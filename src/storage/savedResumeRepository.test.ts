import { describe, expect, it } from "vitest";
import { MAX_RESUME_ATTACHMENT_BYTES } from "../content/resumeAttachment";
import { prepareSavedResume, SavedResumeValidationError } from "./savedResumeRepository";

function pdfFile(content = "%PDF-1.4\nsynthetic resume\n%%EOF", name = "resume.pdf"): File {
  const bytes = new TextEncoder().encode(content);
  const file = new File([bytes], name, { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer.slice(0) });
  return file;
}

describe("prepareSavedResume", () => {
  it("validates and fingerprints a local PDF without retaining a path", async () => {
    const prepared = await prepareSavedResume(pdfFile(), "2026-08-06T08:00:00.000Z");

    expect(prepared.metadata).toMatchObject({
      name: "resume.pdf",
      mimeType: "application/pdf",
      size: 31,
      savedAt: "2026-08-06T08:00:00.000Z"
    });
    expect(prepared.metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared).not.toHaveProperty("path");
    expect(new TextDecoder().decode(prepared.bytes)).toContain("%PDF-1.4");
  });

  it.each([
    [pdfFile("plain text"), "内容不是有效"],
    [pdfFile("%PDF-1.4", "../resume.pdf"), "文件名有效"],
    [new File([new Uint8Array(MAX_RESUME_ATTACHMENT_BYTES + 1)], "resume.pdf", { type: "application/pdf" }), "10 MiB"]
  ])("rejects an unsafe candidate", async (file, message) => {
    await expect(prepareSavedResume(file)).rejects.toEqual(expect.objectContaining({
      name: SavedResumeValidationError.name,
      message: expect.stringContaining(message)
    }));
  });
});
