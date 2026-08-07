import { expect, test } from "@playwright/test";

test("manual recovery writes one explicitly focused ordinary field and rejects unsafe targets", async ({ page }) => {
  await page.goto("/fixture.html");

  await page.locator("#email").click();
  const target = await page.evaluate(() => window.__qiuzhaoFixture.inspectFocusedRecoveryTarget());
  expect(target).toMatchObject({ status: "ready", fieldLabel: "邮箱", controlKind: "email" });
  expect(JSON.stringify(target)).not.toContain("manual@example.test");
  if (target.status !== "ready") throw new Error("focused target was not authorized");

  const result = await page.evaluate(async ({ token }) => window.__qiuzhaoFixture.fillFocusedRecovery({
    token,
    profilePath: "basic.email",
    value: "manual@example.test"
  }), { token: target.token });
  expect(result).toEqual({ status: "filled", fieldLabel: "邮箱", canonicalLabel: "邮箱" });
  expect(JSON.stringify(result)).not.toContain("manual@example.test");
  await expect(page.locator("#email")).toHaveValue("manual@example.test");

  await page.locator("#captcha").click();
  expect(await page.evaluate(() => window.__qiuzhaoFixture.inspectFocusedRecoveryTarget()))
    .toEqual({ status: "rejected", reason: "verification-control" });

  await page.locator("#password").click();
  expect(await page.evaluate(() => window.__qiuzhaoFixture.inspectFocusedRecoveryTarget()))
    .toEqual({ status: "rejected", reason: "unsafe-control" });

  await page.locator("#email").click();
  expect(await page.evaluate(() => window.__qiuzhaoFixture.inspectFocusedRecoveryTarget()))
    .toEqual({ status: "rejected", reason: "existing-value" });
  expect(await page.evaluate(() => window.__qiuzhaoFixture.submitCount)).toBe(0);
});

test("manual recovery stays behind the one-click result and reveals labels only", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/sidepanel.html");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("qiuzhao.privacyAcknowledged", "true");
    localStorage.setItem("qiuzhao.candidateProfile", JSON.stringify({
      schemaVersion: 4,
      updatedAt: "2026-08-07T08:00:00.000Z",
      basic: {
        fullName: "补填验证用户",
        preferredName: "",
        gender: "",
        birthDate: "2003-08-01",
        phone: "13800000000",
        email: "manual-panel@example.test",
        nationality: "",
        currentCity: "上海",
        hometown: "",
        politicalStatus: ""
      },
      education: [],
      workExperiences: [],
      projects: [{
        id: "manual-project",
        name: "补填验证项目",
        role: "产品",
        startDate: "2026-01",
        endDate: "2026-06",
        description: "只用于本地合成验证。",
        outcome: "",
        link: "https://portfolio.example/synthetic"
      }],
      workSamples: [],
      awards: [],
      languages: [],
      jobPreference: { targetRoles: "产品经理", preferredCities: "上海", availableDate: "" },
      answers: { selfIntroduction: "", selfEvaluation: "", strengths: "", careerPlan: "" }
    }));
  });
  await page.reload();

  await expect(page.getByText("某个字段没填上？")).toHaveCount(0);
  await page.getByRole("button", { name: "自动填写当前页面" }).click();
  await page.getByText("某个字段没填上？").click();
  await page.getByRole("button", { name: "读取刚刚聚焦的字段" }).click();
  await expect(page.getByText("已锁定：未匹配的作品链接")).toBeVisible();

  const recovery = page.locator(".manual-recovery");
  await expect(recovery.getByRole("option", { name: "出生日期" })).toHaveCount(0);
  await expect(recovery).not.toContainText("manual-panel@example.test");
  await expect(recovery).not.toContainText("2003-08-01");
  await recovery.getByLabel("选择要补填的档案字段").selectOption("projects.0.link");
  await page.screenshot({ path: "artifacts/manual-recovery.png", fullPage: true });
  await recovery.getByRole("button", { name: "填写这个字段" }).click();
  await expect(recovery.getByText(/写入“未匹配的作品链接”并回读确认/)).toBeVisible();
  await expect(page.getByRole("button", { name: /提交|投递/ })).toHaveCount(0);
});
