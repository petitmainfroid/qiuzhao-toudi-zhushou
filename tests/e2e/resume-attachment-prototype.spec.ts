import { expect, test } from "@playwright/test";

test("resume attachment prototype confirms before immediate upload and never submits", async ({ page }) => {
  let observedUploadRequests = 0;
  await page.route("**/fixture-resume-upload", async (route) => {
    observedUploadRequests += 1;
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto("/fixture.html");

  const prepared = await page.evaluate(async () => {
    const scan = window.__qiuzhaoFixture.scanResumeAttachment();
    if (!scan.candidate) throw new Error("Expected one resume attachment candidate.");
    const bytes = new TextEncoder().encode("%PDF-1.4\nsynthetic attachment prototype\n%%EOF");
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0")
    ).join("");
    let binary = "";
    for (const value of bytes) binary += String.fromCharCode(value);
    return {
      scan,
      metadata: {
        elementId: scan.candidate.elementId,
        destinationOrigin: scan.candidate.destinationOrigin,
        filename: "synthetic-resume.pdf",
        size: bytes.length,
        mimeType: "application/pdf",
        sha256: digest,
        approvedAt: Date.now()
      },
      base64: btoa(binary),
      pageFileCount: (document.getElementById("resume") as HTMLInputElement).files?.length ?? 0,
      pageRequestCount: window.__qiuzhaoFixture.attachmentRequestCount
    };
  });

  expect(prepared.scan.status).toBe("ready");
  expect(prepared.scan.candidate?.fieldLabel).toBe("上传简历");
  expect(prepared.pageFileCount).toBe(0);
  expect(prepared.pageRequestCount).toBe(0);
  expect(observedUploadRequests).toBe(0);

  const result = await page.evaluate(async ({ metadata, base64 }) => {
    const wrongDigest = window.__qiuzhaoFixture.authorizeResumeAttachment({
      ...metadata,
      sha256: "0".repeat(64),
      approvedAt: Date.now()
    });
    if (!wrongDigest.ok) throw new Error(`Unexpected authorization rejection: ${wrongDigest.reason}`);
    const rejected = await window.__qiuzhaoFixture.attachAuthorizedResume({ token: wrongDigest.token, base64 });

    const authorization = window.__qiuzhaoFixture.authorizeResumeAttachment({
      ...metadata,
      approvedAt: Date.now()
    });
    if (!authorization.ok) throw new Error(`Unexpected authorization rejection: ${authorization.reason}`);
    const attached = await window.__qiuzhaoFixture.attachAuthorizedResume({ token: authorization.token, base64 });
    const replay = await window.__qiuzhaoFixture.attachAuthorizedResume({ token: authorization.token, base64 });
    return {
      rejected,
      attached,
      replay,
      fileCount: (document.getElementById("resume") as HTMLInputElement).files?.length ?? 0,
      identityFileCount: (document.getElementById("identity-attachment") as HTMLInputElement).files?.length ?? 0,
      attachmentChangeCount: window.__qiuzhaoFixture.attachmentChangeCount,
      submitCount: window.__qiuzhaoFixture.submitCount
    };
  }, { metadata: prepared.metadata, base64: prepared.base64 });

  expect(result.rejected).toEqual({ status: "rejected", reason: "digest-mismatch" });
  expect(result.attached).toEqual({ status: "attached" });
  expect(result.replay).toEqual({ status: "rejected", reason: "authorization-missing" });
  expect(result.fileCount).toBe(1);
  expect(result.identityFileCount).toBe(0);
  expect(result.attachmentChangeCount).toBe(1);
  expect(result.submitCount).toBe(0);
  await expect.poll(() => observedUploadRequests).toBe(1);
  await expect(page.getByText("招聘网站已接收简历")).toBeVisible();
  await page.screenshot({ path: "artifacts/resume-attachment-prototype.png", fullPage: true });
});
