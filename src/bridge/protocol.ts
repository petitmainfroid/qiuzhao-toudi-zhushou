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
  | "file";

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
  | (BridgeRequestBase & { type: "POWER_SESSION_STOP" });

export type EmbeddedBridgeResponse =
  | { ok: true; session: PowerSessionView }
  | { ok: true; tabId: number | null }
  | { ok: true; state: PrivacySafePageState }
  | { ok: true; result: PageFindResult }
  | { ok: false; code: PowerSessionReason; error: string };

function isPageControlRole(value: unknown): value is PageControlRole {
  return typeof value === "string" && (PAGE_CONTROL_ROLES as readonly string[]).includes(value);
}

function isPageFindQuery(value: unknown): value is PageFindQuery {
  if (!value || typeof value !== "object") return false;
  const query = value as Partial<PageFindQuery>;
  if (typeof query.text !== "string" || query.text.trim().length < 1 || query.text.length > 120) return false;
  if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 20)) return false;
  return query.roles === undefined
    || (Array.isArray(query.roles) && query.roles.length > 0 && query.roles.every(isPageControlRole));
}

export function isEmbeddedBridgeRequest(value: unknown): value is EmbeddedBridgeRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<EmbeddedBridgeRequest>;
  if (typeof request.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(request.requestId)) {
    return false;
  }
  if (request.type === "POWER_SESSION_START") {
    return Number.isInteger(request.tabId) && (request.tabId ?? -1) >= 0;
  }
  if (request.type === "POWER_PAGE_FIND") return isPageFindQuery(request.query);
  return [
    "POWER_SESSION_STATUS",
    "POWER_SESSION_TARGET",
    "POWER_SESSION_REFRESH_STATE",
    "POWER_PAGE_STATE",
    "POWER_SESSION_STOP"
  ].includes(request.type ?? "");
}
