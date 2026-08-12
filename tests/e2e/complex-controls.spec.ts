import { expect, test } from "@playwright/test";

test("complex controls are deterministically operated and verified without submission", async ({ page }) => {
  await page.goto("/complex-controls.html");
  const result = await page.evaluate(async () => {
    const profile = {
      schemaVersion: 4 as const,
      updatedAt: "",
      basic: {
        fullName: "", preferredName: "", gender: "女", birthDate: "", phone: "", email: "",
        nationality: "", currentCity: "", hometown: "", politicalStatus: ""
      },
      education: [{
        id: "education-test", school: "第一测试大学", degree: "硕士", educationType: "",
        major: "软件工程", startDate: "2024-09", endDate: "2027-06", gpa: "", ranking: ""
      }],
      workExperiences: [], projects: [], workSamples: [], awards: [], languages: [],
      jobPreference: { targetRoles: "产品经理、产品运营", preferredCities: "", availableDate: "" },
      answers: {
        selfIntroduction: "",
        selfEvaluation: "只包含匿名验证信息。",
        strengths: "",
        careerPlan: "该值应被页面拒绝。"
      }
    };
    const scan = window.__complexControlsFixture.scan(profile);
    const selections = scan.fields
      .filter((field) => field.profilePath && field.hasValue && !field.excludedReason)
      .map((field) => ({ elementId: field.elementId, profilePath: field.profilePath! }));
    const fill = await window.__complexControlsFixture.fill(profile, selections);
    return {
      paths: scan.fields.flatMap((field) => [field.profilePath, field.companionProfilePath]).filter(Boolean),
      fill,
      inputEvents: window.__complexControlsFixture.inputEvents,
      submitCount: window.__complexControlsFixture.submitCount
    };
  });

  expect(result.paths).toEqual(expect.arrayContaining([
    "education.0.school",
    "education.0.degree",
    "education.0.major",
    "education.0.startDate",
    "education.0.endDate",
    "jobPreference.targetRoles",
    "basic.gender",
    "answers.selfEvaluation",
    "answers.careerPlan"
  ]));
  expect(result.fill.filledCount).toBe(7);
  expect(result.fill.outcomes).toEqual(expect.arrayContaining([
    expect.objectContaining({ profilePath: "answers.careerPlan", status: "skipped", reason: "write-verification-failed" })
  ]));
  expect(JSON.stringify(result.fill)).not.toContain("网页保留的匿名测试内容");
  expect(result.inputEvents).toBeGreaterThanOrEqual(7);
  expect(result.submitCount).toBe(0);

  await expect(page.locator("#school-select .atsx-select-selection-selected-value")).toHaveText("第一测试大学");
  await expect(page.locator("#degree-select .atsx-select-selection-selected-value")).toHaveText("硕士");
  await expect(page.locator("#major-select .atsx-select-selection-selected-value")).toHaveText("软件工程");
  await expect(page.locator('[data-date-display="start"]')).toHaveText("2024-09");
  await expect(page.locator('[data-date-display="end"]')).toHaveText("2027-06");
  await expect(page.locator("#target-roles")).toHaveValues(["产品经理", "产品运营"]);
  await expect(page.locator('input[name="gender"][value="女"]')).toBeChecked();
  await expect(page.locator("#self-evaluation")).toHaveText("只包含匿名验证信息。");
  await expect(page.locator("#career-plan")).toHaveText("网页保留的匿名测试内容");
  await expect(page.locator("#driver-status")).toContainText("最终提交 0 次");
  await page.screenshot({ path: "artifacts/complex-controls.png", fullPage: true });
});
