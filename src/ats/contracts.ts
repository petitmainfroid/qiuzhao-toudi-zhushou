import type {
  PageControlBoundary,
  PageControlRole,
  PageControlSafety,
  PrivacySafeControl
} from "../bridge/protocol";

export const ATS_OBSERVATION_SCHEMA_VERSION = 1 as const;
export const GENERIC_ATS_FAMILY_ID = "generic-html";
export const GENERIC_ATS_FAMILY_VERSION = "1";

export type AtsPageType =
  | "application"
  | "profile"
  | "screening"
  | "assessment"
  | "unknown";

export type AtsFamilyEvidenceKind =
  | "origin"
  | "path"
  | "control-structure"
  | "semantic-marker";

export interface AtsFamilyEvidence {
  kind: AtsFamilyEvidenceKind;
  detail: string;
}

export interface AtsFamilyIdentity {
  id: string;
  version: string;
  confidence: number;
  evidence: AtsFamilyEvidence[];
}

export interface AtsObservationSource {
  origin: string;
  pathTemplate: string;
  language: string;
  pageType: AtsPageType;
  captureToolVersion: string;
}

export interface AtsObservedControl {
  controlKey: string;
  role: PageControlRole;
  tag: PrivacySafeControl["tag"];
  inputType?: string;
  semantics: {
    label?: string;
    ariaLabel?: string;
    placeholder?: string;
    name?: string;
    nearbyText?: string;
    section?: string;
  };
  options?: string[];
  disabled: boolean;
  readOnly: boolean;
  required: boolean;
  multiple: boolean;
  boundary: PageControlBoundary;
  safety: PageControlSafety;
}

export interface AtsObservationSummary {
  controlCount: number;
  blockedControlCount: number;
  frameControlCount: number;
  openShadowControlCount: number;
  sectionCount: number;
}

export interface AtsPrivacyAttestation {
  currentValuesIncluded: false;
  sessionReferencesIncluded: false;
  queryValuesIncluded: false;
  fileMetadataIncluded: false;
}

export interface AtsObservation {
  schemaVersion: typeof ATS_OBSERVATION_SCHEMA_VERSION;
  capturedAt: string;
  source: AtsObservationSource;
  family: AtsFamilyIdentity;
  sections: string[];
  controls: AtsObservedControl[];
  summary: AtsObservationSummary;
  privacy: AtsPrivacyAttestation;
}

export type AtsGroundTruthAction = "fill" | "confirm" | "exclude" | "manual" | "unknown";
export type AtsVerificationKind = "normalized-equality" | "selected-option" | "checked-state" | "attachment-gate" | "none";

export interface AtsControlGroundTruth {
  controlKey: string;
  expectedProfilePath: string | null;
  expectedAction: AtsGroundTruthAction;
  expectedDriver: string | null;
  expectedVerification: AtsVerificationKind;
  notes?: string;
}

export interface AtsObservationGroundTruth {
  schemaVersion: typeof ATS_OBSERVATION_SCHEMA_VERSION;
  observationDigest: string;
  annotations: AtsControlGroundTruth[];
  reviewedAt: string;
}

export interface AtsFamilyDetectionContext {
  source: AtsObservationSource;
  controls: readonly AtsObservedControl[];
  markers: readonly string[];
}

export interface AtsFamilyDetectionCandidate {
  confidence: number;
  evidence: AtsFamilyEvidence[];
}

export interface AtsFamilyDetector {
  id: string;
  version: string;
  detect(context: AtsFamilyDetectionContext): AtsFamilyDetectionCandidate | null;
}
