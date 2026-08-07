import { expect, test } from "@playwright/test";

test("one-click autofill handles safe fields and centralizes exceptions", async ({ page }) => {
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

  await expect(page.getByRole("button", { name: "扫描当前页面" })).toHaveCount(0);
  await page.getByRole("button", { name: "自动填写当前页面" }).click();
  await expect(page.getByRole("heading", { name: "招聘表单验证页" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "只处理这 2 个例外" })).toBeVisible();
  await expect(page.getByText("已经一致 1 项")).toBeVisible();
  await expect(page.getByText("存在冲突")).toBeVisible();
  await expect(page.getByLabel("确认填写 出生日期")).not.toBeChecked();
  await expect(page.getByLabel("确认填写 项目介绍")).not.toBeChecked();
  await page.getByLabel("确认填写 出生日期").check();
  await expect(page.getByRole("button", { name: "确认并继续填写 2 项" })).toBeVisible();
  await page.screenshot({ path: "artifacts/one-click-autofill.png", fullPage: true });

  await page.getByRole("button", { name: "确认并继续填写 2 项" }).click();
  await expect(page.getByText(/已填写 2 项/)).toBeVisible();
});
