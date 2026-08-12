import {
  CONTROL_CAPABILITIES,
  MANUAL_REASONS,
  PROFILE_PATH_KINDS,
  REVIEW_REASONS,
  SAFETY_CLASSES
} from "./types";

const closedObject = (properties: Record<string, unknown>, required: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required
} as const);

const ref = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$" } as const;
const profilePath = {
  type: "string",
  pattern: "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)*$",
  maxLength: 256
} as const;

export const AI_PLANNER_REQUEST_SCHEMA = Object.freeze(closedObject({
  schemaVersion: { const: 1 },
  runFlags: closedObject({
    plannerSource: { const: "ai" },
    legacyFieldTemplateEnabled: { const: false },
    companyFieldOverrideRequired: { const: false }
  }, ["plannerSource", "legacyFieldTemplateEnabled", "companyFieldOverrideRequired"]),
  fields: {
    type: "array",
    minItems: 1,
    maxItems: 2048,
    items: closedObject({
      ref,
      section: { type: "string", maxLength: 512 },
      label: { type: "string", maxLength: 512 },
      role: { type: "string", maxLength: 128 },
      required: { type: "boolean" },
      hasValue: { type: "boolean" },
      capability: { enum: CONTROL_CAPABILITIES },
      safetyClass: { enum: SAFETY_CLASSES },
      options: {
        type: "array",
        maxItems: 2048,
        items: closedObject({
          optionRef: ref,
          label: { type: "string", maxLength: 512 }
        }, ["optionRef", "label"])
      },
      conditional: { type: "boolean" }
    }, ["ref", "section", "label", "role", "required", "hasValue", "capability", "safetyClass", "options", "conditional"])
  },
  profilePathCatalog: {
    type: "array",
    maxItems: 4096,
    items: closedObject({
      path: profilePath,
      kind: { enum: PROFILE_PATH_KINDS },
      hasValue: { type: "boolean" },
      safetyClass: { enum: ["ordinary", "sensitive"] }
    }, ["path", "kind", "hasValue", "safetyClass"])
  }
}, ["schemaVersion", "runFlags", "fields", "profilePathCatalog"]));

const mapDecision = closedObject({
  kind: { const: "map" }, ref, profilePath
}, ["kind", "ref", "profilePath"]);
const missingDecision = closedObject({
  kind: { const: "profile_missing" }, ref, profilePath
}, ["kind", "ref", "profilePath"]);
const manualDecision = closedObject({
  kind: { const: "manual" }, ref, reason: { enum: MANUAL_REASONS }
}, ["kind", "ref", "reason"]);
const reviewDecision = closedObject({
  kind: { const: "review" }, ref, reason: { enum: REVIEW_REASONS }
}, ["kind", "ref", "reason"]);
const notApplicableDecision = closedObject({
  kind: { const: "conditional_not_applicable" }, ref
}, ["kind", "ref"]);
const repeatableDecision = closedObject({
  kind: { const: "ensure_repeatable" }, ref, profilePath
}, ["kind", "ref", "profilePath"]);

export const AI_DECISION_PROPOSAL_SCHEMA = Object.freeze(closedObject({
  schemaVersion: { const: 1 },
  decisions: {
    type: "array",
    minItems: 1,
    maxItems: 2048,
    items: {
      oneOf: [
        mapDecision,
        missingDecision,
        manualDecision,
        reviewDecision,
        notApplicableDecision,
        repeatableDecision
      ]
    }
  }
}, ["schemaVersion", "decisions"]));
