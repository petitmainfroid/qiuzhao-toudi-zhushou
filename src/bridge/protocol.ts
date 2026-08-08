export const POWER_SESSION_TTL_MS = 10 * 60 * 1000;
export const POWER_SESSION_EXPIRY_ALARM = "qiuzhao:power-session-expiry";

export type PowerSessionStatus = "inactive" | "active" | "paused";

export type PowerSessionReason =
  | "not-started"
  | "session-inactive"
  | "expired"
  | "origin-changed"
  | "tab-closed"
  | "debugger-detached"
  | "unsupported-page"
  | "debugger-busy"
  | "timeout"
  | "bridge-failed";

export interface EmbeddedPageState {
  origin: string;
  path: string;
  interactiveCount: number;
  frameCount: number;
}

export interface PowerSessionView {
  status: PowerSessionStatus;
  sessionId?: string;
  tabId?: number;
  origin?: string;
  path?: string;
  startedAt?: number;
  expiresAt?: number;
  pageState?: EmbeddedPageState;
  reason?: PowerSessionReason;
}

export const PAGE_CONTROL_ROLES = [
  "textbox",
  "combobox",
  "listbox",
  "option",
  "checkbox",
  "radio",
  "switch",
  "button",
  "link"
] as const;

export type PageControlRole = typeof PAGE_CONTROL_ROLES[number];
export type PageControlBoundary = "main" | "same-origin-frame" | "open-shadow";
export type PageControlSafety =
  | "ordinary"
  | "credential"
  | "verification"
  | "identity"
  | "final-submit"
  | "file"
  | "consent"
  | "destructive";

export interface PageControlSemantics {
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  nearbyText?: string;
}

export interface PrivacySafeControl {
  ref: string;
  role: PageControlRole;
  tag: "input" | "textarea" | "select" | "button" | "a" | "contenteditable" | "custom";
  inputType?: string;
  semantics: PageControlSemantics;
  options?: string[];
  disabled: boolean;
  readOnly: boolean;
  required: boolean;
  multiple: boolean;
  expanded?: boolean;
  boundary: PageControlBoundary;
  safety: PageControlSafety;
}

export interface PrivacySafePageState {
  snapshotId: string;
  origin: string;
  path: string;
  controls: PrivacySafeControl[];
  summary: {
    controlCount: number;
    frameCount: number;
    openShadowRootCount: number;
    blockedControlCount: number;
  };
}

export interface PageFindQuery {
  text: string;
  roles?: PageControlRole[];
  limit?: number;
}

export interface PageFindMatch {
  ref: string;
  role: PageControlRole;
  label: string;
  score: number;
  reasons: string[];
  safety: PageControlSafety;
}

export interface PageFindResult {
  snapshotId: string;
  query: string;
  searchedControlCount: number;
  matches: PageFindMatch[];
}

export const PAGE_WAIT_KINDS = [
  "find",
  "control-state",
  "option-list",
  "same-origin-navigation",
  "dom-settle"
] as const;

export type PageWaitKind = typeof PAGE_WAIT_KINDS[number];
export type PageWaitControlState = "enabled" | "disabled" | "expanded" | "collapsed";

export type PageWaitCondition =
  | { kind: "find"; query: PageFindQuery; minimumMatches: number }
  | { kind: "control-state"; query: PageFindQuery; state: PageWaitControlState; minimumMatches: number }
  | { kind: "option-list"; query: PageFindQuery; minimumOptions: number; optionText?: string }
  | { kind: "same-origin-navigation" }
  | { kind: "dom-settle"; quietMs: number };

export type PageWaitFailureReason =
  | "timeout"
  | "invalid-session"
  | "session-inactive"
  | "origin-changed"
  | "bridge-failed";

export interface PageWaitResult {
  requestId: string;
  condition: PageWaitKind;
  status: "matched" | "timeout" | "failed";
  polls: number;
  durationBucket: "lt-100ms" | "100-500ms" | "gt-500ms";
  reason?: PageWaitFailureReason;
  result?: PageFindResult;
  path?: string;
}

export const PAGE_ACTION_KINDS = ["fill", "type", "select", "check", "click"] as const;
export type PageActionKind = typeof PAGE_ACTION_KINDS[number];

export type PageActionIntent =
  | { kind: "fill" | "type" | "select"; source: { kind: "profile"; path: string } }
  | { kind: "check"; desired: "checked" | "unchecked" }
  | { kind: "click"; purpose: "open-control" };

export type PageActionFailureReason =
  | "invalid-authorization"
  | "session-inactive"
  | "origin-changed"
  | "stale-reference"
  | "invalid-profile-path"
  | "empty-profile-value"
  | "unsafe-control"
  | "incompatible-action"
  | "disabled-or-readonly"
  | "hidden-control"
  | "option-not-found"
  | "option-ambiguous"
  | "unsupported-control"
  | "framework-rejected"
  | "verification-failed"
  | "duplicate-request-conflict"
  | "duplicate-request-uncertain"
  | "bridge-failed";

export type PageActionStrategy =
  | "none"
  | "native-setter"
  | "native-select"
  | "custom-select"
  | "exact-radio"
  | "exact-check"
  | "contenteditable-text"
  | "open-control"
  | "keyboard-insert";

export interface PageActionAuthorizationView {
  authorizationId: string;
  expiresAt: number;
}

export interface PageActionResult {
  requestId: string;
  ref: string;
  action: PageActionKind;
  status: "verified" | "failed" | "blocked";
  strategy: PageActionStrategy;
  attempts: 0 | 1 | 2;
  reason?: PageActionFailureReason;
  durationBucket: "lt-100ms" | "100-500ms" | "gt-500ms";
}

export type PageUploadFailureReason =
  | "invalid-authorization"
  | "session-inactive"
  | "debugger-conflict"
  | "stale-reference"
  | "timeout"
  | "blocked-control"
  | "page-changed"
  | "verification-failed"
  | "user-cancelled"
  | "invalid-resume"
  | "duplicate-request-conflict"
  | "duplicate-request-uncertain"
  | "bridge-failed";

export interface PageUploadAuthorizationView {
  authorizationId: string;
  expiresAt: number;
  origin: string;
  ref: string;
}

export interface PageUploadResult {
  requestId: string;
  ref: string;
  action: "upload-saved-resume";
  status: "verified" | "failed" | "blocked" | "cancelled";
  attempts: 0 | 1;
  reason?: PageUploadFailureReason;
  durationBucket: "lt-100ms" | "100-500ms" | "gt-500ms";
}

export type PageScreenshotFailureReason =
  | "session-inactive"
  | "debugger-conflict"
  | "timeout"
  | "page-changed"
  | "bridge-failed";

export interface PageScreenshotResult {
  requestId: string;
  status: "captured" | "failed";
  durationBucket: "lt-100ms" | "100-500ms" | "gt-500ms";
  reason?: PageScreenshotFailureReason;
  dataUrl?: string;
}

export type EvidenceCommandType = "page-action" | "upload-saved-resume" | "capture-screenshot";
export type EvidenceCommandStatus = "verified" | "captured" | "failed" | "blocked" | "cancelled";

export interface EvidenceCommandLogEntry {
  command: EvidenceCommandType;
  ref?: string;
  status: EvidenceCommandStatus;
  attempts: 0 | 1 | 2;
  durationBucket: "lt-100ms" | "100-500ms" | "gt-500ms";
  failureCategory?: PageActionFailureReason | PageUploadFailureReason | PageScreenshotFailureReason;
}

interface BridgeRequestBase {
  requestId: string;
}

export type EmbeddedBridgeRequest =
  | (BridgeRequestBase & { type: "POWER_SESSION_START"; tabId: number })
  | (BridgeRequestBase & { type: "POWER_SESSION_STATUS" })
  | (BridgeRequestBase & { type: "POWER_SESSION_TARGET" })
  | (BridgeRequestBase & { type: "POWER_SESSION_REFRESH_STATE" })
  | (BridgeRequestBase & { type: "POWER_PAGE_STATE" })
  | (BridgeRequestBase & { type: "POWER_PAGE_FIND"; query: PageFindQuery })
  | (BridgeRequestBase & {
      type: "POWER_PAGE_WAIT";
      sessionId: string;
      condition: PageWaitCondition;
      timeoutMs: number;
      pollIntervalMs: number;
    })
  | (BridgeRequestBase & { type: "POWER_PAGE_ACTION_AUTHORIZE" })
  | (BridgeRequestBase & {
      type: "POWER_PAGE_ACTION";
      authorizationId: string;
      sessionId: string;
      snapshotId: string;
      ref: string;
      intent: PageActionIntent;
    })
  | (BridgeRequestBase & {
      type: "POWER_PAGE_UPLOAD_AUTHORIZE";
      sessionId: string;
      snapshotId: string;
      ref: string;
    })
  | (BridgeRequestBase & {
      type: "POWER_PAGE_UPLOAD";
      authorizationId: string;
      sessionId: string;
      snapshotId: string;
      ref: string;
    })
  | (BridgeRequestBase & {
      type: "POWER_PAGE_UPLOAD_CANCEL";
      sessionId: string;
      snapshotId: string;
      ref: string;
    })
  | (BridgeRequestBase & { type: "POWER_PAGE_SCREENSHOT"; sessionId: string })
  | (BridgeRequestBase & { type: "POWER_EVIDENCE_LOGS" })
  | (BridgeRequestBase & { type: "POWER_SESSION_STOP" });

export type EmbeddedBridgeResponse =
  | { ok: true; session: PowerSessionView }
  | { ok: true; tabId: number | null }
  | { ok: true; state: PrivacySafePageState }
  | { ok: true; result: PageFindResult }
  | { ok: true; wait: PageWaitResult }
  | { ok: true; authorization: PageActionAuthorizationView }
  | { ok: true; action: PageActionResult }
  | { ok: true; uploadAuthorization: PageUploadAuthorizationView }
  | { ok: true; upload: PageUploadResult }
  | { ok: true; screenshot: PageScreenshotResult }
  | { ok: true; logs: EvidenceCommandLogEntry[] }
  | { ok: false; code: PowerSessionReason; error: string };

function hasExactKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isPageControlRole(value: unknown): value is PageControlRole {
  return typeof value === "string" && (PAGE_CONTROL_ROLES as readonly string[]).includes(value);
}

function isPageFindQuery(value: unknown): value is PageFindQuery {
  if (!value || typeof value !== "object") return false;
  const query = value as Partial<PageFindQuery>;
  const allowed = ["text", ...(query.roles === undefined ? [] : ["roles"]), ...(query.limit === undefined ? [] : ["limit"])];
  if (!hasExactKeys(query, allowed)) return false;
  if (typeof query.text !== "string" || query.text.trim().length < 1 || query.text.length > 120) return false;
  if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 20)) return false;
  return query.roles === undefined
    || (Array.isArray(query.roles) && query.roles.length > 0 && query.roles.every(isPageControlRole));
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isPageWaitCondition(value: unknown): value is PageWaitCondition {
  if (!value || typeof value !== "object") return false;
  const condition = value as Partial<PageWaitCondition> & {
    query?: unknown;
    minimumMatches?: unknown;
    minimumOptions?: unknown;
    optionText?: unknown;
    state?: unknown;
    quietMs?: unknown;
  };
  if (condition.kind === "find") {
    return hasExactKeys(condition, ["kind", "query", "minimumMatches"])
      && isPageFindQuery(condition.query)
      && isBoundedInteger(condition.minimumMatches, 1, 20);
  }
  if (condition.kind === "control-state") {
    return hasExactKeys(condition, ["kind", "query", "state", "minimumMatches"])
      && isPageFindQuery(condition.query)
      && ["enabled", "disabled", "expanded", "collapsed"].includes(String(condition.state))
      && isBoundedInteger(condition.minimumMatches, 1, 20);
  }
  if (condition.kind === "option-list") {
    const keys = ["kind", "query", "minimumOptions", ...(condition.optionText === undefined ? [] : ["optionText"])];
    return hasExactKeys(condition, keys)
      && isPageFindQuery(condition.query)
      && isBoundedInteger(condition.minimumOptions, 1, 50)
      && (condition.optionText === undefined
        || (typeof condition.optionText === "string" && condition.optionText.trim().length > 0 && condition.optionText.length <= 120));
  }
  if (condition.kind === "same-origin-navigation") {
    return hasExactKeys(condition, ["kind"]);
  }
  if (condition.kind === "dom-settle") {
    return hasExactKeys(condition, ["kind", "quietMs"])
      && isBoundedInteger(condition.quietMs, 100, 5_000);
  }
  return false;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(value);
}

function isProfilePath(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 120
    && /^(?:derived\.age|(?:basic|jobPreference|answers)\.[A-Za-z][A-Za-z0-9]*|(?:education|workExperiences|projects|workSamples|awards|languages)\.\d+\.[A-Za-z][A-Za-z0-9]*)$/.test(value)
    && !/(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$)/.test(value);
}

function isPageActionIntent(value: unknown): value is PageActionIntent {
  if (!value || typeof value !== "object") return false;
  const intent = value as Partial<PageActionIntent> & { source?: unknown; desired?: unknown; purpose?: unknown };
  if (intent.kind === "fill" || intent.kind === "type" || intent.kind === "select") {
    if (!hasExactKeys(intent, ["kind", "source"])) return false;
    if (!intent.source || typeof intent.source !== "object") return false;
    const source = intent.source as { kind?: unknown; path?: unknown };
    return hasExactKeys(source, ["kind", "path"])
      && source.kind === "profile"
      && isProfilePath(source.path);
  }
  if (intent.kind === "check") {
    return hasExactKeys(intent, ["kind", "desired"])
      && (intent.desired === "checked" || intent.desired === "unchecked");
  }
  if (intent.kind === "click") {
    return hasExactKeys(intent, ["kind", "purpose"]) && intent.purpose === "open-control";
  }
  return false;
}

export function isEmbeddedBridgeRequest(value: unknown): value is EmbeddedBridgeRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<EmbeddedBridgeRequest>;
  if (!isIdentifier(request.requestId)) return false;
  if (request.type === "POWER_SESSION_START") {
    return hasExactKeys(request, ["type", "requestId", "tabId"])
      && Number.isInteger(request.tabId) && (request.tabId ?? -1) >= 0;
  }
  if (request.type === "POWER_PAGE_FIND") {
    return hasExactKeys(request, ["type", "requestId", "query"]) && isPageFindQuery(request.query);
  }
  if (request.type === "POWER_PAGE_WAIT") {
    return hasExactKeys(request, [
      "type", "requestId", "sessionId", "condition", "timeoutMs", "pollIntervalMs"
    ])
      && isIdentifier(request.sessionId)
      && isPageWaitCondition(request.condition)
      && isBoundedInteger(request.timeoutMs, 100, 10_000)
      && isBoundedInteger(request.pollIntervalMs, 50, 500)
      && request.pollIntervalMs <= request.timeoutMs;
  }
  if (request.type === "POWER_PAGE_ACTION") {
    return hasExactKeys(request, [
      "type", "requestId", "authorizationId", "sessionId", "snapshotId", "ref", "intent"
    ])
      && isIdentifier(request.authorizationId)
      && isIdentifier(request.sessionId)
      && isIdentifier(request.snapshotId)
      && isIdentifier(request.ref)
      && isPageActionIntent(request.intent);
  }
  if (request.type === "POWER_PAGE_UPLOAD_AUTHORIZE") {
    return hasExactKeys(request, ["type", "requestId", "sessionId", "snapshotId", "ref"])
      && isIdentifier(request.sessionId)
      && isIdentifier(request.snapshotId)
      && isIdentifier(request.ref);
  }
  if (request.type === "POWER_PAGE_UPLOAD") {
    return hasExactKeys(request, [
      "type", "requestId", "authorizationId", "sessionId", "snapshotId", "ref"
    ])
      && isIdentifier(request.authorizationId)
      && isIdentifier(request.sessionId)
      && isIdentifier(request.snapshotId)
      && isIdentifier(request.ref);
  }
  if (request.type === "POWER_PAGE_UPLOAD_CANCEL") {
    return hasExactKeys(request, ["type", "requestId", "sessionId", "snapshotId", "ref"])
      && isIdentifier(request.sessionId)
      && isIdentifier(request.snapshotId)
      && isIdentifier(request.ref);
  }
  if (request.type === "POWER_PAGE_SCREENSHOT") {
    return hasExactKeys(request, ["type", "requestId", "sessionId"])
      && isIdentifier(request.sessionId);
  }
  const exactBaseTypes = [
    "POWER_SESSION_STATUS",
    "POWER_SESSION_TARGET",
    "POWER_SESSION_REFRESH_STATE",
    "POWER_PAGE_STATE",
    "POWER_PAGE_ACTION_AUTHORIZE",
    "POWER_EVIDENCE_LOGS",
    "POWER_SESSION_STOP"
  ];
  return exactBaseTypes.includes(request.type ?? "")
    && hasExactKeys(request, ["type", "requestId"]);
}
