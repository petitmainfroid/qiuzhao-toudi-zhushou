import { describe, expect, it, vi } from "vitest";
import type {
  PageActionResult,
  PageUploadResult,
  PrivacySafePageState
} from "../bridge/protocol";
import {
  ATS_ADAPTER_SCHEMA_VERSION,
  AtsAdapterRegistry,
  RecruitmentAdapterOrchestrator,
  type AtsAdapterManifest,
  type RecruitmentKernelApi
} from ".";

const sessionId = "power_session_12345";

const manifest: AtsAdapterManifest = {
  schemaVersion: ATS_ADAPTER_SCHEMA_VERSION,
  family: { id: "anonymous-campus-ats", version: "1" },
  detection: {
    httpsOnly: true,
    exactHosts: ["careers.example.test"],
    hostSuffixes: [],
    pathPrefixes: ["/apply"],
    semanticMarkers: ["candidate.name"],
    minimumSemanticMarkers: 1
  },
  fields: [
    {
      id: "candidate-name",
      semanticKeys: ["candidate.name"],
      roles: ["textbox"],
      capability: "text",
      decision: "fill",
      intent: { kind: "profile-field", pathPattern: "basic.fullName" },
      verification: "normalized-equality"
    },
    {
      id: "candidate-gender",
      semanticKeys: ["candidate.gender"],
      roles: ["combobox"],
      capability: "single-select",
      decision: "confirm",
      intent: { kind: "profile-field", pathPattern: "basic.gender" },
      verification: "selected-option"
    },
    {
      id: "education-period",
      semanticKeys: ["education_list[].period"],
      roles: ["textbox"],
      capability: "date-range",
      decision: "fill",
      intent: {
        kind: "profile-range",
        startPathPattern: "education.{index}.startDate",
        endPathPattern: "education.{index}.endDate"
      },
      verification: "normalized-equality"
    },
    {
      id: "preferred-city",
      semanticKeys: ["candidate.preferred_city"],
      roles: ["combobox"],
      capability: "searchable-combobox",
      decision: "fill",
      intent: { kind: "profile-field", pathPattern: "jobPreference.preferredCities" },
      verification: "selected-option"
    },
    {
      id: "career-plan-present",
      semanticKeys: ["candidate.has_career_plan"],
      roles: ["checkbox"],
      capability: "toggle",
      decision: "confirm",
      intent: { kind: "profile-field", pathPattern: "answers.careerPlan" },
      verification: "checked-state"
    },
    {
      id: "project-name",
      semanticKeys: ["project_list[].name"],
      roles: ["textbox"],
      capability: "text",
      decision: "fill",
      intent: { kind: "profile-field", pathPattern: "projects.{index}.name" },
      verification: "normalized-equality"
    },
    {
      id: "saved-resume",
      semanticKeys: ["resume.attachment"],
      roles: ["textbox"],
      capability: "file-upload",
      decision: "confirm",
      intent: { kind: "saved-resume" },
      verification: "attachment-gate"
    }
  ],
  repeatables: [{
    collection: "projects",
    sectionSemanticKeys: ["project_list"],
    recordSemanticPrefixes: ["project_list[]"],
    addControlLabels: ["Add project"],
    saveControlLabels: ["Save project"],
    maximumCreatesPerRun: 3
  }],
  exclusions: { finalSubmitLabels: ["Submit application"] }
};

function state(projectCount = 1, includeSave = true): PrivacySafePageState {
  const controls: PrivacySafePageState["controls"] = [
    {
      ref: "ref_name_12345678",
      role: "textbox",
      tag: "input",
      semantics: { name: "candidate.name", label: "Name" },
      disabled: false,
      readOnly: false,
      required: true,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    {
      ref: "ref_gender_123456",
      role: "combobox",
      tag: "select",
      semantics: { name: "candidate.gender", label: "Gender" },
      options: ["Female", "Male"],
      disabled: false,
      readOnly: false,
      required: false,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    {
      ref: "ref_period_123456",
      role: "textbox",
      tag: "custom",
      semantics: { name: "education_list[0].period", label: "Education period" },
      disabled: false,
      readOnly: false,
      required: false,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    {
      ref: "ref_city_12345678",
      role: "combobox",
      tag: "custom",
      semantics: { name: "candidate.preferred_city", label: "Preferred city" },
      disabled: false,
      readOnly: false,
      required: false,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    {
      ref: "ref_career_plan_1234",
      role: "checkbox",
      tag: "input",
      inputType: "checkbox",
      semantics: { name: "candidate.has_career_plan", label: "Career plan provided" },
      disabled: false,
      readOnly: false,
      required: false,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    {
      ref: "ref_resume_123456",
      role: "textbox",
      tag: "input",
      inputType: "file",
      semantics: { name: "resume.attachment", label: "Resume" },
      disabled: false,
      readOnly: false,
      required: false,
      multiple: false,
      boundary: "main",
      safety: "file"
    },
    ...Array.from({ length: projectCount }, (_, index) => ({
      ref: `ref_project_${index}_123456`,
      role: "textbox" as const,
      tag: "input" as const,
      semantics: { name: `project_list[${index}].name`, label: "Project name" },
      disabled: false,
      readOnly: false,
      required: false,
      multiple: false,
      boundary: "main" as const,
      safety: "ordinary" as const
    })),
    {
      ref: "ref_project_add_12345",
      role: "button",
      tag: "button",
      semantics: { name: "project_list.add", label: "Add project" },
      disabled: false,
      readOnly: false,
      required: false,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    ...(includeSave ? [{
      ref: "ref_project_save_1234",
      role: "button" as const,
      tag: "button" as const,
      semantics: { name: `project_list[${projectCount - 1}].save`, label: "Save project" },
      disabled: false,
      readOnly: false,
      required: false,
      multiple: false,
      boundary: "main" as const,
      safety: "ordinary" as const
    }] : [])
  ];
  return {
    snapshotId: "state_snapshot_123",
    origin: "https://careers.example.test",
    path: "/apply/123456789",
    controls,
    summary: { controlCount: controls.length, frameCount: 0, openShadowRootCount: 0, blockedControlCount: 1 }
  };
}

function kernel() {
  const action = vi.fn(async (request): Promise<PageActionResult> => ({
    requestId: request.requestId,
    ref: request.ref,
    action: request.intent.kind,
    status: "verified",
    strategy: request.intent.kind === "select"
      ? "native-select"
      : request.intent.kind === "fill-range" ? "native-date-range" : "native-setter",
    attempts: 1,
    durationBucket: "lt-100ms"
  }));
  const upload = vi.fn(async (request): Promise<PageUploadResult> => ({
    requestId: request.requestId,
    ref: request.ref,
    action: "upload-saved-resume",
    status: "verified",
    attempts: 1,
    durationBucket: "lt-100ms"
  }));
  const api: RecruitmentKernelApi = {
    state: vi.fn(async () => state()),
    find: vi.fn(),
    authorizeActions: vi.fn(async () => ({ authorizationId: "action_authorization_123", expiresAt: 9_000 })),
    action,
    wait: vi.fn(async (request) => ({
      requestId: request.requestId,
      condition: request.condition.kind,
      status: "matched" as const,
      polls: 2,
      durationBucket: "100-500ms" as const,
      result: {
        snapshotId: "state_snapshot_after_open",
        query: "candidate.preferred_city",
        searchedControlCount: 1,
        matches: [{
          ref: "ref_city_after_open",
          role: "combobox" as const,
          label: "Preferred city",
          score: 1,
          reasons: ["exact semantic name"],
          safety: "ordinary" as const
        }]
      }
    })),
    authorizeUpload: vi.fn(async (_sessionId, _snapshotId, ref) => ({
      authorizationId: "upload_authorization_123",
      expiresAt: 9_000,
      origin: "https://careers.example.test",
      ref
    })),
    upload
  };
  return { api, action, upload };
}

describe("recruitment adapter orchestrator", () => {
  it("scans through the pinned kernel and executes only selected canonical profile paths", async () => {
    const test = kernel();
    const orchestrator = new RecruitmentAdapterOrchestrator(test.api, new AtsAdapterRegistry([manifest]));
    const resolution = await orchestrator.scan(sessionId);
    expect(resolution.status).toBe("matched");
    if (resolution.status !== "matched") return;
    const outcomes = await orchestrator.executeSelected({
      sessionId,
      authorizationId: "action_authorization_123",
      plan: resolution.plan,
      selections: [
        { controlKey: "ref_name_12345678", confirmed: false },
        { controlKey: "ref_gender_123456", confirmed: true }
      ]
    });
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["verified", "verified"]);
    expect(test.action.mock.calls.map(([request]) => request.intent)).toEqual([
      { kind: "fill", source: { kind: "profile", path: "basic.fullName" } },
      { kind: "select", source: { kind: "profile", path: "basic.gender" } }
    ]);
    expect(JSON.stringify(test.action.mock.calls)).not.toContain("value");
  });

  it("blocks missing confirmation, unknown selections, duplicate work, and direct resume actions", async () => {
    const test = kernel();
    const orchestrator = new RecruitmentAdapterOrchestrator(test.api, new AtsAdapterRegistry([manifest]));
    const resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("expected adapter match");
    const outcomes = await orchestrator.executeSelected({
      sessionId,
      authorizationId: "action_authorization_123",
      plan: resolution.plan,
      selections: [
        { controlKey: "ref_gender_123456", confirmed: false },
        { controlKey: "ref_not_planned_123", confirmed: true },
        { controlKey: "ref_name_12345678", confirmed: true },
        { controlKey: "ref_name_12345678", confirmed: true },
        { controlKey: "ref_period_123456", confirmed: true },
        { controlKey: "ref_resume_123456", confirmed: true }
      ]
    });
    expect(outcomes.map((outcome) => outcome.reason)).toEqual([
      "confirmation-required",
      "not-in-plan",
      undefined,
      "duplicate-selection",
      undefined,
      "saved-resume-requires-upload-gate"
    ]);
    expect(test.action).toHaveBeenCalledTimes(2);
    expect(test.action.mock.calls[1]?.[0].intent).toEqual({
      kind: "fill-range",
      source: {
        kind: "profile-range",
        startPath: "education.0.startDate",
        endPath: "education.0.endDate"
      }
    });
    expect(JSON.stringify(test.action.mock.calls)).not.toMatch(/2024-09|2027-06/);
  });

  it("executes searchable comboboxes as open, wait, refind, and profile-backed select", async () => {
    const test = kernel();
    const orchestrator = new RecruitmentAdapterOrchestrator(test.api, new AtsAdapterRegistry([manifest]));
    const resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("expected adapter match");
    const outcomes = await orchestrator.executeSelected({
      sessionId,
      authorizationId: "action_authorization_123",
      plan: resolution.plan,
      selections: [{ controlKey: "ref_city_12345678", confirmed: false }]
    });
    expect(outcomes).toEqual([expect.objectContaining({
      controlKey: "ref_city_12345678",
      status: "verified"
    })]);
    expect(test.action.mock.calls.map(([request]) => request.intent)).toEqual([
      { kind: "click", purpose: "open-control" },
      { kind: "select", source: { kind: "profile", path: "jobPreference.preferredCities" } }
    ]);
    expect(test.api.wait).toHaveBeenCalledWith(expect.objectContaining({
      condition: {
        kind: "option-list",
        query: { text: "candidate.preferred_city", roles: ["combobox", "listbox"], limit: 5 },
        minimumOptions: 1
      }
    }));
    expect(JSON.stringify(vi.mocked(test.api.wait).mock.calls)).not.toContain("optionText");
  });

  it("routes toggle intent as a local profile-presence check", async () => {
    const test = kernel();
    const orchestrator = new RecruitmentAdapterOrchestrator(test.api, new AtsAdapterRegistry([manifest]));
    const resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("expected adapter match");
    const outcomes = await orchestrator.executeSelected({
      sessionId,
      authorizationId: "action_authorization_123",
      plan: resolution.plan,
      selections: [{ controlKey: "ref_career_plan_1234", confirmed: true }]
    });
    expect(outcomes[0]).toEqual(expect.objectContaining({ status: "verified" }));
    expect(test.action).toHaveBeenCalledWith(expect.objectContaining({
      intent: {
        kind: "check",
        source: { kind: "profile-presence", path: "answers.careerPlan" }
      }
    }));
  });

  it("creates one bounded repeatable row at a time and verifies every new record by rescanning", async () => {
    const test = kernel();
    let projectCount = 1;
    test.api.state = vi.fn(async () => state(projectCount));
    test.api.action = vi.fn(async (request): Promise<PageActionResult> => {
      if (request.intent.kind === "click" && request.intent.purpose === "add-repeatable-record") {
        if (request.intent.source.index >= 2) {
          return {
            requestId: request.requestId,
            ref: request.ref,
            action: "click",
            status: "failed",
            strategy: "none",
            attempts: 0,
            reason: "empty-profile-value",
            durationBucket: "lt-100ms"
          };
        }
        projectCount += 1;
        return {
          requestId: request.requestId,
          ref: request.ref,
          action: "click",
          status: "performed",
          strategy: "repeatable-add",
          attempts: 1,
          durationBucket: "lt-100ms"
        };
      }
      throw new Error("unexpected action");
    });
    const orchestrator = new RecruitmentAdapterOrchestrator(test.api, new AtsAdapterRegistry([manifest]));
    const resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("expected adapter match");

    const outcome = await orchestrator.createMissingRepeatableRecords({
      sessionId,
      authorizationId: "action_authorization_123",
      plan: resolution.plan,
      collection: "projects"
    });

    expect(outcome).toEqual({
      collection: "projects",
      status: "created",
      initialPageCount: 1,
      finalPageCount: 2,
      createdCount: 1
    });
    expect(test.api.action).toHaveBeenCalledTimes(2);
    expect(vi.mocked(test.api.action).mock.calls[0]?.[0].intent).toEqual({
      kind: "click",
      purpose: "add-repeatable-record",
      source: { kind: "profile-record", collection: "projects", index: 1 }
    });
  });

  it("accepts a repeatable save only after the save control disappears without record loss", async () => {
    const test = kernel();
    let includeSave = true;
    test.api.state = vi.fn(async () => state(1, includeSave));
    test.api.action = vi.fn(async (request): Promise<PageActionResult> => {
      includeSave = false;
      return {
        requestId: request.requestId,
        ref: request.ref,
        action: "click",
        status: "performed",
        strategy: "repeatable-save",
        attempts: 1,
        durationBucket: "lt-100ms"
      };
    });
    const orchestrator = new RecruitmentAdapterOrchestrator(test.api, new AtsAdapterRegistry([manifest]));
    const resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("expected adapter match");

    expect(await orchestrator.saveRepeatableRecord({
      sessionId,
      authorizationId: "action_authorization_123",
      plan: resolution.plan,
      collection: "projects",
      recordIndex: 0
    })).toEqual({
      collection: "projects",
      status: "saved",
      initialPageCount: 1,
      finalPageCount: 1,
      createdCount: 0
    });
    expect(test.api.action).toHaveBeenCalledWith(expect.objectContaining({
      intent: { kind: "click", purpose: "save-repeatable-record" }
    }));
  });

  it("fails closed on ambiguous add controls and multi-row mutation", async () => {
    const ambiguous = kernel();
    const ambiguousOrchestrator = new RecruitmentAdapterOrchestrator(
      ambiguous.api,
      new AtsAdapterRegistry([manifest])
    );
    const ambiguousResolution = await ambiguousOrchestrator.scan(sessionId);
    if (ambiguousResolution.status !== "matched") throw new Error("expected adapter match");
    const repeatable = ambiguousResolution.plan.repeatables[0]!;
    repeatable.addControlKeys.push("ref_second_add_12345");
    expect(await ambiguousOrchestrator.createMissingRepeatableRecords({
      sessionId,
      authorizationId: "action_authorization_123",
      plan: ambiguousResolution.plan,
      collection: "projects"
    })).toEqual(expect.objectContaining({ status: "blocked", reason: "add-control-ambiguous", createdCount: 0 }));
    expect(ambiguous.api.action).not.toHaveBeenCalled();

    const changed = kernel();
    let projectCount = 1;
    changed.api.state = vi.fn(async () => state(projectCount));
    changed.api.action = vi.fn(async (request): Promise<PageActionResult> => {
      projectCount = 3;
      return {
        requestId: request.requestId,
        ref: request.ref,
        action: "click",
        status: "performed",
        strategy: "repeatable-add",
        attempts: 1,
        durationBucket: "lt-100ms"
      };
    });
    const changedOrchestrator = new RecruitmentAdapterOrchestrator(changed.api, new AtsAdapterRegistry([manifest]));
    const changedResolution = await changedOrchestrator.scan(sessionId);
    if (changedResolution.status !== "matched") throw new Error("expected adapter match");
    expect(await changedOrchestrator.createMissingRepeatableRecords({
      sessionId,
      authorizationId: "action_authorization_123",
      plan: changedResolution.plan,
      collection: "projects"
    })).toEqual(expect.objectContaining({ status: "failed", reason: "page-structure-changed", createdCount: 0 }));
    expect(changed.api.action).toHaveBeenCalledTimes(1);
  });

  it("routes saved resume only through the K4 confirmation gate", async () => {
    const test = kernel();
    const orchestrator = new RecruitmentAdapterOrchestrator(test.api, new AtsAdapterRegistry([manifest]));
    const resolution = await orchestrator.scan(sessionId);
    if (resolution.status !== "matched") throw new Error("expected adapter match");
    const target = { sessionId, plan: resolution.plan, controlKey: "ref_resume_123456" };
    const authorization = await orchestrator.authorizeSavedResume(target);
    const result = await orchestrator.uploadSavedResume(target, authorization.authorizationId);
    expect(result.status).toBe("verified");
    expect(test.api.authorizeUpload).toHaveBeenCalledWith(
      sessionId,
      resolution.plan.snapshotKey,
      target.controlKey
    );
    expect(test.upload).toHaveBeenCalledTimes(1);
  });
});
