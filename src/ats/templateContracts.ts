import type { RepeatableGroupKey } from "../domain/repeatableGroups";
import type { ControlKind, ExclusionReason } from "../matching/types";

export type AtsTemplateAction = "fill" | "confirm" | "exclude";

export type AtsControlDriverHint =
  | "native"
  | "feishu-select"
  | "feishu-date-range"
  | "aria-combobox";

export type AtsTemplateVerification =
  | "normalized-equality"
  | "selected-option"
  | "checked-state"
  | "none";

export interface AtsTemplateFieldRule {
  id: string;
  semanticKeys: string[];
  profilePathPattern: string | null;
  companionProfilePathPattern?: string;
  action: AtsTemplateAction;
  kinds?: ControlKind[];
  driverHint: AtsControlDriverHint;
  verification: AtsTemplateVerification;
  exclusionReason?: ExclusionReason;
}

export interface AtsTemplateSectionRule {
  id: string;
  labels: string[];
  repeatableGroup?: RepeatableGroupKey;
}

export interface AtsTemplateRepeatableRule {
  group: RepeatableGroupKey;
  sectionId: string;
  pathAliases: string[];
  sectionSelectors: string[];
  addControlSelectors: string[];
  recordRootSelectors: string[];
  saveControlSelectors: string[];
  addLabels: string[];
  saveLabels: string[];
  maximumCreatesPerRun: number;
}

export interface AtsFamilyTemplate {
  familyId: string;
  version: string;
  fieldRules: AtsTemplateFieldRule[];
  sections: AtsTemplateSectionRule[];
  repeatableRules: AtsTemplateRepeatableRule[];
  finalSubmitExclusions: string[];
}

export interface AtsTemplateMatchEvidence {
  familyId: string;
  templateVersion: string;
  ruleId: string;
  driverHint: AtsControlDriverHint;
  verification: AtsTemplateVerification;
}
