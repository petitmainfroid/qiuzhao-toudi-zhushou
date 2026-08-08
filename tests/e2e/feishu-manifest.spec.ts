import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import type { EmbeddedBridgeRequest, EmbeddedBridgeResponse } from "../../src/bridge/protocol";
import { AtsAdapterRegistry, ChromeRecruitmentKernelApi, RecruitmentAdapterOrchestrator } from "../../src/adapter-sdk";
import { feishuRecruitingManifest } from "../../src/ats/adapters/feishu";
import { feishuManifestPage } from "../fixtures/feishu-manifest-page";

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

function requestId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function send<T>(panel: Page, request: EmbeddedBridgeRequest): Promise<T> {
  return panel.evaluate(async (payload) => chrome.runtime.sendMessage(payload), request) as Promise<T>;
}

test("production Feishu manifest recognizes inherited technical fields without exposing page or file values", async () => {
  test.setTimeout(90_000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-feishu-manifest-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });

  try {
    await context.route("https://synthetic.jobs.feishu.cn/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: feishuManifestPage() });
    });
    await expect.poll(() => context.pages().find(
      (page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url())
    )?.url() ?? "", { timeout: 20_000 }).not.toBe("");
    const panel = context.pages().find(
      (page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url())
    );
    if (!panel) throw new Error("Extension options page did not open.");
    const extensionId = new URL(panel.url()).host;
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async () => {
      await chrome.storage.local.set({ "qiuzhao.privacyAcknowledged": true });
    });
    await panel.reload();
    const target = await context.newPage();
    await target.goto("https://synthetic.jobs.feishu.cn/index/resume/7670064234785491242/apply?candidate=not-reported");
    await expect(target.getByRole("heading", { name: "匿名飞书招聘结构" })).toBeVisible();

    await panel.reload();
    await panel.locator(".power-session-actions button").click();
    await expect.poll(async () => {
      const response = await send<{ ok: true; session: { status: string; sessionId?: string; origin?: string } }>(panel, {
        type: "POWER_SESSION_STATUS",
        requestId: requestId("feishu_status")
      });
      return response.session.status === "active" && response.session.origin === "https://synthetic.jobs.feishu.cn"
        ? response.session.sessionId ?? ""
        : "";
    }, { timeout: 20_000 }).not.toBe("");
    const sessionResponse = await send<{ ok: true; session: { sessionId?: string } }>(panel, {
      type: "POWER_SESSION_STATUS",
      requestId: requestId("feishu_session")
    });
    const sessionId = sessionResponse.session.sessionId ?? "";
    expect(sessionId).not.toBe("");

    const kernel = new ChromeRecruitmentKernelApi({
      send: (request) => panel.evaluate(
        async (payload) => chrome.runtime.sendMessage(payload),
        request
      ) as Promise<EmbeddedBridgeResponse>
    });
    const state = await kernel.state(sessionId);
    const serialized = JSON.stringify(state);
    expect(serialized).toContain("basic_info.name");
    expect(serialized).toContain("education_list[0].school");
    expect(serialized).toContain("[文件]");
    expect(serialized).toContain("[时间]");
    expect(serialized).not.toMatch(/page-name-must-not-leak|page-school-must-not-leak|custom-must-not-leak|private@example\.test|synthetic-private-resume|2026-08-08|12:34|candidate=not-reported/i);

    const resolution = await new RecruitmentAdapterOrchestrator(
      kernel,
      new AtsAdapterRegistry([feishuRecruitingManifest])
    ).scan(sessionId);
    expect(resolution.status).toBe("matched");
    if (resolution.status !== "matched") throw new Error("Expected production Feishu manifest match.");
    expect(resolution.plan.familyId).toBe("feishu-recruiting");
    expect(resolution.plan.fields.map((field) => field.ruleId)).toEqual(expect.arrayContaining([
      "basic-name", "basic-email", "basic-gender", "education-school", "resume-attachment"
    ]));
    expect(resolution.plan.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "unknown-field" }),
      expect.objectContaining({ reason: "final-submit" })
    ]));
    expect(await target.evaluate(() => (
      window as unknown as { __feishuManifestGroundTruth: { read(): { submitCount: number } } }
    ).__feishuManifestGroundTruth.read().submitCount)).toBe(0);
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
