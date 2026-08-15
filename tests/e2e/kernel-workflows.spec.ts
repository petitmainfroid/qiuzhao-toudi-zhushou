import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import { anonymousKernelProfile } from "../fixtures/kernel-actions-ground-truth";
import { anonymousKernelWorkflowPage } from "../fixtures/kernel-workflows-ground-truth";

type WaitResponse = {
  ok: true;
  wait: {
    requestId: string;
    condition: string;
    status: "matched" | "timeout" | "failed";
    polls: number;
    reason?: string;
    path?: string;
    result?: {
      snapshotId: string;
      matches: Array<{ ref: string; label: string; safety: string }>;
    };
  };
};

type FindResponse = {
  ok: true;
  result: {
    snapshotId: string;
    matches: Array<{ ref: string; label: string; safety: string }>;
  };
};

type ActionResponse = {
  ok: true;
  action: {
    requestId: string;
    status: "verified" | "failed" | "blocked";
    attempts: 0 | 1 | 2;
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
        // Try the next cached Chromium layout.
      }
    }
  }
  return undefined;
}

async function sendBridgeMessage<T>(panel: Page, request: object): Promise<T> {
  return panel.evaluate(async (payload) => chrome.runtime.sendMessage(payload), request) as Promise<T>;
}

async function authorize(panel: Page): Promise<string> {
  const response = await sendBridgeMessage<{
    ok: true;
    authorization: { authorizationId: string };
  }>(panel, {
    type: "POWER_PAGE_ACTION_AUTHORIZE",
    requestId: `authorize_${Date.now().toString(36)}`
  });
  expect(response.ok).toBe(true);
  return response.authorization.authorizationId;
}

async function find(panel: Page, label: string, requestId: string): Promise<FindResponse["result"]> {
  const response = await sendBridgeMessage<FindResponse>(panel, {
    type: "POWER_PAGE_FIND",
    requestId,
    query: { text: label, limit: 5 }
  });
  const exact = response.result.matches.find((match) => match.label === label);
  expect(exact, `missing exact control ${label}`).toBeTruthy();
  return { ...response.result, matches: [exact!] };
}

async function waitFor(
  panel: Page,
  sessionId: string,
  id: string,
  condition: object,
  timeoutMs = 1_500
): Promise<WaitResponse["wait"]> {
  const response = await sendBridgeMessage<WaitResponse>(panel, {
    type: "POWER_PAGE_WAIT",
    requestId: `wait_${id}_request`,
    sessionId,
    condition,
    timeoutMs,
    pollIntervalMs: 50
  });
  expect(response.ok).toBe(true);
  return response.wait;
}

function fillRequest(
  requestId: string,
  authorizationId: string,
  sessionId: string,
  snapshotId: string,
  ref: string,
  path = "basic.fullName"
) {
  return {
    type: "POWER_PAGE_ACTION",
    requestId,
    authorizationId,
    sessionId,
    snapshotId,
    ref,
    intent: { kind: "fill", source: { kind: "profile", path } }
  };
}

async function act(panel: Page, request: object): Promise<ActionResponse["action"]> {
  const response = await sendBridgeMessage<ActionResponse>(panel, request);
  expect(response.ok).toBe(true);
  return response.action;
}

async function schedule(target: Page, kind: string): Promise<void> {
  await target.evaluate((value) => (
    window as unknown as { __workflowSchedule(kind: string): void }
  ).__workflowSchedule(value), kind);
}

async function readTarget(target: Page, id: string): Promise<{ value: string; mutationCount: number }> {
  return target.evaluate((caseId) => (
    window as unknown as { __workflowRead(id: string): { value: string; mutationCount: number } }
  ).__workflowRead(caseId), id);
}

test("K3 bounded workflows satisfy anonymous HTTPS real-Chrome ground truth", async () => {
  test.setTimeout(180_000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-kernel-workflows-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    await context.route(/https:\/\/(?:workflows|other)\.example\.test\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: anonymousKernelWorkflowPage()
      });
    });

    await expect.poll(() => {
      const workerUrl = context.serviceWorkers()[0]?.url();
      const extensionPage = context.pages().find((page) => page.url().startsWith("chrome-extension://"));
      return workerUrl || extensionPage?.url() || "";
    }, { timeout: 20_000 }).not.toBe("");
    const extensionUrl = context.serviceWorkers()[0]?.url()
      || context.pages().find((page) => page.url().startsWith("chrome-extension://"))?.url()
      || "";
    const extensionId = new URL(extensionUrl).host;
    await expect.poll(
      () => context.pages().some((page) => page.url() === `chrome-extension://${extensionId}/options.html`),
      { timeout: 20_000 }
    ).toBe(true);

    const target = await context.newPage();
    await target.goto("https://workflows.example.test/apply?private=never-report");
    await expect(target.getByRole("heading", { name: "Anonymous K3 workflow ground truth" })).toBeVisible();

    let panel = await context.newPage();
    await panel.setViewportSize({ width: 440, height: 1100 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async (profile) => {
      await chrome.storage.local.set({
        "qiuzhao.privacyAcknowledged": true,
        "qiuzhao.candidateProfile": profile
      });
    }, anonymousKernelProfile());
    await panel.reload();
    await panel.getByRole("button", { name: "连接当前招聘页" }).click();
    await expect(panel.getByRole("heading", { name: "已连接当前招聘页" })).toBeVisible({ timeout: 20_000 });

    const status = await sendBridgeMessage<{
      ok: true;
      session: { sessionId: string; origin: string; path: string };
    }>(panel, { type: "POWER_SESSION_STATUS", requestId: "status_workflow_eval" });
    const sessionId = status.session.sessionId;
    const positive: Array<Record<string, unknown>> = [];

    async function positiveWait(id: string, kind: string, condition: object) {
      await schedule(target, kind);
      const result = await waitFor(panel, sessionId, id, condition);
      expect(result.status, id).toBe("matched");
      positive.push({ id, condition: result.condition, status: result.status, polls: result.polls });
      return result;
    }

    await positiveWait("p01", "find-name", { kind: "find", query: { text: "Delayed Name" }, minimumMatches: 1 });
    await positiveWait("p02", "find-school", { kind: "find", query: { text: "Delayed School" }, minimumMatches: 1 });
    await positiveWait("p03", "enable", { kind: "control-state", query: { text: "Enabled Target" }, state: "enabled", minimumMatches: 1 });
    await positiveWait("p04", "expand", { kind: "control-state", query: { text: "Expand Target" }, state: "expanded", minimumMatches: 1 });
    await positiveWait("p05", "native-options", { kind: "option-list", query: { text: "Native City" }, minimumOptions: 3, optionText: "Beijing" });
    await positiveWait("p06", "custom-options", { kind: "option-list", query: { text: "Custom City" }, minimumOptions: 3, optionText: "Shanghai" });
    const documentNavigation = positiveWait("p07", "document-navigation", { kind: "same-origin-navigation" });
    expect((await documentNavigation).path).toBe("/step-document");
    await target.waitForLoadState("domcontentloaded");
    const spaNavigation = await positiveWait("p08", "spa-navigation", { kind: "same-origin-navigation" });
    expect(spaNavigation.path).toBe("/step-spa");
    await positiveWait("p09", "settle-add", { kind: "dom-settle", quietMs: 180 });
    await positiveWait("p10", "settle-state", { kind: "dom-settle", quietMs: 180 });

    const delayed = await positiveWait("p11", "delayed-action", {
      kind: "find",
      query: { text: "Delayed Full Name" },
      minimumMatches: 1
    });
    let authorizationId = await authorize(panel);
    const delayedAction = await act(panel, fillRequest(
      "action_p11_request",
      authorizationId,
      sessionId,
      delayed.result!.snapshotId,
      delayed.result!.matches[0]!.ref
    ));
    expect(delayedAction.status).toBe("verified");
    expect((await readTarget(target, "p11")).mutationCount).toBe(1);
    positive[positive.length - 1] = { ...positive[positive.length - 1], actionStatus: delayedAction.status };

    const asyncTrigger = await find(panel, "Async Contact Trigger", "find_p12_trigger");
    const openAsync = await act(panel, {
      type: "POWER_PAGE_ACTION",
      requestId: "action_p12_open_request",
      authorizationId,
      sessionId,
      snapshotId: asyncTrigger.snapshotId,
      ref: asyncTrigger.matches[0]!.ref,
      intent: { kind: "click", purpose: "open-control" }
    });
    expect(openAsync.status).toBe("verified");
    const replacement = await waitFor(panel, sessionId, "p12", {
      kind: "option-list",
      query: { text: "Async Contact Choice", roles: ["combobox"] },
      minimumOptions: 2,
      optionText: "2001-02-03"
    });
    expect(replacement.status).toBe("matched");
    const replacementAction = await act(panel, fillRequest(
      "action_p12_request",
      authorizationId,
      sessionId,
      replacement.result!.snapshotId,
      replacement.result!.matches[0]!.ref,
      "basic.birthDate"
    ));
    expect(replacementAction.status, JSON.stringify(replacementAction)).toBe("verified");
    expect((await readTarget(target, "p12")).mutationCount).toBe(1);
    positive.push({
      id: "p12",
      condition: replacement.condition,
      status: replacement.status,
      polls: replacement.polls,
      openStatus: openAsync.status,
      actionStatus: replacementAction.status
    });
    expect(positive).toHaveLength(12);

    const idempotency: Array<Record<string, unknown>> = [];
    authorizationId = await authorize(panel);
    const replayFound = await find(panel, "Replay Target", "find_i01_request");
    const replayRequest = fillRequest(
      "action_i01_request",
      authorizationId,
      sessionId,
      replayFound.snapshotId,
      replayFound.matches[0]!.ref
    );
    const replayFirst = await act(panel, replayRequest);
    const replaySecond = await act(panel, replayRequest);
    expect(replayFirst.status).toBe("verified");
    expect(replaySecond).toEqual(replayFirst);
    expect((await readTarget(target, "i01")).mutationCount).toBe(1);
    idempotency.push({ id: "i01", outcome: "completed-replay", mutationCount: 1 });

    const conflictFound = await find(panel, "Conflict Target", "find_i02_request");
    const conflict = await act(panel, fillRequest(
      "action_i01_request",
      authorizationId,
      sessionId,
      conflictFound.snapshotId,
      conflictFound.matches[0]!.ref
    ));
    expect(conflict).toEqual(expect.objectContaining({ status: "blocked", reason: "duplicate-request-conflict", attempts: 0 }));
    expect((await readTarget(target, "i02")).mutationCount).toBe(0);
    idempotency.push({ id: "i02", outcome: conflict.reason, mutationCount: 0 });

    const concurrentFound = await find(panel, "Concurrent Target", "find_i03_request");
    const concurrentRequest = fillRequest(
      "action_i03_request",
      authorizationId,
      sessionId,
      concurrentFound.snapshotId,
      concurrentFound.matches[0]!.ref
    );
    const concurrent = await Promise.all([act(panel, concurrentRequest), act(panel, concurrentRequest)]);
    expect(concurrent.some((result) => result.status === "verified")).toBe(true);
    expect(concurrent.every((result) => result.status === "verified" || result.reason === "duplicate-request-uncertain")).toBe(true);
    expect((await readTarget(target, "i03")).mutationCount).toBe(1);
    idempotency.push({ id: "i03", outcome: concurrent.map((result) => result.reason ?? result.status), mutationCount: 1 });

    const inflightFound = await find(panel, "Inflight Target", "find_i04_request");
    const inflightRequest = fillRequest(
      "action_i04_request",
      authorizationId,
      sessionId,
      inflightFound.snapshotId,
      inflightFound.matches[0]!.ref
    );
    await panel.evaluate(async (request) => {
      const canonical = (value: unknown): string => {
        if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
        if (value && typeof value === "object") {
          return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
        }
        return JSON.stringify(value) ?? "null";
      };
      const encoded = new TextEncoder().encode(canonical(request));
      const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
      const digest = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const key = "qiuzhao.requestLedger.v1";
      const stored = await chrome.storage.session.get(key);
      const ledger = (stored[key] as { entries?: unknown[] } | undefined) ?? { entries: [] };
      const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
      entries.push({
        requestId: request.requestId,
        sessionId: request.sessionId,
        digest,
        status: "in-flight",
        startedAt: Date.now(),
        expiresAt: Date.now() + 60_000
      });
      await chrome.storage.session.set({ [key]: { entries } });
    }, inflightRequest);
    const uncertain = await act(panel, inflightRequest);
    expect(uncertain).toEqual(expect.objectContaining({ status: "blocked", reason: "duplicate-request-uncertain", attempts: 0 }));
    expect((await readTarget(target, "i04")).mutationCount).toBe(0);
    idempotency.push({ id: "i04", outcome: uncertain.reason, mutationCount: 0 });
    expect(idempotency).toHaveLength(4);

    const workerHost = await context.newCDPSession(panel);
    const targets = await workerHost.send("Target.getTargets") as {
      targetInfos: Array<{ targetId: string; type: string; url: string }>;
    };
    const worker = targets.targetInfos.find((entry) => entry.type === "service_worker" && entry.url.includes(extensionId));
    expect(worker).toBeTruthy();
    await workerHost.send("Target.closeTarget", { targetId: worker!.targetId });
    const replayAfterRestart = await act(panel, replayRequest);
    expect(replayAfterRestart).toEqual(replayFirst);
    expect((await readTarget(target, "i01")).mutationCount).toBe(1);
    idempotency[0] = { ...idempotency[0], workerRestartReplay: true };

    const failures: Array<Record<string, unknown>> = [];
    async function failedWait(id: string, condition: object, reason: string, timeoutMs = 250) {
      const result = await waitFor(panel, sessionId, id, condition, timeoutMs);
      expect(result.reason, id).toBe(reason);
      expect(result.status, id).not.toBe("matched");
      failures.push({ id, status: result.status, reason: result.reason, polls: result.polls });
    }
    await failedWait("f01", { kind: "find", query: { text: "Never Exists" }, minimumMatches: 1 }, "timeout");
    const staleFound = await find(panel, "Conflict Target", "find_f02_stale");
    authorizationId = await authorize(panel);
    await sendBridgeMessage(panel, { type: "POWER_PAGE_STATE", requestId: "invalidate_f02_snapshot" });
    const staleAction = await act(panel, fillRequest(
      "action_f02_stale",
      authorizationId,
      sessionId,
      staleFound.snapshotId,
      staleFound.matches[0]!.ref
    ));
    expect(staleAction).toEqual(expect.objectContaining({ status: "failed", reason: "stale-reference", attempts: 0 }));
    expect((await readTarget(target, "i02")).mutationCount).toBe(0);
    failures.push({ id: "f02", status: staleAction.status, reason: staleAction.reason, mutationCount: 0 });
    await failedWait("f03", { kind: "control-state", query: { text: "Expand Target" }, state: "collapsed", minimumMatches: 1 }, "timeout");
    await failedWait("f04", { kind: "option-list", query: { text: "Native City" }, minimumOptions: 20 }, "timeout");
    await schedule(target, "never-settle");
    await failedWait("f05", { kind: "dom-settle", quietMs: 100 }, "timeout", 250);

    const crossFound = await find(panel, "Cross Guard", "find_cross_guard");
    authorizationId = await authorize(panel);
    const crossAction = fillRequest(
      "action_cross_guard",
      authorizationId,
      sessionId,
      crossFound.snapshotId,
      crossFound.matches[0]!.ref
    );
    await schedule(target, "cross-origin");
    const crossWait = await waitFor(panel, sessionId, "f06", { kind: "same-origin-navigation" }, 1_500);
    expect(crossWait).toEqual(expect.objectContaining({ status: "failed", reason: "origin-changed" }));
    const blockedAfterOriginChange = await act(panel, crossAction);
    expect(blockedAfterOriginChange.status).not.toBe("verified");
    failures.push({
      id: "f06",
      status: crossWait.status,
      reason: crossWait.reason,
      postNavigationAction: blockedAfterOriginChange.reason
    });
    expect(failures).toHaveLength(6);

    const malformed = await panel.evaluate(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "POWER_PAGE_WAIT",
          requestId: "wait_malformed_request",
          sessionId: "power_session_1234",
          condition: { kind: "find", query: { text: "Name", selector: "#private" }, minimumMatches: 1 },
          timeoutMs: 1_000,
          pollIntervalMs: 50
        });
        return response === undefined;
      }
      catch {
        return true;
      }
    });
    expect(malformed).toBe(true);

    const positiveMatched = positive.filter((entry) => entry.status === "matched").length;
    const failureBlocked = failures.filter((entry) => entry.status !== "matched").length;
    const idempotencyPassed = idempotency.filter((entry) => Number(entry.mutationCount) <= 1).length;
    expect(positiveMatched).toBe(12);
    expect(failureBlocked).toBe(6);
    expect(idempotencyPassed).toBe(4);

    const report = {
      schemaVersion: 1,
      feature: "F040",
      level: "L1",
      fixtureId: "anonymous-kernel-workflows-v1",
      environment: { browserFamily: "Chromium", extensionMode: "unpacked", https: true },
      denominators: { positive: 12, boundedFailure: 6, idempotency: 4 },
      metrics: {
        positiveMatched: { numerator: positiveMatched, denominator: 12, rate: positiveMatched / 12, threshold: 1 },
        boundedFailure: { numerator: failureBlocked, denominator: 6, rate: failureBlocked / 6, threshold: 1 },
        idempotency: { numerator: idempotencyPassed, denominator: 4, rate: idempotencyPassed / 4, threshold: 1 }
      },
      cases: positive,
      failures,
      idempotency,
      zeroCounts: {
        duplicateMutation: 0,
        crossOriginAction: blockedAfterOriginChange.status === "verified" ? 1 : 0,
        finalSubmission: 0,
        unboundedWait: 0,
        forbiddenLeak: 0
      }
    };
    const serializedReport = JSON.stringify(report);
    expect(serializedReport).not.toMatch(/authorizationId|sessionId|snapshotId|"ref"|selector|xpath|script|backendNodeId|cookie|password|private=never-report/i);
    expect(Object.values(report.zeroCounts).every((count) => count === 0)).toBe(true);
    await mkdir("artifacts", { recursive: true });
    await writeFile("artifacts/kernel-workflows-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");

    await panel.evaluate((summary) => {
      const card = document.createElement("section");
      card.id = "kernel-workflows-aggregate";
      card.style.cssText = "margin:12px;padding:20px;border-radius:28px;background:#E8DCC7;color:#606C38;font:600 13px/1.6 Epilogue,sans-serif";
      card.innerHTML = `
        <p style="margin:0;color:#B08B6E">K3 · REAL CHROME EVIDENCE</p>
        <h2 style="margin:4px 0 12px;color:#606C38">Bounded workflow kernel</h2>
        <p>Positive ${summary.positive}/12 · Failure closure ${summary.failures}/6</p>
        <p>Idempotency ${summary.idempotency}/4 · Red-line counts 0</p>`;
      document.body.prepend(card);
    }, { positive: positiveMatched, failures: failureBlocked, idempotency: idempotencyPassed });
    await expect(panel.locator("#kernel-workflows-aggregate")).toBeVisible();
    await panel.screenshot({ path: "artifacts/kernel-workflows.png", fullPage: true });
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
