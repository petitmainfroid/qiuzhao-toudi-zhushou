import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import type { EmbeddedBridgeRequest, EmbeddedBridgeResponse } from "../../src/bridge/protocol";
import { AtsAdapterRegistry, ChromeRecruitmentKernelApi, RecruitmentAdapterOrchestrator } from "../../src/adapter-sdk";
import { lenovoTalentManifest } from "../../src/ats/adapters/lenovo";
import {
  createEmptyProfile,
  createProjectRecord,
  createWorkExperienceRecord
} from "../../src/domain/profile";
import { lenovoManifestPage } from "../fixtures/lenovo-manifest-page";

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

async function installSyntheticSavedResume(panel: Page): Promise<void> {
  await panel.evaluate(async () => {
    const raw = new TextEncoder().encode("%PDF-1.7\nanonymous-lenovo-parity");
    const digest = await crypto.subtle.digest("SHA-256", raw);
    const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
    const database = await new Promise<IDBDatabase>((resolveDatabase, reject) => {
      const request = indexedDB.open("qiuzhao-resume-vault", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("saved-resumes")) {
          request.result.createObjectStore("saved-resumes", { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolveDatabase(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolveTransaction, reject) => {
      const transaction = database.transaction("saved-resumes", "readwrite");
      transaction.objectStore("saved-resumes").put({
        key: "primary",
        name: "anonymous-lenovo-parity.pdf",
        mimeType: "application/pdf",
        size: raw.byteLength,
        sha256,
        savedAt: "2026-08-08T00:00:00.000Z",
        bytes: raw.buffer.slice(0)
      });
      transaction.oncomplete = () => resolveTransaction();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
}

test("production Lenovo manifest routes the installed side panel and verifies conservative anonymous writes", async () => {
  test.setTimeout(120_000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-lenovo-manifest-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });

  try {
    await context.route("https://talent.lenovo.com.cn/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: lenovoManifestPage() });
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
    profile.basic.fullName = "Anonymous Lenovo Candidate";
    profile.basic.phone = "13800000000";
    profile.basic.email = "anonymous-lenovo@example.test";
    profile.education[0]!.school = "Anonymous Lenovo University";
    profile.education[0]!.degree = "Bachelor";
    profile.education[0]!.educationType = "Full-time";
    profile.education[0]!.major = "Anonymous Lenovo Major";
    profile.education[0]!.startDate = "2021-09";
    profile.education[0]!.endDate = "2025-06";
    profile.education[0]!.ranking = "Top 10%";
    profile.jobPreference.targetRoles = "Anonymous Role";
    profile.jobPreference.preferredCities = "Anonymous City";
    const internship = createWorkExperienceRecord();
    internship.company = "Anonymous Lenovo Internship";
    internship.role = "Anonymous Lenovo Intern";
    internship.description = "Anonymous Lenovo internship description";
    profile.workExperiences = [internship];
    const project = createProjectRecord();
    project.name = "Anonymous Lenovo Project";
    project.role = "Anonymous Lenovo Owner";
    project.description = "Anonymous Lenovo project description";
    profile.projects = [project];
    profile.answers.strengths = "Anonymous Lenovo strengths";
    profile.answers.selfEvaluation = "Anonymous Lenovo self evaluation";
    await panel.evaluate(async (candidateProfile) => {
      await chrome.storage.local.set({
        "qiuzhao.privacyAcknowledged": true,
        "qiuzhao.candidateProfile": candidateProfile
      });
    }, profile);
    await installSyntheticSavedResume(panel);
    await panel.reload();

    const target = await context.newPage();
    await target.goto("https://talent.lenovo.com.cn/account/resume?candidate=not-reported");
    await expect(target.getByRole("heading", { name: "匿名 Lenovo Talent 候选人简历" })).toBeVisible();

    await panel.reload();
    await panel.locator(".power-session-actions button").click();
    await expect.poll(async () => {
      const response = await send<{ ok: true; session: { status: string; sessionId?: string; origin?: string } }>(panel, {
        type: "POWER_SESSION_STATUS",
        requestId: requestId("lenovo_status")
      });
      return response.session.status === "active" && response.session.origin === "https://talent.lenovo.com.cn"
        ? response.session.sessionId ?? ""
        : "";
    }, { timeout: 20_000 }).not.toBe("");
    const sessionResponse = await send<{ ok: true; session: { sessionId?: string } }>(panel, {
      type: "POWER_SESSION_STATUS",
      requestId: requestId("lenovo_session")
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
    expect(serialized).toContain("resumeAttachment");
    expect(serialized).toContain("educationExperiences[0].degree");
    expect(serialized).not.toMatch(
      /manual-surname-private|identity-private|page-major-private|page-company-private|custom-private|candidate=not-reported/i
    );

    await panel.locator(".scan-button").click();
    await expect(panel.locator(".scan-results")).toBeVisible({ timeout: 20_000 });
    await expect(panel.locator(".result-header h2")).toContainText("lenovo-talent");
    const proposalCheckboxes = panel.locator(".proposal-card input[type='checkbox']");
    expect(await proposalCheckboxes.count()).toBe(14);
    for (const checkbox of await proposalCheckboxes.all()) await expect(checkbox).not.toBeChecked();
    await panel.screenshot({ path: "artifacts/lenovo-k5-sidepanel.png", fullPage: true });

    const routedEmail = panel.locator(".proposal-card[data-profile-path='basic.email']");
    await routedEmail.locator("input[type='checkbox']").check();
    await panel.locator(".fill-button").click();
    await expect.poll(async () => (await target.evaluate(() => (
      window as unknown as { __lenovoGroundTruth: { read(): { email: string } } }
    ).__lenovoGroundTruth.read())).email).toBe("anonymous-lenovo@example.test");

    const orchestrator = new RecruitmentAdapterOrchestrator(
      kernel,
      new AtsAdapterRegistry([lenovoTalentManifest])
    );
    let resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("Expected Lenovo manifest match.");
    expect(resolution.plan.fields).toHaveLength(15);
    expect(resolution.plan.repeatables).toEqual([]);
    expect(resolution.plan.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "adapter-excluded" }),
      expect.objectContaining({ reason: "unknown-field" }),
      expect.objectContaining({ reason: "final-submit" })
    ]));

    const authorization = await kernel.authorizeActions(sessionId);
    const primaryFields = resolution.plan.fields
      .filter((field) => field.intent.kind === "profile-field")
      .sort((left, right) => Number(left.capability === "searchable-combobox") - Number(right.capability === "searchable-combobox"));
    const outcomes = await orchestrator.executeSelected({
      sessionId,
      authorizationId: authorization.authorizationId,
      plan: resolution.plan,
      selections: primaryFields.map((field) => ({ controlKey: field.controlKey, confirmed: true }))
    });
    expect(outcomes.every((outcome) => outcome.status === "verified"), JSON.stringify(outcomes)).toBe(true);

    resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("Lenovo adapter disappeared after primary writes.");
    const resumeField = resolution.plan.fields.find((field) => field.intent.kind === "saved-resume");
    if (!resumeField) throw new Error("Saved resume field was not planned.");
    const uploadAuthorization = await orchestrator.authorizeSavedResume({
      sessionId,
      plan: resolution.plan,
      controlKey: resumeField.controlKey
    });
    const uploaded = await orchestrator.uploadSavedResume({
      sessionId,
      plan: resolution.plan,
      controlKey: resumeField.controlKey
    }, uploadAuthorization.authorizationId);
    expect(uploaded.status).toBe("verified");

    expect(await target.evaluate(() => (
      window as unknown as { __lenovoGroundTruth: { read(): unknown } }
    ).__lenovoGroundTruth.read())).toEqual({
      resumeCount: 1,
      resumeEvents: 1,
      email: "anonymous-lenovo@example.test",
      phone: "13800000000",
      education: ["Bachelor", "Full-time", "Anonymous Lenovo Major", "Top 10%"],
      internship: [
        "Anonymous Lenovo Internship",
        "Anonymous Lenovo Intern",
        "Anonymous Lenovo internship description"
      ],
      project: [
        "Anonymous Lenovo Project",
        "Anonymous Lenovo Owner",
        "Anonymous Lenovo project description"
      ],
      strengths: "Anonymous Lenovo strengths",
      selfEvaluation: "Anonymous Lenovo self evaluation",
      surname: "manual-surname-private",
      givenName: "manual-given-private",
      birthday: "1990/01",
      identity: "identity-private",
      wechat: "manual-wechat-private",
      school: "",
      educationStart: "2010/09",
      avatarCount: 0,
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
