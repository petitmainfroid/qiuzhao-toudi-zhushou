import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { createEmptyProfile } from "../../src/domain/profile";

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
        // Try the next cached Chromium layout or revision.
      }
    }
  }
  return undefined;
}

test("an unknown ATS route fails explicitly and cannot fall back to direct page mutation", async () => {
  test.setTimeout(60_000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-k5-unsupported-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });

  try {
    await context.route("https://unsupported.example.test/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html>
          <html lang="zh-CN">
            <body>
              <h1>未审核 ATS 表单</h1>
              <form id="application-form">
                <label>姓名 <input id="full-name" name="fullName" value="sentinel-unchanged"></label>
                <button id="final-submit" type="submit">最终投递</button>
              </form>
              <script>
                window.__mutationEvidence = { input: 0, change: 0, submit: 0 };
                const field = document.querySelector('#full-name');
                field.addEventListener('input', () => window.__mutationEvidence.input += 1);
                field.addEventListener('change', () => window.__mutationEvidence.change += 1);
                document.querySelector('#application-form').addEventListener('submit', (event) => {
                  event.preventDefault();
                  window.__mutationEvidence.submit += 1;
                });
              </script>
            </body>
          </html>`
      });
    });

    await expect.poll(() => context.pages().find(
      (page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url())
    )?.url() ?? "", { timeout: 20_000 }).not.toBe("");
    const panel = context.pages().find((page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url()));
    if (!panel) throw new Error("Extension options page did not open.");
    const extensionId = new URL(panel.url()).host;
    await panel.setViewportSize({ width: 420, height: 1000 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const profile = createEmptyProfile();
    profile.basic.fullName = "must-not-be-written";
    await panel.evaluate(async (candidateProfile) => {
      await chrome.storage.local.set({
        "qiuzhao.privacyAcknowledged": true,
        "qiuzhao.candidateProfile": candidateProfile
      });
    }, profile);
    await panel.reload();

    const target = await context.newPage();
    await target.goto("https://unsupported.example.test/apply");
    await expect(target.getByRole("heading", { name: "未审核 ATS 表单" })).toBeVisible();

    await panel.locator(".scan-button").click();
    await expect(panel.getByText("当前招聘页面尚未适配；没有扫描或填写任何字段。")).toBeVisible();
    await expect(target.locator("#full-name")).toHaveValue("sentinel-unchanged");
    expect(await target.evaluate(() => (window as typeof window & {
      __mutationEvidence: { input: number; change: number; submit: number };
    }).__mutationEvidence)).toEqual({ input: 0, change: 0, submit: 0 });

    await mkdir(resolve(process.cwd(), "artifacts"), { recursive: true });
    await panel.screenshot({
      path: resolve(process.cwd(), "artifacts/k5-unsupported-page.png"),
      fullPage: true
    });
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
