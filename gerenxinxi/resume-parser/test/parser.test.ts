import { describe, expect, it } from "vitest";
import { StoredPdfResumeParser, parsePdfResumeBytes } from "../src";

function loader(lines: string[], pageCount = 1) {
  return () => ({
    promise: Promise.resolve({
      numPages: pageCount,
      async getPage() {
        return {
          async getTextContent() {
            return {
              items: lines.map((str, index) => ({ str, transform: [1, 0, 0, 10, 0, 100 - index * 12], width: str.length * 8, height: 10 }))
            };
          }
        };
      }
    }),
    async destroy() {}
  });
}

describe("stored PDF resume parser", () => {
  it("returns structured fields and aggregate evidence without raw text or identity values", async () => {
    const result = await parsePdfResumeBytes(
      new TextEncoder().encode("%PDF-1.7\nprivate\n%%EOF"),
      loader([
        "姓名：测试候选人",
        "邮箱：candidate@example.invalid",
        "教育经历",
        "2022.09 - 2026.06 测试大学 软件工程 本科",
        "身份证号：320000200001010000"
      ])
    );
    expect(result.pageCount).toBe(1);
    expect(result.extractedCharacterCount).toBeGreaterThan(12);
    expect(result.populatedPaths.length).toBeGreaterThan(0);
    expect(result.profile.basic.identityDocumentNumber).toBe("");
    expect(JSON.stringify(result)).not.toContain("320000200001010000");
    expect(result).not.toHaveProperty("text");
  });

  it("fails closed for a missing stored PDF and an unusable text layer", async () => {
    await expect(new StoredPdfResumeParser({ load: async () => null }).parse()).rejects.toMatchObject({ code: "resume_missing" });
    await expect(parsePdfResumeBytes(new Uint8Array([1]), loader(["short"]))).rejects.toMatchObject({ code: "resume_ocr_required" });
  });

  it("enforces the page limit before reading pages", async () => {
    await expect(parsePdfResumeBytes(new Uint8Array([1]), loader(["enough readable content"], 51))).rejects.toMatchObject({
      code: "resume_too_many_pages"
    });
  });
});
