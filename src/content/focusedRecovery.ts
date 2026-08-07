import { canonicalFields, type CanonicalField } from "../matching/catalog";
import { describeControl } from "../matching/dom";
import { matchField } from "../matching/matcher";
import { normalizeFieldText } from "../matching/normalize";
import { createFieldFingerprint } from "../mapping/fingerprint";
import { controlUnavailable } from "./controlAdapters/shared";
import { controlAdapterId, readControlCandidates, writeControlVerified } from "./pageDriver";
import { normalizeComparableValue } from "./valueNormalization";

export const FOCUSED_RECOVERY_TTL_MS = 60_000;

export type FocusedRecoveryFailureReason =
  | "no-user-focused-field"
  | "focus-expired"
  | "page-changed"
  | "field-changed"
  | "unsafe-control"
  | "verification-control"
  | "sensitive-target"
  | "existing-value"
  | "unknown-profile-field"
  | "sensitive-profile-value"
  | "empty-profile-value"
  | "authorization-expired"
  | "write-verification-failed";

export type FocusedRecoveryTargetResult =
  | {
      status: "ready";
      token: string;
      fieldLabel: string;
      controlKind: string;
      expiresInMs: number;
    }
  | { status: "rejected"; reason: FocusedRecoveryFailureReason };

export interface FocusedRecoveryWriteRequest {
  token: string;
  profilePath: string;
  value: string;
}

export type FocusedRecoveryWriteResult =
  | { status: "filled"; fieldLabel: string; canonicalLabel: string }
  | { status: "rejected"; reason: FocusedRecoveryFailureReason };

interface FocusSnapshot {
  element: HTMLElement;
  elementId: string;
  fingerprint: string;
  href: string;
  focusedAt: number;
}

interface RecoveryAuthorization extends FocusSnapshot {
  token: string;
  fieldLabel: string;
  expiresAt: number;
}

let lastUserFocus: FocusSnapshot | null = null;
let activeAuthorization: RecoveryAuthorization | null = null;
let trackingInstalled = false;
let tokenCounter = 0;
let keyboardFocusGestureAt = 0;

const VERIFICATION_PATTERNS = [
  "验证码", "短信码", "动态码", "校验码", "captcha", "verificationcode", "smscode", "otp", "onetimepassword"
].map(normalizeFieldText);

function currentHref(): string {
  return typeof location === "undefined" ? "local" : location.href;
}

function canonicalForPath(path: string): CanonicalField | undefined {
  const templatePath = path.replace(/\.\d+\./g, ".0.");
  return canonicalFields.find((field) => field.path === path || field.path === templatePath);
}

function targetFromNode(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  if (node instanceof HTMLLabelElement && node.control instanceof HTMLElement) return node.control;
  const candidate = node.closest<HTMLElement>("input, textarea, select, [contenteditable='true']");
  return candidate ?? null;
}

function makeToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `focused-${crypto.randomUUID()}`;
  }
  tokenCounter += 1;
  return `focused-${Date.now().toString(36)}-${tokenCounter.toString(36)}`;
}

function fieldLabelFor(element: HTMLElement): string {
  const descriptor = describeControl(element, 0);
  return matchField(descriptor).fieldLabel;
}

function targetSafetyReason(element: HTMLElement): FocusedRecoveryFailureReason | null {
  if (controlUnavailable(element) || !controlAdapterId(element)) return "unsafe-control";
  const descriptor = describeControl(element, 0);
  if (descriptor.kind === "date-range") return "unsafe-control";
  const normalizedText = normalizeFieldText([
    descriptor.label,
    descriptor.ariaLabel,
    descriptor.placeholder,
    descriptor.name,
    descriptor.domId,
    descriptor.contextText
  ].join(" "));
  if (VERIFICATION_PATTERNS.some((pattern) => normalizedText.includes(pattern))) {
    return "verification-control";
  }
  const match = matchField(descriptor);
  if (match.excludedReason === "verification-control") return "verification-control";
  if (match.excludedReason === "sensitive-unsupported") return "sensitive-target";
  if (match.excludedReason && match.excludedReason !== "unmatched") return "unsafe-control";
  if (match.profilePath && canonicalForPath(match.profilePath)?.sensitive) return "sensitive-target";
  return null;
}

function emptyControlReason(element: HTMLElement): FocusedRecoveryFailureReason | null {
  const candidates = readControlCandidates(element);
  if (candidates === null) return "unsafe-control";
  return candidates.some((candidate) => candidate.trim().length > 0) ? "existing-value" : null;
}

/** Records an explicit focus gesture without retaining or reading the field value. */
export function captureUserFocusedControl(
  element: HTMLElement,
  focusedAt = Date.now(),
  href = currentHref()
): void {
  const descriptor = describeControl(element, 0);
  lastUserFocus = {
    element,
    elementId: descriptor.elementId,
    fingerprint: createFieldFingerprint(descriptor),
    href,
    focusedAt
  };
  activeAuthorization = null;
}

export function installFocusedRecoveryTracking(): void {
  if (trackingInstalled || typeof document === "undefined") return;
  trackingInstalled = true;
  document.addEventListener("pointerdown", (event) => {
    if (!event.isTrusted) return;
    const target = targetFromNode(event.target);
    if (target) captureUserFocusedControl(target);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.isTrusted && event.key === "Tab") keyboardFocusGestureAt = Date.now();
  }, true);
  document.addEventListener("focusin", (event) => {
    if (!event.isTrusted || Date.now() - keyboardFocusGestureAt > 1_500) return;
    keyboardFocusGestureAt = 0;
    const target = targetFromNode(event.target);
    if (target) captureUserFocusedControl(target);
  }, true);
}

export function inspectFocusedRecoveryTarget(
  now = Date.now(),
  href = currentHref()
): FocusedRecoveryTargetResult {
  activeAuthorization = null;
  const snapshot = lastUserFocus;
  if (!snapshot) return { status: "rejected", reason: "no-user-focused-field" };
  if (now - snapshot.focusedAt > FOCUSED_RECOVERY_TTL_MS) {
    lastUserFocus = null;
    return { status: "rejected", reason: "focus-expired" };
  }
  if (snapshot.href !== href) return { status: "rejected", reason: "page-changed" };
  if (!snapshot.element.isConnected) return { status: "rejected", reason: "field-changed" };
  const descriptor = describeControl(snapshot.element, 0);
  if (
    descriptor.elementId !== snapshot.elementId
    || createFieldFingerprint(descriptor) !== snapshot.fingerprint
  ) {
    return { status: "rejected", reason: "field-changed" };
  }
  const unsafe = targetSafetyReason(snapshot.element) ?? emptyControlReason(snapshot.element);
  if (unsafe) return { status: "rejected", reason: unsafe };

  const token = makeToken();
  const fieldLabel = fieldLabelFor(snapshot.element);
  activeAuthorization = {
    ...snapshot,
    token,
    fieldLabel,
    expiresAt: now + FOCUSED_RECOVERY_TTL_MS
  };
  return {
    status: "ready",
    token,
    fieldLabel,
    controlKind: descriptor.kind,
    expiresInMs: FOCUSED_RECOVERY_TTL_MS
  };
}

export async function fillFocusedRecovery(
  request: FocusedRecoveryWriteRequest,
  now = Date.now(),
  href = currentHref()
): Promise<FocusedRecoveryWriteResult> {
  const observeLiveNavigation = href === currentHref();
  const authorization = activeAuthorization;
  activeAuthorization = null;
  if (!authorization || authorization.token !== request.token || now > authorization.expiresAt) {
    return { status: "rejected", reason: "authorization-expired" };
  }
  if (authorization.href !== href) return { status: "rejected", reason: "page-changed" };
  if (
    lastUserFocus?.element !== authorization.element
    || !authorization.element.isConnected
  ) {
    return { status: "rejected", reason: "field-changed" };
  }

  const descriptor = describeControl(authorization.element, 0);
  if (
    descriptor.elementId !== authorization.elementId
    || createFieldFingerprint(descriptor) !== authorization.fingerprint
  ) {
    return { status: "rejected", reason: "field-changed" };
  }
  const unsafe = targetSafetyReason(authorization.element) ?? emptyControlReason(authorization.element);
  if (unsafe) return { status: "rejected", reason: unsafe };

  const canonical = canonicalForPath(request.profilePath);
  if (!canonical) return { status: "rejected", reason: "unknown-profile-field" };
  if (canonical.sensitive) return { status: "rejected", reason: "sensitive-profile-value" };
  const value = request.value.trim();
  if (!value) return { status: "rejected", reason: "empty-profile-value" };

  const write = await writeControlVerified(authorization.element, value, {
    normalize: (candidate) => normalizeComparableValue(request.profilePath, candidate)
  });
  if (observeLiveNavigation && href !== currentHref()) {
    return { status: "rejected", reason: "page-changed" };
  }
  if (write.status !== "verified") {
    return { status: "rejected", reason: "write-verification-failed" };
  }
  return {
    status: "filled",
    fieldLabel: authorization.fieldLabel,
    canonicalLabel: canonical.label
  };
}

export function resetFocusedRecoveryState(): void {
  lastUserFocus = null;
  activeAuthorization = null;
  keyboardFocusGestureAt = 0;
}
