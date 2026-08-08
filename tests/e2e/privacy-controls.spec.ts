import { expect, test } from "@playwright/test";

function importBundle() {
  return {
    format: "qiuzhao-profile-assistant",
    version: 1,
    exportedAt: "2026-08-03T10:00:00.000Z",
    profile: {
      schemaVersion: 1,
      updatedAt: "",
      basic: {
        fullName: "导入流程验证",
        preferredName: "",
        gender: "",
        birthDate: "",
        phone: "13800000000",
        email: "import@example.test",
        currentCity: "上海",
        hometown: "",
        politicalStatus: ""
      },
      education: [{
        id: "education-import",
        school: "导入验证院校",
        degree: "本科",
        major: "产品设计",
        startDate: "2022-09",
        endDate: "2026-06",
        gpa: "",
        ranking: ""
      }],
      workExperiences: [],
      projects: [],
      jobPreference: { targetRoles: "产品经理", preferredCities: "上海", availableDate: "" },
      answers: { selfIntroduction: "", strengths: "", careerPlan: "" }
    },
    mappings: [{
      site: "https://jobs.example",
      fingerprint: "text|name",
      profilePath: "basic.fullName",
      canonicalLabel: "姓名",
      updatedAt: "2026-08-03T10:00:00.000Z"
    }]
  };
}

test("privacy controls gate first use and support export import delete", async ({ page }) => {
  await page.goto("/options.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByRole("heading", { name: "先确认数据如何被使用。" })).toBeVisible();
  await expect(page.getByText("保存在本机")).toBeVisible();
  await expect(page.getByText("点击后才读取")).toBeVisible();
  await expect(page.getByText("不会替你提交")).toBeVisible();
  await page.getByRole("button", { name: "我已了解，开始建立档案" }).click();
  await expect(page.getByLabel("姓名")).toBeVisible();

  await page.getByLabel("姓名").fill("隐私流程验证");
  await page.getByLabel("证件类型").selectOption("居民身份证");
  await page.getByLabel("证件号码").fill("TEST-ID-DELETE-0042");
  await page.getByRole("button", { name: "保存档案" }).first().click();
  await expect(page.getByText(/已保存于/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出本地数据" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^qiuzhao-profile-\d{4}-\d{2}-\d{2}\.json$/);

  await page.getByRole("button", { name: "删除全部本地数据" }).click();
  await expect(page.getByText("确认永久删除？")).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByLabel("姓名")).toHaveValue("隐私流程验证");
  await expect(page.getByLabel("证件号码")).toHaveValue("TEST-ID-DELETE-0042");
  await page.getByRole("button", { name: "删除全部本地数据" }).click();
  await page.getByRole("button", { name: "确认永久删除" }).click();
  await expect(page.getByLabel("姓名")).toHaveValue("");
  await expect(page.getByLabel("证件号码")).toHaveValue("");
  await expect(page.getByText(/已从本机删除/)).toBeVisible();

  await page.getByLabel("导入本地数据").setInputFiles({
    name: "qiuzhao-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importBundle()))
  });
  await expect(page.getByLabel("姓名")).toHaveValue("导入流程验证");
  await expect(page.getByText(/导入完成/)).toBeVisible();
  await expect(page.getByText("1", { exact: true }).last()).toBeVisible();
});
