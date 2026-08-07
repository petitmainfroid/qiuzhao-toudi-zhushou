import { expect, test } from "@playwright/test";
import path from "node:path";

const prototypeRoot = "/design-prototypes/profile-editor";
const designs = [
  ["01-dossier.html", "档案册", "profile-design-01-dossier.png"],
  ["02-bento.html", "资料拼图", "profile-design-02-bento.png"],
  ["03-guided.html", "引导填写", "profile-design-03-guided.png"],
  ["04-quiet.html", "安静画布", "profile-design-04-quiet.png"],
  ["05-compact.html", "投递工作台", "profile-design-05-compact.png"]
] as const;

test("renders a selector and five distinct profile-editor prototypes", async ({ page }) => {
  await page.goto(`${prototypeRoot}/index.html`);

  await expect(page.getByRole("heading", { name: "先选填写体验，再精雕细琢" })).toBeVisible();
  await expect(page.locator(".design-card")).toHaveCount(5);
  await page.screenshot({ path: path.resolve("artifacts/profile-design-gallery.png"), fullPage: true });

  for (const [file, designName, screenshot] of designs) {
    await page.goto(`${prototypeRoot}/${file}`);
    await expect(page.getByText(`方案 ${file.slice(0, 2)} · ${designName}`, { exact: true })).toBeVisible();
    await expect(page.locator(".profile-section")).toHaveCount(14);
    await expect(page.getByText("独立设计原型", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /保存草稿/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /提交/ })).toHaveCount(0);
    await page.screenshot({ path: path.resolve(`artifacts/${screenshot}`), fullPage: false });
  }

  await page.goto(`${prototypeRoot}/01-dossier.html`);
  await page.locator('[data-section="languages"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve("artifacts/profile-design-01-language.png"), fullPage: false });
});

test("shares only prototype-local draft values across design directions", async ({ page }) => {
  await page.goto(`${prototypeRoot}/01-dossier.html`);
  await page.evaluate(() => localStorage.clear());
  const name = page.locator('[name="basic.fullName"]');
  await name.fill("设计验收用户");
  await page.getByRole("button", { name: "添加教育经历" }).click();
  await page.locator('[name="education.school[1]"]').fill("第二段教育经历测试");
  await page.getByRole("button", { name: /保存草稿/ }).click();
  await expect(page.getByText("原型草稿已保存在本机", { exact: true })).toBeVisible();

  await page.goto(`${prototypeRoot}/02-bento.html`);
  await expect(page.locator('[name="basic.fullName"]')).toHaveValue("设计验收用户");
  await expect(page.locator('[data-records="education"] .record')).toHaveCount(2);
  await expect(page.locator('[name="education.school[1]"]')).toHaveValue("第二段教育经历测试");
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toEqual(["qiuzhao.profile-design-prototype.v1"]);
  await page.evaluate(() => localStorage.clear());
});

test("guided direction moves one section at a time", async ({ page }) => {
  await page.goto(`${prototypeRoot}/03-guided.html`);
  await expect(page.locator('[data-section="resume"]')).toBeVisible();
  await expect(page.locator('[data-section="basic"]')).toBeHidden();
  await page.getByRole("button", { name: /下一步/ }).click();
  await expect(page.locator('[data-section="resume"]')).toBeHidden();
  await expect(page.locator('[data-section="basic"]')).toBeVisible();
  await expect(page.locator("#current-step")).toHaveText("2");
});

test("separates language skills, examinations, and the two resume actions", async ({ page }) => {
  await page.goto(`${prototypeRoot}/01-dossier.html`);
  await page.evaluate(() => localStorage.clear());

  await expect(page.locator('[name="languages.language[0]"]')).toBeAttached();
  await expect(page.locator('[name="languageExams.examType[0]"]')).toBeAttached();
  await expect(page.locator('[name="languages.name[0]"]')).toHaveCount(0);
  await page.locator('[name="languages.language[0]"]').selectOption("英语");
  await page.locator('[name="languages.proficiency[0]"]').selectOption("熟练");
  await page.locator('[name="languageExams.language[0]"]').selectOption("英语");
  await page.locator('[name="languageExams.examType[0]"]').selectOption("CET-6（六级）");
  await page.locator('[name="languageExams.score[0]"]').fill("520");
  await page.locator('[data-add-record="languageExams"]').click();
  await page.locator('[name="languageExams.language[1]"]').selectOption("英语");
  await page.locator('[name="languageExams.examType[1]"]').selectOption("IELTS（雅思）");
  await page.locator('[name="languageExams.score[1]"]').fill("7.0");

  await expect(page.locator('[data-records="workExperiences"]')).toBeAttached();
  await expect(page.locator('[data-records="employmentExperiences"]')).toBeAttached();
  await expect(page.locator('[data-records="campusLeadership"]')).toBeAttached();
  await expect(page.locator('[data-records="campusActivities"]')).toBeAttached();
  await expect(page.locator('[data-records="publications"]')).toBeAttached();
  await expect(page.locator('[data-records="patents"]')).toBeAttached();
  await expect(page.locator('[name="campus.organization[0]"]')).toHaveCount(0);
  await expect(page.locator('[name="research.type[0]"]')).toHaveCount(0);

  await page.locator("#reusable-resume").setInputFiles({ name: "reusable.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf") });
  await page.locator("#resume-import").setInputFiles({ name: "import.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("docx") });
  await page.locator("#save-draft").click();

  const stored = await page.evaluate(() => localStorage.getItem("qiuzhao.profile-design-prototype.v1") || "");
  expect(stored).toContain("languageExams.examType[0]");
  expect(stored).not.toContain("reusable.pdf");
  expect(stored).not.toContain("import.docx");

  await page.reload();
  await expect(page.locator('[name="languages.language[0]"]')).toHaveValue("英语");
  await expect(page.locator('[name="languageExams.examType[0]"]')).toHaveValue("CET-6（六级）");
  await expect(page.locator('[data-records="languageExams"] .record')).toHaveCount(2);
  await expect(page.locator('[name="languageExams.examType[1]"]')).toHaveValue("IELTS（雅思）");
  await page.evaluate(() => localStorage.clear());
});

test("keeps every direction usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [file] of designs) {
    await page.goto(`${prototypeRoot}/${file}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: /保存草稿/ })).toBeVisible();
  }
  await page.goto(`${prototypeRoot}/03-guided.html`);
  await page.screenshot({ path: path.resolve("artifacts/profile-design-mobile-guided.png"), fullPage: false });
});
