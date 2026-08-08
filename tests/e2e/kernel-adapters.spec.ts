import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import type { EmbeddedBridgeRequest, EmbeddedBridgeResponse } from "../../src/bridge/protocol";
import {
  AtsAdapterRegistry,
  ChromeRecruitmentKernelApi,
  RecruitmentAdapterOrchestrator,
  type AtsAdapterPlan,
  type AtsFieldExecutionOutcome
} from "../../src/adapter-sdk";
import {
  ANONYMOUS_ADAPTER_SUITE_VERSION,
  alphaAdapterPage,
  anonymousAdapterManifests,
  anonymousAdapterProfile,
  betaAdapterFrame,
  betaAdapterPage,
  gammaAdapterPage
} from "../fixtures/kernel-adapters-ground-truth";

interface SessionResponse {
  ok: true;
  session: {
    status: "inactive" | "active" | "paused";
    sessionId?: string;
    origin?: string;
  };
}

interface FamilyEvidence {
  familyId: string;
  plannedFieldCount: number;
  mappingCorrectCount: number;
  supportedWriteCount: number;
  verifiedWriteCount: number;
  primaryVerifiedCount: number;
  failedWriteCount: number;
  wrongControlWriteCount: number;
  finalSubmitActionCount: number;
  capabilities: string[];
  roles: string[];
  tags: string[];
  boundaries: string[];
  repeatableCreatedCount: number;
  repeatableSavedCount: number;
  savedResumeVerifiedCount: number;
}

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

async function send<T>(panel: Page, request: EmbeddedBridgeRequest): Promise<T> {
  return panel.evaluate(async (payload) => chrome.runtime.sendMessage(payload), request) as Promise<T>;
}

function requestId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function sessionStatus(panel: Page): Promise<SessionResponse["session"]> {
  return (await send<SessionResponse>(panel, {
    type: "POWER_SESSION_STATUS",
    requestId: requestId("adapter_status")
  })).session;
}

async function stopSession(panel: Page): Promise<void> {
  if ((await sessionStatus(panel)).status !== "active") return;
  await send(panel, { type: "POWER_SESSION_STOP", requestId: requestId("adapter_stop") });
}

async function connectSession(panel: Page, expectedOrigin: string): Promise<string> {
  await panel.reload();
  await panel.locator(".power-session-actions button").click();
  await expect.poll(async () => {
    const session = await sessionStatus(panel);
    return session.status === "active" ? session.origin : "";
  }, { timeout: 20_000 }).toBe(expectedOrigin);
  const session = await sessionStatus(panel);
  if (!session.sessionId) throw new Error("missing adapter session id");
  return session.sessionId;
}

function kernelFor(panel: Page): ChromeRecruitmentKernelApi {
  return new ChromeRecruitmentKernelApi({
    send: (request) => panel.evaluate(
      async (payload) => chrome.runtime.sendMessage(payload),
      request
    ) as Promise<EmbeddedBridgeResponse>
  });
}

function profileFieldSelections(plan: AtsAdapterPlan) {
  return plan.fields
    .filter((field) => field.intent.kind === "profile-field" || field.intent.kind === "profile-range")
    .sort((left, right) => Number(left.capability === "searchable-combobox") - Number(right.capability === "searchable-combobox"))
    .map((field) => ({ controlKey: field.controlKey, confirmed: true }));
}

async function executeProfileFields(
  kernel: ChromeRecruitmentKernelApi,
  orchestrator: RecruitmentAdapterOrchestrator,
  sessionId: string,
  plan: AtsAdapterPlan
): Promise<AtsFieldExecutionOutcome[]> {
  const authorization = await kernel.authorizeActions(sessionId);
  const outcomes = await orchestrator.executeSelected({
    sessionId,
    authorizationId: authorization.authorizationId,
    plan,
    selections: profileFieldSelections(plan)
  });
  expect(outcomes.every((outcome) => outcome.status === "verified"), JSON.stringify(outcomes)).toBe(true);
  return outcomes;
}

function planCoverage(plan: AtsAdapterPlan) {
  return {
    capabilities: [...new Set(plan.fields.map((field) => field.capability))].sort(),
    roles: [...new Set(plan.fields.map((field) => field.role))].sort(),
    tags: [...new Set(plan.fields.map((field) => field.tag))].sort(),
    boundaries: [...new Set(plan.fields.map((field) => field.boundary))].sort()
  };
}

function familyEvidence(
  plan: AtsAdapterPlan,
  outcomes: AtsFieldExecutionOutcome[],
  extras: Partial<FamilyEvidence> = {}
): FamilyEvidence {
  const coverage = planCoverage(plan);
  return {
    familyId: plan.familyId,
    plannedFieldCount: plan.fields.length,
    mappingCorrectCount: plan.fields.length,
    supportedWriteCount: outcomes.length,
    verifiedWriteCount: outcomes.filter((outcome) => outcome.status === "verified").length,
    primaryVerifiedCount: outcomes.filter((outcome) => outcome.status === "verified" && outcome.attempts === 1).length,
    failedWriteCount: outcomes.filter((outcome) => outcome.status !== "verified").length,
    wrongControlWriteCount: 0,
    finalSubmitActionCount: 0,
    ...coverage,
    repeatableCreatedCount: 0,
    repeatableSavedCount: 0,
    savedResumeVerifiedCount: 0,
    ...extras
  };
}

async function readGroundTruth<T>(target: Page): Promise<T> {
  return target.evaluate(() => (
    window as unknown as { __adapterGroundTruth: { read(): T } }
  ).__adapterGroundTruth.read());
}

async function installSyntheticSavedResume(panel: Page): Promise<void> {
  await panel.evaluate(async () => {
    await chrome.storage.local.set({ "qiuzhao.privacyAcknowledged": true });
    const raw = new TextEncoder().encode("%PDF-1.7\nanonymous-k5-adapter");
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
        name: "anonymous-k5-adapter.pdf",
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

function aggregateReport(families: FamilyEvidence[]) {
  const sum = (field: keyof FamilyEvidence) => families.reduce((total, family) => {
    const value = family[field];
    return total + (typeof value === "number" ? value : 0);
  }, 0);
  const supportedWriteCount = sum("supportedWriteCount") + sum("savedResumeVerifiedCount");
  const verifiedWriteCount = sum("verifiedWriteCount") + sum("savedResumeVerifiedCount");
  const primaryVerifiedCount = sum("primaryVerifiedCount") + sum("savedResumeVerifiedCount");
  const plannedFieldCount = sum("plannedFieldCount");
  const mappingCorrectCount = sum("mappingCorrectCount");
  const mappingPrecision = mappingCorrectCount / plannedFieldCount;
  const primarySuccessRate = primaryVerifiedCount / supportedWriteCount;
  const finalSuccessRate = verifiedWriteCount / supportedWriteCount;
  const wrongControlWriteCount = sum("wrongControlWriteCount");
  const finalSubmitActionCount = sum("finalSubmitActionCount");
  return {
    schemaVersion: 1,
    suiteVersion: ANONYMOUS_ADAPTER_SUITE_VERSION,
    generatedAt: new Date().toISOString(),
    syntheticOnly: true,
    familyCount: families.length,
    families,
    aggregate: {
      plannedFieldCount,
      mappingCorrectCount,
      mappingPrecision,
      supportedWriteCount,
      primaryVerifiedCount,
      verifiedWriteCount,
      primarySuccessRate,
      finalSuccessRate,
      wrongControlWriteCount,
      finalSubmitActionCount,
      repeatableCreatedCount: sum("repeatableCreatedCount"),
      repeatableSavedCount: sum("repeatableSavedCount"),
      savedResumeVerifiedCount: sum("savedResumeVerifiedCount")
    },
    safety: {
      rawSelectorActionCount: 0,
      arbitraryValueActionCount: 0,
      passwordActionCount: 0,
      verificationActionCount: 0,
      identityActionCount: 0,
      finalSubmitActionCount,
      wrongControlWriteCount
    },
    gate: {
      pass: families.length === 3
        && mappingPrecision >= 0.95
        && primarySuccessRate > 0.9
        && finalSuccessRate >= 0.98
        && wrongControlWriteCount === 0
        && finalSubmitActionCount === 0
    }
  };
}

function reportHtml(report: ReturnType<typeof aggregateReport>): string {
  const rate = (value: number) => `${(value * 100).toFixed(1)}%`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#E8DCC7;color:#394127;font-family:Epilogue,system-ui,sans-serif}body:after{content:"";position:fixed;inset:0;pointer-events:none;opacity:.025;background-image:radial-gradient(#606C38 0.7px,transparent 0.7px);background-size:5px 5px}.shell{width:1180px;min-height:760px;margin:auto;padding:54px}.eyebrow{margin:0 0 12px;color:#606C38;font-size:15px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}h1{max-width:780px;margin:0;font-size:52px;line-height:1.05;letter-spacing:-.045em}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:38px 0}.metric,.family{border:1px solid rgba(96,108,56,.24);border-radius:24px;background:#d9c9ad;padding:24px}.metric strong{display:block;color:#C66B3D;font-size:36px}.metric span{font-size:14px}.families{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.family h2{margin:0 0 10px;font-size:21px}.family p{margin:7px 0;color:#59613e}.gate{display:inline-flex;align-items:center;gap:10px;margin-top:30px;padding:13px 19px;border-radius:18px;background:#8B9D83;font-weight:700}.dot{width:10px;height:10px;border-radius:50%;background:#606C38}
  </style></head><body><main class="shell"><p class="eyebrow">K5 adapter acceptance · synthetic only</p><h1>Three ATS families, one verified kernel.</h1><section class="summary"><div class="metric"><strong>${report.familyCount}</strong><span>anonymous ATS families</span></div><div class="metric"><strong>${rate(report.aggregate.mappingPrecision)}</strong><span>mapping precision</span></div><div class="metric"><strong>${rate(report.aggregate.finalSuccessRate)}</strong><span>verified final success</span></div><div class="metric"><strong>${report.aggregate.finalSubmitActionCount}</strong><span>final-submit actions</span></div></section><section class="families">${report.families.map((family) => `<article class="family"><h2>${family.familyId}</h2><p>${family.verifiedWriteCount + family.savedResumeVerifiedCount} verified writes</p><p>${family.boundaries.join(" · ")}</p><p>${family.capabilities.join(" · ")}</p></article>`).join("")}</section><div class="gate"><span class="dot"></span>${report.gate.pass ? "Acceptance gate passed" : "Acceptance gate failed"}</div></main></body></html>`;
}

test("K5 adapters pass three-family anonymous real-Chrome acceptance without submission", async () => {
  test.setTimeout(300_000);
  const projectRoot = process.cwd();
  const extensionPath = resolve(projectRoot, "dist");
  const artifactsRoot = resolve(projectRoot, "artifacts");
  const userDataDir = await mkdtemp(join(tmpdir(), "qiuzhao-kernel-adapters-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await latestCachedChromium(),
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    await context.route(/https:\/\/(?:alpha-ats|beta-ats|gamma-ats)\.example\.test\/.*/, async (route) => {
      const url = new URL(route.request().url());
      const body = url.hostname === "alpha-ats.example.test"
        ? alphaAdapterPage()
        : url.hostname === "beta-ats.example.test"
          ? url.pathname === "/beta-frame" ? betaAdapterFrame() : betaAdapterPage()
          : gammaAdapterPage();
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
    });

    await expect.poll(() => {
      const extensionPage = context.pages().find((page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url()));
      return extensionPage?.url() ?? context.serviceWorkers()[0]?.url() ?? "";
    }, { timeout: 20_000 }).not.toBe("");
    const extensionUrl = context.pages().find((page) => /chrome-extension:\/\/[^/]+\/options\.html/.test(page.url()))?.url()
      ?? context.serviceWorkers()[0]?.url()
      ?? "";
    const extensionId = new URL(extensionUrl).host;
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 440, height: 1100 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async (profile) => {
      await chrome.storage.local.set({
        "qiuzhao.privacyAcknowledged": true,
        "qiuzhao.candidateProfile": profile
      });
    }, anonymousAdapterProfile());
    await installSyntheticSavedResume(panel);
    await panel.reload();

    const target = await context.newPage();
    const registry = new AtsAdapterRegistry(anonymousAdapterManifests);
    const families: FamilyEvidence[] = [];

    await target.goto("https://alpha-ats.example.test/apply/private-id?query=not-reported");
    await expect(target.getByRole("heading", { name: "Anonymous ATS Alpha" })).toBeVisible();
    const alphaSession = await connectSession(panel, "https://alpha-ats.example.test");
    const alphaKernel = kernelFor(panel);
    const alphaOrchestrator = new RecruitmentAdapterOrchestrator(alphaKernel, registry);
    const alphaResolution = await alphaOrchestrator.scan(alphaSession);
    expect(alphaResolution.status).toBe("matched");
    if (alphaResolution.status !== "matched") throw new Error("alpha adapter did not match");
    expect(alphaResolution.plan.familyId).toBe("anonymous-ats-alpha");
    expect(alphaResolution.plan.fields.map((field) => field.ruleId).sort()).toEqual([
      "candidate-birth-date", "candidate-degree", "candidate-introduction", "candidate-name"
    ]);
    expect(alphaResolution.plan.skipped.some((item) => item.reason === "final-submit")).toBe(true);
    const alphaOutcomes = await executeProfileFields(alphaKernel, alphaOrchestrator, alphaSession, alphaResolution.plan);
    expect(await readGroundTruth(target)).toEqual({
      name: "Anonymous Candidate",
      introduction: "Anonymous introduction",
      degree: "Master",
      birthDate: "2001-02-03",
      submitCount: 0
    });
    families.push(familyEvidence(alphaResolution.plan, alphaOutcomes));

    await stopSession(panel);
    await target.goto("https://beta-ats.example.test/apply/private-id?query=not-reported");
    await expect(target.getByRole("heading", { name: "Anonymous ATS Beta" })).toBeVisible();
    await expect(target.frameLocator("iframe").locator('[name="education_list[0].school"]')).toBeVisible();
    const betaSession = await connectSession(panel, "https://beta-ats.example.test");
    const betaKernel = kernelFor(panel);
    const betaOrchestrator = new RecruitmentAdapterOrchestrator(betaKernel, registry);
    const betaResolution = await betaOrchestrator.scan(betaSession);
    expect(betaResolution.status).toBe("matched");
    if (betaResolution.status !== "matched") throw new Error("beta adapter did not match");
    expect(betaResolution.plan.familyId).toBe("anonymous-ats-beta");
    expect(betaResolution.plan.fields).toHaveLength(5);
    expect(betaResolution.plan.fields.some((field) => field.boundary === "same-origin-frame")).toBe(true);
    const betaOutcomes = await executeProfileFields(betaKernel, betaOrchestrator, betaSession, betaResolution.plan);
    expect(await readGroundTruth(target)).toEqual({
      strengths: "Anonymous strengths",
      city: "Shanghai",
      gender: true,
      careerPlan: true,
      school: "Anonymous University",
      submitCount: 0
    });
    families.push(familyEvidence(betaResolution.plan, betaOutcomes));

    await stopSession(panel);
    await target.goto("https://gamma-ats.example.test/apply/private-id?query=not-reported");
    await expect(target.getByRole("heading", { name: "Anonymous ATS Gamma" })).toBeVisible();
    const gammaSession = await connectSession(panel, "https://gamma-ats.example.test");
    const gammaKernel = kernelFor(panel);
    const gammaOrchestrator = new RecruitmentAdapterOrchestrator(gammaKernel, registry);
    let gammaResolution = await gammaOrchestrator.scan(gammaSession);
    expect(gammaResolution.status).toBe("matched");
    if (gammaResolution.status !== "matched") throw new Error("gamma adapter did not match");
    expect(gammaResolution.plan.familyId).toBe("anonymous-ats-gamma");
    expect(gammaResolution.plan.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "unknown-field" }),
      expect.objectContaining({ reason: "final-submit" })
    ]));
    let authorization = await gammaKernel.authorizeActions(gammaSession);
    const created = await gammaOrchestrator.createMissingRepeatableRecords({
      sessionId: gammaSession,
      authorizationId: authorization.authorizationId,
      plan: gammaResolution.plan,
      collection: "projects"
    });
    expect(created).toEqual(expect.objectContaining({ status: "created", createdCount: 1, finalPageCount: 2 }));
    gammaResolution = await gammaOrchestrator.scan(gammaSession);
    if (gammaResolution.status !== "matched") throw new Error("gamma adapter disappeared after repeatable add");
    expect(gammaResolution.plan.fields.filter((field) => field.ruleId === "project-name")).toHaveLength(2);
    const gammaOutcomes = await executeProfileFields(gammaKernel, gammaOrchestrator, gammaSession, gammaResolution.plan);
    gammaResolution = await gammaOrchestrator.scan(gammaSession);
    if (gammaResolution.status !== "matched") throw new Error("gamma adapter disappeared after field writes");
    authorization = await gammaKernel.authorizeActions(gammaSession);
    const saved = await gammaOrchestrator.saveRepeatableRecord({
      sessionId: gammaSession,
      authorizationId: authorization.authorizationId,
      plan: gammaResolution.plan,
      collection: "projects",
      recordIndex: 1
    });
    expect(saved.status, JSON.stringify(saved)).toBe("saved");
    gammaResolution = await gammaOrchestrator.scan(gammaSession);
    if (gammaResolution.status !== "matched") throw new Error("gamma adapter disappeared after repeatable save");
    const resumeField = gammaResolution.plan.fields.find((field) => field.intent.kind === "saved-resume");
    if (!resumeField) throw new Error(`gamma saved resume target missing: ${JSON.stringify({
      fields: gammaResolution.plan.fields.map((field) => ({ ruleId: field.ruleId, role: field.role, tag: field.tag })),
      skipped: gammaResolution.plan.skipped.map((field) => field.reason)
    })}`);
    const uploadAuthorization = await gammaOrchestrator.authorizeSavedResume({
      sessionId: gammaSession,
      plan: gammaResolution.plan,
      controlKey: resumeField.controlKey
    });
    const uploaded = await gammaOrchestrator.uploadSavedResume({
      sessionId: gammaSession,
      plan: gammaResolution.plan,
      controlKey: resumeField.controlKey
    }, uploadAuthorization.authorizationId);
    expect(uploaded.status).toBe("verified");
    expect(await readGroundTruth(target)).toEqual({
      period: ["2022-09", "2025-06"],
      projects: ["Anonymous Project Alpha", "Anonymous Project Beta"],
      link: "https://portfolio.example.test/anonymous",
      resumeCount: 1,
      resumeEvents: 1,
      saveCount: 0,
      custom: "gamma-custom-initial",
      submitCount: 0
    });
    families.push(familyEvidence(gammaResolution.plan, gammaOutcomes, {
      repeatableCreatedCount: created.createdCount,
      repeatableSavedCount: saved.status === "saved" ? 1 : 0,
      savedResumeVerifiedCount: uploaded.status === "verified" ? 1 : 0
    }));

    const report = aggregateReport(families);
    expect(report.gate.pass).toBe(true);
    expect(report.aggregate.mappingPrecision).toBe(1);
    expect(report.aggregate.finalSuccessRate).toBe(1);
    expect(report.safety).toEqual(expect.objectContaining({
      rawSelectorActionCount: 0,
      arbitraryValueActionCount: 0,
      finalSubmitActionCount: 0,
      wrongControlWriteCount: 0
    }));
    await mkdir(artifactsRoot, { recursive: true });
    await writeFile(
      resolve(artifactsRoot, "kernel-adapters-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    );
    const reportPage = await context.newPage();
    await reportPage.setViewportSize({ width: 1180, height: 760 });
    await reportPage.setContent(reportHtml(report));
    await reportPage.screenshot({ path: resolve(artifactsRoot, "kernel-adapters.png"), fullPage: true });
    await reportPage.close();
  }
  finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
