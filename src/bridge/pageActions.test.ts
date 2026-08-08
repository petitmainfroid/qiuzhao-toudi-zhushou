import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile, type CandidateProfile } from "../domain/profile";
import { OpaqueReferenceRegistry } from "./pageState";
import {
  PageActionService,
  type PageActionExecutor,
  type PageActionServiceDependencies
} from "./pageActions";
import type { EmbeddedBridgeRequest, PowerSessionView } from "./protocol";

type ActionRequest = Extract<EmbeddedBridgeRequest, { type: "POWER_PAGE_ACTION" }>;

const session: PowerSessionView = {
  status: "active",
  sessionId: "power_session_test",
  tabId: 42,
  origin: "https://jobs.example",
  path: "/apply"
};

function profile(): CandidateProfile {
  const value = createEmptyProfile();
  value.updatedAt = "revision-1";
  value.basic.fullName = "Anonymous Candidate";
  value.education[0]!.startDate = "2024-09";
  value.education[0]!.endDate = "2027-06";
  return value;
}

function target(
  registry: OpaqueReferenceRegistry,
  overrides: Partial<Parameters<OpaqueReferenceRegistry["snapshot"]>[3][number]> = {}
): { ref: string; snapshotId: string } {
  const ref = registry.reference(session.sessionId!, "main-frame", 101);
  const snapshotId = registry.snapshot(session.sessionId!, session.origin!, session.path!, [{
    ref,
    frameKey: "main-frame",
    backendNodeId: 101,
    fingerprint: "fingerprint-1",
    role: "textbox",
    tag: "input",
    inputType: "text",
    safety: "ordinary",
    boundary: "main",
    disabled: false,
    readOnly: false,
    ...overrides
  }]);
  return { ref, snapshotId };
}

function request(
  authorizationId: string,
  ref: string,
  snapshotId: string,
  intent: ActionRequest["intent"] = {
    kind: "fill",
    source: { kind: "profile", path: "basic.fullName" }
  }
): ActionRequest {
  return {
    type: "POWER_PAGE_ACTION",
    requestId: "request_action_test",
    authorizationId,
    sessionId: session.sessionId!,
    snapshotId,
    ref,
    intent
  };
}

describe("page action service", () => {
  let registry: OpaqueReferenceRegistry;
  let executor: PageActionExecutor;
  let currentProfile: CandidateProfile;
  let now: number;
  let dependencies: PageActionServiceDependencies;

  beforeEach(() => {
    registry = new OpaqueReferenceRegistry(() => "actionnonce");
    currentProfile = profile();
    now = 1_000;
    executor = {
      execute: vi.fn(async () => ({
        performed: true,
        verified: true,
        strategy: "native-setter" as const
      })),
      keyboardFallback: vi.fn(async () => ({
        performed: true,
        verified: true,
        strategy: "keyboard-insert" as const
      }))
    };
    dependencies = {
      registry,
      executor,
      profileRepository: { load: vi.fn(async () => currentProfile) },
      now: () => now,
      randomId: () => "action_authorization_test"
    };
  });

  it("resolves the profile value locally and returns only privacy-safe evidence", async () => {
    const service = new PageActionService(dependencies);
    const control = target(registry);
    const authorization = await service.authorize(session, true);
    const result = await service.act(
      request(authorization.authorizationId, control.ref, control.snapshotId),
      session
    );

    expect(result).toEqual({
      requestId: "request_action_test",
      ref: control.ref,
      action: "fill",
      status: "verified",
      strategy: "native-setter",
      attempts: 1,
      durationBucket: "lt-100ms"
    });
    expect(executor.execute).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ backendNodeId: 101, fingerprint: "fingerprint-1" }),
      { action: "fill", strategy: "primary", expected: "Anonymous Candidate" }
    );
    expect(JSON.stringify(result)).not.toMatch(/Anonymous Candidate|basic\.fullName|revision-1/);
  });

  it("uses at most one keyboard fallback after a framework rejection", async () => {
    vi.mocked(executor.execute).mockResolvedValue({
      performed: false,
      verified: false,
      strategy: "native-setter",
      reason: "framework-rejected"
    });
    const service = new PageActionService(dependencies);
    const control = target(registry);
    const authorization = await service.authorize(session, true);

    expect(await service.act(
      request(authorization.authorizationId, control.ref, control.snapshotId),
      session
    )).toEqual(expect.objectContaining({
      status: "verified",
      attempts: 2,
      strategy: "keyboard-insert"
    }));
    expect(executor.execute).toHaveBeenCalledOnce();
    expect(executor.keyboardFallback).toHaveBeenCalledOnce();
  });

  it("resolves both sides of a canonical profile date range without exposing either value", async () => {
    vi.mocked(executor.execute).mockResolvedValue({
      performed: true,
      verified: true,
      strategy: "native-date-range"
    });
    const service = new PageActionService(dependencies);
    const control = target(registry, { role: "textbox", tag: "custom" });
    const authorization = await service.authorize(session, true);
    const result = await service.act(
      request(authorization.authorizationId, control.ref, control.snapshotId, {
        kind: "fill-range",
        source: {
          kind: "profile-range",
          startPath: "education.0.startDate",
          endPath: "education.0.endDate"
        }
      }),
      session
    );

    expect(result).toEqual(expect.objectContaining({
      action: "fill-range",
      status: "verified",
      strategy: "native-date-range",
      attempts: 1
    }));
    expect(executor.execute).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ backendNodeId: 101 }),
      {
        action: "fill-range",
        strategy: "primary",
        expectedStart: "2024-09",
        expectedEnd: "2027-06"
      }
    );
    expect(JSON.stringify(result)).not.toMatch(/2024-09|2027-06|startDate|endDate/);
    expect(executor.keyboardFallback).not.toHaveBeenCalled();
  });

  it("blocks invalid or incomplete profile ranges before executing", async () => {
    const service = new PageActionService(dependencies);
    const control = target(registry, { role: "textbox", tag: "custom" });
    const authorization = await service.authorize(session, true);
    currentProfile.education[0]!.endDate = "";
    expect(await service.act(
      request(authorization.authorizationId, control.ref, control.snapshotId, {
        kind: "fill-range",
        source: {
          kind: "profile-range",
          startPath: "education.0.startDate",
          endPath: "education.0.endDate"
        }
      }),
      session
    )).toEqual(expect.objectContaining({ status: "failed", attempts: 0, reason: "empty-profile-value" }));
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("blocks restricted controls, stale snapshots, and changed profile revisions before execution", async () => {
    const service = new PageActionService(dependencies);
    const restricted = target(registry, { safety: "final-submit", role: "button", tag: "button", inputType: "submit" });
    const authorization = await service.authorize(session, true);
    expect(await service.act(
      request(authorization.authorizationId, restricted.ref, restricted.snapshotId),
      session
    )).toEqual(expect.objectContaining({ status: "blocked", attempts: 0, reason: "unsafe-control" }));

    const ordinary = target(registry);
    expect(await service.act(
      request(authorization.authorizationId, ordinary.ref, "state_old_snapshot"),
      session
    )).toEqual(expect.objectContaining({ status: "failed", attempts: 0, reason: "stale-reference" }));

    currentProfile = { ...currentProfile, updatedAt: "revision-2" };
    expect(await service.act(
      request(authorization.authorizationId, ordinary.ref, ordinary.snapshotId),
      session
    )).toEqual(expect.objectContaining({ status: "blocked", attempts: 0, reason: "invalid-authorization" }));
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("rejects missing gestures, expired authorizations, and incompatible generic clicks", async () => {
    const service = new PageActionService(dependencies);
    await expect(service.authorize(session, false)).rejects.toThrow("action-authorization-unavailable");

    const control = target(registry);
    const authorization = await service.authorize(session, true);
    now += 60_001;
    expect(await service.act(
      request(authorization.authorizationId, control.ref, control.snapshotId),
      session
    )).toEqual(expect.objectContaining({ status: "blocked", attempts: 0, reason: "invalid-authorization" }));

    now = 2_000;
    const button = target(registry, { role: "button", tag: "button", inputType: "button" });
    const nextAuthorization = await service.authorize(session, true);
    expect(await service.act(
      request(nextAuthorization.authorizationId, button.ref, button.snapshotId, {
        kind: "click",
        purpose: "open-control"
      }),
      session
    )).toEqual(expect.objectContaining({ status: "blocked", attempts: 0, reason: "incompatible-action" }));
  });
});
