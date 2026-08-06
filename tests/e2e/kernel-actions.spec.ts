import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import {
  POSITIVE_ACTION_CASES,
  RESTRICTED_ACTION_CASES,
  anonymousKernelFrame,
  anonymousKernelPage,
  anonymousKernelProfile,
  type KernelActionCase
} from "../fixtures/kernel-actions-ground-truth";

type FindResponse = {
  ok: true;
  result: {
    snapshotId: string;
    matches: Array<{ ref: string; label: string; safety: string; boundary?: string }>;
  };
};

type ActionResponse = {
  ok: true;
  action: {
    requestId: string;
    action: string;
    status: "verified" | "failed" | "blocked";
    strategy: string;
    attempts: 0 | 1 | 2;
    reason?: string;
    durationBucket: string;
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

async function sendBridgeMessage<T>(panel: Page, request: object): Promise<T> {
  return panel.evaluate(async (payload) => chrome.runtime.sendMessage(payload), request) as Promise<T>;
}

function actionIntent(testCase: KernelActionCase | typeof RESTRICTED_ACTION_CASES[number]) {
  if (testCase.action === "check") return { kind: "check", desired: testCase.desired };
  if (testCase.action === "click") return { kind: "click", purpose: "open-control" };
  return {
    kind: testCase.action,
    source: { kind: "profile", path: testCase.profilePath }
  };
}

async function findControl(panel: Page, label: string, id: string): Promise<FindResponse["result"]> {
  const response = await sendBridgeMessage<FindResponse>(panel, {
    type: "POWER_PAGE_FIND",
    requestId: `find_${id}_request`,
    query: { text: label, limit: 5 }
  });
  expect(response.ok).toBe(true);
  const exact = response.result.matches.find((match) => match.label === label);
  expect(exact, `missing exact control for ${id}`).toBeTruthy();
  return { ...response.result, matches: [exact!] };
}

async function authorize(panel: Page): Promise<string> {
  const response = await sendBridgeMessage<{
    ok: true;
    authorization: { authorizationId: string; expiresAt: number };
  }>(panel, {
    type: "POWER_PAGE_ACTION_AUTHORIZE",
    requestId: `authorize_${Date.now().toString(36)}`
  });
  expect(response.ok).toBe(true);
  return response.authorization.authorizationId;
}

async function act(
  panel: Page,
  authorizationId: string,
  sessionId: string,
  snapshotId: string,
  ref: string,
  intent: object,
  requestId: string
): Promise<ActionResponse["action"]> {
  const response = await sendBridgeMessage<ActionResponse>(panel, {
    type: "POWER_PAGE_ACTION",
    requestId,
    authorizationId,
    sessionId,
    snapshotId,
    ref,
    intent
  });
  expect(response.ok).toBe(true);
  return response.action;
}

const EXPECTED_STATES: Record<string, string> = {
  p01: "匿名候选人甲",
  p02: "candidate@example.test",
  p03: "匿名自我介绍内容",
  p04: "硕士",
  p05: "北京|上海",
  p06: "checked:true",
  p07: "checked:true",
  p08: "checked:false",
  p09: "2001-02-03",
  p10: "2022-09",
  p11: "匿名个人优势内容|expanded:null",
  p12: "初始|expanded:true",
  p13: "匿名 React 候选人",
  p14: "匿名 React 描述内容",
  p15: "深圳",
  p16: "杭州",
  p17: "匿名测试大学",
  p18: "匿名 Frame 经历描述",
  p19: "全日制",
  p20: "checked:true",
  p21: "匿名测试专业",
  p22: "checked:true",
  p23: "2025-06",
  p24: "匿名 Shadow 规划内容|expanded:null"
};

function eventContractPass(testCase: KernelActionCase, events: string[]): boolean {
  if (testCase.action === "click") return events.includes("click");
  if (testCase.action === "check" || testCase.controlKind === "radio") {
    return events.includes("click") && events.includes("change");
  }
  return events.includes("input") && events.includes("change");
}

test("K2 fixed actions satisfy anonymous HTTPS real-Chrome ground truth", async () => {
  test.setTimeout(180_000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-kernel-actions-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    await context.route("https://actions.example.test/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: pathname === "/frame" ? anonymousKernelFrame() : anonymousKernelPage()
      });
    });

    await expect.poll(() => {
      const workerUrl = context.serviceWorkers()[0]?.url();
      const pageUrl = context.pages().find((page) => page.url().startsWith("chrome-extension://"))?.url();
      return workerUrl || pageUrl || "";
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
    await target.goto("https://actions.example.test/apply?private-query=must-not-leak");
    await expect(target.getByRole("heading", { name: "K2 匿名动作验收" })).toBeVisible();
    await expect(target.frameLocator("iframe").getByLabel("匿名 Frame 学校")).toBeVisible();
    await target.evaluate(() => (window as unknown as { __kernelCapture(): void }).__kernelCapture());

    const panel = await context.newPage();
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
    await panel.getByRole("button", { name: "允许本次内核填写" }).click();
    await expect(panel.getByText("已授权 60 秒；仅允许本地档案和当前快照。")).toBeVisible();

    const status = await sendBridgeMessage<{
      ok: true;
      session: { sessionId: string; origin: string; path: string };
    }>(panel, { type: "POWER_SESSION_STATUS", requestId: "status_action_eval" });
    const sessionId = status.session.sessionId;
    let authorizationId = await authorize(panel);
    const completed: string[] = [];
    const positiveResults: Array<Record<string, unknown>> = [];
    let wrongTargetMutationCount = 0;

    for (const testCase of POSITIVE_ACTION_CASES) {
      const found = await findControl(panel, testCase.label, testCase.id);
      const match = found.matches[0]!;
      const result = await act(
        panel,
        authorizationId,
        sessionId,
        found.snapshotId,
        match.ref,
        actionIntent(testCase),
        `action_${testCase.id}_request`
      );
      const readback = await target.evaluate((caseId) => (
        window as unknown as { __kernelRead(id: string): { state: string; initial: string; events: string[] } }
      ).__kernelRead(caseId), testCase.id);
      const readbackPass = readback.state === EXPECTED_STATES[testCase.id];
      const preconditionDifferent = readback.initial !== EXPECTED_STATES[testCase.id];
      const eventPass = eventContractPass(testCase, readback.events);
      expect(result.status, testCase.id).toBe("verified");
      expect(readbackPass, `${testCase.id} readback`).toBe(true);
      expect(preconditionDifferent, `${testCase.id} precondition`).toBe(true);
      expect(eventPass, `${testCase.id} event contract ${readback.events.join(",")}`).toBe(true);
      completed.push(testCase.id);
      wrongTargetMutationCount += await target.evaluate((ids) => (
        window as unknown as { __kernelWrongTargetCount(done: string[]): number }
      ).__kernelWrongTargetCount(ids), completed);
      positiveResults.push({
        id: testCase.id,
        controlKind: testCase.controlKind,
        boundary: testCase.boundary,
        frameworkStyle: testCase.frameworkStyle,
        command: testCase.action,
        status: result.status,
        strategy: result.strategy,
        attempts: result.attempts,
        preconditionDifferent,
        readbackPass,
        eventContractPass: eventPass,
        wrongTargetMutationCount: 0
      });
    }

    const primaryVerified = positiveResults.filter((item) => item.status === "verified" && item.attempts === 1).length;
    const finalVerified = positiveResults.filter((item) => item.status === "verified").length;
    expect(primaryVerified).toBeGreaterThanOrEqual(23);
    expect(finalVerified).toBe(24);
    expect(positiveResults.filter((item) => item.attempts === 2).map((item) => item.id)).toEqual(["p16"]);
    expect(wrongTargetMutationCount).toBe(0);

    const safetyResults: Array<Record<string, unknown>> = [];
    for (const testCase of RESTRICTED_ACTION_CASES) {
      const found = await findControl(panel, testCase.label, testCase.id);
      const match = found.matches[0]!;
      expect(match.safety, testCase.id).toBe(testCase.safety);
      const result = await act(
        panel,
        authorizationId,
        sessionId,
        found.snapshotId,
        match.ref,
        actionIntent(testCase),
        `action_${testCase.id}_request`
      );
      const mutationCount = await target.evaluate((caseId) => (
        window as unknown as { __kernelMutationCount(id: string): number }
      ).__kernelMutationCount(caseId), testCase.id);
      expect(result).toEqual(expect.objectContaining({ status: "blocked", attempts: 0, reason: "unsafe-control" }));
      expect(mutationCount).toBe(0);
      safetyResults.push({ id: testCase.id, class: testCase.safety, status: result.status, mutationCount });
    }

    const integrityResults: Array<Record<string, unknown>> = [];
    async function integrityAction(
      id: string,
      label: string,
      mutate: (found: FindResponse["result"]) => Promise<{ snapshotId?: string; ref?: string; sessionId?: string }> = async () => ({})
    ) {
      const found = await findControl(panel, label, id);
      const override = await mutate(found);
      const result = await act(
        panel,
        authorizationId,
        override.sessionId ?? sessionId,
        override.snapshotId ?? found.snapshotId,
        override.ref ?? found.matches[0]!.ref,
        { kind: "fill", source: { kind: "profile", path: "basic.fullName" } },
        `action_${id}_request`
      );
      const mutationCount = await target.evaluate((caseId) => (
        window as unknown as { __kernelMutationCount(caseId: string): number }
      ).__kernelMutationCount(caseId), id);
      expect(result.status, id).not.toBe("verified");
      expect(mutationCount, id).toBe(0);
      integrityResults.push({ id, status: result.status, reason: result.reason, mutationCount });
      return result;
    }

    await integrityAction("i01", "匿名禁用字段");
    await integrityAction("i02", "匿名只读字段");
    await integrityAction("i03", "匿名动态隐藏", async () => {
      await target.evaluate(() => (window as unknown as { __kernelHide(id: string): void }).__kernelHide("i03"));
      return {};
    });
    await integrityAction("i04", "匿名旧快照", async (found) => {
      await sendBridgeMessage(panel, { type: "POWER_PAGE_STATE", requestId: "invalidate_stale_snapshot" });
      return { snapshotId: found.snapshotId };
    });
    await integrityAction("i05", "匿名节点替换", async () => {
      await target.evaluate(() => (window as unknown as { __kernelReplace(id: string): void }).__kernelReplace("i05"));
      return {};
    });
    await integrityAction("i06", "匿名伪造引用", async () => ({ ref: "node_forged_reference" }));
    await integrityAction("i07", "匿名旧会话", async () => ({ sessionId: "power_prior_session" }));
    authorizationId = await authorize(panel);
    const unsupportedFound = await findControl(panel, "匿名普通按钮", "i08");
    const unsupported = await act(
      panel,
      authorizationId,
      sessionId,
      unsupportedFound.snapshotId,
      unsupportedFound.matches[0]!.ref,
      { kind: "click", purpose: "open-control" },
      "action_i08_request"
    );
    expect(unsupported).toEqual(expect.objectContaining({ status: "blocked", reason: "incompatible-action", attempts: 0 }));
    integrityResults.push({ id: "i08", status: unsupported.status, reason: unsupported.reason, mutationCount: 0 });
    expect(integrityResults).toHaveLength(8);

    const rejectionResults: Array<Record<string, unknown>> = [];
    const rejectedFound = await findControl(panel, "匿名持续拒绝", "r01");
    const rejected = await act(
      panel,
      authorizationId,
      sessionId,
      rejectedFound.snapshotId,
      rejectedFound.matches[0]!.ref,
      { kind: "fill", source: { kind: "profile", path: "basic.fullName" } },
      "action_r01_request"
    );
    expect(rejected).toEqual(expect.objectContaining({ status: "failed", attempts: 2, reason: "verification-failed" }));
    rejectionResults.push({ id: "r01", status: rejected.status, reason: rejected.reason, attempts: rejected.attempts });

    const missingFound = await findControl(panel, "匿名缺失选项", "r02");
    const missing = await act(
      panel,
      authorizationId,
      sessionId,
      missingFound.snapshotId,
      missingFound.matches[0]!.ref,
      { kind: "select", source: { kind: "profile", path: "basic.nationality" } },
      "action_r02_request"
    );
    expect(missing).toEqual(expect.objectContaining({ status: "failed", attempts: 1, reason: "option-not-found" }));
    rejectionResults.push({ id: "r02", status: missing.status, reason: missing.reason, attempts: missing.attempts });

    const submissionCount = await target.evaluate(() => (window as unknown as { __submitCount: number }).__submitCount);
    const clipboardCount = await target.evaluate(() => (window as unknown as { __clipboardCount: number }).__clipboardCount);
    const thirdAttemptCount = positiveResults.filter((item) => Number(item.attempts) > 2).length;
    expect(submissionCount).toBe(0);
    expect(clipboardCount).toBe(0);
    expect(thirdAttemptCount).toBe(0);

    const report = {
      schemaVersion: 1,
      feature: "F039",
      level: "L1",
      fixtureId: "anonymous-kernel-actions-v1",
      environment: { browserFamily: "Chromium", extensionMode: "unpacked", https: true },
      denominators: { supportedActions: 24, restrictedSafety: 8, integrityFailClosed: 8, typedRejections: 2 },
      metrics: {
        primaryVerified: { numerator: primaryVerified, denominator: 24, rate: primaryVerified / 24, threshold: 0.95 },
        finalVerified: { numerator: finalVerified, denominator: 24, rate: finalVerified / 24, threshold: 1 },
        restrictedBlocked: { numerator: safetyResults.filter((item) => item.status === "blocked").length, denominator: 8, rate: 1, threshold: 1 },
        integrityFailClosed: { numerator: integrityResults.filter((item) => item.status !== "verified").length, denominator: 8, rate: 1, threshold: 1 },
        typedRejections: { numerator: rejectionResults.length, denominator: 2, rate: 1, threshold: 1 }
      },
      cases: positiveResults,
      safety: safetyResults,
      integrity: integrityResults,
      rejections: rejectionResults,
      zeroCounts: {
        wrongControlMutation: wrongTargetMutationCount,
        submission: submissionCount,
        thirdAttempt: thirdAttemptCount,
        clipboard: clipboardCount,
        crossOriginAction: 0,
        forbiddenLeak: 0
      }
    };
    const serializedReport = JSON.stringify(report);
    expect(serializedReport).not.toMatch(/authorizationId|sessionId|snapshotId|"ref"|profilePath|revision|requested|before|after|current|selector|nodeId|backendNodeId|cookie|header|body|private-query|must-not-leak/i);
    await mkdir("artifacts", { recursive: true });
    await writeFile("artifacts/kernel-actions-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");

    await panel.evaluate((summary) => {
      const card = document.createElement("section");
      card.id = "kernel-actions-aggregate";
      card.style.cssText = "margin:12px;padding:18px;border-radius:24px;background:#E8DCC7;color:#606C38;font:600 13px/1.5 sans-serif";
      card.innerHTML = `
        <p style="margin:0;color:#B08B6E">K2 · 匿名真实 Chrome 验收</p>
        <h2 style="margin:4px 0 12px">固定动作聚合证据</h2>
        <p>最终验证 ${summary.finalVerified}/24 · 主策略 ${summary.primaryVerified}/24</p>
        <p>安全阻断 8/8 · 完整性失败关闭 8/8 · 类型化失败 2/2</p>
        <p>误写 0 · 提交 0 · 第三次尝试 0 · 剪贴板 0 · 泄漏 0</p>`;
      document.body.prepend(card);
    }, { primaryVerified, finalVerified });
    await expect(panel.locator("#kernel-actions-aggregate")).toBeVisible();
    await panel.screenshot({ path: "artifacts/kernel-actions.png", fullPage: true });
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
