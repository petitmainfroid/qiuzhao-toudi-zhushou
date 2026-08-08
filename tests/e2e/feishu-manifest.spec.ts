import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import type { EmbeddedBridgeRequest, EmbeddedBridgeResponse } from "../../src/bridge/protocol";
import { AtsAdapterRegistry, ChromeRecruitmentKernelApi, RecruitmentAdapterOrchestrator } from "../../src/adapter-sdk";
import { feishuRecruitingManifest } from "../../src/ats/adapters/feishu";
import { createEmptyProfile, createProjectRecord } from "../../src/domain/profile";
import { feishuManifestPage } from "../fixtures/feishu-manifest-page";

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
    const raw = new TextEncoder().encode("%PDF-1.7\nanonymous-feishu-parity");
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
        name: "anonymous-feishu-parity.pdf",
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

test("production Feishu manifest recognizes and verifies anonymous write parity without exposing page or file values", async () => {
  test.setTimeout(120_000);
  const extensionPath = resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-feishu-manifest-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });

  try {
    await context.route("https://synthetic.jobs.feishu.cn/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: feishuManifestPage() });
    });
    await expect.poll(() => context.pages().find(
      (page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url())
    )?.url() ?? "", { timeout: 20_000 }).not.toBe("");
    const panel = context.pages().find(
      (page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url())
    );
    if (!panel) throw new Error("Extension options page did not open.");
    const extensionId = new URL(panel.url()).host;
    await panel.setViewportSize({ width: 420, height: 1000 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    const profile = createEmptyProfile();
    profile.updatedAt = "2026-08-08T00:00:00.000Z";
    profile.basic.fullName = "Anonymous Feishu Candidate";
    profile.basic.phone = "13800000000";
    profile.basic.email = "anonymous-feishu@example.test";
    profile.basic.gender = "Female";
    profile.basic.nationality = "Anonymous Region";
    profile.basic.currentCity = "Anonymous City";
    profile.education[0]!.school = "Anonymous Feishu University";
    profile.education[0]!.degree = "Bachelor";
    profile.education[0]!.educationType = "Full-time";
    profile.education[0]!.major = "Anonymous Major";
    profile.education[0]!.startDate = "2022-09";
    profile.education[0]!.endDate = "2025-06";
    profile.jobPreference.targetRoles = "Anonymous Role";
    profile.jobPreference.preferredCities = "Anonymous City";
    const firstProject = createProjectRecord();
    firstProject.id = "feishu-project-0";
    firstProject.name = "Anonymous Feishu Project A";
    firstProject.role = "Anonymous Owner";
    firstProject.description = "Anonymous project description A";
    const secondProject = createProjectRecord();
    secondProject.id = "feishu-project-1";
    secondProject.name = "Anonymous Feishu Project B";
    secondProject.role = "Anonymous Owner";
    secondProject.description = "Anonymous project description B";
    profile.projects = [firstProject, secondProject];
    await panel.evaluate(async (candidateProfile) => {
      await chrome.storage.local.set({
        "qiuzhao.privacyAcknowledged": true,
        "qiuzhao.candidateProfile": candidateProfile
      });
    }, profile);
    await installSyntheticSavedResume(panel);
    await panel.reload();
    const target = await context.newPage();
    await target.goto("https://synthetic.jobs.feishu.cn/index/resume/7670064234785491242/apply?candidate=not-reported");
    await expect(target.getByRole("heading", { name: "匿名飞书招聘结构" })).toBeVisible();

    await panel.reload();
    await panel.locator(".power-session-actions button").click();
    await expect.poll(async () => {
      const response = await send<{ ok: true; session: { status: string; sessionId?: string; origin?: string } }>(panel, {
        type: "POWER_SESSION_STATUS",
        requestId: requestId("feishu_status")
      });
      return response.session.status === "active" && response.session.origin === "https://synthetic.jobs.feishu.cn"
        ? response.session.sessionId ?? ""
        : "";
    }, { timeout: 20_000 }).not.toBe("");
    const sessionResponse = await send<{ ok: true; session: { sessionId?: string } }>(panel, {
      type: "POWER_SESSION_STATUS",
      requestId: requestId("feishu_session")
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
    expect(serialized).toContain("basic_info.name");
    expect(serialized).toContain("education_list[0].school");
    expect(state.controls.filter((control) => control.semantics.name === "education_list[0].start_end_time")).toHaveLength(1);
    expect(serialized).toContain("[文件]");
    expect(serialized).toContain("[时间]");
    expect(serialized).not.toMatch(/page-name-must-not-leak|page-school-must-not-leak|custom-must-not-leak|private@example\.test|synthetic-private-resume|2026-08-08|12:34|candidate=not-reported/i);

    await panel.locator(".scan-button").click();
    await expect(panel.locator(".scan-results")).toBeVisible({ timeout: 20_000 });
    await expect(panel.locator(".result-header h2")).toContainText("feishu-recruiting");
    const proposalCheckboxes = panel.locator(".proposal-card input[type='checkbox']");
    expect(await proposalCheckboxes.count()).toBeGreaterThan(0);
    for (const checkbox of await proposalCheckboxes.all()) await expect(checkbox).not.toBeChecked();
    await panel.screenshot({ path: "artifacts/feishu-k5-sidepanel.png", fullPage: true });

    const routedName = panel.locator(".proposal-card[data-profile-path='basic.fullName']");
    await expect(routedName).toBeVisible();
    await routedName.locator("input[type='checkbox']").check();
    await panel.locator(".fill-button").click();
    await expect.poll(async () => (await target.evaluate(() => (
      window as unknown as { __feishuManifestGroundTruth: { read(): { name: string } } }
    ).__feishuManifestGroundTruth.read())).name).toBe("Anonymous Feishu Candidate");
    expect((await target.evaluate(() => (
      window as unknown as { __feishuManifestGroundTruth: { read(): { submitCount: number } } }
    ).__feishuManifestGroundTruth.read())).submitCount).toBe(0);

    const orchestrator = new RecruitmentAdapterOrchestrator(
      kernel,
      new AtsAdapterRegistry([feishuRecruitingManifest])
    );
    let resolution = await orchestrator.scan(sessionId);
    expect(resolution.status).toBe("matched");
    if (resolution.status !== "matched") throw new Error("Expected production Feishu manifest match.");
    expect(resolution.plan.familyId).toBe("feishu-recruiting");
    expect(resolution.plan.fields.map((field) => field.ruleId)).toEqual(expect.arrayContaining([
      "basic-name", "basic-email", "basic-gender", "education-school", "education-range", "resume-attachment"
    ]));
    expect(resolution.plan.fields.filter((field) => field.ruleId === "education-range")).toHaveLength(1);
    expect(resolution.plan.repeatables.find((item) => item.collection === "projects")).toEqual(expect.objectContaining({
      recordIndexes: [0],
      addControlKeys: [expect.any(String)]
    }));
    expect(resolution.plan.repeatables.filter((item) => item.collection !== "projects").every(
      (item) => item.addControlKeys.length === 0 && item.saveControls.length === 0
    )).toBe(true);
    expect(resolution.plan.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "unknown-field" }),
      expect.objectContaining({ reason: "final-submit" })
    ]));

    let authorization = await kernel.authorizeActions(sessionId);
    const primaryFields = resolution.plan.fields
      .filter((field) => field.intent.kind === "profile-field" || field.intent.kind === "profile-range")
      .sort((left, right) => Number(left.capability === "searchable-combobox") - Number(right.capability === "searchable-combobox"));
    const primaryOutcomes = await orchestrator.executeSelected({
      sessionId,
      authorizationId: authorization.authorizationId,
      plan: resolution.plan,
      selections: primaryFields.map((field) => ({ controlKey: field.controlKey, confirmed: true }))
    });
    expect(primaryOutcomes.every((outcome) => outcome.status === "verified"), JSON.stringify(primaryOutcomes)).toBe(true);

    resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("Feishu adapter disappeared after primary writes.");
    authorization = await kernel.authorizeActions(sessionId);
    const created = await orchestrator.createMissingRepeatableRecords({
      sessionId,
      authorizationId: authorization.authorizationId,
      plan: resolution.plan,
      collection: "projects"
    });
    expect(created).toEqual(expect.objectContaining({ status: "created", createdCount: 1, finalPageCount: 2 }));

    resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("Feishu adapter disappeared after repeatable creation.");
    const secondProjectField = resolution.plan.fields.find((field) =>
      field.intent.kind === "profile-field" && field.intent.pathPattern === "projects.1.name"
    );
    if (!secondProjectField) throw new Error("Second project field was not planned.");
    authorization = await kernel.authorizeActions(sessionId);
    const secondProjectOutcome = await orchestrator.executeSelected({
      sessionId,
      authorizationId: authorization.authorizationId,
      plan: resolution.plan,
      selections: [{ controlKey: secondProjectField.controlKey, confirmed: true }]
    });
    expect(secondProjectOutcome).toEqual([expect.objectContaining({ status: "verified" })]);
    const saved = await orchestrator.saveRepeatableRecord({
      sessionId,
      authorizationId: authorization.authorizationId,
      plan: resolution.plan,
      collection: "projects",
      recordIndex: 1
    });
    expect(saved.status).toBe("saved");

    resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("Feishu adapter disappeared after repeatable save.");
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
      window as unknown as { __feishuManifestGroundTruth: { read(): unknown } }
    ).__feishuManifestGroundTruth.read())).toEqual({
      name: "Anonymous Feishu Candidate",
      email: "anonymous-feishu@example.test",
      gender: "Female",
      school: "Anonymous Feishu University",
      period: ["2022-09", "2025-06"],
      projects: ["Anonymous Feishu Project A", "Anonymous Feishu Project B"],
      resumeCount: 1,
      resumeEvents: 1,
      addCount: 1,
      saveCount: 1,
      custom: "custom-must-not-leak",
      submitCount: 0
    });
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
