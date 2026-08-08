import { getProfileValue, type CandidateProfile } from "../domain/profile";
import { canonicalFields } from "../matching/catalog";
import { ProfileRepository } from "../storage/profileRepository";
import {
  runFixedPageAction,
  type FixedPageActionOutcome,
  type FixedPageActionPayload
} from "../content/pageDriver";
import { ensureAttached, sendDebuggerCommand } from "./opencliCdp";
import {
  inspectControlTarget,
  type CdpDomNode,
  type OpaqueReferenceRegistry,
  type ReferenceTarget
} from "./pageState";
import type {
  EmbeddedBridgeRequest,
  PageActionAuthorizationView,
  PageActionFailureReason,
  PageActionIntent,
  PageActionResult,
  PageActionStrategy,
  PowerSessionView
} from "./protocol";

export const PAGE_ACTION_AUTHORIZATION_TTL_MS = 60_000;
const MAX_ACTIONS_PER_AUTHORIZATION = 100;
const ACTION_OBJECT_GROUP = "qiuzhao-fixed-action";

type PageActionRequest = Extract<EmbeddedBridgeRequest, { type: "POWER_PAGE_ACTION" }>;

interface StoredAuthorization {
  authorizationId: string;
  sessionId: string;
  tabId: number;
  origin: string;
  profileRevision: string;
  expiresAt: number;
  actionCount: number;
}

export interface PageActionExecutor {
  execute(
    session: PowerSessionView,
    target: ReferenceTarget,
    payload: FixedPageActionPayload
  ): Promise<FixedPageActionOutcome>;
  keyboardFallback(
    session: PowerSessionView,
    target: ReferenceTarget,
    expected: string,
    action: "fill" | "type"
  ): Promise<FixedPageActionOutcome>;
}

export interface PageActionServiceDependencies {
  registry: OpaqueReferenceRegistry;
  executor: PageActionExecutor;
  profileRepository: Pick<ProfileRepository, "load">;
  now(): number;
  randomId(): string;
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

function allowedProfilePath(path: string): boolean {
  if (path === "derived.age") return true;
  const template = path.replace(
    /^(education|workExperiences|projects|workSamples|awards|languages)\.\d+\./,
    "$1.0."
  );
  return canonicalFields.some((field) => field.path === template);
}

function durationBucket(duration: number): PageActionResult["durationBucket"] {
  if (duration < 100) return "lt-100ms";
  if (duration <= 500) return "100-500ms";
  return "gt-500ms";
}

function actionValue(intent: PageActionIntent, profile: CandidateProfile): string | undefined {
  if (intent.kind === "check" || intent.kind === "click") return undefined;
  return getProfileValue(profile, intent.source.path).trim();
}

function compatible(intent: PageActionIntent, target: ReferenceTarget): boolean {
  if (intent.kind === "check") return target.role === "checkbox" || target.role === "switch";
  if (intent.kind === "click") {
    return (target.role === "combobox" || target.role === "listbox")
      && target.tag !== "button" && target.tag !== "a";
  }
  if (intent.kind === "type") {
    return target.role === "textbox"
      && target.inputType !== "radio" && target.inputType !== "checkbox";
  }
  if (intent.kind === "select") {
    return target.tag === "select"
      || target.role === "radio"
      || target.role === "combobox"
      || target.role === "listbox";
  }
  return target.role === "textbox"
    || target.tag === "select"
    || target.role === "radio";
}

function staticResult(
  request: PageActionRequest,
  startedAt: number,
  now: number,
  status: PageActionResult["status"],
  reason: PageActionFailureReason,
  attempts: 0 | 1 | 2 = 0,
  strategy: PageActionStrategy = "none"
): PageActionResult {
  return {
    requestId: request.requestId,
    ref: request.ref,
    action: request.intent.kind,
    status,
    strategy,
    attempts,
    reason,
    durationBucket: durationBucket(now - startedAt)
  };
}

function outcomeResult(
  request: PageActionRequest,
  startedAt: number,
  now: number,
  outcome: FixedPageActionOutcome,
  attempts: 1 | 2
): PageActionResult {
  return {
    requestId: request.requestId,
    ref: request.ref,
    action: request.intent.kind,
    status: outcome.verified ? "verified" : "failed",
    strategy: outcome.strategy,
    attempts,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    durationBucket: durationBucket(now - startedAt)
  };
}

export class PageActionService {
  private authorization: StoredAuthorization | null = null;

  constructor(private readonly dependencies: PageActionServiceDependencies) {}

  async authorize(session: PowerSessionView, createdByUserGesture: boolean): Promise<PageActionAuthorizationView> {
    if (
      !createdByUserGesture
      || session.status !== "active"
      || !session.sessionId
      || typeof session.tabId !== "number"
      || !session.origin
    ) throw new Error("action-authorization-unavailable");

    const profile = await this.dependencies.profileRepository.load();
    const authorizationId = this.dependencies.randomId();
    const expiresAt = this.dependencies.now() + PAGE_ACTION_AUTHORIZATION_TTL_MS;
    this.authorization = {
      authorizationId,
      sessionId: session.sessionId,
      tabId: session.tabId,
      origin: session.origin,
      profileRevision: profile.updatedAt,
      expiresAt,
      actionCount: 0
    };
    return { authorizationId, expiresAt };
  }

  invalidate(): void {
    this.authorization = null;
  }

  async act(request: PageActionRequest, session: PowerSessionView): Promise<PageActionResult> {
    const startedAt = this.dependencies.now();
    const authorization = this.authorization;
    if (
      !authorization
      || authorization.authorizationId !== request.authorizationId
      || authorization.expiresAt <= startedAt
      || authorization.actionCount >= MAX_ACTIONS_PER_AUTHORIZATION
      || session.status !== "active"
      || request.sessionId !== session.sessionId
      || authorization.sessionId !== session.sessionId
      || authorization.tabId !== session.tabId
      || authorization.origin !== session.origin
    ) {
      this.invalidate();
      return staticResult(request, startedAt, this.dependencies.now(), "blocked", "invalid-authorization");
    }

    const target = this.dependencies.registry.resolve(request.sessionId, request.snapshotId, request.ref);
    if (!target || target.origin !== session.origin || target.path !== session.path) {
      return staticResult(request, startedAt, this.dependencies.now(), "failed", "stale-reference");
    }
    if (target.safety !== "ordinary") {
      return staticResult(request, startedAt, this.dependencies.now(), "blocked", "unsafe-control");
    }
    if (target.disabled || target.readOnly) {
      return staticResult(request, startedAt, this.dependencies.now(), "blocked", "disabled-or-readonly");
    }
    if (!compatible(request.intent, target)) {
      return staticResult(request, startedAt, this.dependencies.now(), "blocked", "incompatible-action");
    }

    const profile = await this.dependencies.profileRepository.load();
    if (profile.updatedAt !== authorization.profileRevision) {
      this.invalidate();
      return staticResult(request, startedAt, this.dependencies.now(), "blocked", "invalid-authorization");
    }
    if (
      request.intent.kind !== "check"
      && request.intent.kind !== "click"
      && !allowedProfilePath(request.intent.source.path)
    ) return staticResult(request, startedAt, this.dependencies.now(), "blocked", "invalid-profile-path");

    const expected = actionValue(request.intent, profile);
    if (request.intent.kind !== "check" && request.intent.kind !== "click" && !expected) {
      return staticResult(request, startedAt, this.dependencies.now(), "failed", "empty-profile-value");
    }

    authorization.actionCount += 1;
    const primary = await this.dependencies.executor.execute(session, target, {
      action: request.intent.kind,
      strategy: "primary",
      ...(expected !== undefined ? { expected } : {}),
      ...(request.intent.kind === "check" ? { desired: request.intent.desired } : {})
    });
    if (primary.verified) {
      return outcomeResult(request, startedAt, this.dependencies.now(), primary, 1);
    }

    const mayFallback = (request.intent.kind === "fill" || request.intent.kind === "type")
      && target.role === "textbox"
      && expected !== undefined
      && (primary.reason === "framework-rejected" || primary.reason === "verification-failed");
    if (!mayFallback) return outcomeResult(request, startedAt, this.dependencies.now(), primary, 1);

    const currentTarget = this.dependencies.registry.resolve(request.sessionId, request.snapshotId, request.ref);
    if (!currentTarget || currentTarget.fingerprint !== target.fingerprint) {
      return staticResult(request, startedAt, this.dependencies.now(), "failed", "stale-reference", 1, primary.strategy);
    }
    const fallback = await this.dependencies.executor.keyboardFallback(
      session,
      currentTarget,
      expected,
      request.intent.kind === "fill" ? "fill" : "type"
    );
    return outcomeResult(request, startedAt, this.dependencies.now(), fallback, 2);
  }
}

interface RemoteObjectResult {
  result?: { value?: unknown; objectId?: string };
  exceptionDetails?: unknown;
}

function sanitizedOutcome(value: unknown): FixedPageActionOutcome {
  if (!value || typeof value !== "object") {
    return { performed: false, verified: false, strategy: "none", reason: "bridge-failed" };
  }
  const candidate = value as Partial<FixedPageActionOutcome>;
  const strategies: PageActionStrategy[] = [
    "none", "native-setter", "native-select", "custom-select", "exact-radio", "exact-check",
    "contenteditable-text", "open-control", "keyboard-insert"
  ];
  const reasons: PageActionFailureReason[] = [
    "invalid-authorization", "session-inactive", "origin-changed", "stale-reference",
    "invalid-profile-path", "empty-profile-value", "unsafe-control", "incompatible-action",
    "disabled-or-readonly", "hidden-control", "option-not-found", "option-ambiguous",
    "unsupported-control", "framework-rejected", "verification-failed", "bridge-failed"
  ];
  if (
    typeof candidate.performed !== "boolean"
    || typeof candidate.verified !== "boolean"
    || !strategies.includes(candidate.strategy as PageActionStrategy)
    || (candidate.reason !== undefined && !reasons.includes(candidate.reason))
  ) return { performed: false, verified: false, strategy: "none", reason: "bridge-failed" };
  return {
    performed: candidate.performed,
    verified: candidate.verified,
    strategy: candidate.strategy as PageActionStrategy,
    ...(candidate.reason ? { reason: candidate.reason } : {})
  };
}

export class ChromePageActionExecutor implements PageActionExecutor {
  private async inspect(session: PowerSessionView, target: ReferenceTarget): Promise<CdpDomNode | null> {
    if (session.status !== "active" || typeof session.tabId !== "number" || !session.origin || !session.path) return null;
    const location = secureLocation((await chrome.tabs.get(session.tabId)).url);
    if (!location || location.origin !== session.origin || location.path !== target.path) return null;
    await ensureAttached(session.tabId);
    const documentResult = await sendDebuggerCommand<{ root?: CdpDomNode }>({ tabId: session.tabId }, "DOM.getDocument", {
      depth: -1,
      pierce: true
    });
    if (!documentResult.root) return null;
    const inspected = inspectControlTarget(
      documentResult.root,
      session.origin,
      target.frameKey,
      target.backendNodeId
    );
    return inspected?.fingerprint === target.fingerprint ? documentResult.root : null;
  }

  private async call(
    tabId: number,
    target: ReferenceTarget,
    payload: FixedPageActionPayload
  ): Promise<FixedPageActionOutcome> {
    try {
      const resolved = await sendDebuggerCommand<{ object?: { objectId?: string } }>({ tabId }, "DOM.resolveNode", {
        backendNodeId: target.backendNodeId,
        objectGroup: ACTION_OBJECT_GROUP
      });
      const objectId = resolved.object?.objectId;
      if (!objectId) return { performed: false, verified: false, strategy: "none", reason: "stale-reference" };
      const result = await sendDebuggerCommand<RemoteObjectResult>({ tabId }, "Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: runFixedPageAction.toString(),
        arguments: [{ value: payload }],
        returnByValue: true,
        awaitPromise: false,
        userGesture: true,
        silent: true,
        objectGroup: ACTION_OBJECT_GROUP
      });
      if (result.exceptionDetails) {
        return { performed: false, verified: false, strategy: "none", reason: "bridge-failed" };
      }
      return sanitizedOutcome(result.result?.value);
    }
    catch {
      return { performed: false, verified: false, strategy: "none", reason: "bridge-failed" };
    }
    finally {
      await sendDebuggerCommand({ tabId }, "Runtime.releaseObjectGroup", {
        objectGroup: ACTION_OBJECT_GROUP
      }).catch(() => undefined);
    }
  }

  async execute(
    session: PowerSessionView,
    target: ReferenceTarget,
    payload: FixedPageActionPayload
  ): Promise<FixedPageActionOutcome> {
    if (typeof session.tabId !== "number" || !await this.inspect(session, target)) {
      return { performed: false, verified: false, strategy: "none", reason: "stale-reference" };
    }
    const outcome = await this.call(session.tabId, target, payload);
    if (!await this.inspect(session, target)) {
      return { performed: outcome.performed, verified: false, strategy: outcome.strategy, reason: "stale-reference" };
    }
    return outcome;
  }

  async keyboardFallback(
    session: PowerSessionView,
    target: ReferenceTarget,
    expected: string,
    action: "fill" | "type"
  ): Promise<FixedPageActionOutcome> {
    if (typeof session.tabId !== "number" || !await this.inspect(session, target)) {
      return { performed: false, verified: false, strategy: "keyboard-insert", reason: "stale-reference" };
    }
    const prepared = await this.call(session.tabId, target, {
      action,
      strategy: "prepare-keyboard",
      expected
    });
    if (!prepared.performed || !await this.inspect(session, target)) return prepared;
    await sendDebuggerCommand({ tabId: session.tabId }, "Input.insertText", { text: expected });
    const verified = await this.call(session.tabId, target, {
      action,
      strategy: "verify-keyboard",
      expected
    });
    if (!await this.inspect(session, target)) {
      return { performed: true, verified: false, strategy: "keyboard-insert", reason: "stale-reference" };
    }
    return verified;
  }
}

function randomAuthorizationId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `action_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function createChromePageActionService(registry: OpaqueReferenceRegistry): PageActionService {
  return new PageActionService({
    registry,
    executor: new ChromePageActionExecutor(),
    profileRepository: new ProfileRepository(),
    now: () => Date.now(),
    randomId: randomAuthorizationId
  });
}
