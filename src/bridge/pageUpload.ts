import {
  runFixedFileUpload,
  type FixedFileUploadOutcome,
  type FixedFileUploadPayload
} from "../content/fileUploadDriver";
import {
  SavedResumeRepository,
  type SavedResume,
  type SavedResumeRepositoryLike
} from "../storage/savedResumeRepository";
import { EmbeddedCdpError, ensureAttached, sendDebuggerCommand } from "./opencliCdp";
import {
  inspectControlTarget,
  type CdpDomNode,
  type OpaqueReferenceRegistry,
  type ReferenceTarget
} from "./pageState";
import type {
  EmbeddedBridgeRequest,
  PageUploadAuthorizationView,
  PageUploadFailureReason,
  PageUploadResult,
  PowerSessionView
} from "./protocol";

export const PAGE_UPLOAD_AUTHORIZATION_TTL_MS = 60_000;
const UPLOAD_OBJECT_GROUP = "qiuzhao-fixed-upload";

type PageUploadRequest = Extract<EmbeddedBridgeRequest, { type: "POWER_PAGE_UPLOAD" }>;
type PageUploadAuthorizeRequest = Extract<EmbeddedBridgeRequest, { type: "POWER_PAGE_UPLOAD_AUTHORIZE" }>;
type PageUploadCancelRequest = Extract<EmbeddedBridgeRequest, { type: "POWER_PAGE_UPLOAD_CANCEL" }>;

interface StoredUploadAuthorization {
  authorizationId: string;
  sessionId: string;
  tabId: number;
  origin: string;
  path: string;
  snapshotId: string;
  ref: string;
  resumeRevision: string;
  expiresAt: number;
  used: boolean;
}

export interface PageUploadExecutor {
  execute(session: PowerSessionView, target: ReferenceTarget, resume: SavedResume): Promise<FixedFileUploadOutcome>;
}

export interface PageUploadServiceDependencies {
  registry: OpaqueReferenceRegistry;
  executor: PageUploadExecutor;
  resumeRepository: SavedResumeRepositoryLike;
  now(): number;
  randomId(): string;
}

function durationBucket(duration: number): PageUploadResult["durationBucket"] {
  if (duration < 100) return "lt-100ms";
  if (duration <= 500) return "100-500ms";
  return "gt-500ms";
}

function result(
  request: Pick<PageUploadRequest | PageUploadCancelRequest, "requestId" | "ref">,
  startedAt: number,
  now: number,
  status: PageUploadResult["status"],
  attempts: 0 | 1,
  reason?: PageUploadFailureReason
): PageUploadResult {
  return {
    requestId: request.requestId,
    ref: request.ref,
    action: "upload-saved-resume",
    status,
    attempts,
    ...(reason ? { reason } : {}),
    durationBucket: durationBucket(now - startedAt)
  };
}

function validSession(session: PowerSessionView): session is PowerSessionView & {
  sessionId: string;
  tabId: number;
  origin: string;
  path: string;
} {
  return session.status === "active"
    && typeof session.sessionId === "string"
    && typeof session.tabId === "number"
    && typeof session.origin === "string"
    && typeof session.path === "string";
}

function validFileTarget(target: ReferenceTarget): boolean {
  return target.safety === "file"
    && target.tag === "input"
    && target.inputType === "file"
    && !target.disabled
    && !target.readOnly;
}

export class PageUploadService {
  private authorization: StoredUploadAuthorization | null = null;

  constructor(private readonly dependencies: PageUploadServiceDependencies) {}

  async authorize(
    request: PageUploadAuthorizeRequest,
    session: PowerSessionView,
    createdByUserGesture: boolean
  ): Promise<PageUploadAuthorizationView> {
    if (
      !createdByUserGesture
      || !validSession(session)
      || request.sessionId !== session.sessionId
    ) throw new Error("upload-authorization-unavailable");
    const target = this.dependencies.registry.resolve(request.sessionId, request.snapshotId, request.ref);
    if (!target || target.origin !== session.origin || target.path !== session.path) {
      throw new Error("stale-reference");
    }
    if (!validFileTarget(target)) throw new Error("blocked-control");
    const resume = await this.dependencies.resumeRepository.load();
    if (!resume) throw new Error("invalid-resume");

    const authorizationId = this.dependencies.randomId();
    const expiresAt = this.dependencies.now() + PAGE_UPLOAD_AUTHORIZATION_TTL_MS;
    this.authorization = {
      authorizationId,
      sessionId: session.sessionId,
      tabId: session.tabId,
      origin: session.origin,
      path: session.path,
      snapshotId: request.snapshotId,
      ref: request.ref,
      resumeRevision: resume.sha256,
      expiresAt,
      used: false
    };
    return { authorizationId, expiresAt, origin: session.origin, ref: request.ref };
  }

  invalidate(): void {
    this.authorization = null;
  }

  cancel(request: PageUploadCancelRequest): PageUploadResult {
    const startedAt = this.dependencies.now();
    this.invalidate();
    return result(request, startedAt, this.dependencies.now(), "cancelled", 0, "user-cancelled");
  }

  async upload(request: PageUploadRequest, session: PowerSessionView): Promise<PageUploadResult> {
    const startedAt = this.dependencies.now();
    const authorization = this.authorization;
    if (session.status !== "active") {
      const reason: PageUploadFailureReason = session.reason === "origin-changed"
        ? "page-changed"
        : "session-inactive";
      this.invalidate();
      return result(request, startedAt, this.dependencies.now(), "failed", 0, reason);
    }
    if (
      !authorization
      || authorization.authorizationId !== request.authorizationId
      || authorization.expiresAt <= startedAt
      || authorization.used
      || !validSession(session)
      || request.sessionId !== session.sessionId
      || authorization.sessionId !== session.sessionId
      || authorization.tabId !== session.tabId
      || request.snapshotId !== authorization.snapshotId
      || request.ref !== authorization.ref
    ) {
      return result(request, startedAt, this.dependencies.now(), "blocked", 0, "invalid-authorization");
    }
    if (authorization.origin !== session.origin || authorization.path !== session.path) {
      this.invalidate();
      return result(request, startedAt, this.dependencies.now(), "failed", 0, "page-changed");
    }
    const target = this.dependencies.registry.resolve(request.sessionId, request.snapshotId, request.ref);
    if (!target) return result(request, startedAt, this.dependencies.now(), "failed", 0, "stale-reference");
    if (!validFileTarget(target)) {
      return result(request, startedAt, this.dependencies.now(), "blocked", 0, "blocked-control");
    }
    const resume = await this.dependencies.resumeRepository.load();
    if (!resume || resume.sha256 !== authorization.resumeRevision) {
      this.invalidate();
      return result(request, startedAt, this.dependencies.now(), "blocked", 0, "invalid-resume");
    }

    authorization.used = true;
    try {
      const outcome = await this.dependencies.executor.execute(session, target, resume);
      if (outcome.verified) {
        return result(request, startedAt, this.dependencies.now(), "verified", 1);
      }
      return result(
        request,
        startedAt,
        this.dependencies.now(),
        outcome.reason === "blocked-control" ? "blocked" : "failed",
        outcome.performed ? 1 : 0,
        outcome.reason ?? "verification-failed"
      );
    }
    catch (error) {
      const reason: PageUploadFailureReason = error instanceof EmbeddedCdpError
        ? error.code === "debugger-busy" ? "debugger-conflict"
          : error.code === "timeout" ? "timeout"
            : error.code === "origin-changed" ? "page-changed"
              : "bridge-failed"
        : "bridge-failed";
      return result(request, startedAt, this.dependencies.now(), "failed", 0, reason);
    }
  }
}

function secureLocation(rawUrl: string | undefined): { origin: string; path: string } | null {
  try {
    const url = new URL(rawUrl ?? "");
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return { origin: url.origin, path: url.pathname };
  }
  catch {
    return null;
  }
}

function sanitizedOutcome(value: unknown): FixedFileUploadOutcome {
  if (!value || typeof value !== "object") {
    return { performed: false, verified: false, reason: "bridge-failed" };
  }
  const candidate = value as Partial<FixedFileUploadOutcome>;
  const reasons: PageUploadFailureReason[] = [
    "invalid-authorization", "session-inactive", "debugger-conflict", "stale-reference", "timeout",
    "blocked-control", "page-changed", "verification-failed", "user-cancelled", "invalid-resume",
    "duplicate-request-conflict", "duplicate-request-uncertain", "bridge-failed"
  ];
  if (
    typeof candidate.performed !== "boolean"
    || typeof candidate.verified !== "boolean"
    || (candidate.reason !== undefined && !reasons.includes(candidate.reason))
  ) return { performed: false, verified: false, reason: "bridge-failed" };
  return {
    performed: candidate.performed,
    verified: candidate.verified,
    ...(candidate.reason ? { reason: candidate.reason } : {})
  };
}

async function filePayload(resume: SavedResume): Promise<FixedFileUploadPayload> {
  const bytes = new Uint8Array(await resume.file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  const base64 = btoa(chunks.join(""));
  bytes.fill(0);
  return { base64, name: resume.name, mimeType: resume.mimeType, size: resume.size };
}

export class ChromePageUploadExecutor implements PageUploadExecutor {
  async execute(
    session: PowerSessionView,
    target: ReferenceTarget,
    resume: SavedResume
  ): Promise<FixedFileUploadOutcome> {
    if (!validSession(session)) return { performed: false, verified: false, reason: "session-inactive" };
    const location = secureLocation((await chrome.tabs.get(session.tabId)).url);
    if (!location || location.origin !== session.origin || location.path !== target.path) {
      return { performed: false, verified: false, reason: "page-changed" };
    }
    await ensureAttached(session.tabId);
    const documentResult = await sendDebuggerCommand<{ root?: CdpDomNode }>({ tabId: session.tabId }, "DOM.getDocument", {
      depth: -1,
      pierce: true
    });
    if (!documentResult.root) return { performed: false, verified: false, reason: "stale-reference" };
    const inspected = inspectControlTarget(
      documentResult.root,
      session.origin,
      target.frameKey,
      target.backendNodeId
    );
    if (inspected?.fingerprint !== target.fingerprint) {
      return { performed: false, verified: false, reason: "stale-reference" };
    }

    try {
      const resolved = await sendDebuggerCommand<{ object?: { objectId?: string } }>({ tabId: session.tabId }, "DOM.resolveNode", {
        backendNodeId: target.backendNodeId,
        objectGroup: UPLOAD_OBJECT_GROUP
      });
      const objectId = resolved.object?.objectId;
      if (!objectId) return { performed: false, verified: false, reason: "stale-reference" };
      const response = await sendDebuggerCommand<{
        result?: { value?: unknown };
        exceptionDetails?: unknown;
      }>({ tabId: session.tabId }, "Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: runFixedFileUpload.toString(),
        arguments: [{ value: await filePayload(resume) }],
        returnByValue: true,
        awaitPromise: false,
        userGesture: true,
        silent: true,
        objectGroup: UPLOAD_OBJECT_GROUP
      });
      if (response.exceptionDetails) return { performed: false, verified: false, reason: "bridge-failed" };
      return sanitizedOutcome(response.result?.value);
    }
    finally {
      await sendDebuggerCommand({ tabId: session.tabId }, "Runtime.releaseObjectGroup", {
        objectGroup: UPLOAD_OBJECT_GROUP
      }).catch(() => undefined);
    }
  }
}

function randomAuthorizationId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `upload_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function createChromePageUploadService(registry: OpaqueReferenceRegistry): PageUploadService {
  return new PageUploadService({
    registry,
    executor: new ChromePageUploadExecutor(),
    resumeRepository: new SavedResumeRepository(),
    now: () => Date.now(),
    randomId: randomAuthorizationId
  });
}
