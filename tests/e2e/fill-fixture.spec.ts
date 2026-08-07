import { expect, test } from "@playwright/test";

test("fill fixture changes selected fields and leaves excluded controls untouched", async ({ page }) => {
  await page.goto("/fixture.html");
  const result = await page.evaluate(async () => {
    document.getElementById("resume")?.insertAdjacentHTML("beforebegin", '<label for="identity-number">身份证号码</label><input id="identity-number" />');
    const profile = {
      schemaVersion: 4 as const,
      updatedAt: "",
      basic: {
        fullName: "端到端验证",
        preferredName: "",
        gender: "女",
        birthDate: "",
        phone: "",
        email: "e2e@example.test",
        nationality: "",
        currentCity: "",
        hometown: "",
        politicalStatus: "",
        identityDocumentType: "居民身份证",
        identityDocumentNumber: "TEST-ID-000042"
      },
      education: [{
        id: "education-e2e",
        school: "",
        degree: "本科",
        educationType: "",
        major: "",
        startDate: "",
        endDate: "",
        gpa: "",
        ranking: ""
      }],
      workExperiences: [],
      projects: [{
        id: "project-e2e",
        name: "",
        role: "",
        startDate: "",
        endDate: "",
        description: "验证内容脚本会触发页面事件。",
        outcome: "",
        link: ""
      }],
      workSamples: [],
      awards: [],
      languages: [],
      jobPreference: { targetRoles: "", preferredCities: "", availableDate: "" },
      answers: { selfIntroduction: "", selfEvaluation: "", strengths: "", careerPlan: "" }
    };
    const scan = window.__qiuzhaoFixture.scan(profile);
    const identity = scan.fields.find((field) => field.profilePath === "basic.identityDocumentNumber")!;
    const selections = scan.fields
      .filter((field) => field.profilePath && field.hasValue && !field.excludedReason && field.profilePath !== "basic.identityDocumentNumber")
      .map((field) => ({ elementId: field.elementId, profilePath: field.profilePath! }));
    const fill = await window.__qiuzhaoFixture.fill(profile, selections);
    const identityBlankBeforeConfirmation = (document.getElementById("identity-number") as HTMLInputElement).value === "";
    const identityFill = await window.__qiuzhaoFixture.fill(profile, [{ elementId: identity.elementId, profilePath: identity.profilePath! }]);
    return { scan, fill, identity, identityBlankBeforeConfirmation, identityFill };
  });

  expect(result.fill.filledCount).toBeGreaterThanOrEqual(5);
  await expect(page.locator("#full-name")).toHaveValue("端到端验证");
  await expect(page.locator("#email")).toHaveValue("e2e@example.test");
  await expect(page.locator("#degree")).toHaveValue("本科");
  await expect(page.locator("input[value='女']")).toBeChecked();
  await expect(page.locator("#project-description")).toHaveText("验证内容脚本会触发页面事件。");
  await expect(page.locator("#captcha")).toHaveValue("");
  await expect(page.locator("#password")).toHaveValue("");
  expect(result.identity).toMatchObject({ requiresConfirmation: true, valuePreview: "••••••0042" });
  expect(result.identityBlankBeforeConfirmation).toBe(true);
  expect(result.identityFill).toMatchObject({ filledCount: 1, skippedCount: 0 });
  await expect(page.locator("#identity-number")).toHaveValue("TEST-ID-000042");
  await expect(page.locator("#resume")).toHaveValue("");
  expect(await page.evaluate(() => window.__qiuzhaoFixture.eventCount)).toBeGreaterThanOrEqual(5);
  expect(await page.evaluate(() => window.__qiuzhaoFixture.submitCount)).toBe(0);
});

test("page comparison keeps raw page values private and blocks stale conflicts", async ({ page }) => {
  await page.goto("/fixture.html");
  await page.locator("#full-name").fill("PAGE-PRIVATE-CONFLICT-9471");
  await page.locator("#email").fill("E2E@EXAMPLE.TEST");

  const result = await page.evaluate(async () => {
    const profile = {
      schemaVersion: 4 as const,
      updatedAt: "",
      basic: {
        fullName: "档案中的姓名",
        preferredName: "",
        gender: "",
        birthDate: "",
        phone: "",
        email: "e2e@example.test",
        nationality: "",
        currentCity: "",
        hometown: "",
        politicalStatus: ""
      },
      education: [{
        id: "comparison-education",
        school: "",
        degree: "本科",
        educationType: "",
        major: "",
        startDate: "",
        endDate: "",
        gpa: "",
        ranking: ""
      }],
      workExperiences: [],
      projects: [],
      workSamples: [],
      awards: [],
      languages: [],
      jobPreference: { targetRoles: "", preferredCities: "", availableDate: "" },
      answers: { selfIntroduction: "", selfEvaluation: "", strengths: "", careerPlan: "" }
    };
    const scan = window.__qiuzhaoFixture.scan(profile);
    const name = scan.fields.find((field) => field.profilePath === "basic.fullName")!;
    const email = scan.fields.find((field) => field.profilePath === "basic.email")!;
    const degree = scan.fields.find((field) => field.profilePath === "education.0.degree")!;
    const fill = await window.__qiuzhaoFixture.fill(profile, [
      { elementId: name.elementId, profilePath: "basic.fullName" },
      { elementId: degree.elementId, profilePath: "education.0.degree" }
    ]);

    const fresh = window.__qiuzhaoFixture.scan(profile);
    const freshName = fresh.fields.find((field) => field.profilePath === "basic.fullName")!;
    (document.getElementById("full-name") as HTMLInputElement).value = "CHANGED-AFTER-SCAN-2648";
    const stale = await window.__qiuzhaoFixture.fill(profile, [{
      elementId: freshName.elementId,
      profilePath: "basic.fullName",
      conflictApprovalToken: freshName.comparisonToken
    }]);
    return {
      serializedScan: JSON.stringify(scan),
      statuses: {
        name: name.comparisonStatus,
        email: email.comparisonStatus,
        degree: degree.comparisonStatus
      },
      fill,
      stale
    };
  });

  expect(result.serializedScan).not.toContain("PAGE-PRIVATE-CONFLICT-9471");
  expect(result.statuses).toEqual({ name: "conflict", email: "equal", degree: "empty" });
  expect(result.fill.outcomes).toEqual(expect.arrayContaining([
    expect.objectContaining({ profilePath: "basic.fullName", status: "skipped", reason: "conflict-requires-rescan" }),
    expect.objectContaining({ profilePath: "education.0.degree", status: "filled" })
  ]));
  expect(result.stale.outcomes[0]).toMatchObject({ status: "skipped", reason: "conflict-requires-rescan" });
  await expect(page.locator("#full-name")).toHaveValue("CHANGED-AFTER-SCAN-2648");
  await expect(page.locator("#email")).toHaveValue("E2E@EXAMPLE.TEST");
  await expect(page.locator("#degree")).toHaveValue("本科");
  expect(await page.evaluate(() => window.__qiuzhaoFixture.submitCount)).toBe(0);
});

test("fill fixture discovers dynamic fields without promoting ambiguity", async ({ page }) => {
  await page.goto("/fixture.html");
  const initialCount = await page.evaluate(() => window.__qiuzhaoFixture.scan({
    schemaVersion: 4,
    updatedAt: "",
    basic: { fullName: "动态验证", preferredName: "", gender: "", birthDate: "", phone: "", email: "", nationality: "", currentCity: "", hometown: "", politicalStatus: "" },
    education: [],
    workExperiences: [],
    projects: [],
    workSamples: [],
    awards: [],
    languages: [],
    jobPreference: { targetRoles: "", preferredCities: "", availableDate: "" },
    answers: { selfIntroduction: "", selfEvaluation: "", strengths: "", careerPlan: "" }
  }).summary.total);

  await page.getByRole("button", { name: "添加补充字段" }).click();
  const dynamic = await page.evaluate(() => window.__qiuzhaoFixture.scan({
    schemaVersion: 4,
    updatedAt: "",
    basic: { fullName: "动态验证", preferredName: "", gender: "", birthDate: "", phone: "", email: "", nationality: "", currentCity: "", hometown: "", politicalStatus: "" },
    education: [],
    workExperiences: [],
    projects: [],
    workSamples: [],
    awards: [],
    languages: [],
    jobPreference: { targetRoles: "", preferredCities: "", availableDate: "" },
    answers: { selfIntroduction: "", selfEvaluation: "", strengths: "", careerPlan: "" }
  }));

  expect(dynamic.summary.total).toBe(initialCount + 2);
  const contact = dynamic.fields.find((field) => field.fieldLabel === "紧急联系人姓名");
  expect(contact?.confidence).toBe("high");
  expect(contact?.requiresConfirmation).toBe(true);
  const location = dynamic.fields.find((field) => field.fieldLabel === "所在地");
  expect(location?.confidence).not.toBe("high");
});
