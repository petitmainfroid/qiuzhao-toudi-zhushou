import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import type { EmbeddedBridgeResponse } from "../../src/bridge/protocol";
import { AtsAdapterRegistry, ChromeRecruitmentKernelApi, RecruitmentAdapterOrchestrator } from "../../src/adapter-sdk";
import { mokaManifest } from "../../src/ats/adapters/moka";
import {
  createAwardRecord,
  createEmptyProfile,
  createLanguageRecord,
  createProjectRecord,
  createWorkExperienceRecord
} from "../../src/domain/profile";
import { mokaManifestPage } from "../fixtures/moka-manifest-page";

async function latestCachedChromium(): Promise<string | undefined> {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return undefined;
  const cacheRoot = join(localAppData, "ms-playwright");
  const entries = await readdir(cacheRoot, { withFileTypes: true });
  const revisions = entries
    .filter((entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(right.split("-")[1]) - Number(left.split("-")[1]));
  for (const revision of revisions) {
    for (const folder of ["chrome-win64", "chrome-win"]) {
      const executable = join(cacheRoot, revision, folder, "chrome.exe");
      try {
        await access(executable);
        return executable;
      }
      catch {
        // Try the next cached Chromium layout.
      }
    }
  }
  return undefined;
}

test("production Moka manifest routes the installed side panel and verifies conservative anonymous writes", async () => {
  test.setTimeout(120_000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-moka-manifest-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });

  try {
    await context.route("https://app.mokahr.com/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: mokaManifestPage() });
    });
    await expect.poll(() => context.pages().find(
      (page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url())
    )?.url() ?? "", { timeout: 20_000 }).not.toBe("");
    const panel = context.pages().find((page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url()));
    if (!panel) throw new Error("Extension options page did not open.");
    const extensionId = new URL(panel.url()).host;
    await panel.setViewportSize({ width: 420, height: 1000 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const profile = createEmptyProfile();
    profile.updatedAt = "2026-08-08T00:00:00.000Z";
    profile.basic.fullName = "Anonymous Moka Candidate";
    profile.basic.phone = "13800000000";
    profile.basic.email = "anonymous-moka@example.test";
    profile.basic.gender = "Female";
    profile.basic.birthDate = "2002-05-06";
    profile.basic.nationality = "Anonymous Region";
    profile.basic.currentCity = "Anonymous City";
    profile.education[0]!.school = "Anonymous Moka University";
    profile.education[0]!.degree = "Bachelor";
    profile.education[0]!.educationType = "Full-time";
    profile.education[0]!.major = "Anonymous Major";
    profile.education[0]!.startDate = "2021-09";
    profile.education[0]!.endDate = "2025-06";
    profile.jobPreference.targetRoles = "Anonymous Role";
    profile.jobPreference.preferredCities = "Anonymous City";
    const internship = createWorkExperienceRecord();
    internship.company = "Anonymous Internship Company";
    internship.role = "Anonymous Intern";
    internship.startDate = "2024-01";
    internship.endDate = "2024-06";
    internship.description = "Anonymous internship description";
    profile.workExperiences = [internship];
    const project = createProjectRecord();
    project.name = "Anonymous Moka Project";
    project.role = "Anonymous Owner";
    project.startDate = "2023-01";
    project.endDate = "2023-12";
    project.description = "Anonymous project description";
    profile.projects = [project];
    const language = createLanguageRecord();
    language.language = "English";
    language.proficiency = "Expert";
    profile.languages = [language];
    const award = createAwardRecord();
    award.date = "2025-01-01";
    award.name = "Anonymous Award";
    profile.awards = [award];
    profile.answers.selfEvaluation = "Anonymous self description";

    await panel.evaluate(async (candidateProfile) => {
      await chrome.storage.local.set({
        "qiuzhao.privacyAcknowledged": true,
        "qiuzhao.candidateProfile": candidateProfile
      });
    }, profile);
    const target = await context.newPage();
    await target.goto("https://app.mokahr.com/campus_apply/anonymous-tenant/4112#/candidateHome/resume");
    await expect(target.getByRole("heading", { name: "匿名 Moka 候选人简历" })).toBeVisible();

    await panel.reload();
    await panel.locator(".power-session-actions button").click();
    await expect(panel.getByText("https://app.mokahr.com", { exact: true })).toBeVisible({ timeout: 20_000 });
    await panel.locator(".scan-button").click();
    await expect(panel.locator(".scan-results")).toBeVisible({ timeout: 20_000 });
    await expect(panel.locator(".result-header h2")).toContainText("moka");
    const proposalCheckboxes = panel.locator(".proposal-card input[type='checkbox']");
    expect(await proposalCheckboxes.count()).toBe(27);
    for (const checkbox of await proposalCheckboxes.all()) await expect(checkbox).not.toBeChecked();
    await panel.screenshot({ path: "artifacts/moka-k5-sidepanel.png", fullPage: true });

    const routedName = panel.locator(".proposal-card[data-profile-path='basic.fullName']");
    await routedName.locator("input[type='checkbox']").check();
    await panel.locator(".fill-button").click();
    await expect.poll(async () => (await target.evaluate(() => (
      window as unknown as { __mokaGroundTruth: { read(): { basic: string[] } } }
    ).__mokaGroundTruth.read())).basic[0]).toBe("Anonymous Moka Candidate");

    const kernel = new ChromeRecruitmentKernelApi({
      send: (request) => panel.evaluate(
        async (payload) => chrome.runtime.sendMessage(payload),
        request
      ) as Promise<EmbeddedBridgeResponse>
    });
    const session = await panel.evaluate(async () => chrome.runtime.sendMessage({
      type: "POWER_SESSION_STATUS",
      requestId: `moka_${Date.now().toString(36)}`
    })) as { ok: true; session: { sessionId?: string } };
    const sessionId = session.session.sessionId ?? "";
    expect(sessionId).not.toBe("");
    const state = await kernel.state(sessionId);
    const serialized = JSON.stringify(state);
    expect(serialized).not.toMatch(/page-name-private|page-phone-private|identity-private|custom-private/i);

    const orchestrator = new RecruitmentAdapterOrchestrator(kernel, new AtsAdapterRegistry([mokaManifest]));
    const resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("Expected Moka manifest match.");
    expect(resolution.plan.fields).toHaveLength(27);
    const authorization = await kernel.authorizeActions(sessionId);
    const outcomes = await orchestrator.executeSelected({
      sessionId,
      authorizationId: authorization.authorizationId,
      plan: resolution.plan,
      selections: resolution.plan.fields
        .sort((left, right) => Number(left.capability === "searchable-combobox") - Number(right.capability === "searchable-combobox"))
        .map((field) => ({ controlKey: field.controlKey, confirmed: true }))
    });
    expect(outcomes.every((outcome) => outcome.status === "verified"), JSON.stringify(outcomes)).toBe(true);

    expect(await target.evaluate(() => (
      window as unknown as { __mokaGroundTruth: { read(): unknown } }
    ).__mokaGroundTruth.read())).toEqual({
      basic: ["Anonymous Moka Candidate", "13800000000", "anonymous-moka@example.test", "Female", "2002-05-06", "Anonymous City"],
      preferredCity: "Anonymous City",
      education: ["2021-09", "2025-06", "Anonymous Moka University", "Anonymous Major", "Bachelor"],
      internship: ["2024-01", "2024-06", "Anonymous Internship Company", "Anonymous Intern", "Anonymous internship description"],
      project: ["2023-01", "2023-12", "Anonymous Moka Project", "Anonymous Owner", "Anonymous project description"],
      language: ["English", "Expert"],
      selfDescription: "Anonymous self description",
      award: ["2025-01-01", "Anonymous Award"],
      manualWork: "manual-work-private",
      identity: "identity-private",
      responsibilities: "manual-responsibilities-private",
      custom: "custom-private",
      saveCount: 0,
      submitCount: 0
    });
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
