import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeResumeAttachment,
  isResumeAttachmentOriginAllowed,
  MAX_RESUME_ATTACHMENT_BYTES,
  scanResumeAttachment
} from "./resumeAttachment";

describe("resume attachment architecture", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("finds one PDF-compatible resume control while excluding identity attachments", () => {
    document.body.innerHTML = `
      <label for="resume-file">上传个人简历</label>
      <input id="resume-file" type="file" accept=".pdf,application/pdf" />
      <label for="identity-file">身份证附件</label>
      <input id="identity-file" type="file" accept="image/*,.pdf" />
    `;

    const scan = scanResumeAttachment();

    expect(scan.status).toBe("ready");
    expect(scan.candidateCount).toBe(1);
    expect(scan.candidate).toMatchObject({
      fieldLabel: "上传个人简历",
      destinationOrigin: window.location.origin,
      acceptsPdf: true
    });
  });

  it("fails closed when multiple resume controls are present", () => {
    document.body.innerHTML = `
      <label for="resume-cn">上传简历</label><input id="resume-cn" type="file" accept=".pdf" />
      <label for="resume-en">Resume</label><input id="resume-en" type="file" accept="application/pdf" />
    `;

    expect(scanResumeAttachment()).toMatchObject({
      status: "ambiguous",
      candidate: null,
      candidateCount: 2
    });
  });

  it("allows HTTPS destinations and loopback fixtures but rejects remote HTTP", () => {
    expect(isResumeAttachmentOriginAllowed("https://jobs.example")).toBe(true);
    expect(isResumeAttachmentOriginAllowed("http://127.0.0.1:4173")).toBe(true);
    expect(isResumeAttachmentOriginAllowed("http://localhost:4173")).toBe(true);
    expect(isResumeAttachmentOriginAllowed("http://jobs.example")).toBe(false);
    expect(isResumeAttachmentOriginAllowed("file:///tmp/form.html")).toBe(false);
  });

  it("rejects stale, oversized, non-PDF, and wrong-origin authorization metadata", () => {
    document.body.innerHTML = `
      <label for="resume-file">上传简历</label><input id="resume-file" type="file" accept=".pdf" />
    `;
    const candidate = scanResumeAttachment().candidate!;
    const base = {
      elementId: candidate.elementId,
      destinationOrigin: candidate.destinationOrigin,
      filename: "candidate.pdf",
      size: 128,
      mimeType: "application/pdf",
      sha256: "a".repeat(64),
      approvedAt: Date.now()
    };

    expect(authorizeResumeAttachment({ ...base, destinationOrigin: "https://wrong.example" }))
      .toEqual({ ok: false, reason: "invalid-destination" });
    expect(authorizeResumeAttachment({ ...base, filename: "candidate.docx" }))
      .toEqual({ ok: false, reason: "invalid-filename" });
    expect(authorizeResumeAttachment({ ...base, mimeType: "application/octet-stream" }))
      .toEqual({ ok: false, reason: "invalid-mime" });
    expect(authorizeResumeAttachment({ ...base, size: MAX_RESUME_ATTACHMENT_BYTES + 1 }))
      .toEqual({ ok: false, reason: "invalid-size" });
    expect(authorizeResumeAttachment({ ...base, approvedAt: Date.now() - 60_001 }))
      .toEqual({ ok: false, reason: "stale-confirmation" });
  });
});
