import { expect, test } from "@playwright/test";

test("page comparison groups empty, equal, and conflict fields before filling", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/sidepanel.html");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("qiuzhao.privacyAcknowledged", "true");
    localStorage.setItem("qiuzhao.candidateProfile", JSON.stringify({
      schemaVersion: 1,
      updatedAt: "2026-08-03T10:00:00.000Z",
      basic: {
        fullName: "侧栏界面验证",
        preferredName: "",
        gender: "",
        birthDate: "2003-08-01",
        phone: "13800000000",
        email: "panel@example.test",
        currentCity: "上海",
        hometown: "",
        politicalStatus: ""
      },
      education: [{
        id: "education-panel",
        school: "界面验证院校",
        degree: "本科",
        major: "产品设计",
        startDate: "2022-09",
        endDate: "2026-06",
        gpa: "",
        ranking: ""
      }],
      workExperiences: [],
      projects: [{
        id: "project-panel",
        name: "浏览器填表验证",
        role: "产品设计",
        startDate: "2026-01",
        endDate: "2026-06",
        description: "验证侧边栏中的中置信度字段需要用户主动确认。",
        outcome: ""
      }],
      jobPreference: { targetRoles: "产品经理", preferredCities: "上海", availableDate: "" },
      answers: { selfIntroduction: "", strengths: "", careerPlan: "" }
    }));
  });
  await page.reload();

  await page.getByRole("button", { name: "扫描当前页面" }).click();
  await expect(page.getByRole("heading", { name: "招聘表单验证页" })).toBeVisible();
  await expect(page.getByLabel("选择 姓名")).toBeChecked();
  await expect(page.getByText("已经一致 1 项")).toBeVisible();
  await expect(page.getByText("存在冲突")).toBeVisible();
  await expect(page.getByLabel("选择 出生日期")).not.toBeChecked();
  await page.getByLabel("选择 出生日期").check();
  await expect(page.getByRole("button", { name: "填写已选 2 项" })).toBeVisible();
  await page.screenshot({ path: "artifacts/page-comparison.png", fullPage: true });

  await page.getByRole("button", { name: "填写已选 2 项" }).click();
  await expect(page.getByText(/已填写 2 项/)).toBeVisible();
});
