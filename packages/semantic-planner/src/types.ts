export const PLANNER_SOURCE = "ai" as const;

export const AI_FIRST_RUN_FLAGS = Object.freeze({
  plannerSource: PLANNER_SOURCE,
  legacyFieldTemplateEnabled: false,
  companyFieldOverrideRequired: false
} as const);

export const CONTROL_CAPABILITIES = [
  "read_only",
  "fill_text",
  "fill_multiline",
  "select_option",
  "set_date",
  "set_boolean",
  "ensure_repeatable"
] as const;

export type ControlCapability = (typeof CONTROL_CAPABILITIES)[number];

export const SAFETY_CLASSES = [
  "ordinary",
  "sensitive",
  "identity",
  "verification",
  "attachment",
  "consent",
  "destructive",
  "final_submission"
] as const;

export type SafetyClass = (typeof SAFETY_CLASSES)[number];

export const PROFILE_PATH_KINDS = [
  "text",
  "multiline",
  "choice",
  "date",
  "boolean",
  "repeatable"
] as const;

export type ProfilePathKind = (typeof PROFILE_PATH_KINDS)[number];

export interface PrivacySafeOption {
  optionRef: string;
  label: string;
}

export interface PrivacySafeObservedField {
  ref: string;
  section: string;
  label: string;
  role: string;
  required: boolean;
  hasValue: boolean;
  capability: ControlCapability;
  safetyClass: SafetyClass;
  options: readonly PrivacySafeOption[];
  conditional: boolean;
}

export interface ProfilePathCatalogEntry {
  path: string;
  kind: ProfilePathKind;
  hasValue: boolean;
  safetyClass: "ordinary" | "sensitive";
}

export interface AiPlannerRequest {
  schemaVersion: 1;
  runFlags: typeof AI_FIRST_RUN_FLAGS;
  fields: readonly Readonly<PrivacySafeObservedField>[];
  profilePathCatalog: readonly Readonly<ProfilePathCatalogEntry>[];
}

export const MANUAL_REASONS = [
  "protected_field",
  "unsupported_control",
  "user_input_required"
] as const;

export const REVIEW_REASONS = [
  "ambiguous_mapping",
  "sensitive_confirmation",
  "page_state_conflict"
] as const;

export type ManualReason = (typeof MANUAL_REASONS)[number];
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export type AiFieldDecision =
  | { kind: "map"; ref: string; profilePath: string }
  | { kind: "profile_missing"; ref: string; profilePath: string }
  | { kind: "manual"; ref: string; reason: ManualReason }
  | { kind: "review"; ref: string; reason: ReviewReason }
  | { kind: "conditional_not_applicable"; ref: string }
  | { kind: "ensure_repeatable"; ref: string; profilePath: string };

export interface AiDecisionProposal {
  schemaVersion: 1;
  decisions: readonly AiFieldDecision[];
}

export type AiPlannerInvoker = (request: Readonly<AiPlannerRequest>) => Promise<unknown>;
