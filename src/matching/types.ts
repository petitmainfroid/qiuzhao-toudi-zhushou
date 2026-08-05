export type ControlKind =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "month"
  | "number"
  | "textarea"
  | "select"
  | "custom-select"
  | "date-range"
  | "radio"
  | "checkbox"
  | "contenteditable"
  | "file"
  | "password"
  | "hidden"
  | "button"
  | "unknown";

export interface FieldDescriptor {
  elementId: string;
  tagName: string;
  inputType: string;
  kind: ControlKind;
  label: string;
  ariaLabel: string;
  placeholder: string;
  name: string;
  domId: string;
  autocomplete: string;
  contextText: string;
  options: string[];
  disabled: boolean;
  readOnly: boolean;
}

export type MatchConfidence = "high" | "medium" | "low" | "none";

export type ExclusionReason =
  | "unsupported-control"
  | "sensitive-unsupported"
  | "verification-control"
  | "disabled-or-readonly"
  | "unmatched";

export interface MatchResult {
  elementId: string;
  fieldLabel: string;
  profilePath: string | null;
  canonicalLabel: string | null;
  score: number;
  confidence: MatchConfidence;
  reasons: string[];
  requiresConfirmation: boolean;
  excludedReason?: ExclusionReason;
}
