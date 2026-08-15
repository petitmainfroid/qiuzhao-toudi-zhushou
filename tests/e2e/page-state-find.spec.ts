import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";

type SafeControl = {
  ref: string;
  role: string;
  boundary: "main" | "same-origin-frame" | "open-shadow";
  safety: string;
  semantics: { label?: string };
};

type SafeState = {
  snapshotId: string;
  controls: SafeControl[];
  summary: {
    controlCount: number;
    frameCount: number;
    openShadowRootCount: number;
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
        // Try the next cached browser layout.
      }
    }
  }
  return undefined;
}

function anonymousFrame(): string {
  return `<!doctype html>
    <html lang="zh-CN">
      <body>
        <h2>匿名内嵌步骤</h2>
        <label for="referrer">推荐人姓名</label>
        <input id="referrer" name="referrerName" value="PRIVATE-REFERRER-5137">
      </body>
    </html>`;
}

function anonymousRecruitmentPage(): string {
  return `<!doctype html>
    <html lang="zh-CN">
      <head><meta charset="utf-8"><title>匿名校招结构验收</title></head>
      <body>
        <main>
          <h1>匿名校招申请</h1>
          <label for="PRIVATE-DOM-ID-9381">姓名</label>
          <input id="PRIVATE-DOM-ID-9381" class="PRIVATE-CLASS-6248" name="fullName" value="PRIVATE-FULL-NAME-9843" required>

          <input aria-label="手机号码" name="mobile" value="13912345678">
          <input placeholder="电子邮箱" name="email" value="private@example.test">
          <span>当前城市</span><input name="currentCity" value="PRIVATE-CITY-4412">
          <label>出生日期 <input type="date" name="birthDate" value="2000-01-02"></label>

          <label for="degree">最高学历</label>
          <select id="degree" name="highestDegree">
            <option>本科</option><option selected>硕士</option><option>博士</option>
          </select>

          <label><input type="checkbox" name="consent" checked> 同意隐私说明</label>
          <label><input type="radio" name="gender" value="male"> 男</label>
          <label><input type="radio" name="gender" value="female" checked> 女</label>

          <p id="position-label">期望岗位</p>
          <div role="combobox" aria-labelledby="position-label" tabindex="0">请选择岗位</div>
          <div role="listbox" aria-label="工作地点" tabindex="0"><div>北京</div><div>上海</div></div>
          <button type="button">新增实习经历</button>
          <a href="/privacy">隐私说明</a>
          <div role="switch" aria-label="接受岗位推荐" tabindex="0"></div>
          <div contenteditable="true" aria-label="个人优势">PRIVATE-EDITABLE-9964</div>

          <label>账号密码 <input type="password" name="password" value="PRIVATE-PASSWORD-5592"></label>
          <label>短信验证码 <input name="smsCode" value="731902"></label>
          <label>身份证号 <input name="identityNumber" value="110101200001020019"></label>
          <button id="final-submit" type="button">提交申请</button>
          <label>常用简历 PDF <input type="file" name="resumeFile" accept="application/pdf"></label>

          <label>毕业院校 <input name="schoolName" value="PRIVATE-SCHOOL-2386"></label>
          <label>意向方向 <input name="jobDirection" value="PRIVATE-DIRECTION-7418"></label>
          <div id="shadow-host"></div>
          <iframe title="同源招聘子表单" src="/frame"></iframe>
        </main>
        <script>
          window.__submitCount = 0;
          document.getElementById('final-submit').addEventListener('click', () => { window.__submitCount += 1; });
          const root = document.getElementById('shadow-host').attachShadow({ mode: 'open' });
          root.innerHTML = '<label for="portfolio">作品集链接</label><input id="portfolio" name="portfolioUrl" value="https://private.example/portfolio">';
        </script>
      </body>
    </html>`;
}

async function sendBridgeMessage<T>(panel: import("@playwright/test").Page, request: object): Promise<T> {
  return panel.evaluate(async (payload) => chrome.runtime.sendMessage(payload), request) as Promise<T>;
}

test("privacy-safe state/find reaches anonymous HTTPS ground truth without leaking or submitting", async () => {
  test.setTimeout(120_000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-page-state-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    await context.route("https://state.example.test/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: pathname === "/frame" ? anonymousFrame() : anonymousRecruitmentPage()
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

    // A fresh extension install opens options asynchronously. Let that one-time
    // navigation finish before creating the recruitment tab so it cannot steal it.
    await expect.poll(
      () => context.pages().some((page) => page.url() === `chrome-extension://${extensionId}/options.html`),
      { timeout: 20_000 }
    ).toBe(true);

    const target = await context.newPage();
    await target.goto("https://state.example.test/apply?PRIVATE_QUERY=must-not-leak");
    await expect(target.getByRole("heading", { name: "匿名校招申请" })).toBeVisible();
    await expect(target.frameLocator("iframe").getByRole("heading", { name: "匿名内嵌步骤" })).toBeVisible();

    const panel = await context.newPage();
    await panel.setViewportSize({ width: 440, height: 1100 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async () => {
      await chrome.storage.local.set({ "qiuzhao.privacyAcknowledged": true });
    });
    await panel.reload();
    await panel.getByRole("button", { name: "连接当前招聘页" }).click();
    await expect(panel.getByRole("heading", { name: "已连接当前招聘页" })).toBeVisible({ timeout: 20_000 });

    const firstResponse = await sendBridgeMessage<{ ok: true; state: SafeState }>(panel, {
      type: "POWER_PAGE_STATE",
      requestId: "state_eval_first"
    });
    const secondResponse = await sendBridgeMessage<{ ok: true; state: SafeState }>(panel, {
      type: "POWER_PAGE_STATE",
      requestId: "state_eval_second"
    });
    expect(firstResponse.ok).toBe(true);
    expect(secondResponse.ok).toBe(true);
    const first = firstResponse.state;
    const second = secondResponse.state;

    const expectedLabels = [
      "姓名", "手机号码", "电子邮箱", "当前城市", "出生日期", "最高学历", "同意隐私说明",
      "男", "女", "期望岗位", "工作地点", "新增实习经历", "隐私说明", "接受岗位推荐", "个人优势",
      "账号密码", "短信验证码", "身份证号", "提交申请", "常用简历 PDF", "毕业院校", "意向方向",
      "作品集链接", "推荐人姓名"
    ];
    const foundLabels = new Set(first.controls.map((control) => control.semantics.label).filter(Boolean));
    const foundExpected = expectedLabels.filter((label) => foundLabels.has(label));
    const recall = foundExpected.length / expectedLabels.length;
    expect(recall).toBeGreaterThanOrEqual(0.95);

    const secondRefs = new Map(second.controls.map((control) => [`${control.role}:${control.semantics.label}`, control.ref]));
    const stableControls = first.controls.filter((control) => secondRefs.get(`${control.role}:${control.semantics.label}`) === control.ref);
    const referenceStability = stableControls.length / first.controls.length;
    expect(referenceStability).toBe(1);
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(first.summary.frameCount).toBeGreaterThanOrEqual(2);
    expect(first.summary.openShadowRootCount).toBeGreaterThanOrEqual(1);
    expect(first.controls.find((control) => control.semantics.label === "作品集链接")?.boundary).toBe("open-shadow");
    expect(first.controls.find((control) => control.semantics.label === "推荐人姓名")?.boundary).toBe("same-origin-frame");

    const serialized = JSON.stringify(first);
    const forbiddenFragments = [
      "PRIVATE-FULL-NAME-9843", "13912345678", "private@example.test", "PRIVATE-CITY-4412",
      "PRIVATE-PASSWORD-5592", "731902", "110101200001020019", "PRIVATE-SCHOOL-2386",
      "PRIVATE-EDITABLE-9964", "PRIVATE-DOM-ID-9381", "PRIVATE-CLASS-6248", "PRIVATE_QUERY",
      "must-not-leak", "private.example/portfolio", "PRIVATE-REFERRER-5137"
    ];
    const leakedFragments = forbiddenFragments.filter((fragment) => serialized.includes(fragment));
    expect(leakedFragments).toEqual([]);
    const forbiddenKeys = new Set(["value", "checked", "selected", "id", "class", "style", "selector", "nodeId", "backendNodeId", "frameId"]);
    const emittedForbiddenKeys: string[] = [];
    function inspectKeys(value: unknown): void {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) return value.forEach(inspectKeys);
      for (const [key, child] of Object.entries(value)) {
        if (forbiddenKeys.has(key)) emittedForbiddenKeys.push(key);
        inspectKeys(child);
      }
    }
    inspectKeys(first);
    expect(emittedForbiddenKeys).toEqual([]);

    const findQueries = ["毕业院校", "硕士", "期望岗位", "作品集链接", "推荐人姓名"];
    const findTopLabels: Record<string, string | undefined> = {};
    for (const [index, query] of findQueries.entries()) {
      const response = await sendBridgeMessage<{ ok: true; result: { matches: Array<{ label: string }> } }>(panel, {
        type: "POWER_PAGE_FIND",
        requestId: `find_eval_${index}`,
        query: { text: query, limit: 5 }
      });
      expect(response.ok).toBe(true);
      findTopLabels[query] = response.result.matches[0]?.label;
    }
    expect(findTopLabels).toEqual({
      "毕业院校": "毕业院校",
      "硕士": "最高学历",
      "期望岗位": "期望岗位",
      "作品集链接": "作品集链接",
      "推荐人姓名": "推荐人姓名"
    });

    expect(first.controls.find((control) => control.semantics.label === "账号密码")?.safety).toBe("credential");
    expect(first.controls.find((control) => control.semantics.label === "短信验证码")?.safety).toBe("verification");
    expect(first.controls.find((control) => control.semantics.label === "身份证号")?.safety).toBe("identity");
    expect(first.controls.find((control) => control.semantics.label === "提交申请")?.safety).toBe("final-submit");
    expect(first.controls.find((control) => control.semantics.label === "常用简历 PDF")?.safety).toBe("file");
    const submissionCount = await target.evaluate(() => (window as unknown as { __submitCount: number }).__submitCount);
    expect(submissionCount).toBe(0);

    await panel.getByRole("button", { name: "读取结构" }).click();
    await expect(panel.getByText(new RegExp(`已识别 ${first.summary.controlCount} 个控件`))).toBeVisible();
    await panel.getByLabel("按字段语义查找").fill("毕业院校");
    await panel.getByRole("button", { name: "查找" }).click();
    await expect(panel.getByRole("list", { name: "语义查找结果" }).getByText("毕业院校", { exact: true })).toBeVisible();
    await panel.screenshot({ path: "artifacts/page-state-find.png", fullPage: true });

    await writeFile("artifacts/page-state-find-report.json", `${JSON.stringify({
      schemaVersion: 1,
      fixture: "anonymous HTTPS recruitment ground truth",
      expectedControlLabels: expectedLabels.length,
      foundExpectedControlLabels: foundExpected.length,
      semanticRecall: recall,
      referenceStability,
      frameCount: first.summary.frameCount,
      openShadowRootCount: first.summary.openShadowRootCount,
      findTopLabels,
      forbiddenLeakCount: leakedFragments.length + emittedForbiddenKeys.length,
      submissionCount
    }, null, 2)}\n`, "utf8");
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
