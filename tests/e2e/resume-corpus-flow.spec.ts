import { expect, test } from "@playwright/test";

test("resume corpus import creates missing rows and fills a recruitment form without submission", async ({ page }) => {
  await page.goto("/repeatable-fixture.html");

  const result = await page.evaluate(async () => {
    const modulePath = "/src/resume/parseResume.ts";
    const parser = await import(/* @vite-ignore */ modulePath);
    const parsed = parser.parseResumeText(`
Anonymous Candidate
Phone: +971 58 535 9738 | candidate@example.test | 求职意向：研究实习生
教育经历
Example University 2024 - 预计 2028
机器学习博士
Example University 2022 - 2024
机器学习硕士
南岭大学 2018 - 2022
计算机科学学士
代表论文
Anonymous Publication That Must Stay Outside Projects
实习经历
研究实习生 2023
匿名科技公司
研究实习生 2022
匿名研究院
在校科研
匿名研究甲
• 方法：构建匿名分析流程。
• 结果：完成稳定性验证。
匿名研究乙
• 方法：实现匿名数据管线。
• 结果：形成复现实验。
项目成果
匿名成果丙 2025.01 - 2025.03
• 完成匿名评测。
技能/目标
Python、TypeScript、可复核测试
语言能力
中文（母语）、英文（流利）
`);
    const profile = parsed.profile;
    const groups = ["education", "workExperiences", "projects", "languages"] as const;
    const creationResults: Array<{ group: string; status: string; createdCount: number }> = [];

    for (const group of groups) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const current = window.__repeatableFixture.scanRepeatable(profile).groups.find((item) => item.key === group);
        if (!current?.missingCount) break;
        const creation = await window.__repeatableFixture.create(profile, group);
        creationResults.push({ group, status: creation.status, createdCount: creation.createdCount });
        if (creation.createdCount === 0) break;
      }
    }

    const after = window.__repeatableFixture.scanRepeatable(profile);
    const scan = window.__repeatableFixture.scan(profile);
    const selections = scan.fields
      .filter((field) => field.profilePath && field.hasValue && !field.excludedReason && field.comparisonStatus === "empty")
      .map((field) => ({ elementId: field.elementId, profilePath: field.profilePath! }));
    const fill = await window.__repeatableFixture.fill(profile, selections);
    return {
      parsedCounts: {
        education: profile.education.length,
        work: profile.workExperiences.length,
        projects: profile.projects.length,
        languages: profile.languages.length
      },
      creationResults,
      remaining: after.groups.map(({ key, missingCount }) => ({ key, missingCount })),
      fill,
      deleteClickCount: window.__repeatableFixture.deleteClickCount,
      submitCount: window.__repeatableFixture.submitCount
    };
  });

  expect(result.parsedCounts).toEqual({ education: 3, work: 2, projects: 3, languages: 2 });
  expect(result.creationResults.some(({ createdCount }) => createdCount > 0)).toBe(true);
  expect(result.remaining.filter(({ key }) => ["education", "workExperiences", "projects", "languages"].includes(key))
    .every(({ missingCount }) => missingCount === 0)).toBe(true);
  const skippedSummary = JSON.stringify(result.fill.outcomes.filter(({ status }) => status === "skipped"));
  expect(result.fill.filledCount, skippedSummary).toBeGreaterThanOrEqual(20);
  expect(result.deleteClickCount).toBe(0);
  expect(result.submitCount).toBe(0);

  await expect(page.locator('[data-form-field-name="education_list[2].school"] input')).toHaveValue("南岭大学");
  await expect(page.locator('[data-form-field-name="internship_list[1].company"] input')).toHaveValue("匿名研究院");
  await expect(page.locator('[data-form-field-name="project_list[2].name"] input')).toHaveValue("匿名成果丙");
  await expect(page.locator('[data-form-field-name="language_list[1].language"] input')).toHaveValue("英语");
  await expect(page.locator("#submit-control")).toBeVisible();
  await page.screenshot({ path: "artifacts/resume-corpus.png", fullPage: true });
});
