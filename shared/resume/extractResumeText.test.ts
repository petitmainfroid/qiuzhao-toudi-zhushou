// @vitest-environment node

import { strToU8, unzipSync, zipSync } from "fflate";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MAX_RESUME_BYTES,
  detectResumeFormat,
  extractDocxText,
  extractPositionedPdfLines,
  extractResumeText
} from "./extractResumeText";

function docxBuffer(paragraphs: string[]): ArrayBuffer {
  const body = paragraphs
    .map((paragraph) => `<w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>${body}</w:body>
    </w:document>`;
  const zipped = zipSync({ "word/document.xml": strToU8(xml) });
  return Uint8Array.from(zipped).buffer;
}

describe("resume text extraction", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "DOMParser", {
      configurable: true,
      value: new JSDOM("").window.DOMParser
    });
  });

  it("detects supported formats from MIME type or extension", () => {
    expect(detectResumeFormat({ name: "candidate.PDF", type: "" })).toBe("pdf");
    expect(detectResumeFormat({ name: "candidate", type: "application/pdf" })).toBe("pdf");
    expect(detectResumeFormat({ name: "candidate.docx", type: "" })).toBe("docx");
    expect(detectResumeFormat({ name: "candidate.doc", type: "application/msword" })).toBeNull();
  });

  it("extracts paragraph text from a DOCX archive without retaining the archive", () => {
    const buffer = docxBuffer([
      "林晓舟",
      "教育经历",
      "2022.09 - 2026.06 上海交通大学 计算机科学与技术 本科"
    ]);
    expect(Object.keys(unzipSync(new Uint8Array(buffer)))).toContain("word/document.xml");
    const text = extractDocxText(buffer);
    expect(text).toBe("林晓舟\n教育经历\n2022.09 - 2026.06 上海交通大学 计算机科学与技术 本科");
  });

  it("reconstructs spaced PDF glyphs while keeping dated and award rows together", () => {
    const item = (str: string, x: number, y: number, width: number) => ({
      str,
      transform: [1, 0, 0, 12, x, y],
      width,
      height: 12
    });
    const lines = extractPositionedPdfLines([
      item("项", 180, 700, 12), item("目", 192, 700, 12), item("经", 204, 700, 12), item("历", 216, 700, 12),
      item("本地资料", 20, 700, 48),
      item("2025.01 - 2025.06", 180, 670, 110), item("匿名项目", 305, 670, 48),
      item("全国匿名算法大赛", 20, 640, 108), item("二等奖", 310, 640, 36)
    ]);

    expect(lines).toEqual([
      "本地资料",
      "项目经历",
      "2025.01 - 2025.06 匿名项目",
      "全国匿名算法大赛 二等奖"
    ]);
  });

  it("rejects invalid, unsupported, empty, and oversized files with actionable messages", async () => {
    await expect(extractResumeText(new File([], "empty.pdf", { type: "application/pdf" })))
      .rejects.toThrow("空文件");
    await expect(extractResumeText(new File(["plain text"], "resume.txt", { type: "text/plain" })))
      .rejects.toThrow("只支持 PDF 和 DOCX");
    const oversized = new File([new Uint8Array(MAX_RESUME_BYTES + 1)], "large.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    await expect(extractResumeText(oversized)).rejects.toThrow("不能超过 10 MB");
    expect(() => extractDocxText(new TextEncoder().encode("not a zip").buffer))
      .toThrow("已损坏");
  });
});
