import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { CandidateProfile } from "../../../shared/domain/profile";
import { parseResumeText } from "../../../shared/resume/parseResume";

const MAX_PDF_PAGES = 50;
const MAX_EXTRACTED_CHARACTERS = 250_000;

interface PdfTextItem {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface PdfPageLike {
  getTextContent(): Promise<{ items: unknown[] }>;
}

interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
}

interface PdfLoadingTaskLike {
  promise: Promise<PdfDocumentLike>;
  destroy(): Promise<void>;
}

type PdfDocumentLoader = (input: Record<string, unknown>) => PdfLoadingTaskLike;

export interface StoredResumeByteSource {
  load(): Promise<{ bytes: Uint8Array } | null>;
}

export interface StoredResumeParseResult {
  profile: CandidateProfile;
  populatedPaths: string[];
  warnings: string[];
  pageCount: number;
  usedOcr: false;
  extractedCharacterCount: number;
}

export class ResumeParserError extends Error {
  constructor(readonly code: "resume_missing" | "resume_unreadable" | "resume_ocr_required" | "resume_too_many_pages") {
    super(code);
    this.name = "ResumeParserError";
  }
}

function isTextItem(value: unknown): value is PdfTextItem {
  return Boolean(value && typeof value === "object" && typeof (value as PdfTextItem).str === "string");
}

function textLines(items: unknown[]): string[] {
  const positioned = items.filter(isTextItem).filter((item) => item.str.trim()).map((item, index) => ({
    text: item.str.trim(),
    x: item.transform?.[4] ?? index,
    y: item.transform?.[5] ?? 0,
    width: Math.max(0, item.width ?? 0),
    height: Math.max(1, item.height ?? (Math.abs(item.transform?.[3] ?? 10) || 10))
  }));
  positioned.sort((left, right) => right.y - left.y || left.x - right.x);
  const rows: Array<{ y: number; height: number; items: typeof positioned }> = [];
  for (const item of positioned) {
    const row = rows.find((candidate) =>
      Math.abs(candidate.y - item.y) <= Math.max(2, Math.min(candidate.height, item.height) * 0.4)
    );
    if (row) {
      row.items.push(item);
      row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
      row.height = Math.max(row.height, item.height);
    } else {
      rows.push({ y: item.y, height: item.height, items: [item] });
    }
  }
  rows.sort((left, right) => right.y - left.y);
  return rows.flatMap((row) => {
    row.items.sort((left, right) => left.x - right.x);
    const lines: string[] = [];
    let line = "";
    let previous: (typeof row.items)[number] | undefined;
    for (const item of row.items) {
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      if (previous && gap > Math.max(24, Math.max(previous.height, item.height) * 2.4)) {
        if (line.trim()) lines.push(line.trim());
        line = "";
        previous = undefined;
      }
      const localGap = previous ? item.x - (previous.x + previous.width) : 0;
      const needsSpace = Boolean(previous) && localGap > Math.max(1.5, Math.min(previous?.height ?? item.height, item.height) * 0.18);
      line += `${line && needsSpace ? " " : ""}${item.text}`;
      previous = item;
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
  });
}

function normalizeText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function safelyWipe(bytes: Uint8Array): void {
  try { bytes.fill(0); } catch { /* pdf.js may detach its private copy. */ }
}

export async function parsePdfResumeBytes(
  bytes: Uint8Array,
  loader: PdfDocumentLoader = getDocument as unknown as PdfDocumentLoader
): Promise<StoredResumeParseResult> {
  if (bytes.byteLength === 0) throw new ResumeParserError("resume_unreadable");
  const parserBytes = bytes.slice();
  const loadingTask = loader({
    data: parserBytes,
    isEvalSupported: false,
    useWorkerFetch: false,
    useSystemFonts: true,
    cMapPacked: true
  });
  try {
    const document = await loadingTask.promise;
    if (!Number.isSafeInteger(document.numPages) || document.numPages < 1) {
      throw new ResumeParserError("resume_unreadable");
    }
    if (document.numPages > MAX_PDF_PAGES) throw new ResumeParserError("resume_too_many_pages");
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      pages.push(textLines((await page.getTextContent()).items).join("\n"));
    }
    const text = normalizeText(pages.join("\n\n")).slice(0, MAX_EXTRACTED_CHARACTERS);
    if (text.length < 12) throw new ResumeParserError("resume_ocr_required");
    const parsed = parseResumeText(text);
    // Identity values require deliberate user entry and never leave this parser.
    parsed.profile.basic.identityDocumentType = "";
    parsed.profile.basic.identityDocumentNumber = "";
    const populatedPaths = parsed.populatedPaths.filter((path) =>
      path !== "basic.identityDocumentType" && path !== "basic.identityDocumentNumber"
    );
    if (populatedPaths.length === 0) throw new ResumeParserError("resume_unreadable");
    return {
      profile: parsed.profile,
      populatedPaths,
      warnings: parsed.warnings,
      pageCount: document.numPages,
      usedOcr: false,
      extractedCharacterCount: text.length
    };
  } catch (error) {
    if (error instanceof ResumeParserError) throw error;
    throw new ResumeParserError("resume_unreadable");
  } finally {
    await loadingTask.destroy().catch(() => undefined);
    safelyWipe(parserBytes);
  }
}

export class StoredPdfResumeParser {
  constructor(
    private readonly source: StoredResumeByteSource,
    private readonly loader?: PdfDocumentLoader
  ) {}

  async parse(): Promise<StoredResumeParseResult> {
    const stored = await this.source.load();
    if (!stored) throw new ResumeParserError("resume_missing");
    try {
      return await parsePdfResumeBytes(stored.bytes, this.loader);
    } finally {
      safelyWipe(stored.bytes);
    }
  }
}
