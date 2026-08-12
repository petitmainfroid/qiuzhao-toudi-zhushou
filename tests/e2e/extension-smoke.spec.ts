import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";

function escapePdfText(value: string): string {
  return value.replace(/([\\()])/g, "\\$1");
}

function buildPdf(lines: string[]): Buffer {
  const textCommands = lines.map((line, index) => `${index === 0 ? "72 740 Td" : "0 -18 Td"} (${escapePdfText(line)}) Tj`).join("\n");
  const stream = `BT\n/F1 12 Tf\n${textCommands}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
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
        // Try the next cached layout or revision.
      }
    }
  }
  return undefined;
}

test("unpacked extension boots and parses a local PDF on its options page", async () => {
  test.setTimeout(60000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-extension-"));
  const executablePath = await latestCachedChromium();
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const extensionUrl = await expect.poll(() => {
      const workerUrl = context.serviceWorkers()[0]?.url();
      const pageUrl = context.pages().find((page) => page.url().startsWith("chrome-extension://"))?.url();
      return workerUrl || pageUrl || "";
    }, { timeout: 20000 }).not.toBe("").then(() => {
      const workerUrl = context.serviceWorkers()[0]?.url();
      const pageUrl = context.pages().find((page) => page.url().startsWith("chrome-extension://"))?.url();
      return workerUrl || pageUrl || "";
    });
    const extensionId = new URL(extensionUrl).host;
    expect(extensionId).not.toBe("");

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.getByRole("heading", { name: "先确认数据如何被使用。" })).toBeVisible();
    await page.getByRole("button", { name: "我已了解，开始建立档案" }).click();
    await page.getByLabel("从简历导入档案信息").setInputFiles({
      name: "extension-smoke.pdf",
      mimeType: "application/pdf",
      buffer: buildPdf(["Extension Smoke", "13800138002", "extension.smoke@example.com"])
    });
    await expect(page.getByText(/PDF，1 页\s+已在本机完成解析/)).toBeVisible({ timeout: 30000 });
    await expect(page.getByLabel("姓名")).toHaveValue("Extension Smoke");
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
