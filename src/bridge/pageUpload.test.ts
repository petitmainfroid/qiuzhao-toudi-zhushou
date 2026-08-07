import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedResume } from "../storage/savedResumeRepository";
import { OpaqueReferenceRegistry } from "./pageState";
import { EmbeddedCdpError } from "./opencliCdp";
import {
  PageUploadService,
  type PageUploadExecutor,
  type PageUploadServiceDependencies
} from "./pageUpload";
import type { EmbeddedBridgeRequest, PowerSessionView } from "./protocol";

type AuthorizeRequest = Extract<EmbeddedBridgeRequest, { type: "POWER_PAGE_UPLOAD_AUTHORIZE" }>;
type UploadRequest = Extract<EmbeddedBridgeRequest, { type: "POWER_PAGE_UPLOAD" }>;

const session: PowerSessionView = {
  status: "active",
  sessionId: "power_session_upload",
  tabId: 42,
  origin: "https://jobs.example",
  path: "/apply"
};

function savedResume(revision = "a".repeat(64)): SavedResume {
  const bytes = new TextEncoder().encode("%PDF-1.7 anonymous");
  return {
    name: "anonymous-resume.pdf",
    mimeType: "application/pdf",
    size: bytes.byteLength,
    sha256: revision,
    savedAt: "2026-08-07T00:00:00.000Z",
    file: new File([bytes], "anonymous-resume.pdf", { type: "application/pdf" })
  };
}

function fileTarget(registry: OpaqueReferenceRegistry, overrides: Record<string, unknown> = {}) {
  const ref = registry.reference(session.sessionId!, "main-frame", 501);
  const snapshotId = registry.snapshot(session.sessionId!, session.origin!, session.path!, [{
    ref,
    frameKey: "main-frame",
    backendNodeId: 501,
    fingerprint: "file-fingerprint",
    role: "textbox",
    tag: "input",
    inputType: "file",
    safety: "file",
    boundary: "main",
    disabled: false,
    readOnly: false,
    ...overrides
  }]);
  return { ref, snapshotId };
}

function authorizeRequest(ref: string, snapshotId: string): AuthorizeRequest {
  return {
    type: "POWER_PAGE_UPLOAD_AUTHORIZE",
    requestId: "upload_authorize_request",
    sessionId: session.sessionId!,
    snapshotId,
    ref
  };
}

function uploadRequest(authorizationId: string, ref: string, snapshotId: string): UploadRequest {
  return {
    type: "POWER_PAGE_UPLOAD",
    requestId: "upload_execute_request",
    authorizationId,
    sessionId: session.sessionId!,
    snapshotId,
    ref
  };
}

describe("user-confirmed saved resume upload", () => {
  let registry: OpaqueReferenceRegistry;
  let executor: PageUploadExecutor;
  let resume: SavedResume | null;
  let now: number;
  let dependencies: PageUploadServiceDependencies;

  beforeEach(() => {
    registry = new OpaqueReferenceRegistry(() => "uploadnonce");
    executor = { execute: vi.fn(async () => ({ performed: true, verified: true })) };
    resume = savedResume();
    now = 1_000;
    dependencies = {
      registry,
      executor,
      resumeRepository: {
        load: vi.fn(async () => resume),
        save: vi.fn(),
        clear: vi.fn()
      },
      now: () => now,
      randomId: () => "upload_authorization_123"
    };
  });

  it("binds the local primary PDF to one current opaque file reference", async () => {
    const service = new PageUploadService(dependencies);
    const target = fileTarget(registry);
    const authorization = await service.authorize(authorizeRequest(target.ref, target.snapshotId), session, true);
    const outcome = await service.upload(
      uploadRequest(authorization.authorizationId, target.ref, target.snapshotId),
      session
    );

    expect(authorization).toEqual({
      authorizationId: "upload_authorization_123",
      expiresAt: 61_000,
      origin: "https://jobs.example",
      ref: target.ref
    });
    expect(outcome).toEqual({
      requestId: "upload_execute_request",
      ref: target.ref,
      action: "upload-saved-resume",
      status: "verified",
      attempts: 1,
      durationBucket: "lt-100ms"
    });
    expect(executor.execute).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ backendNodeId: 501, safety: "file" }),
      resume
    );
    expect(JSON.stringify(outcome)).not.toMatch(/anonymous-resume|sha256|PDF-1\.7|jobs\.example/);
  });

  it("requires a gesture, current file target and unchanged local PDF", async () => {
    const service = new PageUploadService(dependencies);
    const target = fileTarget(registry);
    await expect(service.authorize(authorizeRequest(target.ref, target.snapshotId), session, false))
      .rejects.toThrow("upload-authorization-unavailable");

    const blocked = fileTarget(registry, { disabled: true });
    await expect(service.authorize(authorizeRequest(blocked.ref, blocked.snapshotId), session, true))
      .rejects.toThrow("blocked-control");

    const current = fileTarget(registry);
    const authorization = await service.authorize(authorizeRequest(current.ref, current.snapshotId), session, true);
    resume = savedResume("b".repeat(64));
    expect(await service.upload(
      uploadRequest(authorization.authorizationId, current.ref, current.snapshotId),
      session
    )).toEqual(expect.objectContaining({ status: "blocked", attempts: 0, reason: "invalid-resume" }));
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("consumes an authorization once and gives cancellation a distinct result", async () => {
    const service = new PageUploadService(dependencies);
    const target = fileTarget(registry);
    const authorization = await service.authorize(authorizeRequest(target.ref, target.snapshotId), session, true);
    const request = uploadRequest(authorization.authorizationId, target.ref, target.snapshotId);
    expect((await service.upload(request, session)).status).toBe("verified");
    expect(await service.upload({ ...request, requestId: "upload_second_request" }, session))
      .toEqual(expect.objectContaining({ status: "blocked", attempts: 0, reason: "invalid-authorization" }));
    expect(executor.execute).toHaveBeenCalledOnce();

    expect(service.cancel({
      type: "POWER_PAGE_UPLOAD_CANCEL",
      requestId: "upload_cancel_request",
      sessionId: session.sessionId!,
      snapshotId: target.snapshotId,
      ref: target.ref
    })).toEqual(expect.objectContaining({ status: "cancelled", attempts: 0, reason: "user-cancelled" }));
  });

  it.each([
    ["stale-reference", "failed", 0],
    ["blocked-control", "blocked", 0],
    ["verification-failed", "failed", 1],
    ["timeout", "failed", 0]
  ] as const)("preserves typed executor failure %s", async (reason, status, attempts) => {
    vi.mocked(executor.execute).mockResolvedValue({
      performed: attempts === 1,
      verified: false,
      reason
    });
    const service = new PageUploadService(dependencies);
    const target = fileTarget(registry);
    const authorization = await service.authorize(authorizeRequest(target.ref, target.snapshotId), session, true);
    expect(await service.upload(
      uploadRequest(authorization.authorizationId, target.ref, target.snapshotId),
      session
    )).toEqual(expect.objectContaining({ reason, status, attempts }));
  });

  it("maps a Chrome debugger ownership conflict to the upload-specific code", async () => {
    vi.mocked(executor.execute).mockRejectedValue(new EmbeddedCdpError("debugger-busy", "occupied"));
    const service = new PageUploadService(dependencies);
    const target = fileTarget(registry);
    const authorization = await service.authorize(authorizeRequest(target.ref, target.snapshotId), session, true);
    expect(await service.upload(
      uploadRequest(authorization.authorizationId, target.ref, target.snapshotId),
      session
    )).toEqual(expect.objectContaining({ status: "failed", attempts: 0, reason: "debugger-conflict" }));
  });
});
