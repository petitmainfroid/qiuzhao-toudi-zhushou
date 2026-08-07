import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { importAtsCorpusSample } from "../../scripts/ats-corpus/core.mjs";
import { auditXiaomiObservationFile } from "../../scripts/ats-corpus/xiaomi-observation-audit.mjs";

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

function buildCollectorExtension(): void {
  const npmExecPath = process.env.npm_execpath;
  const result = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, "run", "build:collector"], {
        cwd: process.cwd(),
        encoding: "utf8"
      })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:collector"], {
        cwd: process.cwd(),
        encoding: "utf8"
      });
  if (result.status !== 0) {
    throw new Error(`Collector build failed.\n${result.stdout}\n${result.stderr}`);
  }
}

function xiaomiDerivedAnonymousPage(): string {
  return `<!doctype html>
    <html lang="zh-CN">
      <head><meta charset="utf-8"><title>小米派生匿名申请表</title></head>
      <body>
        <main>
          <h1>匿名实习申请</h1>
          <section aria-labelledby="resume-section">
            <h2 id="resume-section">简历</h2>
            <label>上传简历 <input type="file" accept="application/pdf"><span>synthetic-private-resume.pdf 上次上传 2026-08-07 10:30 更新 删除</span></label>
          </section>
          <section aria-labelledby="basic-section">
            <h2 id="basic-section">基本信息</h2>
            <label>姓名 <input name="name" value="Private Candidate"></label>
            <label>手机号 <input name="mobile" value="13800138000"></label>
            <label>邮箱 <input name="email" value="candidate@example.com"></label>
            <label>年龄 <input type="number" name="age" value="24"></label>
            <label>性别 <select name="gender"><option>女</option><option>男</option></select></label>
            <label>国籍（地区） <select name="nationality"><option>中国</option></select></label>
            <button type="button" role="combobox" aria-label="家乡">选择家乡</button>
            <label>个人证件 <input name="identification" aria-label="身份证号" value="110101199001011234"></label>
            <label>期望工作地点 <select name="preferred_city_list" multiple><option>北京</option><option>上海</option></select></label>
          </section>
          <section aria-labelledby="education-section">
            <h2 id="education-section">教育经历</h2>
            <label>学校名称 <input name="education_list[0].school" required></label>
            <button type="button" role="combobox" aria-label="学历" aria-required="true">选择学历</button>
            <label>专业 <input name="education_list[0].field_of_study" required></label>
            <label>教育开始时间 <input type="month" name="education_list[0].start_end_time.start" required></label>
            <label>教育结束时间 <input type="month" name="education_list[0].start_end_time.end" required></label>
            <label>学历类型 <select name="education_list[0].education_type" required><option>统招全日制</option></select></label>
          </section>
          <section aria-labelledby="internship-section">
            <h2 id="internship-section">实习经历</h2>
            <label>公司名称 <input name="internship_list[0].company" required></label>
            <label>职位名称 <input name="internship_list[0].title" required></label>
            <label>实习开始时间 <input type="month" name="internship_list[0].start_end_time.start" required></label>
            <label>实习结束时间 <input type="month" name="internship_list[0].start_end_time.end" required></label>
            <label>实习描述 <textarea name="internship_list[0].desc"></textarea></label>
          </section>
          <section aria-labelledby="works-section">
            <h2 id="works-section">作品</h2>
            <label>作品链接 <input type="url" name="works_list[0].link"></label>
            <label>作品附件 <input type="file" name="works_list[0].attachment"></label>
            <label>作品描述 <textarea name="works_list[0].desc"></textarea></label>
          </section>
          <section aria-labelledby="project-section">
            <h2 id="project-section">项目经历</h2>
            <label>项目名称 <input name="project_list[0].name" required></label>
            <label>项目角色 <input name="project_list[0].role"></label>
            <label>项目开始时间 <input type="month" name="project_list[0].start_end_time.start"></label>
            <label>项目结束时间 <input type="month" name="project_list[0].start_end_time.end"></label>
            <label>项目链接 <input type="url" name="project_list[0].link"></label>
            <label>项目描述 <textarea name="project_list[0].desc"></textarea></label>
          </section>
          <section aria-labelledby="award-section">
            <h2 id="award-section">获奖</h2>
            <label>获奖名称 <input name="award_list[0].name" required></label>
            <label>获奖时间 <input type="month" name="award_list[0].date"></label>
            <label>获奖描述 <textarea name="award_list[0].desc"></textarea></label>
            <label>获奖证明附件 <input type="file" name="award_list[0].attachment"></label>
          </section>
          <section aria-labelledby="language-section">
            <h2 id="language-section">语言能力</h2>
            <label>语言 <select name="language_list[0].language"><option>英语</option></select></label>
            <label>精通程度 <select name="language_list[0].proficiency"><option>商务会话</option></select></label>
          </section>
          <section aria-labelledby="self-section">
            <h2 id="self-section">自我评价</h2>
            <label>自我评价 <textarea name="self_evaluation.self_evaluation"></textarea></label>
          </section>
          <button id="final-submit" type="button">提交申请</button>
        </main>
        <script>
          window.__submitCount = 0;
          document.getElementById('final-submit').addEventListener('click', () => { window.__submitCount += 1; });
        </script>
      </body>
    </html>`;
}

function metaappDerivedAnonymousPage(): string {
  const field = (label: string, control: string, required = false) => `
    <div class="atsx-form-item${required ? " is-required" : ""}">
      <div class="atsx-label-shell">${required ? '<span class="required-mark">*</span>' : ""}<span class="atsx-label-text">${label}</span></div>
      <div class="field-wrapper">${control}</div>
    </div>`;
  const group = (label: string, fields: string) => `
    <div class="application-block">
      <div class="heading-shell"><span>${label}</span></div>
      <div class="field-list">${fields}</div>
    </div>`;
  return `<!doctype html>
    <html lang="zh-CN">
      <head><meta charset="utf-8"><title>MetaApp 派生匿名申请表</title></head>
      <body>
        <main>
          <h1>匿名软件研发申请</h1>
          ${group("简历", field("简历附件", '<input type="file" accept="application/pdf">', true))}
          ${group("基本信息", [
            field("姓名", '<input type="text" value="Private Candidate">', true),
            field("手机号码", '<input type="tel" value="13800138000">', true),
            field("邮箱", '<input type="email" value="candidate@example.com">', true),
            field("国籍（地区）", '<div role="combobox" aria-expanded="false"></div>')
          ].join(""))}
          ${group("教育经历", [
            field("学校名称", '<input type="text">'),
            field("学历", '<div role="combobox" aria-expanded="false"></div>'),
            field("专业", '<input type="text">'),
            field("起止时间", '<input type="text" value="2024-09 - 2026-06">')
          ].join(""))}
          ${group("实习经历", [
            field("公司名称", '<input type="text">'),
            field("职位名称", '<input type="text">'),
            field("起止时间", '<input type="text" value="2025-01 - 2025-06">'),
            field("描述", '<textarea></textarea>')
          ].join(""))}
          <div role="listbox">
            <div role="option">本科</div>
            <div role="option">硕士</div>
            <div role="option">中国</div>
          </div>
          <button id="meta-final-submit" type="button">提交简历</button>
        </main>
        <script>
          window.__submitCount = 0;
          document.getElementById('meta-final-submit').addEventListener('click', () => { window.__submitCount += 1; });
        </script>
      </body>
    </html>`;
}

test("development-only collector validates Xiaomi and MetaApp ground truth without submission", async () => {
  test.setTimeout(180_000);
  buildCollectorExtension();
  const extensionPath = resolve(process.cwd(), "dist-collector");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-ats-collector-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    await context.route("https://xiaomi.jobs.f.mioffice.cn/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: xiaomiDerivedAnonymousPage()
      });
    });
    await context.route("https://meta.jobs.feishu.cn/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: metaappDerivedAnonymousPage()
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

    // A fresh unpacked profile opens the extension's options page once. Wait for
    // that install-side effect to finish so it cannot reuse and interrupt the
    // HTTPS fixture tab while the full E2E suite is running in parallel.
    await expect.poll(
      () => context.pages().some((page) => page.url() === `chrome-extension://${extensionId}/options.html`),
      { timeout: 20_000 }
    ).toBe(true);
    const target = context.pages().find(
      (page) => page.url() === `chrome-extension://${extensionId}/options.html`
    ) ?? await context.newPage();
    await target.goto("https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply?candidate=private-candidate-token");
    await expect(target.getByRole("heading", { name: "匿名实习申请" })).toBeVisible();

    const panel = await context.newPage();
    await panel.setViewportSize({ width: 440, height: 940 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async () => {
      await chrome.storage.local.set({ "qiuzhao.privacyAcknowledged": true });
    });
    await panel.reload();

    await expect(panel.getByRole("heading", { name: "ATS 匿名结构采集器" })).toBeVisible();
    await panel.getByRole("button", { name: "采集匿名结构" }).click();
    await expect(panel.getByText("隐私检查和独立覆盖验收通过。请先查看预览，再下载匿名 JSON。")).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText("/internship/resume/:id/apply", { exact: true })).toBeVisible();
    await expect(panel.getByText("generic-html · 0%", { exact: true })).toBeVisible();
    await expect(panel.getByText("9 / 9", { exact: true })).toBeVisible();
    await expect(panel.getByText("34 / 34", { exact: true })).toBeVisible();
    await expect(panel.getByText("已识别并保护", { exact: true })).toBeVisible();
    await expect(panel.getByText("学校名称", { exact: true })).toBeVisible();
    await panel.screenshot({ path: "artifacts/xiaomi-ats-collector.png", fullPage: true });

    const downloadPromise = panel.waitForEvent("download");
    await panel.getByRole("button", { name: "下载匿名 JSON" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^ats-observation-application-.*\.json$/);
    const downloadPath = join(userDataDir, "xiaomi-anonymous-observation.json");
    await download.saveAs(downloadPath);

    const observation = JSON.parse(await readFile(downloadPath, "utf8"));
    const serialized = JSON.stringify(observation);
    expect(observation.source).toMatchObject({
      origin: "https://xiaomi.jobs.f.mioffice.cn",
      pathTemplate: "/internship/resume/:id/apply",
      pageType: "application"
    });
    expect(observation.summary.controlCount).toBeGreaterThanOrEqual(34);
    expect(observation.summary.sectionCount).toBe(9);
    expect(observation.sections).toEqual([
      "简历",
      "基本信息",
      "教育经历",
      "实习经历",
      "作品",
      "项目经历",
      "获奖",
      "语言能力",
      "自我评价"
    ]);
    expect(observation.family.id).toBe("generic-html");
    expect(observation.controls.some((control: any) => control.semantics.label === "学校名称")).toBe(true);
    expect(observation.controls.some((control: any) => control.semantics.label === "公司名称")).toBe(true);
    expect(observation.controls.some((control: any) => control.semantics.label === "项目名称")).toBe(true);
    expect(observation.controls.some((control: any) => control.safety === "identity")).toBe(true);
    expect(observation.controls.some((control: any) => control.safety === "file")).toBe(true);
    expect(observation.controls.some((control: any) => control.safety === "final-submit")).toBe(true);
    for (const forbidden of [
      "Private Candidate",
      "13800138000",
      "candidate@example.com",
      "110101199001011234",
      "synthetic-private-resume.pdf",
      "2026-08-07 10:30",
      "上次上传",
      "private-candidate-token",
      "7663053400020879658",
      "snapshotId",
      "opaque-private-reference",
      "backendNodeId",
      "querySelector",
      "outerHTML",
      "Cookie"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(await target.evaluate(() => (window as unknown as { __submitCount: number }).__submitCount)).toBe(0);

    await expect(importAtsCorpusSample(downloadPath, {
      projectRoot: process.cwd(),
      corpusRoot: join(userDataDir, "dry-run-corpus"),
      dryRun: true
    })).resolves.toMatchObject({
      status: "validated",
      pageType: "application"
    });
    await expect(auditXiaomiObservationFile(downloadPath, {
      projectRoot: process.cwd(),
      k1ControlCount: observation.controls.length
    })).resolves.toMatchObject({
      passed: true,
      rawControls: { consistent: true },
      sections: { observed: 9, expected: 9, missing: [] },
      logicalFields: { observed: 34, expected: 34, missing: [] },
      safety: { finalSubmitControls: 1, finalSubmitProtected: true },
      privacyAudit: "passed"
    });

    await target.goto("https://meta.jobs.feishu.cn/140297/resume/7667451369407023396/apply?candidate=private-metaapp-token");
    await expect(target.getByRole("heading", { name: "匿名软件研发申请" })).toBeVisible();
    await panel.getByRole("button", { name: "重新采集匿名结构" }).click();
    await expect(panel.getByText("隐私检查和独立覆盖验收通过。请先查看预览，再下载匿名 JSON。")).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText("https://meta.jobs.feishu.cn", { exact: true })).toBeVisible();
    await expect(panel.getByText("/:id/resume/:id/apply", { exact: true })).toBeVisible();
    await expect(panel.getByText("MetaApp", { exact: true })).toBeVisible();
    await expect(panel.getByText("4 / 4", { exact: true })).toBeVisible();
    await expect(panel.getByText("13 / 13", { exact: true })).toBeVisible();
    await expect(panel.getByText("3 个 · 不计入逻辑字段", { exact: true })).toBeVisible();
    await expect(panel.getByText("已识别并保护", { exact: true })).toBeVisible();
    await panel.screenshot({ path: "artifacts/metaapp-ats-collector.png", fullPage: true });

    const metaappDownloadPromise = panel.waitForEvent("download");
    await panel.getByRole("button", { name: "下载匿名 JSON" }).click();
    const metaappDownload = await metaappDownloadPromise;
    const metaappDownloadPath = join(userDataDir, "metaapp-anonymous-observation.json");
    await metaappDownload.saveAs(metaappDownloadPath);
    const metaappObservation = JSON.parse(await readFile(metaappDownloadPath, "utf8"));
    const metaappSerialized = JSON.stringify(metaappObservation);
    expect(metaappObservation.source).toMatchObject({
      origin: "https://meta.jobs.feishu.cn",
      pathTemplate: "/:id/resume/:id/apply",
      pageType: "application"
    });
    expect(metaappObservation.sections).toEqual(["简历", "基本信息", "教育经历", "实习经历"]);
    expect(metaappObservation.controls.filter((control: any) => control.role === "option")).toHaveLength(3);
    for (const forbidden of [
      "Private Candidate",
      "13800138000",
      "candidate@example.com",
      "2024-09",
      "2025-01",
      "private-metaapp-token",
      "7667451369407023396"
    ]) {
      expect(metaappSerialized).not.toContain(forbidden);
    }
    expect(await target.evaluate(() => (window as unknown as { __submitCount: number }).__submitCount)).toBe(0);
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
