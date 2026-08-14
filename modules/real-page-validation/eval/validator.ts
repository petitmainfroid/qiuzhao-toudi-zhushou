import {
  FIELD_SAFETY_CLASSES,
  REAL_PAGE_EVALUATION_SCHEMA_VERSION,
  SAFE_CONTROL_KINDS,
  TERMINAL_FIELD_CONCLUSIONS,
  TYPED_FAILURES,
  type AnnotationFieldInstance,
  type FrozenRealPageAnnotation,
  type RealPageAnnotationDraft,
  type RealPageRunManifest,
  type RetainedRealPageSiteId,
  type RunFieldOutcome
} from "./contracts";
import { assertNormalizedPageIdentity, retainedSite } from "./registry";
import { createHash } from "node:crypto";

type UnknownRecord = Record<string, unknown>;

const FORBIDDEN_KEYS = new Set([
  "value", "rawValue", "actualValue", "expectedValue", "pageValue", "profileValue", "selectedValue",
  "html", "rawHtml", "dom", "selector", "xpath", "cdp", "cookie", "authorization", "token", "password",
  "request", "response", "body", "headers", "query", "queryString", "filename", "fileName", "filePath",
  "screenshot", "har", "resumeText", "email", "phone", "identityNumber", "executorPass", "passClaim"
]);

const ANNOTATION_KEYS = [
  "schemaVersion", "kind", "annotationId", "revision", "siteId", "page", "createdAt", "annotator",
  "provenance", "runtimeDenominatorSource", "fields", "reviewedByUserAt"
] as const;
const FROZEN_ANNOTATION_KEYS = [...ANNOTATION_KEYS, "annotationHash", "frozen"] as const;
const RUN_KEYS = [
  "schemaVersion", "kind", "runId", "siteId", "evidenceLevel", "annotation", "page", "versions", "lease",
  "executorRole", "startedAt", "completedAt", "claimedDenominators", "fields", "safety"
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: UnknownRecord, allowed: readonly string[], path: string): void {
  const missing = allowed.filter((key) => !(key in value));
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (missing.length || unknown.length) {
    throw new Error(`${path} has invalid keys: missing=${missing.join("|")}, unknown=${unknown.join("|")}`);
  }
}

function assertRecord(value: unknown, path: string): asserts value is UnknownRecord {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
}

function assertString(value: unknown, path: string, pattern: RegExp, maximum = 160): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || !pattern.test(value)) {
    throw new Error(`${path} is invalid.`);
  }
}

function assertInteger(value: unknown, path: string, minimum = 0): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < minimum) throw new Error(`${path} must be an integer >= ${minimum}.`);
}

function assertIso(value: unknown, path: string): asserts value is string {
  assertString(value, path, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, 30);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${path} is not a valid timestamp.`);
}

function assertPrivacyAllowlist(value: unknown, path = "artifact"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPrivacyAllowlist(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Forbidden private evidence key: ${path}.${key}`);
    assertPrivacyAllowlist(child, `${path}.${key}`);
  }
}

function assertPage(value: unknown, siteId: RetainedRealPageSiteId, path: string): void {
  assertRecord(value, path);
  exactKeys(value, ["origin", "normalizedPath"], path);
  assertString(value.origin, `${path}.origin`, /^https:\/\/[a-z0-9.-]+$/, 253);
  assertString(value.normalizedPath, `${path}.normalizedPath`, /^\//, 180);
  assertNormalizedPageIdentity(siteId, { origin: value.origin, normalizedPath: value.normalizedPath });
}

function assertSiteId(value: unknown, path: string): asserts value is RetainedRealPageSiteId {
  assertString(value, path, /^[a-z0-9-]+$/, 64);
  retainedSite(value as RetainedRealPageSiteId);
}

function assertFieldInstance(value: unknown, index: number): asserts value is AnnotationFieldInstance {
  const path = `annotation.fields[${index}]`;
  assertRecord(value, path);
  exactKeys(value, ["fieldInstanceId", "semanticKey", "stepId", "conditionRef", "repeatable", "controlKind", "required", "safetyClass"], path);
  assertString(value.fieldInstanceId, `${path}.fieldInstanceId`, /^[a-z][a-z0-9._:-]{2,119}$/i, 120);
  assertString(value.semanticKey, `${path}.semanticKey`, /^[a-z][a-z0-9_.\[\]-]{1,119}$/i, 120);
  assertString(value.stepId, `${path}.stepId`, /^[a-z][a-z0-9._-]{1,79}$/i, 80);
  if (value.conditionRef !== null) assertString(value.conditionRef, `${path}.conditionRef`, /^[a-z][a-z0-9._:-]{1,119}$/i, 120);
  if (value.repeatable !== null) {
    assertRecord(value.repeatable, `${path}.repeatable`);
    exactKeys(value.repeatable, ["groupRef", "instanceIndex"], `${path}.repeatable`);
    assertString(value.repeatable.groupRef, `${path}.repeatable.groupRef`, /^[a-z][a-z0-9._-]{1,79}$/i, 80);
    assertInteger(value.repeatable.instanceIndex, `${path}.repeatable.instanceIndex`);
  }
  if (!(SAFE_CONTROL_KINDS as readonly unknown[]).includes(value.controlKind)) throw new Error(`${path}.controlKind is invalid.`);
  if (typeof value.required !== "boolean") throw new Error(`${path}.required must be Boolean.`);
  if (!(FIELD_SAFETY_CLASSES as readonly unknown[]).includes(value.safetyClass)) throw new Error(`${path}.safetyClass is invalid.`);
}

function assertAnnotationShape(value: unknown, frozen: boolean): asserts value is FrozenRealPageAnnotation | RealPageAnnotationDraft {
  assertRecord(value, "annotation");
  exactKeys(value, frozen ? FROZEN_ANNOTATION_KEYS : ANNOTATION_KEYS, "annotation");
  if (value.schemaVersion !== REAL_PAGE_EVALUATION_SCHEMA_VERSION || value.kind !== "real-page-annotation") {
    throw new Error("annotation schema/kind is invalid.");
  }
  assertString(value.annotationId, "annotation.annotationId", /^ann_[a-z0-9_-]{6,80}$/i, 84);
  assertInteger(value.revision, "annotation.revision", 1);
  assertSiteId(value.siteId, "annotation.siteId");
  assertPage(value.page, value.siteId, "annotation.page");
  assertIso(value.createdAt, "annotation.createdAt");
  assertIso(value.reviewedByUserAt, "annotation.reviewedByUserAt");
  assertRecord(value.annotator, "annotation.annotator");
  exactKeys(value.annotator, ["role", "agentScanViewed"], "annotation.annotator");
  if (value.annotator.role !== "independent-human-annotator" || value.annotator.agentScanViewed !== false) {
    throw new Error("Annotation must be independent from Agent scan output.");
  }
  if (value.runtimeDenominatorSource !== "reachable-field-instances") {
    throw new Error("Runtime denominator must come from reachable field instances.");
  }
  if (!Array.isArray(value.provenance) || value.provenance.length === 0) throw new Error("annotation.provenance is required.");
  value.provenance.forEach((entry, index) => {
    const path = `annotation.provenance[${index}]`;
    assertRecord(entry, path);
    exactKeys(entry, ["artifactRef", "evidenceClass"], path);
    assertString(entry.artifactRef, `${path}.artifactRef`, /^(?:ats-corpus\/ground-truth|ats-corpus\/observations|artifacts\/)[A-Za-z0-9_./-]+$/, 240);
    if (!["primitive-regression", "public-contract-drift", "historical-structural-observation"].includes(String(entry.evidenceClass))) {
      throw new Error(`${path}.evidenceClass is not provenance-only.`);
    }
  });
  if (!Array.isArray(value.fields) || value.fields.length === 0 || value.fields.length > 1000) throw new Error("annotation.fields is invalid.");
  value.fields.forEach(assertFieldInstance);
  const ids = value.fields.map((field) => (field as AnnotationFieldInstance).fieldInstanceId);
  if (new Set(ids).size !== ids.length) throw new Error("annotation.fields contains duplicate fieldInstanceId values.");
  if (frozen) {
    if (value.frozen !== true) throw new Error("Frozen annotation must set frozen=true.");
    assertString(value.annotationHash, "annotation.annotationHash", /^[a-f0-9]{64}$/, 64);
  }
  assertPrivacyAllowlist(value, "annotation");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  return createHash("sha256").update(value).digest("hex");
}

export async function freezeAnnotation(draft: RealPageAnnotationDraft): Promise<FrozenRealPageAnnotation> {
  assertAnnotationShape(draft, false);
  const annotationHash = await sha256(canonicalJson(draft));
  return { ...structuredClone(draft), annotationHash, frozen: true };
}

export async function assertFrozenAnnotation(value: unknown): Promise<void> {
  assertAnnotationShape(value, true);
  const { annotationHash, frozen: _frozen, ...draft } = value as FrozenRealPageAnnotation;
  const expected = await sha256(canonicalJson(draft));
  if (annotationHash !== expected) throw new Error("Frozen annotation hash mismatch.");
}

function assertOutcome(value: unknown, index: number): asserts value is RunFieldOutcome {
  const path = `run.fields[${index}]`;
  assertRecord(value, path);
  exactKeys(value, ["fieldInstanceId", "eligible", "profilePath", "hasProfileSource", "attempted", "attempts", "mappingCorrect", "verification", "terminalConclusion", "typedFailure"], path);
  assertString(value.fieldInstanceId, `${path}.fieldInstanceId`, /^[a-z][a-z0-9._:-]{2,119}$/i, 120);
  if (typeof value.eligible !== "boolean" || typeof value.attempted !== "boolean") throw new Error(`${path} flags must be Boolean.`);
  if (value.profilePath !== null) assertString(value.profilePath, `${path}.profilePath`, /^[A-Za-z][A-Za-z0-9.\[\]_-]{1,119}$/, 120);
  if (value.hasProfileSource !== null && typeof value.hasProfileSource !== "boolean") throw new Error(`${path}.hasProfileSource is invalid.`);
  if (value.mappingCorrect !== null && typeof value.mappingCorrect !== "boolean") throw new Error(`${path}.mappingCorrect is invalid.`);
  if (value.verification !== null && typeof value.verification !== "boolean") throw new Error(`${path}.verification is invalid.`);
  if (!(TERMINAL_FIELD_CONCLUSIONS as readonly unknown[]).includes(value.terminalConclusion)) throw new Error(`${path}.terminalConclusion is invalid.`);
  if (!(TYPED_FAILURES as readonly unknown[]).includes(value.typedFailure)) throw new Error(`${path}.typedFailure is invalid.`);
  if (!Array.isArray(value.attempts) || value.attempts.length > 2) throw new Error(`${path}.attempts exceeds the retry budget.`);
  value.attempts.forEach((attempt, attemptIndex) => {
    const attemptPath = `${path}.attempts[${attemptIndex}]`;
    assertRecord(attempt, attemptPath);
    exactKeys(attempt, ["ordinal", "strategy", "verified", "typedFailure"], attemptPath);
    if (attempt.ordinal !== attemptIndex + 1) throw new Error(`${attemptPath}.ordinal is invalid.`);
    if (attempt.strategy !== (attemptIndex === 0 ? "primary" : "registered-fallback")) throw new Error(`${attemptPath}.strategy is invalid.`);
    if (typeof attempt.verified !== "boolean") throw new Error(`${attemptPath}.verified must be Boolean.`);
    if (!(TYPED_FAILURES as readonly unknown[]).includes(attempt.typedFailure)) throw new Error(`${attemptPath}.typedFailure is invalid.`);
    if (attempt.verified && attempt.typedFailure !== "none") throw new Error(`${attemptPath} cannot verify with a failure.`);
  });
  if (value.attempted !== (value.attempts.length > 0)) throw new Error(`${path}.attempted disagrees with attempts.`);
  if (value.eligible !== (value.profilePath !== null && value.hasProfileSource === true)) {
    throw new Error(`${path}.eligible must derive from an available profile source.`);
  }
  if (!value.attempted && (value.verification !== null || value.mappingCorrect !== null)) throw new Error(`${path} has execution results without an attempt.`);
  if (value.attempted && (typeof value.verification !== "boolean" || typeof value.mappingCorrect !== "boolean")) {
    throw new Error(`${path} attempts require mapping and Boolean verification results.`);
  }
  if (value.verification === true && !value.attempts.some((attempt) => attempt.verified)) throw new Error(`${path}.verification is unsupported by attempts.`);
  if (value.terminalConclusion === "content-consistent" && value.verification !== true) throw new Error(`${path} claims consistency without verification.`);
}

const SAFETY_KEYS = [
  "wrongControlWrites", "thirdAttempts", "duplicateRecords", "unconfirmedSensitiveActions", "unconfirmedAttachmentActions",
  "credentialReads", "cookieReads", "tokenReads", "verificationBypasses", "identityBypasses", "crossOriginActions",
  "deleteActions", "explicitSaveActions", "irreversibleSaveActions", "unexpectedNavigations", "finalSubmissions"
] as const;

export function assertRunManifest(value: unknown): asserts value is RealPageRunManifest {
  assertRecord(value, "run");
  exactKeys(value, RUN_KEYS, "run");
  if (value.schemaVersion !== REAL_PAGE_EVALUATION_SCHEMA_VERSION || value.kind !== "real-page-run") throw new Error("run schema/kind is invalid.");
  assertString(value.runId, "run.runId", /^run_[a-z0-9_-]{6,80}$/i, 84);
  assertSiteId(value.siteId, "run.siteId");
  if (value.evidenceLevel !== "E3" && value.evidenceLevel !== "E4") throw new Error("run.evidenceLevel is invalid.");
  assertPage(value.page, value.siteId, "run.page");
  assertRecord(value.annotation, "run.annotation");
  exactKeys(value.annotation, ["annotationId", "revision", "annotationHash"], "run.annotation");
  assertString(value.annotation.annotationId, "run.annotation.annotationId", /^ann_[a-z0-9_-]{6,80}$/i, 84);
  assertInteger(value.annotation.revision, "run.annotation.revision", 1);
  assertString(value.annotation.annotationHash, "run.annotation.annotationHash", /^[a-f0-9]{64}$/, 64);
  assertRecord(value.versions, "run.versions");
  exactKeys(value.versions, ["codeCommit", "appVersion", "browserVersion"], "run.versions");
  assertString(value.versions.codeCommit, "run.versions.codeCommit", /^[a-f0-9]{7,40}$/, 40);
  assertString(value.versions.appVersion, "run.versions.appVersion", /^[A-Za-z0-9._+-]{1,40}$/, 40);
  assertString(value.versions.browserVersion, "run.versions.browserVersion", /^\d+(?:\.\d+){1,3}$/, 40);
  assertRecord(value.lease, "run.lease");
  exactKeys(value.lease, ["leaseId", "origin", "normalizedPath", "allowedActions", "issuedAt", "expiresAt", "revokedAt", "autoSaveDisclosed"], "run.lease");
  assertString(value.lease.leaseId, "run.lease.leaseId", /^lease_[a-z0-9_-]{6,80}$/i, 86);
  assertString(value.lease.origin, "run.lease.origin", /^https:\/\/[a-z0-9.-]+$/, 253);
  assertString(value.lease.normalizedPath, "run.lease.normalizedPath", /^\//, 180);
  assertNormalizedPageIdentity(value.siteId, { origin: value.lease.origin, normalizedPath: value.lease.normalizedPath });
  if (!Array.isArray(value.lease.allowedActions) || !value.lease.allowedActions.every((action) => ["inspect", "plan", "ordinary-fill", "audit"].includes(String(action)))) {
    throw new Error("run.lease.allowedActions is invalid.");
  }
  if (new Set(value.lease.allowedActions).size !== value.lease.allowedActions.length) throw new Error("run.lease.allowedActions contains duplicates.");
  if (value.evidenceLevel === "E4" && !value.lease.allowedActions.includes("ordinary-fill")) throw new Error("E4 requires ordinary-fill authorization.");
  assertIso(value.lease.issuedAt, "run.lease.issuedAt");
  assertIso(value.lease.expiresAt, "run.lease.expiresAt");
  if (value.lease.revokedAt !== null) assertIso(value.lease.revokedAt, "run.lease.revokedAt");
  if (typeof value.lease.autoSaveDisclosed !== "boolean") throw new Error("run.lease.autoSaveDisclosed must be Boolean.");
  if (value.executorRole !== "serial-execution-agent") throw new Error("run.executorRole is invalid.");
  assertIso(value.startedAt, "run.startedAt");
  assertIso(value.completedAt, "run.completedAt");
  assertRecord(value.claimedDenominators, "run.claimedDenominators");
  exactKeys(value.claimedDenominators, ["aReachable", "bEligible", "cWriteAttempts"], "run.claimedDenominators");
  Object.entries(value.claimedDenominators).forEach(([key, count]) => assertInteger(count, `run.claimedDenominators.${key}`));
  if (!Array.isArray(value.fields) || value.fields.length === 0 || value.fields.length > 1000) throw new Error("run.fields is invalid.");
  value.fields.forEach(assertOutcome);
  const ids = value.fields.map((field) => (field as RunFieldOutcome).fieldInstanceId);
  if (new Set(ids).size !== ids.length) throw new Error("run.fields contains duplicate field outcomes.");
  assertRecord(value.safety, "run.safety");
  exactKeys(value.safety, SAFETY_KEYS, "run.safety");
  const safety = value.safety;
  SAFETY_KEYS.forEach((key) => assertInteger(safety[key], `run.safety.${key}`));
  if (value.evidenceLevel === "E3" && value.fields.some((field) => (field as RunFieldOutcome).attempted)) throw new Error("E3 is read-only and cannot contain write attempts.");
  assertPrivacyAllowlist(value, "run");
}

export async function assertRunAgainstAnnotation(
  run: unknown,
  annotation: unknown
): Promise<void> {
  assertRunManifest(run);
  await assertFrozenAnnotation(annotation);
  const frozen = annotation as FrozenRealPageAnnotation;
  if (
    run.siteId !== frozen.siteId
    || run.annotation.annotationId !== frozen.annotationId
    || run.annotation.revision !== frozen.revision
    || run.annotation.annotationHash !== frozen.annotationHash
  ) throw new Error("Run does not reference the exact frozen annotation.");
  const annotationIds = frozen.fields.map((field) => field.fieldInstanceId).sort();
  const runIds = run.fields.map((field) => field.fieldInstanceId).sort();
  if (canonicalJson(annotationIds) !== canonicalJson(runIds)) throw new Error("Run field outcomes do not equal the frozen annotation denominator.");
  const annotationById = new Map(frozen.fields.map((field) => [field.fieldInstanceId, field]));
  for (const outcome of run.fields) {
    const field = annotationById.get(outcome.fieldInstanceId)!;
    if (outcome.eligible && field.safetyClass !== "ordinary") throw new Error(`Protected field marked eligible: ${outcome.fieldInstanceId}`);
    if (run.evidenceLevel === "E4" && outcome.attempted && !outcome.eligible) throw new Error(`Ineligible field was attempted: ${outcome.fieldInstanceId}`);
  }
}

export const REAL_PAGE_SAFETY_COUNT_KEYS = SAFETY_KEYS;
