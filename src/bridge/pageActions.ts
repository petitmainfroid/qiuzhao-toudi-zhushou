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
  if (intent.kind === "check" || intent.kind === "click" || intent.kind === "fill-range") return undefined;
  return getProfileValue(profile, intent.source.path).trim();
}

function checkDesired(intent: Extract<PageActionIntent, { kind: "check" }>, profile: CandidateProfile) {
  if ("desired" in intent) return intent.desired;
  return getProfileValue(profile, intent.source.path).trim() ? "checked" : "unchecked";
}

function validDateRange(start: string, end: string): boolean {
  const canonicalDate = /^\d{4}-\d{2}(?:-\d{2})?$/;
  return canonicalDate.test(start)
    && canonicalDate.test(end)
    && start.length === end.length
    && start <= end;
}

function allowedProfileRange(intent: Extract<PageActionIntent, { kind: "fill-range" }>): boolean {
  const match = /^(education|workExperiences|projects)\.(\d+)\.startDate$/.exec(intent.source.startPath);
  return Boolean(
    match
    && intent.source.endPath === `${match[1]}.${match[2]}.endDate`
    && allowedProfilePath(intent.source.startPath)
    && allowedProfilePath(intent.source.endPath)
  );
}

function compatible(intent: PageActionIntent, target: ReferenceTarget): boolean {
  if (intent.kind === "check") return target.role === "checkbox" || target.role === "switch";
  if (intent.kind === "click") {
    if (intent.purpose === "add-repeatable-record" || intent.purpose === "save-repeatable-record") {
      return target.role === "button"
        && target.tag !== "a"
        && target.inputType !== "submit";
    }
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
  if (intent.kind === "fill-range") {
    return (target.role === "textbox" || target.role === "combobox")
      && (target.tag === "input" || target.tag === "custom");
  }
  return target.role === "textbox"
    || target.tag === "select"
    || target.role === "radio";
}

function profileRecord(profile: CandidateProfile, source: Extract<PageActionIntent, {
  kind: "click";
  purpose: "add-repeatable-record";
}>["source"]): object | undefined {
  const records = profile[source.collection];
  return records[source.index];
}

function meaningfulRecord(record: object | undefined): boolean {
  return Boolean(record && Object.entries(record).some(
    ([key, value]) => key !== "id" && typeof value === "string" && value.trim().length > 0
  ));
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
    status: outcome.verified ? "verified" : outcome.performed && !outcome.reason ? "performed" : "failed",
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
    if (request.intent.kind === "fill-range" && !allowedProfileRange(request.intent)) {
      return staticResult(request, startedAt, this.dependencies.now(), "blocked", "invalid-profile-range");
    }
    if (
      request.intent.kind !== "check"
      && request.intent.kind !== "click"
      && request.intent.kind !== "fill-range"
      && !allowedProfilePath(request.intent.source.path)
    ) return staticResult(request, startedAt, this.dependencies.now(), "blocked", "invalid-profile-path");
    if (
      request.intent.kind === "check"
      && "source" in request.intent
      && !allowedProfilePath(request.intent.source.path)
    ) return staticResult(request, startedAt, this.dependencies.now(), "blocked", "invalid-profile-path");

    const expected = actionValue(request.intent, profile);
    const expectedRange = request.intent.kind === "fill-range"
      ? {
          start: getProfileValue(profile, request.intent.source.startPath).trim(),
          end: getProfileValue(profile, request.intent.source.endPath).trim()
        }
      : undefined;
    if (
      request.intent.kind === "click"
      && request.intent.purpose === "add-repeatable-record"
      && !meaningfulRecord(profileRecord(profile, request.intent.source))
    ) {
      return staticResult(request, startedAt, this.dependencies.now(), "failed", "empty-profile-value");
    }
    if (expectedRange && (!expectedRange.start || !expectedRange.end)) {
      return staticResult(request, startedAt, this.dependencies.now(), "failed", "empty-profile-value");
    }
    if (expectedRange && !validDateRange(expectedRange.start, expectedRange.end)) {
      return staticResult(request, startedAt, this.dependencies.now(), "blocked", "invalid-profile-range");
    }
    if (request.intent.kind !== "check" && request.intent.kind !== "click" && !expected) {
      if (request.intent.kind !== "fill-range") {
        return staticResult(request, startedAt, this.dependencies.now(), "failed", "empty-profile-value");
      }
    }

    authorization.actionCount += 1;
    const primary = await this.dependencies.executor.execute(session, target, {
      action: request.intent.kind,
      strategy: "primary",
      ...(expected !== undefined ? { expected } : {}),
      ...(expectedRange ? { expectedStart: expectedRange.start, expectedEnd: expectedRange.end } : {}),
      ...(request.intent.kind === "check" ? { desired: checkDesired(request.intent, profile) } : {}),
      ...(request.intent.kind === "click" ? { purpose: request.intent.purpose } : {})
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
    "none", "native-setter", "native-select", "custom-select", "native-date-range", "repeatable-add", "repeatable-save", "exact-radio", "exact-check",
    "contenteditable-text", "open-control", "keyboard-insert"
  ];
  const reasons: PageActionFailureReason[] = [
    "invalid-authorization", "session-inactive", "origin-changed", "stale-reference",
    "invalid-profile-path", "invalid-profile-range", "empty-profile-value", "unsafe-control", "incompatible-action",
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
    const structuralClick = payload.action === "click" && (
      payload.purpose === "open-control"
      || payload.purpose === "add-repeatable-record"
      || payload.purpose === "save-repeatable-record"
    );
    // Open controls intentionally change expanded state; repeatable controls may
    // disappear or be replaced. Their verification is the orchestrator's bounded
    // wait/rescan, not survival of the old fingerprint. Pre-action inspection and
    // the fixed role/label gates still apply.
    if (structuralClick && outcome.performed && !outcome.reason) return outcome;
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
