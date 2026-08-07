import { expect, test } from "@playwright/test";

test("repeatable records are created one at a time, rescanned, and filled without delete or submit", async ({ page }) => {
  await page.goto("/repeatable-fixture.html");

  const result = await page.evaluate(async () => {
    const profile = {
      schemaVersion: 4 as const,
      updatedAt: "",
      basic: {
        fullName: "重复记录回归",
        preferredName: "",
        gender: "",
        birthDate: "",
        phone: "",
        email: "",
        nationality: "",
        currentCity: "",
        hometown: "",
        politicalStatus: ""
      },
      education: [
        { id: "edu-0", school: "第一测试大学", degree: "硕士", educationType: "统招全日制", major: "人工智能", startDate: "", endDate: "", gpa: "", ranking: "" },
        { id: "edu-1", school: "第二测试大学", degree: "本科", educationType: "统招全日制", major: "计算机科学", startDate: "", endDate: "", gpa: "", ranking: "" }
      ],
      workExperiences: [
        { id: "intern-0", company: "甲测试科技", department: "", role: "算法实习生", startDate: "", endDate: "", description: "第一段实习说明" },
        { id: "intern-1", company: "乙测试科技", department: "", role: "产品实习生", startDate: "", endDate: "", description: "第二段实习说明" }
      ],
      projects: [
        { id: "project-0", name: "项目一", role: "负责人", startDate: "", endDate: "", description: "项目一说明", outcome: "", link: "https://example.test/project-1" },
        { id: "project-1", name: "项目二", role: "开发者", startDate: "", endDate: "", description: "项目二说明", outcome: "", link: "https://example.test/project-2" },
        { id: "project-2", name: "项目三", role: "研究者", startDate: "", endDate: "", description: "项目三说明", outcome: "", link: "https://example.test/project-3" }
      ],
      workSamples: [{ id: "work-0", link: "https://example.test/portfolio", description: "作品集说明" }],
      awards: [{ id: "award-0", name: "测试奖项", date: "2025-06", description: "获奖说明" }],
      languages: [{ id: "language-0", language: "英语", proficiency: "商务会话" }],
      jobPreference: { targetRoles: "", preferredCities: "", availableDate: "" },
      answers: { selfIntroduction: "", selfEvaluation: "", strengths: "", careerPlan: "" }
    };

    const before = window.__repeatableFixture.scanRepeatable(profile);
    const creations = {
      projects: await window.__repeatableFixture.create(profile, "projects"),
      education: await window.__repeatableFixture.create(profile, "education"),
      internshipFirst: await window.__repeatableFixture.create(profile, "workExperiences"),
      internshipSecond: await window.__repeatableFixture.create(profile, "workExperiences"),
      workSamples: await window.__repeatableFixture.create(profile, "workSamples"),
      awards: await window.__repeatableFixture.create(profile, "awards"),
      languages: await window.__repeatableFixture.create(profile, "languages")
    };
    const after = window.__repeatableFixture.scanRepeatable(profile);
    const scan = window.__repeatableFixture.scan(profile);
    const selections = scan.fields
      .filter((field) => field.profilePath && field.hasValue && !field.excludedReason && field.comparisonStatus === "empty")
      .map((field) => ({ elementId: field.elementId, profilePath: field.profilePath! }));
    const fill = await window.__repeatableFixture.fill(profile, selections);
    const secondScan = window.__repeatableFixture.scan(profile);
    const secondSelections = secondScan.fields
      .filter((field) => field.profilePath && field.hasValue && !field.excludedReason && field.comparisonStatus === "empty")
      .map((field) => ({ elementId: field.elementId, profilePath: field.profilePath! }));
    const secondFill = await window.__repeatableFixture.fill(profile, secondSelections);
    return {
      before,
      creations,
      after,
      fill,
      secondFill,
      addClickCount: window.__repeatableFixture.addClickCount,
      saveClickCount: window.__repeatableFixture.saveClickCount,
      deleteClickCount: window.__repeatableFixture.deleteClickCount,
      submitCount: window.__repeatableFixture.submitCount
    };
  });

  expect(result.before.groups.find(({ key }) => key === "projects")).toMatchObject({ pageCount: 1, profileCount: 3, missingCount: 2 });
  expect(result.creations.projects).toMatchObject({ status: "created", createdCount: 2, finalPageCount: 3 });
  expect(result.creations.internshipFirst).toMatchObject({
    status: "partial",
    createdCount: 1,
    remainingCount: 1,
    reason: "add-control-changed"
  });
  expect(result.creations.internshipSecond).toMatchObject({ status: "created", createdCount: 1, remainingCount: 0 });
  expect(result.after.groups.every(({ missingCount }) => missingCount === 0)).toBe(true);
  expect(result.addClickCount).toBe(8);
  expect(result.deleteClickCount).toBe(0);
  expect(result.submitCount).toBe(0);
  expect(result.fill.filledCount).toBeGreaterThanOrEqual(28);
  expect(result.fill.repeatableLifecycles).toHaveLength(10);
  expect(result.fill.repeatableLifecycles?.filter(({ status }) => status === "saved")).toHaveLength(7);
  expect(result.fill.repeatableLifecycles?.filter(({ status, reason }) =>
    status === "verified" && reason === "no-save-required"
  )).toHaveLength(3);
  expect(result.fill.repeatableLifecycles?.some(({ status }) => status === "stopped")).toBe(false);
  expect(result.saveClickCount).toBe(7);
  expect(result.secondFill.filledCount).toBe(0);
  expect(result.secondFill.repeatableLifecycles ?? []).toHaveLength(0);

  await expect(page.locator('[data-form-field-name="internship_list[1].company"] input')).toHaveValue("乙测试科技");
  await expect(page.locator('[data-form-field-name="project_list[2].name"] input')).toHaveValue("项目三");
  await expect(page.locator('[data-form-field-name="works_list[0].link"] input')).toHaveValue("https://example.test/portfolio");
  await expect(page.locator('[data-form-field-name="award_list[0].name"] input')).toHaveValue("测试奖项");
  await expect(page.locator('[data-form-field-name="language_list[0].proficiency"] input')).toHaveValue("商务会话");
  await expect(page.locator("#submit-control")).toBeVisible();
  await page.screenshot({ path: "artifacts/repeatable-records.png", fullPage: true });
});
