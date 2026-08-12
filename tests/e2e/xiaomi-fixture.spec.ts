import { expect, test } from "@playwright/test";

test("Xiaomi-derived fixture scans and fills reusable fields without submission", async ({ page }) => {
  await page.goto("/xiaomi-fixture.html");
  const result = await page.evaluate(async () => {
    const profile = {
      schemaVersion: 5 as const,
      updatedAt: "",
      basic: {
        fullName: "小米回归测试",
        preferredName: "",
        gender: "女",
        birthDate: "2000-01-01",
        phone: "13800000000",
        email: "xiaomi-fixture@example.test",
        nationality: "中国",
        currentCity: "北京",
        hometown: "北京",
        politicalStatus: ""
      },
      education: [
        { id: "edu-0", school: "第一测试大学", degree: "硕士", educationType: "统招全日制", major: "人工智能", startDate: "2024-09", endDate: "2027-06", gpa: "", ranking: "" },
        { id: "edu-1", school: "第二测试大学", degree: "本科", educationType: "统招全日制", major: "计算机科学", startDate: "2020-09", endDate: "2024-06", gpa: "", ranking: "" }
      ],
      workExperiences: [{ id: "intern-0", company: "测试科技", department: "算法", role: "算法实习生", startDate: "2025-01", endDate: "2025-06", description: "参与模型评测。" }],
      projects: [{ id: "project-0", name: "智能评测项目", role: "负责人", startDate: "2025-02", endDate: "2025-08", description: "构建评测集。", outcome: "", link: "https://example.test/project" }],
      workSamples: [{ id: "work-0", link: "https://example.test/portfolio", description: "作品说明。" }],
      awards: [{ id: "award-0", name: "测试奖项", date: "2025-06", description: "获奖说明。" }],
      languages: [{ id: "language-0", language: "英语", proficiency: "商务会话" }],
      jobPreference: { targetRoles: "算法实习生", preferredCities: "北京", availableDate: "" },
      answers: { selfIntroduction: "", selfEvaluation: "认真负责，注重验证。", strengths: "", careerPlan: "" }
    };
    const scan = window.__xiaomiFixture.scan(profile);
    const selections = scan.fields
      .filter((field) => field.profilePath && field.hasValue && !field.excludedReason)
      .map((field) => ({ elementId: field.elementId, profilePath: field.profilePath! }));
    return { scan, fill: await window.__xiaomiFixture.fill(profile, selections) };
  });

  expect(result.scan.summary.total).toBeGreaterThanOrEqual(25);
  expect(result.scan.resumeAttachment).toMatchObject({
    status: "ready",
    candidateCount: 1,
    candidate: { fieldLabel: "上传简历", acceptsPdf: true }
  });
  expect(result.scan.fields.find((field) => field.fieldLabel === "个人证件")?.excludedReason).toBe("sensitive-unsupported");
  expect(result.fill.filledCount).toBeGreaterThanOrEqual(20);
  await expect(page.locator('[data-form-field-name="education_list[0].school"] input')).toHaveValue("第一测试大学");
  await expect(page.locator('#education\\[0\\]\\.degree .atsx-select-selection-selected-value')).toHaveText("硕士");
  await expect(page.locator('[data-form-field-name="education_list[1].school"] input')).toHaveValue("第二测试大学");
  await expect(page.locator('input[name="education_list[0].start_end_time.start"]')).toHaveValue("2024-09");
  await expect(page.locator('input[name="education_list[0].start_end_time.end"]')).toHaveValue("2027-06");
  await expect(page.locator('[data-form-field-name="works_list[0].link"] input')).toHaveValue("https://example.test/portfolio");
  await expect(page.locator('[data-form-field-name="language_list[0].proficiency"] select')).toHaveValue("商务会话");
  await expect(page.locator('[data-form-field-name="self_evaluation.self_evaluation"] textarea')).toHaveValue("认真负责，注重验证。");
  await expect(page.locator('[data-form-field-name="basic_info.identification"] input')).toHaveValue("");
  await expect(page.locator('[data-form-field-name="works_list[0].attachment"] input')).toHaveValue("");
  await expect(page.locator('[data-cy="inputUpload"]')).toHaveValue("");
  expect(await page.evaluate(() => window.__xiaomiFixture.submitCount)).toBe(0);
  await page.screenshot({ path: "artifacts/xiaomi-form-regression.png", fullPage: true });
});
