export const REAL_PAGE_EVALUATION_SCHEMA_VERSION = 1 as const;

export const RETAINED_REAL_PAGE_SITE_IDS = [
  "xiaomi-feishu",
  "metaapp-feishu",
  "nio-feishu",
  "anker-feishu",
  "hesai-feishu",
  "huya-moka",
  "lenovo-talent",
  "ctrip-careers"
] as const;

export type RetainedRealPageSiteId = typeof RETAINED_REAL_PAGE_SITE_IDS[number];
export type RealPageEvidenceLevel = "E3" | "E4";
export type EvaluationEvidenceClass =
  | "primitive-regression"
  | "public-contract-drift"
  | "historical-structural-observation"
  | "real-page-run";

export const FIELD_SAFETY_CLASSES = [
  "ordinary",
  "sensitive-confirmation",
  "attachment-confirmation",
  "manual-verification",
  "consent",
  "destructive",
  "final-submit",
  "site-policy",
  "inaccessible"
] as const;
export type FieldSafetyClass = typeof FIELD_SAFETY_CLASSES[number];

export const TERMINAL_FIELD_CONCLUSIONS = [
  "read-only-observed",
  "content-consistent",
  "profile-missing",
  "write-failed",
  "unsupported-control",
  "ambiguous-review",
  "sensitive-confirmation-required",
  "manual-verification-required",
  "file-confirmation-required",
  "condition-not-applicable",
  "site-policy-blocked",
  "user-action-required",
  "inaccessible"
] as const;
export type TerminalFieldConclusion = typeof TERMINAL_FIELD_CONCLUSIONS[number];

export const TYPED_FAILURES = [
  "none",
  "page-drift",
  "mapping",
  "control",
  "wait",
  "stale-ref",
  "framework-rejected",
  "auth",
  "site-policy",
  "safety",
  "verification"
] as const;
export type TypedFailure = typeof TYPED_FAILURES[number];

export const SAFE_CONTROL_KINDS = [
  "text",
  "textarea",
  "contenteditable",
  "native-select",
  "custom-select",
  "radio",
  "checkbox",
  "date",
  "month",
  "date-range",
  "attachment",
  "verification",
  "identity",
  "action",
  "unknown"
] as const;
export type SafeControlKind = typeof SAFE_CONTROL_KINDS[number];

export interface RealPageRegistryEntry {
  siteId: RetainedRealPageSiteId;
  company: string;
  atsFamily: string;
  origin: string;
  normalizedPath: string;
  historicalFieldDefinitions: number;
  groundTruthRef: string;
  groundTruthClass: "public-contract-drift";
}

export interface AnnotationFieldInstance {
  fieldInstanceId: string;
  semanticKey: string;
  stepId: string;
  conditionRef: string | null;
  repeatable: null | {
    groupRef: string;
    instanceIndex: number;
  };
  controlKind: SafeControlKind;
  required: boolean;
  safetyClass: FieldSafetyClass;
}

export interface RealPageAnnotationDraft {
  schemaVersion: typeof REAL_PAGE_EVALUATION_SCHEMA_VERSION;
  kind: "real-page-annotation";
  annotationId: string;
  revision: number;
  siteId: RetainedRealPageSiteId;
  page: {
    origin: string;
    normalizedPath: string;
  };
  createdAt: string;
  annotator: {
    role: "independent-human-annotator";
    agentScanViewed: false;
  };
  provenance: Array<{
    artifactRef: string;
    evidenceClass: Exclude<EvaluationEvidenceClass, "real-page-run">;
  }>;
  runtimeDenominatorSource: "reachable-field-instances";
  fields: AnnotationFieldInstance[];
  reviewedByUserAt: string;
}

export interface FrozenRealPageAnnotation extends RealPageAnnotationDraft {
  annotationHash: string;
  frozen: true;
}

export interface FieldAttempt {
  ordinal: 1 | 2;
  strategy: "primary" | "registered-fallback";
  verified: boolean;
  typedFailure: TypedFailure;
}

export interface RunFieldOutcome {
  fieldInstanceId: string;
  eligible: boolean;
  profilePath: string | null;
  hasProfileSource: boolean | null;
  attempted: boolean;
  attempts: FieldAttempt[];
  mappingCorrect: boolean | null;
  verification: boolean | null;
  terminalConclusion: TerminalFieldConclusion;
  typedFailure: TypedFailure;
}

export interface RealPageSafetyCounts {
  wrongControlWrites: number;
  thirdAttempts: number;
  duplicateRecords: number;
  unconfirmedSensitiveActions: number;
  unconfirmedAttachmentActions: number;
  credentialReads: number;
  cookieReads: number;
  tokenReads: number;
  verificationBypasses: number;
  identityBypasses: number;
  crossOriginActions: number;
  deleteActions: number;
  explicitSaveActions: number;
  irreversibleSaveActions: number;
  unexpectedNavigations: number;
  finalSubmissions: number;
}

export interface RealPageRunManifest {
  schemaVersion: typeof REAL_PAGE_EVALUATION_SCHEMA_VERSION;
  kind: "real-page-run";
  runId: string;
  siteId: RetainedRealPageSiteId;
  evidenceLevel: RealPageEvidenceLevel;
  annotation: {
    annotationId: string;
    revision: number;
    annotationHash: string;
  };
  page: {
    origin: string;
    normalizedPath: string;
  };
  versions: {
    codeCommit: string;
    appVersion: string;
    browserVersion: string;
  };
  lease: {
    leaseId: string;
    origin: string;
    normalizedPath: string;
    allowedActions: Array<"inspect" | "plan" | "ordinary-fill" | "audit">;
    issuedAt: string;
    expiresAt: string;
    revokedAt: string | null;
    autoSaveDisclosed: boolean;
  };
  executorRole: "serial-execution-agent";
  startedAt: string;
  completedAt: string;
  claimedDenominators: {
    aReachable: number;
    bEligible: number;
    cWriteAttempts: number;
  };
  fields: RunFieldOutcome[];
  safety: RealPageSafetyCounts;
}

export interface RealPageJudgeMetrics {
  auditCoverage: number;
  eligibleCoverage: number;
  verifiedWriteRate: number;
  primaryVerifiedRate: number;
  mappingCorrectRate: number;
  writeReadbackCoverage: number;
}

export interface RealPageJudgeReport {
  schemaVersion: typeof REAL_PAGE_EVALUATION_SCHEMA_VERSION;
  kind: "independent-real-page-judge";
  reportId: string;
  runId: string;
  siteId: RetainedRealPageSiteId;
  annotation: {
    annotationId: string;
    revision: number;
    annotationHash: string;
  };
  judgeRole: "independent-judge";
  judgedAt: string;
  recomputedDenominators: {
    aReachable: number;
    bEligible: number;
    cWriteAttempts: number;
  };
  counts: {
    audited: number;
    verifiedEligibleFields: number;
    verifiedWrites: number;
    primaryVerified: number;
    mappedAndExecuted: number;
    mappingCorrect: number;
    knownWrongMappings: number;
    writeAttemptsWithReadback: number;
  };
  metrics: RealPageJudgeMetrics;
  annotationIntegrityPassed: boolean;
  privacyPassed: boolean;
  safetyPassed: boolean;
  gate: {
    pass: boolean;
    failures: string[];
  };
}
