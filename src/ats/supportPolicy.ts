export const ATS_SUPPORT_LEVELS = [
  "planned",
  "observed",
  "fixture-verified",
  "real-page-verified"
] as const;

export type AtsSupportLevel = typeof ATS_SUPPORT_LEVELS[number];

export const ATS_SUPPORT_EVIDENCE_KINDS = [
  "public-ground-truth",
  "private-observation",
  "synthetic-fixture",
  "real-page-run"
] as const;

export type AtsSupportEvidenceKind = typeof ATS_SUPPORT_EVIDENCE_KINDS[number];

export const ATS_ACCEPTANCE_CONTROL_KINDS = [
  "text",
  "choice",
  "date",
  "repeatable"
] as const;

export type AtsAcceptanceControlKind = typeof ATS_ACCEPTANCE_CONTROL_KINDS[number];

export const ATS_SUPPORT_THRESHOLDS = {
  minimumEligibleFieldCoverage: 0.9,
  minimumVerifiedWriteSuccess: 0.95,
  minimumDistinctRealSites: 3
} as const;

export interface AtsSupportEvidencePrivacy {
  currentValuesIncluded: false;
  profileDataIncluded: false;
  rawHtmlIncluded: false;
  authenticationIncluded: false;
  queryValuesIncluded: false;
  fileMetadataIncluded: false;
}

export interface AtsAcceptanceMetrics {
  eligibleFieldCount: number;
  correctlyMappedFieldCount: number;
  attemptedWriteCount: number;
  verifiedWriteCount: number;
  incorrectWriteCount: number;
  unsafeActionCount: number;
  finalSubmitActivationCount: number;
  unexpectedNavigationCount: number;
  duplicateRepeatableRecordCount: number;
  standardModeNetworkRequestCount: number;
  controlKinds: AtsAcceptanceControlKind[];
}

export interface AtsSupportEvidence {
  id: string;
  familyId: string;
  siteKey: string;
  kind: AtsSupportEvidenceKind;
  verifiedAt: string;
  privacy: AtsSupportEvidencePrivacy;
  metrics?: AtsAcceptanceMetrics;
  artifactRef?: string;
}

export interface AtsFamilySupportAssessment {
  familyId: string;
  level: AtsSupportLevel;
  evidenceCount: number;
  observedSiteCount: number;
  fixtureSiteCount: number;
  realPageSiteCount: number;
  coveredControlKinds: AtsAcceptanceControlKind[];
  blockingReasons: string[];
}

export class AtsSupportPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtsSupportPolicyError";
  }
}

const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const SITE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;
const SAFE_ARTIFACT_PATTERN = /^(?:(?:artifacts|ats-corpus|docs|tests)\/[a-zA-Z0-9_.\/-]+|private:[a-z0-9][a-z0-9-]{1,79})$/;
const EVIDENCE_KIND_SET = new Set<string>(ATS_SUPPORT_EVIDENCE_KINDS);
const CONTROL_KIND_SET = new Set<string>(ATS_ACCEPTANCE_CONTROL_KINDS);

function requireSafeId(value: string, label: string, pattern: RegExp): void {
  if (!pattern.test(value)) {
    throw new AtsSupportPolicyError(`Invalid ${label}: ${value}`);
  }
}

function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AtsSupportPolicyError(`${label} must be a non-negative integer.`);
  }
}

function validatePrivacy(privacy: AtsSupportEvidencePrivacy): void {
  if (!privacy || typeof privacy !== "object" || Array.isArray(privacy)) {
    throw new AtsSupportPolicyError("ATS support evidence failed the privacy attestation.");
  }
  const attestations = Object.entries(privacy);
  const expected = [
    "authenticationIncluded",
    "currentValuesIncluded",
    "fileMetadataIncluded",
    "profileDataIncluded",
    "queryValuesIncluded",
    "rawHtmlIncluded"
  ];
  const keys = attestations.map(([key]) => key).sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected) || attestations.some(([, value]) => value !== false)) {
    throw new AtsSupportPolicyError("ATS support evidence failed the privacy attestation.");
  }
}

function validateMetrics(metrics: AtsAcceptanceMetrics): void {
  const numericEntries = Object.entries(metrics)
    .filter(([key]) => key !== "controlKinds") as Array<[string, number]>;
  numericEntries.forEach(([key, value]) => requireNonNegativeInteger(value, key));
  if (metrics.eligibleFieldCount < 1) {
    throw new AtsSupportPolicyError("Acceptance evidence needs at least one eligible field.");
  }
  if (metrics.correctlyMappedFieldCount > metrics.eligibleFieldCount) {
    throw new AtsSupportPolicyError("Correctly mapped fields cannot exceed eligible fields.");
  }
  if (metrics.attemptedWriteCount < 1) {
    throw new AtsSupportPolicyError("Acceptance evidence needs at least one attempted write.");
  }
  if (metrics.verifiedWriteCount > metrics.attemptedWriteCount) {
    throw new AtsSupportPolicyError("Verified writes cannot exceed attempted writes.");
  }
  if (!Array.isArray(metrics.controlKinds) || metrics.controlKinds.length < 1) {
    throw new AtsSupportPolicyError("Acceptance evidence needs at least one control kind.");
  }
  const kinds = new Set(metrics.controlKinds);
  if (kinds.size !== metrics.controlKinds.length
    || metrics.controlKinds.some((kind) => !CONTROL_KIND_SET.has(kind))) {
    throw new AtsSupportPolicyError("Acceptance evidence has invalid or duplicate control kinds.");
  }
}

export function assertValidAtsSupportEvidence(evidence: AtsSupportEvidence): void {
  requireSafeId(evidence.id, "evidence id", ID_PATTERN);
  requireSafeId(evidence.familyId, "family id", ID_PATTERN);
  requireSafeId(evidence.siteKey, "site key", SITE_KEY_PATTERN);
  if (!EVIDENCE_KIND_SET.has(evidence.kind)) {
    throw new AtsSupportPolicyError(`Invalid evidence kind: ${evidence.kind}`);
  }
  const parsedDate = new Date(`${evidence.verifiedAt}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(evidence.verifiedAt)
    || !Number.isFinite(parsedDate.valueOf())
    || parsedDate.toISOString().slice(0, 10) !== evidence.verifiedAt) {
    throw new AtsSupportPolicyError("Evidence verification date must use YYYY-MM-DD.");
  }
  validatePrivacy(evidence.privacy);
  if (evidence.artifactRef
    && (!SAFE_ARTIFACT_PATTERN.test(evidence.artifactRef)
      || evidence.artifactRef.includes("..")
      || evidence.artifactRef.includes("//"))) {
    throw new AtsSupportPolicyError("Evidence artifact reference is not repository-relative or opaque.");
  }
  const requiresMetrics = evidence.kind === "synthetic-fixture" || evidence.kind === "real-page-run";
  if (requiresMetrics !== Boolean(evidence.metrics)) {
    throw new AtsSupportPolicyError(
      requiresMetrics
        ? "Synthetic and real-page evidence require aggregate metrics."
        : "Ground-truth and observation evidence cannot carry write metrics."
    );
  }
  if (evidence.metrics) validateMetrics(evidence.metrics);
}

function metricsBlockingReasons(evidence: AtsSupportEvidence): string[] {
  const metrics = evidence.metrics;
  if (!metrics) return [];
  const reasons: string[] = [];
  const coverage = metrics.correctlyMappedFieldCount / metrics.eligibleFieldCount;
  const writeSuccess = metrics.verifiedWriteCount / metrics.attemptedWriteCount;
  if (coverage < ATS_SUPPORT_THRESHOLDS.minimumEligibleFieldCoverage) {
    reasons.push(`${evidence.id}: eligible-field coverage below 90%`);
  }
  if (writeSuccess < ATS_SUPPORT_THRESHOLDS.minimumVerifiedWriteSuccess) {
    reasons.push(`${evidence.id}: verified-write success below 95%`);
  }
  if (metrics.incorrectWriteCount > 0) reasons.push(`${evidence.id}: incorrect write recorded`);
  if (metrics.unsafeActionCount > 0) reasons.push(`${evidence.id}: unsafe action recorded`);
  if (metrics.finalSubmitActivationCount > 0) reasons.push(`${evidence.id}: final submit activated`);
  if (metrics.unexpectedNavigationCount > 0) reasons.push(`${evidence.id}: unexpected navigation recorded`);
  if (metrics.duplicateRepeatableRecordCount > 0) reasons.push(`${evidence.id}: duplicate repeatable record recorded`);
  if (metrics.standardModeNetworkRequestCount > 0) reasons.push(`${evidence.id}: standard mode used the network`);
  return reasons;
}

function uniqueSites(evidence: AtsSupportEvidence[], kind: AtsSupportEvidenceKind): number {
  return new Set(evidence.filter((item) => item.kind === kind).map((item) => item.siteKey)).size;
}

function orderedControlKinds(evidence: AtsSupportEvidence[]): AtsAcceptanceControlKind[] {
  const covered = new Set(evidence.flatMap((item) => item.metrics?.controlKinds ?? []));
  return ATS_ACCEPTANCE_CONTROL_KINDS.filter((kind) => covered.has(kind));
}

export function assessAtsFamilySupport(
  familyId: string,
  evidence: AtsSupportEvidence[]
): AtsFamilySupportAssessment {
  requireSafeId(familyId, "family id", ID_PATTERN);
  if (!Array.isArray(evidence)) throw new AtsSupportPolicyError("Evidence must be an array.");
  const ids = new Set<string>();
  evidence.forEach((item) => {
    assertValidAtsSupportEvidence(item);
    if (item.familyId !== familyId) {
      throw new AtsSupportPolicyError(`Evidence ${item.id} belongs to another ATS family.`);
    }
    if (ids.has(item.id)) throw new AtsSupportPolicyError(`Duplicate evidence id: ${item.id}`);
    ids.add(item.id);
  });

  const blockingReasons = evidence.flatMap(metricsBlockingReasons);
  const metricEvidence = evidence.filter((item) => item.metrics);
  const observedSiteKeys = new Set(
    evidence
      .filter((item) => item.kind === "public-ground-truth" || item.kind === "private-observation")
      .map((item) => item.siteKey)
  );
  metricEvidence.forEach((item) => {
    if (!observedSiteKeys.has(item.siteKey)) {
      blockingReasons.push(`${item.id}: missing independent ground truth or observation`);
    }
  });
  const passingMetricEvidence = metricEvidence.filter((item) =>
    metricsBlockingReasons(item).length === 0 && observedSiteKeys.has(item.siteKey)
  );
  const realEvidence = evidence.filter((item) => item.kind === "real-page-run");
  const passingRealEvidence = passingMetricEvidence.filter((item) => item.kind === "real-page-run");
  const coveredControlKinds = orderedControlKinds(passingRealEvidence);
  const distinctPassingRealSites = new Set(passingRealEvidence.map((item) => item.siteKey)).size;
  const allControlKindsCovered = ATS_ACCEPTANCE_CONTROL_KINDS.every((kind) => coveredControlKinds.includes(kind));

  let level: AtsSupportLevel = observedSiteKeys.size > 0 ? "observed" : "planned";
  if (blockingReasons.length === 0
    && passingMetricEvidence.some((item) => item.kind === "synthetic-fixture")) {
    level = "fixture-verified";
  }
  if (realEvidence.length > 0
    && blockingReasons.length === 0
    && distinctPassingRealSites >= ATS_SUPPORT_THRESHOLDS.minimumDistinctRealSites
    && allControlKindsCovered) {
    level = "real-page-verified";
  }

  return {
    familyId,
    level,
    evidenceCount: evidence.length,
    observedSiteCount: observedSiteKeys.size,
    fixtureSiteCount: uniqueSites(evidence, "synthetic-fixture"),
    realPageSiteCount: uniqueSites(evidence, "real-page-run"),
    coveredControlKinds: orderedControlKinds(passingMetricEvidence),
    blockingReasons
  };
}
