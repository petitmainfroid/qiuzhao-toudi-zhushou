import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";

type SessionView = {
  status: "inactive" | "active" | "paused";
  origin?: string;
  path?: string;
  reason?: string;
  pageState?: { interactiveCount: number; frameCount: number };
};

async function startSession(panel: Page, targetUrl: string): Promise<SessionView> {
  return panel.evaluate(async (url) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
    if (typeof tab?.id !== "number") throw new Error(`No extension tab found for ${url}`);
    const response = await chrome.runtime.sendMessage({
      type: "POWER_SESSION_START",
      requestId: "embedded_bridge_start",
      tabId: tab.id
    });
    if (!response.ok || !("session" in response)) throw new Error(response.error ?? "Session did not start");
    return response.session;
  }, targetUrl);
}

async function refreshSession(panel: Page): Promise<SessionView> {
  return panel.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({
      type: "POWER_SESSION_REFRESH_STATE",
      requestId: `embedded_bridge_refresh_${Date.now()}`
    });
    if (!response.ok || !("session" in response)) throw new Error(response.error ?? "Session did not refresh");
    return response.session;
  });
}

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
        // Try the next cached browser layout.
      }
    }
  }
  return undefined;
}

function anonymousRecruitmentPage(step: string): string {
  return `<!doctype html>
    <html lang="zh-CN">
      <head><meta charset="utf-8"><title>Anonymous ATS ${step}</title></head>
      <body>
        <main>
          <h1>Anonymous application ${step}</h1>
          <label>姓名 <input name="fullName"></label>
          <label>验证码 <input name="smsCode"></label>
          <label>密码 <input type="password" name="password"></label>
          <select aria-label="学历"><option>本科</option></select>
          <button id="final-submit" type="button">提交申请</button>
        </main>
        <script>
          window.__submitCount = 0;
          document.getElementById('final-submit').addEventListener('click', () => { window.__submitCount += 1; });
        </script>
      </body>
    </html>`;
}

test("embedded bridge pins one HTTPS tab and pauses on Origin change without submitting", async () => {
  test.setTimeout(90_000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-embedded-bridge-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    await context.route("https://jobs.example.test/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: anonymousRecruitmentPage(path)
      });
    });
    await context.route("https://other.example.test/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: anonymousRecruitmentPage("cross-origin")
      });
    });

    await expect.poll(() => {
      const workerUrl = context.serviceWorkers()[0]?.url();
      const extensionPageUrl = context.pages().find((page) => page.url().startsWith("chrome-extension://"))?.url();
      return workerUrl || extensionPageUrl || "";
    }, { timeout: 20_000 }).not.toBe("");
    const extensionUrl = context.serviceWorkers()[0]?.url()
      || context.pages().find((page) => page.url().startsWith("chrome-extension://"))?.url()
      || "";
    const extensionId = new URL(extensionUrl).host;

    await expect.poll(
      () => context.pages().some((page) => page.url() === `chrome-extension://${extensionId}/options.html`),
      { timeout: 20_000 }
    ).toBe(true);
    const target = context.pages().find(
      (page) => page.url() === `chrome-extension://${extensionId}/options.html`
    ) ?? await context.newPage();
    await target.goto("https://jobs.example.test/apply/1?private=query-is-not-status");
    await expect(target.getByRole("heading", { name: "Anonymous application /apply/1" })).toBeVisible();

    const panel = await context.newPage();
    await panel.setViewportSize({ width: 420, height: 900 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async () => {
      await chrome.storage.local.set({ "qiuzhao.privacyAcknowledged": true });
    });
    await panel.reload();

    const started = await startSession(panel, target.url());
    expect(started.status).toBe("active");
    expect(started.origin).toBe("https://jobs.example.test");
    expect(started.path).toBe("/apply/1");
    expect(started.pageState).toMatchObject({ interactiveCount: 5, frameCount: 1 });
    expect(JSON.stringify(started)).not.toContain("query-is-not-status");

    expect(await target.evaluate(() => (window as unknown as { __submitCount: number }).__submitCount)).toBe(0);
    await target.goto("https://jobs.example.test/apply/2?private=still-not-status");
    await expect(target.getByRole("heading", { name: "Anonymous application /apply/2" })).toBeVisible();
    const refreshed = await refreshSession(panel);
    expect(refreshed.path).toBe("/apply/2");
    expect(JSON.stringify(refreshed)).not.toContain("still-not-status");
    expect(await target.evaluate(() => (window as unknown as { __submitCount: number }).__submitCount)).toBe(0);

    await target.goto("https://other.example.test/continue");
    const paused = await refreshSession(panel);
    expect(paused.status).toBe("paused");
    expect(paused.reason).toBe("origin-changed");
    expect(await target.evaluate(() => (window as unknown as { __submitCount: number }).__submitCount)).toBe(0);
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
