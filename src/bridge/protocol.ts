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
  | "bridge-failed";

export type PageActionStrategy =
  | "none"
  | "native-setter"
  | "native-select"
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
  | (BridgeRequestBase & { type: "POWER_PAGE_ACTION_AUTHORIZE" })
  | (BridgeRequestBase & {
      type: "POWER_PAGE_ACTION";
      authorizationId: string;
      sessionId: string;
      snapshotId: string;
      ref: string;
      intent: PageActionIntent;
    })
  | (BridgeRequestBase & { type: "POWER_SESSION_STOP" });

export type EmbeddedBridgeResponse =
  | { ok: true; session: PowerSessionView }
  | { ok: true; tabId: number | null }
  | { ok: true; state: PrivacySafePageState }
  | { ok: true; result: PageFindResult }
  | { ok: true; authorization: PageActionAuthorizationView }
  | { ok: true; action: PageActionResult }
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
  const exactBaseTypes = [
    "POWER_SESSION_STATUS",
    "POWER_SESSION_TARGET",
    "POWER_SESSION_REFRESH_STATE",
    "POWER_PAGE_STATE",
    "POWER_PAGE_ACTION_AUTHORIZE",
    "POWER_SESSION_STOP"
  ];
  return exactBaseTypes.includes(request.type ?? "")
    && hasExactKeys(request, ["type", "requestId"]);
}
