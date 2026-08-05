import type { CandidateProfile } from "../domain/profile";
import { fillPage, scanPage, type FillSelection, type FillResult, type ScanResult } from "../content/engine";
import {
  attachAuthorizedResume,
  authorizeResumeAttachment,
  scanResumeAttachment,
  type ResumeAttachmentAuthorization,
  type ResumeAttachmentMetadata,
  type ResumeAttachmentPayload,
  type ResumeAttachmentRejection,
  type ResumeAttachmentResult,
  type ResumeAttachmentScan
} from "../content/resumeAttachment";

declare global {
  interface Window {
    __qiuzhaoFixture: {
      scan(profile: CandidateProfile): ScanResult;
      fill(profile: CandidateProfile, selections: FillSelection[]): Promise<FillResult>;
      scanResumeAttachment(): ResumeAttachmentScan;
      authorizeResumeAttachment(metadata: ResumeAttachmentMetadata): ResumeAttachmentAuthorization | ResumeAttachmentRejection;
      attachAuthorizedResume(payload: ResumeAttachmentPayload): Promise<ResumeAttachmentResult>;
      eventCount: number;
      submitCount: number;
      attachmentChangeCount: number;
      attachmentRequestCount: number;
    };
  }
}

window.__qiuzhaoFixture = {
  scan: scanPage,
  fill: fillPage,
  scanResumeAttachment,
  authorizeResumeAttachment,
  attachAuthorizedResume,
  eventCount: 0,
  submitCount: 0,
  attachmentChangeCount: 0,
  attachmentRequestCount: 0
};

document.getElementById("application-form")?.addEventListener("input", () => {
  window.__qiuzhaoFixture.eventCount += 1;
});
document.getElementById("application-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  window.__qiuzhaoFixture.submitCount += 1;
});

document.getElementById("resume")?.addEventListener("change", (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  window.__qiuzhaoFixture.attachmentChangeCount += 1;
  window.__qiuzhaoFixture.attachmentRequestCount += 1;
  const status = document.getElementById("resume-upload-status");
  if (status) status.textContent = "已选择文件，招聘网站开始上传";
  void fetch("/fixture-resume-upload", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file
  }).then((response) => {
    if (status) status.textContent = response.ok ? "招聘网站已接收简历" : "招聘网站上传失败";
  }).catch(() => {
    if (status) status.textContent = "招聘网站上传失败";
  });
});

document.getElementById("add-dynamic")?.addEventListener("click", () => {
  document.getElementById("dynamic-fields")?.removeAttribute("hidden");
});
