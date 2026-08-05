import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";

test("resume attachment UI requires file and destination confirmation", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 980 });
  await page.goto("/sidepanel.html");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("qiuzhao.privacyAcknowledged", "true");
    localStorage.setItem("qiuzhao.candidateProfile", JSON.stringify({
      schemaVersion: 2,
      updatedAt: "2026-08-05T00:00:00.000Z",
      basic: {
        fullName: "Synthetic Candidate",
        preferredName: "",
        gender: "",
        birthDate: "",
        phone: "13800000000",
        email: "synthetic@example.test",
        nationality: "Synthetic",
        currentCity: "Test City",
        hometown: "",
        politicalStatus: ""
      },
      education: [{
        id: "synthetic-education",
        school: "Synthetic University",
        degree: "Bachelor",
        educationType: "Full time",
        major: "Testing",
        startDate: "2022-09",
        endDate: "2026-06",
        gpa: "",
        ranking: ""
      }],
      workExperiences: [],
      projects: [],
      workSamples: [],
      awards: [],
      languages: [],
      jobPreference: { targetRoles: "Tester", preferredCities: "Test City", availableDate: "" },
      answers: { selfIntroduction: "", selfEvaluation: "", strengths: "", careerPlan: "" }
    }));
  });
  await page.reload();

  await page.getByRole("button", { name: "扫描当前页面" }).click();
  await expect(page.getByRole("heading", { name: "附加简历 PDF" })).toBeVisible();
  await expect(page.getByText("http://127.0.0.1:4173")).toBeVisible();
  await expect(page.getByRole("button", { name: /确认上传到/ })).toHaveCount(0);

  await page.getByLabel("选择要附加的 PDF 简历").setInputFiles({
    name: "synthetic-resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nsynthetic resume attachment\n%%EOF")
  });
  await expect(page.getByText("synthetic-resume.pdf")).toBeVisible();
  await expect(page.getByText(/SHA-256 [a-f0-9]{16}…/)).toBeVisible();
  const confirm = page.getByRole("button", { name: "确认上传到 127.0.0.1:4173" });
  await expect(confirm).toBeEnabled();
  await page.screenshot({ path: "artifacts/resume-attachment.png", fullPage: true });

  await confirm.click();
  await expect(page.getByText(/简历已附加/)).toBeVisible();
  await expect(page.getByText(/本人最终提交/)).toBeVisible();
  await page.screenshot({ path: "artifacts/resume-attachment-confirmed.png", fullPage: true });
});
