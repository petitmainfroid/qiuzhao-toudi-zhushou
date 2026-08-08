import type {
  PageControlBoundary,
  PageControlRole,
  PageControlSafety,
  PageControlSemantics
} from "../bridge/protocol";

export const ATS_ADAPTER_SCHEMA_VERSION = 1 as const;

export const ATS_CONTROL_CAPABILITIES = [
  "text",
  "contenteditable",
  "single-select",
  "multi-select",
  "searchable-combobox",
  "choice",
  "toggle",
  "date",
  "month",
  "date-range",
  "file-upload"
] as const;

export type AtsControlCapability = typeof ATS_CONTROL_CAPABILITIES[number];

export const ATS_FIELD_DECISIONS = ["fill", "confirm", "exclude"] as const;
export type AtsFieldDecision = typeof ATS_FIELD_DECISIONS[number];

export const ATS_VERIFICATION_KINDS = [
  "normalized-equality",
  "selected-option",
  "checked-state",
  "attachment-gate",
  "none"
] as const;

export type AtsVerificationKind = typeof ATS_VERIFICATION_KINDS[number];

export const ATS_REPEATABLE_COLLECTIONS = [
  "education",
  "workExperiences",
  "projects",
  "workSamples",
  "awards",
  "languages"
] as const;

export type AtsRepeatableCollection = typeof ATS_REPEATABLE_COLLECTIONS[number];

export type AtsFieldIntent =
  | { kind: "profile-field"; pathPattern: string }
  | { kind: "profile-range"; startPathPattern: string; endPathPattern: string }
  | { kind: "saved-resume" }
  | { kind: "manual" };

export interface AtsAdapterFamily {
  id: string;
  version: string;
}

export interface AtsAdapterDetection {
  httpsOnly: true;
  exactHosts: string[];
  hostSuffixes: string[];
  pathPrefixes: string[];
  semanticMarkers: string[];
  minimumSemanticMarkers: number;
}

export interface AtsAdapterFieldRule {
  id: string;
  semanticKeys: string[];
  roles: PageControlRole[];
  capability: AtsControlCapability;
  decision: AtsFieldDecision;
  intent: AtsFieldIntent;
  verification: AtsVerificationKind;
}

export interface AtsAdapterRepeatableRule {
  collection: AtsRepeatableCollection;
  sectionSemanticKeys: string[];
  recordSemanticPrefixes: string[];
  addControlLabels: string[];
  saveControlLabels: string[];
  maximumCreatesPerRun: number;
}

export interface AtsAdapterExclusions {
  finalSubmitLabels: string[];
}

export interface AtsAdapterManifest {
  schemaVersion: typeof ATS_ADAPTER_SCHEMA_VERSION;
  family: AtsAdapterFamily;
  detection: AtsAdapterDetection;
  fields: AtsAdapterFieldRule[];
  repeatables: AtsAdapterRepeatableRule[];
  exclusions: AtsAdapterExclusions;
}

export interface AtsAdapterControlSummary {
  controlKey: string;
  role: PageControlRole;
  tag: "input" | "textarea" | "select" | "button" | "a" | "contenteditable" | "custom";
  inputType?: string;
  semantics: PageControlSemantics;
  optionLabels?: string[];
  disabled: boolean;
  readOnly: boolean;
  required: boolean;
  multiple: boolean;
  boundary: PageControlBoundary;
  safety: PageControlSafety;
}

export interface AtsAdapterPageSummary {
  snapshotKey: string;
  origin: string;
  pathTemplate: string;
  controls: AtsAdapterControlSummary[];
}

export interface AtsAdapterPlannedField {
  controlKey: string;
  ruleId: string;
  semanticKey: string;
  capability: AtsControlCapability;
  decision: AtsFieldDecision;
  intent: AtsFieldIntent;
  verification: AtsVerificationKind;
}

export type AtsAdapterSkipReason =
  | "unknown-field"
  | "ambiguous-rule"
  | "incompatible-role"
  | "missing-record-index"
  | "adapter-excluded"
  | "unsafe-control"
  | "final-submit"
  | "unavailable-control";

export interface AtsAdapterSkippedControl {
  controlKey: string;
  reason: AtsAdapterSkipReason;
}

export interface AtsAdapterPlan {
  familyId: string;
  familyVersion: string;
  snapshotKey: string;
  fields: AtsAdapterPlannedField[];
  repeatables: AtsAdapterRepeatableRule[];
  skipped: AtsAdapterSkippedControl[];
}
