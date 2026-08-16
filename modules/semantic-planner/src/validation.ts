import {
  AI_FIRST_RUN_FLAGS,
  CONTROL_CAPABILITIES,
  MANUAL_REASONS,
  PROFILE_PATH_KINDS,
  REVIEW_REASONS,
  SAFETY_CLASSES,
  type AiDecisionProposal,
  type AiFieldDecision,
  type AiPlannerRequest,
  type PrivacySafeObservedField,
  type ProfilePathCatalogEntry
} from "./types";

// Repeatable profile records use canonical numeric segments such as
// `education.0.school`. Bracket syntax, signs, and zero-padded indexes stay
// invalid; the compiler also requires every path to exist in the local catalog.
const PROFILE_PATH_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.(?:[A-Za-z][A-Za-z0-9_]*|0|[1-9][0-9]*))*$/;
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

export class PlannerValidationError extends Error {
  constructor(
    public readonly code:
      | "invalid_request"
      | "duplicate_ref"
      | "duplicate_profile_path"
      | "invalid_model_output",
    message: string
  ) {
    super(message);
    this.name = "PlannerValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isEnumValue<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
}

function parseField(value: unknown, index: number): PrivacySafeObservedField {
  const keys = ["ref", "section", "label", "role", "required", "hasValue", "capability", "safetyClass", "options", "conditional"];
  if (!isRecord(value) || !exactKeys(value, keys)) {
    throw new PlannerValidationError("invalid_request", `fields[${index}] must be a closed object`);
  }
  if (typeof value.ref !== "string" || !REF_PATTERN.test(value.ref)) {
    throw new PlannerValidationError("invalid_request", `fields[${index}].ref is invalid`);
  }
  if (!validText(value.section, 512) || !validText(value.label, 512) || !validText(value.role, 128)) {
    throw new PlannerValidationError("invalid_request", `fields[${index}] contains invalid structural text`);
  }
  if (typeof value.required !== "boolean" || typeof value.hasValue !== "boolean" || typeof value.conditional !== "boolean") {
    throw new PlannerValidationError("invalid_request", `fields[${index}] has invalid boolean metadata`);
  }
  if (!isEnumValue(CONTROL_CAPABILITIES, value.capability) || !isEnumValue(SAFETY_CLASSES, value.safetyClass)) {
    throw new PlannerValidationError("invalid_request", `fields[${index}] has an unknown capability or safety class`);
  }
  if (!Array.isArray(value.options)) {
    throw new PlannerValidationError("invalid_request", `fields[${index}].options must be an array`);
  }
  const optionRefs = new Set<string>();
  const options = value.options.map((option, optionIndex) => {
    if (!isRecord(option) || !exactKeys(option, ["optionRef", "label"]) || typeof option.optionRef !== "string"
      || !REF_PATTERN.test(option.optionRef) || !validText(option.label, 512)) {
      throw new PlannerValidationError("invalid_request", `fields[${index}].options[${optionIndex}] is invalid`);
    }
    if (optionRefs.has(option.optionRef)) {
      throw new PlannerValidationError("invalid_request", `fields[${index}] has duplicate option refs`);
    }
    optionRefs.add(option.optionRef);
    return Object.freeze({ optionRef: option.optionRef, label: option.label });
  });
  return Object.freeze({
    ref: value.ref,
    section: value.section,
    label: value.label,
    role: value.role,
    required: value.required,
    hasValue: value.hasValue,
    capability: value.capability,
    safetyClass: value.safetyClass,
    options: Object.freeze(options),
    conditional: value.conditional
  });
}

function parseProfilePath(value: unknown, index: number): ProfilePathCatalogEntry {
  if (!isRecord(value) || !exactKeys(value, ["path", "kind", "hasValue", "safetyClass"])) {
    throw new PlannerValidationError("invalid_request", `profilePathCatalog[${index}] must be a closed object`);
  }
  if (typeof value.path !== "string" || value.path.length > 256 || !PROFILE_PATH_PATTERN.test(value.path)) {
    throw new PlannerValidationError("invalid_request", `profilePathCatalog[${index}].path is invalid`);
  }
  if (!isEnumValue(PROFILE_PATH_KINDS, value.kind) || typeof value.hasValue !== "boolean"
    || (value.safetyClass !== "ordinary" && value.safetyClass !== "sensitive")) {
    throw new PlannerValidationError("invalid_request", `profilePathCatalog[${index}] has invalid metadata`);
  }
  return Object.freeze({
    path: value.path,
    kind: value.kind,
    hasValue: value.hasValue,
    safetyClass: value.safetyClass
  });
}

export function createAiPlannerRequest(value: unknown): Readonly<AiPlannerRequest> {
  const allowedKeys = ["fields", "profilePathCatalog", ...(isRecord(value) && value.defaultResume !== undefined ? ["defaultResume"] : [])];
  if (!isRecord(value) || !exactKeys(value, allowedKeys) || !Array.isArray(value.fields)
    || value.fields.length === 0 || value.fields.length > 2048 || !Array.isArray(value.profilePathCatalog)
    || value.profilePathCatalog.length > 4096) {
    throw new PlannerValidationError("invalid_request", "planner input must contain only fields and profilePathCatalog");
  }
  const fields = value.fields.map(parseField);
  const refs = new Set<string>();
  for (const field of fields) {
    if (refs.has(field.ref)) throw new PlannerValidationError("duplicate_ref", `duplicate observed ref: ${field.ref}`);
    refs.add(field.ref);
  }
  const profilePathCatalog = value.profilePathCatalog.map(parseProfilePath);
  const paths = new Set<string>();
  for (const entry of profilePathCatalog) {
    if (paths.has(entry.path)) throw new PlannerValidationError("duplicate_profile_path", `duplicate profile path: ${entry.path}`);
    paths.add(entry.path);
  }
  const defaultResume = value.defaultResume === undefined
    ? Object.freeze({ hasValue: false, mimeType: "application/pdf" as const })
    : value.defaultResume;
  if (!isRecord(defaultResume) || !exactKeys(defaultResume, ["hasValue", "mimeType"])
    || typeof defaultResume.hasValue !== "boolean" || defaultResume.mimeType !== "application/pdf") {
    throw new PlannerValidationError("invalid_request", "defaultResume must contain only PDF availability metadata");
  }
  return Object.freeze({
    schemaVersion: 1,
    runFlags: AI_FIRST_RUN_FLAGS,
    fields: Object.freeze(fields),
    profilePathCatalog: Object.freeze(profilePathCatalog),
    defaultResume: Object.freeze({ hasValue: defaultResume.hasValue, mimeType: "application/pdf" as const })
  });
}

export function parseAiPlannerRequest(value: unknown): Readonly<AiPlannerRequest> {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "runFlags", "fields", "profilePathCatalog", "defaultResume"])
    || value.schemaVersion !== 1 || !isRecord(value.runFlags)
    || !exactKeys(value.runFlags, ["plannerSource", "legacyFieldTemplateEnabled", "companyFieldOverrideRequired"])
    || value.runFlags.plannerSource !== "ai" || value.runFlags.legacyFieldTemplateEnabled !== false
    || value.runFlags.companyFieldOverrideRequired !== false) {
    throw new PlannerValidationError("invalid_request", "planner request has invalid AI-first run flags");
  }
  return createAiPlannerRequest({ fields: value.fields, profilePathCatalog: value.profilePathCatalog, defaultResume: value.defaultResume });
}

function parseDecision(value: unknown, index: number): AiFieldDecision {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.ref !== "string" || !REF_PATTERN.test(value.ref)) {
    throw new PlannerValidationError("invalid_model_output", `decisions[${index}] is invalid`);
  }
  switch (value.kind) {
    case "map":
    case "profile_missing":
    case "ensure_repeatable":
    case "map_collection_empty":
      if (!exactKeys(value, ["kind", "ref", "profilePath"]) || typeof value.profilePath !== "string"
        || value.profilePath.length > 256 || !PROFILE_PATH_PATTERN.test(value.profilePath)) {
        throw new PlannerValidationError("invalid_model_output", `decisions[${index}] has an invalid profile path`);
      }
      return Object.freeze({ kind: value.kind, ref: value.ref, profilePath: value.profilePath });
    case "map_date_range":
      if (!exactKeys(value, ["kind", "ref", "startProfilePath", "endProfilePath"])
        || typeof value.startProfilePath !== "string" || typeof value.endProfilePath !== "string"
        || !PROFILE_PATH_PATTERN.test(value.startProfilePath) || !PROFILE_PATH_PATTERN.test(value.endProfilePath)) {
        throw new PlannerValidationError("invalid_model_output", `decisions[${index}] has an invalid date range path`);
      }
      return Object.freeze({ kind: value.kind, ref: value.ref, startProfilePath: value.startProfilePath, endProfilePath: value.endProfilePath });
    case "map_date_range_start":
      if (!exactKeys(value, ["kind", "ref", "startProfilePath"])
        || typeof value.startProfilePath !== "string" || !PROFILE_PATH_PATTERN.test(value.startProfilePath)) {
        throw new PlannerValidationError("invalid_model_output", `decisions[${index}] has an invalid start date path`);
      }
      return Object.freeze({ kind: value.kind, ref: value.ref, startProfilePath: value.startProfilePath });
    case "manual":
      if (!exactKeys(value, ["kind", "ref", "reason"]) || !isEnumValue(MANUAL_REASONS, value.reason)) {
        throw new PlannerValidationError("invalid_model_output", `decisions[${index}] has an invalid manual reason`);
      }
      return Object.freeze({ kind: value.kind, ref: value.ref, reason: value.reason });
    case "review":
      if (!exactKeys(value, ["kind", "ref", "reason"]) || !isEnumValue(REVIEW_REASONS, value.reason)) {
        throw new PlannerValidationError("invalid_model_output", `decisions[${index}] has an invalid review reason`);
      }
      return Object.freeze({ kind: value.kind, ref: value.ref, reason: value.reason });
    case "conditional_not_applicable":
    case "upload_default_resume":
      if (!exactKeys(value, ["kind", "ref"])) {
        throw new PlannerValidationError("invalid_model_output", `decisions[${index}] has extra properties`);
      }
      return Object.freeze({ kind: value.kind, ref: value.ref });
    default:
      throw new PlannerValidationError("invalid_model_output", `decisions[${index}] has an unknown decision kind`);
  }
}

export function parseAiDecisionProposal(value: unknown): Readonly<AiDecisionProposal> {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "decisions"]) || value.schemaVersion !== 1
    || !Array.isArray(value.decisions) || value.decisions.length === 0 || value.decisions.length > 2048) {
    throw new PlannerValidationError("invalid_model_output", "model output must be a closed versioned decision proposal");
  }
  return Object.freeze({ schemaVersion: 1, decisions: Object.freeze(value.decisions.map(parseDecision)) });
}
