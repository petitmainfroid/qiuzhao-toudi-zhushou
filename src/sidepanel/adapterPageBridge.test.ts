import { describe, expect, it, vi } from "vitest";
import type {
  PageActionResult,
  PageUploadResult,
  PrivacySafePageState,
  PowerSessionView
} from "../bridge/protocol";
import {
  createEmptyProfile,
  createProjectRecord,
  type CandidateProfile
} from "../domain/profile";
import {
  ATS_ADAPTER_SCHEMA_VERSION,
  AtsAdapterRegistry,
  type AtsAdapterManifest,
  type RecruitmentKernelApi
} from "../adapter-sdk";
import type { SavedFieldMapping } from "../mapping/types";
import { AdapterPageBridge, type AdapterPageBridgeSession } from "./adapterPageBridge";

const sessionId = "power_session_sidepanel_123";

const manifest: AtsAdapterManifest = {
  schemaVersion: ATS_ADAPTER_SCHEMA_VERSION,
  family: { id: "anonymous-sidepanel-ats", version: "1" },
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
      roles: ["button"],
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

function control(
  ref: string,
  name: string,
  overrides: Partial<PrivacySafePageState["controls"][number]> = {}
): PrivacySafePageState["controls"][number] {
  return {
    ref,
    role: "textbox",
    tag: "input",
    semantics: { name, label: name },
    disabled: false,
    readOnly: false,
    required: false,
    multiple: false,
    boundary: "main",
    safety: "ordinary",
    ...overrides
  };
}

function pageState(projectCount = 1): PrivacySafePageState {
  const controls: PrivacySafePageState["controls"] = [
    control("ref_name_12345678", "candidate.name", { semantics: { name: "candidate.name", label: "Name" } }),
    control("ref_gender_123456", "candidate.gender", {
      role: "combobox",
      tag: "select",
      semantics: { name: "candidate.gender", label: "Gender" },
      options: ["Female", "Male"]
    }),
    control("ref_resume_123456", "resume.attachment", {
      role: "button",
      inputType: "file",
      safety: "file",
      semantics: { name: "resume.attachment", label: "Resume PDF" }
    }),
    ...Array.from({ length: projectCount }, (_, index) => control(
      `ref_project_${index}_123456`,
      `project_list[${index}].name`,
      { semantics: { name: `project_list[${index}].name`, label: "Project name" } }
    )),
    control("ref_project_add_12345", "project_list.add", {
      role: "button",
      tag: "button",
      semantics: { name: "project_list.add", label: "Add project" }
    }),
    control("ref_submit_123456", "candidate.submit", {
      role: "button",
      tag: "button",
      safety: "final-submit",
      semantics: { name: "candidate.submit", label: "Submit application" }
    })
  ];
  return {
    snapshotId: `state_snapshot_${projectCount}`,
    origin: "https://careers.example.test",
    path: "/apply/123456789",
    controls,
    summary: {
      controlCount: controls.length,
      frameCount: 0,
      openShadowRootCount: 0,
      blockedControlCount: 2
    }
  };
}

function profile(): CandidateProfile {
  const value = createEmptyProfile();
  value.updatedAt = "2026-08-08T10:00:00.000Z";
  value.basic.fullName = "Local Only Candidate";
  value.basic.gender = "Female";
  const first = createProjectRecord();
  first.name = "Local Project Alpha";
  const second = createProjectRecord();
  second.name = "Local Project Beta";
  value.projects = [first, second];
  return value;
}

function harness(stateFactory: () => PrivacySafePageState = () => pageState()) {
  const action = vi.fn(async (request): Promise<PageActionResult> => ({
    requestId: request.requestId,
    ref: request.ref,
    action: request.intent.kind,
    status: "verified",
    strategy: request.intent.kind === "select" ? "native-select" : "native-setter",
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
    state: vi.fn(async () => stateFactory()),
    find: vi.fn(),
    authorizeActions: vi.fn(async () => ({
      authorizationId: "action_authorization_123",
      expiresAt: Date.now() + 60_000
    })),
    action,
    wait: vi.fn(),
    authorizeUpload: vi.fn(async (_activeSessionId, _snapshotId, ref) => ({
      authorizationId: "upload_authorization_123",
      expiresAt: Date.now() + 60_000,
      origin: "https://careers.example.test",
      ref
    })),
    upload
  };
  const session: AdapterPageBridgeSession = {
    status: vi.fn(async (): Promise<PowerSessionView> => ({ status: "active", sessionId }))
  };
  const bridge = new AdapterPageBridge(api, new AtsAdapterRegistry([manifest]), session);
  return { bridge, api, action, upload, session };
}

describe("AdapterPageBridge", () => {
  it("converts a privacy-safe K5 plan into the existing side-panel view without sending profile values", async () => {
    const test = harness();
    const localProfile = profile();
    const result = await test.bridge.scan(localProfile, [{
      site: "https://careers.example.test",
      fingerprint: "attacker-remap",
      profilePath: "basic.email",
      canonicalLabel: "Email",
      updatedAt: "2026-08-08T10:00:00.000Z"
    } satisfies SavedFieldMapping]);

    expect(result.site).toBe("https://careers.example.test");
    expect(result.fields.find((field) => field.elementId === "ref_name_12345678")).toMatchObject({
      fieldLabel: "Name",
      profilePath: "basic.fullName",
      valuePreview: "Local Only Candidate",
      comparisonStatus: "unreadable",
      requiresConfirmation: true,
      mappingSource: "rule"
    });
    expect(result.summary.high).toBe(0);
    expect(result.summary.needsConfirmation).toBeGreaterThan(0);
    expect(result.resumeAttachment).toEqual({
      status: "ready",
      candidateCount: 1,
      candidate: expect.objectContaining({
        elementId: "ref_resume_123456",
        destinationOrigin: "https://careers.example.test",
        kernelTarget: {
          sessionId,
          snapshotId: "state_snapshot_1",
          ref: "ref_resume_123456"
        }
      })
    });
    expect(result.repeatableRecords?.groups[0]).toMatchObject({
      key: "projects",
      profileCount: 2,
      pageCount: 1,
      missingCount: 1,
      canCreate: true
    });
    expect(test.api.state).toHaveBeenCalledWith(sessionId);
    expect(JSON.stringify(vi.mocked(test.api.state).mock.calls)).not.toContain("Local Only Candidate");
  });

  it("authorizes a click-time fill and executes only exact adapter paths while ignoring saved remaps", async () => {
    const test = harness();
    const localProfile = profile();
    await test.bridge.scan(localProfile);
    const result = await test.bridge.fill(localProfile, [
      { elementId: "ref_name_12345678", profilePath: "basic.fullName" },
      { elementId: "ref_gender_123456", profilePath: "basic.email" },
      { elementId: "ref_not_planned_123", profilePath: "basic.fullName" }
    ], [{
      site: "https://careers.example.test",
      fingerprint: "adapter|anonymous-sidepanel-ats|1|candidate-name|candidate.name|basic.fullName|",
      profilePath: "basic.email",
      canonicalLabel: "Email",
      updatedAt: "2026-08-08T10:00:00.000Z"
    }]);

    expect(test.api.authorizeActions).toHaveBeenCalledTimes(1);
    expect(test.action).toHaveBeenCalledTimes(1);
    expect(test.action).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      snapshotId: "state_snapshot_1",
      ref: "ref_name_12345678",
      intent: { kind: "fill", source: { kind: "profile", path: "basic.fullName" } }
    }));
    expect(JSON.stringify(test.action.mock.calls)).not.toContain("Local Only Candidate");
    expect(result).toMatchObject({ filledCount: 1, skippedCount: 2 });
    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(["filled", "skipped", "skipped"]);
  });

  it("creates only missing meaningful repeatable rows and refreshes the adapter plan", async () => {
    let projectCount = 1;
    const test = harness(() => pageState(projectCount));
    test.api.action = vi.fn(async (request): Promise<PageActionResult> => {
      if (request.intent.kind !== "click" || request.intent.purpose !== "add-repeatable-record") {
        throw new Error("unexpected action");
      }
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
    });
    const localProfile = profile();
    await test.bridge.scan(localProfile);
    const result = await test.bridge.createRepeatableRecords(localProfile, "projects");

    expect(result).toEqual({
      group: "projects",
      status: "created",
      initialPageCount: 1,
      finalPageCount: 2,
      requestedCount: 1,
      createdCount: 1,
      remainingCount: 0
    });
    expect(test.api.action).toHaveBeenCalledTimes(2);
    expect(vi.mocked(test.api.action).mock.calls[0]?.[0].intent).toEqual({
      kind: "click",
      purpose: "add-repeatable-record",
      source: { kind: "profile-record", collection: "projects", index: 1 }
    });
    expect(test.api.state).toHaveBeenCalledTimes(3);
  });

  it("routes the saved PDF through the K4 upload authorization and rejects changed targets", async () => {
    const test = harness();
    const result = await test.bridge.scan(profile());
    const candidate = result.resumeAttachment?.candidate;
    if (!candidate) throw new Error("expected resume candidate");
    const file = new File(["%PDF-1.7"], "resume.pdf", { type: "application/pdf" });

    expect(await test.bridge.attachResume(file, candidate, "unused-digest", Date.now())).toEqual({
      status: "attached"
    });
    expect(test.api.authorizeUpload).toHaveBeenCalledWith(
      sessionId,
      "state_snapshot_1",
      "ref_resume_123456"
    );
    expect(test.upload).toHaveBeenCalledTimes(1);

    expect(await test.bridge.attachResume(file, {
      ...candidate,
      elementId: "ref_changed_123456"
    }, "unused-digest", Date.now())).toEqual({
      status: "rejected",
      reason: "candidate-changed"
    });
    expect(test.upload).toHaveBeenCalledTimes(1);
  });
});
