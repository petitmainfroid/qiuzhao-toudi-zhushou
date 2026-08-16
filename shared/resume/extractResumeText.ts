import { strFromU8, unzipSync } from "fflate";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const MAX_DOCX_XML_BYTES = 12 * 1024 * 1024;
const MAX_PDF_PAGES = 50;
const MAX_OCR_PAGES = 8;
const MAX_EXTRACTED_CHARACTERS = 250_000;

export type ResumeFormat = "pdf" | "docx";

export interface ExtractedResumeText {
  format: ResumeFormat;
  text: string;
  pageCount?: number;
  usedOcr?: boolean;
}

function extensionOf(fileName: string): string {
  const match = /\.([^.]+)$/.exec(fileName.trim().toLowerCase());
  return match?.[1] ?? "";
}

export function detectResumeFormat(file: Pick<File, "name" | "type">): ResumeFormat | null {
  const extension = extensionOf(file.name);
  if (file.type === "application/pdf" || extension === "pdf") return "pdf";
  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || extension === "docx"
  ) return "docx";
  return null;
}

function ensureReadableText(text: string): string {
  const normalized = text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length < 12) {
    throw new Error("没有从简历中读取到足够文字。若这是扫描件，请先使用文字版 PDF 或 DOCX。");
  }
  return normalized.slice(0, MAX_EXTRACTED_CHARACTERS);
}

function extractDocxParagraphs(xml: string): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("DOCX 文档结构无法读取，请重新导出后再试。");
  }

  const paragraphs = Array.from(document.getElementsByTagNameNS("*", "p"));
  return paragraphs
    .map((paragraph) => {
      const fragments = Array.from(paragraph.children).flatMap((child) => {
        if (child.localName === "r" || child.localName === "hyperlink") {
          return Array.from(child.getElementsByTagNameNS("*", "t"))
            .map((textNode) => textNode.textContent ?? "");
        }
        if (child.localName === "tab") return ["\t"];
        return [];
      });
      return fragments.join("").trim();
    })
    .filter(Boolean)
    .join("\n");
}

interface PositionedPdfText {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
}

interface PositionedLineItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rebuild PDF lines from coordinates instead of trusting the often column-interleaved content order. */
export function extractPositionedPdfLines(items: readonly PositionedPdfText[]): string[] {
  const positioned: PositionedLineItem[] = items
    .filter((item) => item.str.trim())
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      width: Math.max(0, item.width ?? 0),
      height: Math.max(1, item.height ?? (Math.abs(item.transform[3] ?? 0) || 10))
    }));
  positioned.sort((left, right) => right.y - left.y || left.x - right.x);

  const rows: Array<{ y: number; height: number; items: PositionedLineItem[] }> = [];
  for (const item of positioned) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(2, Math.min(candidate.height, item.height) * 0.4));
    if (row) {
      row.items.push(item);
      row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
      row.height = Math.max(row.height, item.height);
    }
    else {
      rows.push({ y: item.y, height: item.height, items: [item] });
    }
  }
  rows.sort((left, right) => right.y - left.y);

  const lines: string[] = [];
  for (const row of rows) {
    row.items.sort((left, right) => left.x - right.x);
    const rowCarriesStructuredSuffix = row.items.some((item) =>
      /(?:19|20)\d{2}|至今|现在|present|current|一等奖|二等奖|三等奖|金牌|银牌|铜牌|冠军|亚军|季军|优胜奖|核心成员|负责人/i.test(item.text)
    );
    let line = "";
    let previous: PositionedLineItem | null = null;
    for (const item of row.items) {
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      const splitGap = Math.max(24, Math.max(previous?.height ?? item.height, item.height) * 2.4);
      if (previous && gap > splitGap && !rowCarriesStructuredSuffix) {
        if (line.trim()) lines.push(line.trim());
        line = "";
        previous = null;
      }
      const localGap = previous ? item.x - (previous.x + previous.width) : 0;
      const needsSpace = Boolean(previous) && localGap > Math.max(1.5, Math.min(previous?.height ?? item.height, item.height) * 0.18);
      line += `${line && needsSpace ? " " : ""}${item.text}`;
      previous = item;
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines;
}

function pdfTextNeedsOcr(text: string): boolean {
  const hanCharacters = (text.match(/\p{Script=Han}/gu) ?? []).length;
  if (hanCharacters >= 20) return false;
  const latinCharacters = (text.match(/[A-Za-z]/g) ?? []).length;
  if (latinCharacters < 100) return false;
  const semanticTokens = text.match(/\b(?:education|experience|employment|internship|research|projects?|publications?|skills?|awards?)\b/gi) ?? [];
  return semanticTokens.length === 0;
}

function localOcrAssets(): { workerPath: string; corePath: string; langPath: string } {
  const root = new URL("/", globalThis.location.href);
  if (import.meta.env.DEV) {
    return {
      workerPath: new URL("node_modules/tesseract.js/dist/worker.min.js", root).href,
      corePath: new URL("node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", root).href,
      langPath: new URL("node_modules/@tesseract.js-data/chi_sim/4.0.0_best_int", root).href
    };
  }
  return {
    workerPath: new URL("ocr/worker.min.js", root).href,
    corePath: new URL("ocr/tesseract-core-lstm.wasm.js", root).href,
    langPath: new URL("ocr", root).href
  };
}

function localPdfAssets(): { cMapUrl: string; standardFontDataUrl: string } {
  const root = new URL("/", globalThis.location.href);
  const base = import.meta.env.DEV ? "node_modules/pdfjs-dist/" : "pdfjs/";
  return {
    cMapUrl: new URL(`${base}cmaps/`, root).href,
    standardFontDataUrl: new URL(`${base}standard_fonts/`, root).href
  };
}

export async function recognizeCanvasWithLocalOcr(canvas: HTMLCanvasElement): Promise<string> {
  const { createWorker, OEM } = await import("tesseract.js");
  const worker = await createWorker("chi_sim", OEM.LSTM_ONLY, {
    ...localOcrAssets(),
    gzip: true,
    cacheMethod: "none",
    workerBlobURL: false
  });
  try {
    return (await worker.recognize(canvas)).data.text;
  }
  finally {
    await worker.terminate();
  }
}

export function extractDocxText(data: ArrayBuffer): string {
  let oversizedDocumentXml = false;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(data), {
      filter: (entry) => {
        const normalizedName = entry.name.replace(/\\/g, "/");
        if (normalizedName !== "word/document.xml") return false;
        if (entry.originalSize > MAX_DOCX_XML_BYTES) {
          oversizedDocumentXml = true;
          return false;
        }
        return true;
      }
    });
  }
  catch {
    throw new Error("DOCX 文件已损坏或不是有效的 Word 文档。");
  }

  if (oversizedDocumentXml) {
    throw new Error("DOCX 解压后的正文过大，请移除无关内容后再试。");
  }
  const documentXml = entries["word/document.xml"];
  if (!documentXml) {
    throw new Error("DOCX 中没有找到可读取的正文。");
  }
  if (documentXml.byteLength > MAX_DOCX_XML_BYTES) {
    throw new Error("DOCX 解压后的正文过大，请移除无关内容后再试。");
  }
  return ensureReadableText(extractDocxParagraphs(strFromU8(documentXml)));
}

export async function extractPdfText(data: ArrayBuffer): Promise<{ text: string; pageCount: number; usedOcr: boolean }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    useWorkerFetch: false,
    useSystemFonts: true,
    cMapPacked: true,
    ...localPdfAssets()
  });

  try {
    const document = await loadingTask.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF 共 ${document.numPages} 页，超过可解析的 ${MAX_PDF_PAGES} 页上限。`);
    }

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = extractPositionedPdfLines(content.items.filter((item): item is typeof item & PositionedPdfText => "str" in item));
      pages.push(lines.join("\n"));
    }

    const positionedText = ensureReadableText(pages.join("\n\n"));
    if (!pdfTextNeedsOcr(positionedText)) {
      return { text: positionedText, pageCount: document.numPages, usedOcr: false };
    }
    if (document.numPages > MAX_OCR_PAGES) {
      throw new Error(`PDF 文本层无法正常读取，且超过本机 OCR 的 ${MAX_OCR_PAGES} 页上限。请重新导出为文字版 PDF 或 DOCX。`);
    }

    const { createWorker, OEM } = await import("tesseract.js");
    const worker = await createWorker("chi_sim", OEM.LSTM_ONLY, {
      ...localOcrAssets(),
      gzip: true,
      cacheMethod: "none",
      workerBlobURL: false
    });
    try {
      const ocrPages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = globalThis.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const canvasContext = canvas.getContext("2d", { willReadFrequently: true });
        if (!canvasContext) throw new Error("浏览器无法创建本机 OCR 画布。");
        canvasContext.fillStyle = "#ffffff";
        canvasContext.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext, viewport }).promise;
        const result = await worker.recognize(canvas);
        ocrPages.push(result.data.text);
        canvas.width = 1;
        canvas.height = 1;
      }
      return { text: ensureReadableText(ocrPages.join("\n\n")), pageCount: document.numPages, usedOcr: true };
    }
    finally {
      await worker.terminate();
    }
  }
  catch (error) {
    if (error instanceof Error && /没有从简历|超过可解析|文本层无法正常读取|本机 OCR|OCR 画布/.test(error.message)) throw error;
    throw new Error("PDF 无法读取。请确认文件未加密、未损坏，并且包含可选择的文字。");
  }
  finally {
    await loadingTask.destroy();
  }
}

export async function extractResumeText(file: File): Promise<ExtractedResumeText> {
  if (file.size === 0) throw new Error("所选简历是空文件。");
  if (file.size > MAX_RESUME_BYTES) throw new Error("简历不能超过 10 MB。");
  const format = detectResumeFormat(file);
  if (!format) throw new Error("目前只支持 PDF 和 DOCX 简历。");

  const data = await file.arrayBuffer();
  if (format === "docx") return { format, text: extractDocxText(data) };
  const result = await extractPdfText(data);
  return { format, ...result };
}
