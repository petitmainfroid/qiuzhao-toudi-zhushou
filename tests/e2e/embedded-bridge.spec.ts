import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";

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

    const target = await context.newPage();
    await target.goto("https://jobs.example.test/apply/1?private=query-is-not-status");
    await expect(target.getByRole("heading", { name: "Anonymous application /apply/1" })).toBeVisible();

    const panel = await context.newPage();
    await panel.setViewportSize({ width: 420, height: 900 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async () => {
      await chrome.storage.local.set({ "qiuzhao.privacyAcknowledged": true });
    });
    await panel.reload();

    await panel.getByRole("button", { name: "连接当前招聘页" }).click();
    await expect(panel.getByRole("heading", { name: "已连接当前招聘页" })).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText("https://jobs.example.test", { exact: true })).toBeVisible();
    await expect(panel.getByText("/apply/1", { exact: true })).toBeVisible();
    await expect(panel.getByText(/5 个控件 · 1 个 frame/)).toBeVisible();
    await expect(panel.getByText("query-is-not-status")).toHaveCount(0);
    await panel.screenshot({ path: "artifacts/embedded-bridge.png", fullPage: true });

    expect(await target.evaluate(() => (window as unknown as { __submitCount: number }).__submitCount)).toBe(0);
    await target.goto("https://jobs.example.test/apply/2?private=still-not-status");
    await panel.getByRole("button", { name: "刷新状态" }).click();
    await expect(panel.getByText("/apply/2", { exact: true })).toBeVisible();
    await expect(panel.getByText("still-not-status")).toHaveCount(0);
    expect(await target.evaluate(() => (window as unknown as { __submitCount: number }).__submitCount)).toBe(0);

    await target.goto("https://other.example.test/continue");
    await panel.getByRole("button", { name: "刷新状态" }).click();
    await expect(panel.getByRole("heading", { name: "会话已安全暂停" })).toBeVisible();
    await expect(panel.getByText("页面已切换到其他站点，会话已暂停。")).toBeVisible();
    expect(await target.evaluate(() => (window as unknown as { __submitCount: number }).__submitCount)).toBe(0);
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
