import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import type { EmbeddedBridgeRequest, EmbeddedBridgeResponse } from "../../src/bridge/protocol";
import { AtsAdapterRegistry, ChromeRecruitmentKernelApi, RecruitmentAdapterOrchestrator } from "../../src/adapter-sdk";
import { ctripCareersManifest } from "../../src/ats/adapters/ctrip";
import {
  createEmptyProfile,
  createLanguageRecord,
  createWorkExperienceRecord
} from "../../src/domain/profile";
import { ctripManifestPage } from "../fixtures/ctrip-manifest-page";

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

function requestId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function send<T>(panel: Page, request: EmbeddedBridgeRequest): Promise<T> {
  return panel.evaluate(async (payload) => chrome.runtime.sendMessage(payload), request) as Promise<T>;
}

test("production Ctrip manifest routes the installed side panel and verifies conservative anonymous writes", async () => {
  test.setTimeout(120_000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-ctrip-manifest-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });

  try {
    await context.route("https://job.ctrip.com/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: ctripManifestPage() });
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
    profile.basic.fullName = "Anonymous Ctrip Candidate";
    profile.basic.phone = "13800000000";
    profile.basic.email = "anonymous-ctrip@example.test";
    profile.basic.gender = "Female";
    profile.basic.birthDate = "2002-05-06";
    profile.basic.currentCity = "Anonymous Ctrip City";
    profile.education[0]!.school = "Anonymous Ctrip University";
    profile.education[0]!.degree = "Bachelor";
    profile.education[0]!.educationType = "Full-time";
    profile.education[0]!.major = "Anonymous Ctrip Major";
    profile.education[0]!.startDate = "2021-09";
    profile.education[0]!.endDate = "2025-06";
    profile.jobPreference.targetRoles = "Anonymous Role";
    profile.jobPreference.preferredCities = "Anonymous Ctrip City";
    const work = createWorkExperienceRecord();
    work.company = "Anonymous Ctrip Company";
    work.role = "Anonymous Ctrip Role";
    work.description = "Anonymous Ctrip work description";
    profile.workExperiences = [work];
    const language = createLanguageRecord();
    language.language = "English";
    language.proficiency = "Expert";
    profile.languages = [language];
    profile.answers.selfEvaluation = "Anonymous Ctrip self evaluation";
    await panel.evaluate(async (candidateProfile) => {
      await chrome.storage.local.set({
        "qiuzhao.privacyAcknowledged": true,
        "qiuzhao.candidateProfile": candidateProfile
      });
    }, profile);
    await panel.reload();

    const target = await context.newPage();
    await target.goto("https://job.ctrip.com/#/experienced/personal-homepage/editCV?tabindex=2");
    await expect(target.getByRole("heading", { name: "匿名 Ctrip Careers 候选人简历" })).toBeVisible();

    await panel.reload();
    await panel.locator(".power-session-actions button").click();
    await expect.poll(async () => {
      const response = await send<{ ok: true; session: { status: string; sessionId?: string; origin?: string } }>(panel, {
        type: "POWER_SESSION_STATUS",
        requestId: requestId("ctrip_status")
      });
      return response.session.status === "active" && response.session.origin === "https://job.ctrip.com"
        ? response.session.sessionId ?? ""
        : "";
    }, { timeout: 20_000 }).not.toBe("");
    const sessionResponse = await send<{ ok: true; session: { sessionId?: string } }>(panel, {
      type: "POWER_SESSION_STATUS",
      requestId: requestId("ctrip_session")
    });
    const sessionId = sessionResponse.session.sessionId ?? "";
    expect(sessionId).not.toBe("");

    const kernel = new ChromeRecruitmentKernelApi({
      send: (request) => panel.evaluate(
        async (payload) => chrome.runtime.sendMessage(payload),
        request
      ) as Promise<EmbeddedBridgeResponse>
    });
    const state = await kernel.state(sessionId);
    const serialized = JSON.stringify(state);
    expect(serialized).toContain("recruitEducationList[0].highestDegree");
    expect(serialized).toContain("recruitWorkingList[0].companyName");
    expect(serialized).not.toMatch(
      /page-name-private|verification-private|page-major-private|page-company-private|custom-private|tabindex=2/i
    );

    await panel.locator(".scan-button").click();
    await expect(panel.locator(".scan-results")).toBeVisible({ timeout: 20_000 });
    await expect(panel.locator(".result-header h2")).toContainText("ctrip-careers-custom");
    await expect(panel.locator(".attachment-card")).toHaveCount(0);
    const proposalCheckboxes = panel.locator(".proposal-card input[type='checkbox']");
    expect(await proposalCheckboxes.count()).toBe(14);
    for (const checkbox of await proposalCheckboxes.all()) await expect(checkbox).not.toBeChecked();
    await panel.screenshot({ path: "artifacts/ctrip-k5-sidepanel.png", fullPage: true });

    const routedName = panel.locator(".proposal-card[data-profile-path='basic.fullName']");
    await routedName.locator("input[type='checkbox']").check();
    await panel.locator(".fill-button").click();
    await expect.poll(async () => (await target.evaluate(() => (
      window as unknown as { __ctripGroundTruth: { read(): { basic: string[] } } }
    ).__ctripGroundTruth.read())).basic[0]).toBe("Anonymous Ctrip Candidate");

    const orchestrator = new RecruitmentAdapterOrchestrator(
      kernel,
      new AtsAdapterRegistry([ctripCareersManifest])
    );
    const resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("Expected Ctrip manifest match.");
    expect(resolution.plan.fields).toHaveLength(14);
    expect(resolution.plan.repeatables).toEqual([]);
    expect(resolution.plan.fields.some((field) => field.intent.kind === "saved-resume")).toBe(false);
    expect(resolution.plan.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "adapter-excluded" }),
      expect.objectContaining({ reason: "unknown-field" }),
      expect.objectContaining({ reason: "final-submit" })
    ]));

    const authorization = await kernel.authorizeActions(sessionId);
    const fields = [...resolution.plan.fields]
      .sort((left, right) => Number(left.capability === "searchable-combobox") - Number(right.capability === "searchable-combobox"));
    const outcomes = await orchestrator.executeSelected({
      sessionId,
      authorizationId: authorization.authorizationId,
      plan: resolution.plan,
      selections: fields.map((field) => ({ controlKey: field.controlKey, confirmed: true }))
    });
    expect(outcomes.every((outcome) => outcome.status === "verified"), JSON.stringify(outcomes)).toBe(true);

    expect(await target.evaluate(() => (
      window as unknown as { __ctripGroundTruth: { read(): unknown } }
    ).__ctripGroundTruth.read())).toEqual({
      basic: [
        "Anonymous Ctrip Candidate",
        "13800000000",
        "anonymous-ctrip@example.test",
        "Female",
        "2002-05-06",
        "Anonymous Ctrip City"
      ],
      education: [
        "",
        "Bachelor",
        "Anonymous Ctrip Major",
        "2010-09-01",
        "2014-06-30",
        "manual-education-description-private"
      ],
      work: [
        "Anonymous Ctrip Company",
        "Anonymous Ctrip Role",
        "2015-01-01",
        "2015-06-30",
        false,
        "Anonymous Ctrip work description"
      ],
      language: ["English", "Expert"],
      skill: "manual-skill-private",
      certificate: "manual-certificate-private",
      evaluation: "Anonymous Ctrip self evaluation",
      smsCode: "verification-private",
      smsPromptCount: 1,
      resumeImportCount: 0,
      portfolioFileCount: 0,
      parseCount: 0,
      portfolioCount: 0,
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
