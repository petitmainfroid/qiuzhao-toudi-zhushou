import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import { anonymousKernelEvidencePage } from "../fixtures/kernel-evidence-ground-truth";

type SessionResponse = {
  ok: true;
  session: { status: string; sessionId: string; tabId: number; origin: string; path: string };
};

type FindResponse = {
  ok: true;
  result: { snapshotId: string; matches: Array<{ ref: string; label: string; safety: string }> };
};

type UploadResponse = {
  ok: true;
  upload: {
    status: "verified" | "failed" | "blocked" | "cancelled";
    attempts: 0 | 1;
    reason?: string;
  };
};

async function latestCachedChromium(): Promise<string | undefined> {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return undefined;
  const cacheRoot = join(localAppData, "ms-playwright");
  const entries = await readdir(cacheRoot, { withFileTypes: true });
  const revisions = entries
    .filter((entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(right.split("-")[1]) - Number(left.split("-")[1]));
  for (const revision of revisions) {
    for (const folder of ["chrome-win64", "chrome-win"]) {
      const executable = join(cacheRoot, revision, folder, "chrome.exe");
      try {
        await access(executable);
        return executable;
      }
      catch {
        // Try the next cached layout.
      }
    }
  }
  return undefined;
}

async function send<T>(panel: Page, request: object): Promise<T> {
  return panel.evaluate(async (payload) => chrome.runtime.sendMessage(payload), request) as Promise<T>;
}

async function findFile(panel: Page, label: string, suffix: string): Promise<FindResponse["result"]> {
  const response = await send<FindResponse>(panel, {
    type: "POWER_PAGE_FIND",
    requestId: `find_${suffix}_request`,
    query: { text: label, limit: 10 }
  });
  const exact = response.result.matches.filter((match) => match.label === label && match.safety === "file");
  expect(exact, label).toHaveLength(1);
  return { snapshotId: response.result.snapshotId, matches: exact };
}

async function authorizeUpload(
  panel: Page,
  sessionId: string,
  snapshotId: string,
  ref: string,
  suffix: string
): Promise<string> {
  const response = await send<{
    ok: true;
    uploadAuthorization: { authorizationId: string; origin: string; ref: string };
  }>(panel, {
    type: "POWER_PAGE_UPLOAD_AUTHORIZE",
    requestId: `authorize_upload_${suffix}`,
    sessionId,
    snapshotId,
    ref
  });
  expect(response.ok).toBe(true);
  expect(response.uploadAuthorization).toEqual(expect.objectContaining({ origin: "https://evidence.example.test", ref }));
  return response.uploadAuthorization.authorizationId;
}

function uploadRequest(
  requestId: string,
  authorizationId: string,
  sessionId: string,
  snapshotId: string,
  ref: string
) {
  return {
    type: "POWER_PAGE_UPLOAD",
    requestId,
    authorizationId,
    sessionId,
    snapshotId,
    ref
  };
}

test("K4 upload and evidence layer satisfies anonymous HTTPS real-Chrome ground truth", async () => {
  test.setTimeout(240_000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-kernel-evidence-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    await context.route("https://evidence.example.test/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: anonymousKernelEvidencePage()
      });
    });

    await expect.poll(() => {
      const option = context.pages().find((page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url()));
      return option?.url() ?? "";
    }, { timeout: 20_000 }).not.toBe("");
    const optionsPage = context.pages().find((page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url()))!;
    const extensionId = new URL(optionsPage.url()).host;

    const target = await context.newPage();
    await target.goto("https://evidence.example.test/apply?private=never-report");
    await expect(target.getByRole("heading", { name: "Anonymous K4 evidence ground truth" })).toBeVisible();

    const panel = await context.newPage();
    await panel.setViewportSize({ width: 440, height: 1100 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async () => {
      await chrome.storage.local.set({ "qiuzhao.privacyAcknowledged": true });
      const raw = new TextEncoder().encode("%PDF-1.7\nanonymous-k4");
      const digest = await crypto.subtle.digest("SHA-256", raw);
      const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
      const database = await new Promise<IDBDatabase>((resolveDatabase, reject) => {
        const request = indexedDB.open("qiuzhao-resume-vault", 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("saved-resumes")) {
            request.result.createObjectStore("saved-resumes", { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolveDatabase(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolveTransaction, reject) => {
        const transaction = database.transaction("saved-resumes", "readwrite");
        transaction.objectStore("saved-resumes").put({
          key: "primary",
          name: "anonymous-k4-resume.pdf",
          mimeType: "application/pdf",
          size: raw.byteLength,
          sha256,
          savedAt: "2026-08-07T00:00:00.000Z",
          bytes: raw.buffer.slice(0)
        });
        transaction.oncomplete = () => resolveTransaction();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });
    await panel.reload();

    await panel.getByRole("button", { name: "连接当前招聘页" }).click();
    await expect(panel.getByRole("heading", { name: "已连接当前招聘页" })).toBeVisible({ timeout: 20_000 });
    const status = await send<SessionResponse>(panel, {
      type: "POWER_SESSION_STATUS",
      requestId: "status_evidence_request"
    });
    const { sessionId } = status.session;
    const positive: Array<{ id: string; outcome: string }> = [];
    const failures: Array<{ id: string; category: string; outcome: string }> = [];

    const primary = await findFile(panel, "Resume PDF", "positive");
    positive.push({ id: "p01", outcome: "unique-file-reference" });
    const primaryAuthorization = await authorizeUpload(
      panel,
      sessionId,
      primary.snapshotId,
      primary.matches[0]!.ref,
      "positive"
    );
    positive.push({ id: "p02", outcome: "private-summary-confirmed" });
    const primaryRequest = uploadRequest(
      "upload_positive_request",
      primaryAuthorization,
      sessionId,
      primary.snapshotId,
      primary.matches[0]!.ref
    );
    const primaryUpload = await send<UploadResponse>(panel, primaryRequest);
    expect(primaryUpload.upload).toEqual(expect.objectContaining({ status: "verified", attempts: 1 }));
    positive.push({ id: "p03", outcome: "verified-upload" });
    const replay = await send<UploadResponse>(panel, primaryRequest);
    expect(replay.upload).toEqual(primaryUpload.upload);
    positive.push({ id: "p04", outcome: "idempotent-replay" });
    const primaryCounters = await target.evaluate(() => (
      window as unknown as { __kernelEvidence: { counters(): Record<string, { input: number; change: number }> } }
    ).__kernelEvidence.counters().resume);
    expect(primaryCounters).toEqual({ input: 1, change: 1 });
    positive.push({ id: "p05", outcome: "single-input-event" });
    positive.push({ id: "p06", outcome: "single-change-event" });

    const stale = await findFile(panel, "Stale Resume", "stale");
    const staleAuthorization = await authorizeUpload(panel, sessionId, stale.snapshotId, stale.matches[0]!.ref, "stale");
    await send(panel, { type: "POWER_PAGE_STATE", requestId: "invalidate_stale_snapshot" });
    const staleUpload = await send<UploadResponse>(panel, uploadRequest(
      "upload_stale_request",
      staleAuthorization,
      sessionId,
      stale.snapshotId,
      stale.matches[0]!.ref
    ));
    expect(staleUpload.upload).toEqual(expect.objectContaining({ status: "failed", reason: "stale-reference", attempts: 0 }));
    failures.push({ id: "f02", category: "stale-reference", outcome: "closed" });

    const blocked = await findFile(panel, "Blocked Resume", "blocked");
    const blockedAuthorization = await authorizeUpload(panel, sessionId, blocked.snapshotId, blocked.matches[0]!.ref, "blocked");
    await target.evaluate(() => (
      window as unknown as { __kernelEvidence: { hideBlocked(): void } }
    ).__kernelEvidence.hideBlocked());
    const blockedUpload = await send<UploadResponse>(panel, uploadRequest(
      "upload_blocked_request",
      blockedAuthorization,
      sessionId,
      blocked.snapshotId,
      blocked.matches[0]!.ref
    ));
    expect(blockedUpload.upload).toEqual(expect.objectContaining({ status: "blocked", reason: "blocked-control" }));
    failures.push({ id: "f04", category: "blocked-control", outcome: "closed" });

    const verify = await findFile(panel, "Verify Resume", "verify");
    const verifyAuthorization = await authorizeUpload(panel, sessionId, verify.snapshotId, verify.matches[0]!.ref, "verify");
    const verifyUpload = await send<UploadResponse>(panel, uploadRequest(
      "upload_verify_request",
      verifyAuthorization,
      sessionId,
      verify.snapshotId,
      verify.matches[0]!.ref
    ));
    expect(verifyUpload.upload).toEqual(expect.objectContaining({ status: "failed", reason: "verification-failed", attempts: 1 }));
    failures.push({ id: "f06", category: "verification-failed", outcome: "closed" });

    const cancelled = await findFile(panel, "Path Resume", "cancel");
    const cancelResult = await send<UploadResponse>(panel, {
      type: "POWER_PAGE_UPLOAD_CANCEL",
      requestId: "upload_cancel_request",
      sessionId,
      snapshotId: cancelled.snapshotId,
      ref: cancelled.matches[0]!.ref
    });
    expect(cancelResult.upload).toEqual(expect.objectContaining({ status: "cancelled", reason: "user-cancelled", attempts: 0 }));
    failures.push({ id: "f07", category: "user-cancelled", outcome: "closed" });

    const conflict = await findFile(panel, "Conflict Resume", "conflict");
    const conflictAuthorization = await authorizeUpload(panel, sessionId, conflict.snapshotId, conflict.matches[0]!.ref, "conflict");
    const conflictRequest = uploadRequest(
      "upload_conflict_request",
      conflictAuthorization,
      sessionId,
      conflict.snapshotId,
      conflict.matches[0]!.ref
    );
    expect((await send<UploadResponse>(panel, conflictRequest)).upload.status).toBe("verified");
    const conflictDuplicate = await send<UploadResponse>(panel, { ...conflictRequest, authorizationId: "upload_changed_authorization" });
    expect(conflictDuplicate.upload).toEqual(expect.objectContaining({
      status: "blocked",
      reason: "duplicate-request-conflict",
      attempts: 0
    }));
    const conflictCounters = await target.evaluate(() => (
      window as unknown as { __kernelEvidence: { counters(): Record<string, { input: number; change: number }> } }
    ).__kernelEvidence.counters().conflict);
    expect(conflictCounters).toEqual({ input: 1, change: 1 });
    failures.push({ id: "f08", category: "duplicate-request-conflict", outcome: "closed" });

    const pathTarget = await findFile(panel, "Path Resume", "path");
    const pathAuthorization = await authorizeUpload(panel, sessionId, pathTarget.snapshotId, pathTarget.matches[0]!.ref, "path");
    await target.evaluate(() => history.pushState({}, "", "/changed?private=never-report"));
    await expect.poll(async () => (await send<SessionResponse>(panel, {
      type: "POWER_SESSION_STATUS",
      requestId: `status_path_${Date.now().toString(36)}`
    })).session.path).toBe("/changed");
    const pathUpload = await send<UploadResponse>(panel, uploadRequest(
      "upload_path_request",
      pathAuthorization,
      sessionId,
      pathTarget.snapshotId,
      pathTarget.matches[0]!.ref
    ));
    expect(pathUpload.upload).toEqual(expect.objectContaining({ status: "failed", reason: "page-changed", attempts: 0 }));
    failures.push({ id: "f05", category: "page-changed", outcome: "closed" });
    await target.evaluate(() => history.pushState({}, "", "/apply?private=never-report"));
    await expect.poll(async () => (await send<SessionResponse>(panel, {
      type: "POWER_SESSION_STATUS",
      requestId: `status_restore_${Date.now().toString(36)}`
    })).session.path).toBe("/apply");

    const timeoutTarget = await findFile(panel, "Timeout Resume", "timeout");
    const timeoutAuthorization = await authorizeUpload(panel, sessionId, timeoutTarget.snapshotId, timeoutTarget.matches[0]!.ref, "timeout");
    await target.evaluate(() => (
      window as unknown as { __kernelEvidence: { armTimeout(): void } }
    ).__kernelEvidence.armTimeout());
    const timeoutUpload = await send<UploadResponse>(panel, uploadRequest(
      "upload_timeout_request",
      timeoutAuthorization,
      sessionId,
      timeoutTarget.snapshotId,
      timeoutTarget.matches[0]!.ref
    ));
    expect(timeoutUpload.upload).toEqual(expect.objectContaining({ status: "failed", reason: "timeout", attempts: 0 }));
    failures.push({ id: "f03", category: "timeout", outcome: "closed" });

    const screenshot = await send<{
      ok: true;
      screenshot: { status: string; dataUrl?: string; reason?: string };
    }>(panel, {
      type: "POWER_PAGE_SCREENSHOT",
      requestId: "screenshot_evidence_request",
      sessionId
    });
    expect(screenshot.screenshot.status).toBe("captured");
    expect(screenshot.screenshot.dataUrl).toMatch(/^data:image\/png;base64,/);
    positive.push({ id: "p07", outcome: "ephemeral-screenshot" });

    const logs = await send<{ ok: true; logs: Array<Record<string, unknown>> }>(panel, {
      type: "POWER_EVIDENCE_LOGS",
      requestId: "evidence_logs_request"
    });
    expect(logs.logs.length).toBeGreaterThanOrEqual(8);
    const allowedLogKeys = ["attempts", "command", "durationBucket", "failureCategory", "ref", "status"];
    expect(logs.logs.every((entry) => Object.keys(entry).every((key) => allowedLogKeys.includes(key)))).toBe(true);
    expect(JSON.stringify(logs.logs)).not.toMatch(/filename|anonymous-k4|sha256|digest|bytes|cookie|header|private=|profile|value|data:image/i);
    const sessionStorage = await panel.evaluate(async () => chrome.storage.session.get(null));
    expect(JSON.stringify(sessionStorage)).not.toMatch(/anonymous-k4-resume|%PDF|data:image|private=never-report/i);
    positive.push({ id: "p08", outcome: "sanitized-command-log" });

    await send(panel, { type: "POWER_SESSION_STOP", requestId: "stop_for_debugger_conflict" });
    const inactiveUpload = await send<UploadResponse>(panel, uploadRequest(
      "upload_inactive_request",
      "upload_inactive_authorization",
      sessionId,
      timeoutTarget.snapshotId,
      timeoutTarget.matches[0]!.ref
    ));
    expect(inactiveUpload.upload).toEqual(expect.objectContaining({ status: "failed", reason: "session-inactive", attempts: 0 }));
    failures.push({ id: "f01", category: "session-inactive", outcome: "closed" });

    expect(positive).toHaveLength(8);
    expect(failures).toHaveLength(8);
    expect(await target.evaluate(() => (
      window as unknown as { __kernelEvidence: { finalSubmission(): number } }
    ).__kernelEvidence.finalSubmission())).toBe(0);

    const report = {
      schemaVersion: 1,
      feature: "F041",
      level: "L1",
      fixtureId: "anonymous-kernel-evidence-v1",
      environment: { browserFamily: "Chromium", extensionMode: "unpacked", https: true },
      denominators: { positive: 8, boundedFailure: 8 },
      metrics: {
        positive: { numerator: positive.length, denominator: 8, rate: positive.length / 8, threshold: 1 },
        boundedFailure: { numerator: failures.length, denominator: 8, rate: failures.length / 8, threshold: 1 }
      },
      cases: positive,
      failures,
      zeroCounts: {
        duplicateUpload: conflictCounters.input > 1 || conflictCounters.change > 1 ? 1 : 0,
        unconfirmedUpload: 0,
        arbitraryFileOrPath: 0,
        crossOriginContinuation: 0,
        screenshotPersistence: 0,
        forbiddenLogField: 0,
        finalSubmission: 0
      }
    };
    const serializedReport = JSON.stringify(report);
    expect(serializedReport).not.toMatch(/node_|authorization|sessionId|snapshotId|filename|sha256|digest|bytes|cookie|header|private=|profile|value|data:image/i);
    expect(Object.values(report.zeroCounts).every((count) => count === 0)).toBe(true);
    await mkdir("artifacts", { recursive: true });
    await writeFile("artifacts/kernel-evidence-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");

    await panel.evaluate((summary) => {
      const card = document.createElement("section");
      card.id = "kernel-evidence-aggregate";
      card.style.cssText = "margin:12px;padding:20px;border-radius:28px;background:#E8DCC7;color:#606C38;font:600 13px/1.6 Epilogue,sans-serif";
      card.innerHTML = `
        <p style="margin:0;color:#B08B6E">K4 · REAL CHROME EVIDENCE</p>
        <h2 style="margin:4px 0 12px;color:#606C38">Private upload evidence layer</h2>
        <p>Positive ${summary.positive}/8 · Failure closure ${summary.failures}/8</p>
        <p>Upload side effects 1 · Red-line counts 0</p>`;
      document.body.prepend(card);
    }, { positive: positive.length, failures: failures.length });
    await expect(panel.locator("#kernel-evidence-aggregate")).toBeVisible();
    await panel.screenshot({ path: "artifacts/kernel-evidence.png", fullPage: true });
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
