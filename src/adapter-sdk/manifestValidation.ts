import { canonicalFields } from "../matching/catalog";
import { PAGE_CONTROL_ROLES } from "../bridge/protocol";
import {
  ATS_ADAPTER_SCHEMA_VERSION,
  ATS_CONTROL_CAPABILITIES,
  ATS_FIELD_DECISIONS,
  ATS_REPEATABLE_COLLECTIONS,
  ATS_VERIFICATION_KINDS,
  type AtsAdapterFieldRule,
  type AtsAdapterManifest,
  type AtsFieldIntent
} from "./contracts";

export type AtsAdapterManifestIssueCode =
  | "invalid-shape"
  | "unknown-property"
  | "invalid-value"
  | "invalid-profile-path"
  | "unsafe-decision"
  | "duplicate-id";

export interface AtsAdapterManifestIssue {
  code: AtsAdapterManifestIssueCode;
  path: string;
}

export type AtsAdapterManifestValidation =
  | { ok: true; manifest: AtsAdapterManifest }
  | { ok: false; issues: AtsAdapterManifestIssue[] };

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: UnknownRecord,
  allowed: readonly string[],
  path: string,
  issues: AtsAdapterManifestIssue[],
  optional: readonly string[] = []
): boolean {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  unknown.forEach((key) => issues.push({ code: "unknown-property", path: `${path}.${key}` }));
  const missing = allowed.filter((key) => !(key in value) && !optional.includes(key));
  missing.forEach((key) => issues.push({ code: "invalid-shape", path: `${path}.${key}` }));
  return unknown.length === 0 && missing.length === 0;
}

function stringValue(value: unknown, maximum = 120): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function stringArray(value: unknown, maximumItems = 100): value is string[] {
  return Array.isArray(value)
    && value.length <= maximumItems
    && value.every((item) => stringValue(item))
    && new Set(value).size === value.length;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(value);
}

function version(value: unknown): value is string {
  return typeof value === "string" && /^\d+(?:\.\d+){0,2}$/.test(value);
}

function host(value: string): boolean {
  return value === value.toLowerCase()
    && value.length <= 253
    && value.includes(".")
    && !value.startsWith(".")
    && !value.endsWith(".")
    && !value.includes("*")
    && value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function pathPrefix(value: string): boolean {
  return value.startsWith("/")
    && value.length <= 160
    && !/[?#\\]/.test(value)
    && !value.includes("//");
}

function semanticKey(value: string): boolean {
  return /^[a-z][a-z0-9_.-]*(?:\[\])?[a-z0-9_.-]*$/.test(value);
}

function canonicalField(pathPattern: string) {
  const normalized = pathPattern.replaceAll("{index}", "0");
  return canonicalFields.find((field) => field.path === normalized);
}

function validPathPattern(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 120
    && /^(?:derived\.age|(?:basic|jobPreference|answers)\.[A-Za-z][A-Za-z0-9]*|(?:education|workExperiences|projects|workSamples|awards|languages)\.(?:\{index\}|0)\.[A-Za-z][A-Za-z0-9]*)$/.test(value)
    && !/(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$)/.test(value)
    && Boolean(canonicalField(value));
}

function validateIntent(
  value: unknown,
  path: string,
  issues: AtsAdapterManifestIssue[]
): value is AtsFieldIntent {
  if (!record(value) || typeof value.kind !== "string") {
    issues.push({ code: "invalid-shape", path });
    return false;
  }
  if (value.kind === "profile-field") {
    exactKeys(value, ["kind", "pathPattern"], path, issues);
    if (!validPathPattern(value.pathPattern)) {
      issues.push({ code: "invalid-profile-path", path: `${path}.pathPattern` });
      return false;
    }
    return true;
  }
  if (value.kind === "profile-range") {
    exactKeys(value, ["kind", "startPathPattern", "endPathPattern"], path, issues);
    const startValid = validPathPattern(value.startPathPattern);
    const endValid = validPathPattern(value.endPathPattern);
    if (!startValid) issues.push({ code: "invalid-profile-path", path: `${path}.startPathPattern` });
    if (!endValid) issues.push({ code: "invalid-profile-path", path: `${path}.endPathPattern` });
    return startValid && endValid;
  }
  if (value.kind === "saved-resume" || value.kind === "manual") {
    return exactKeys(value, ["kind"], path, issues);
  }
  issues.push({ code: "invalid-value", path: `${path}.kind` });
  return false;
}

function intentPaths(intent: AtsFieldIntent): string[] {
  if (intent.kind === "profile-field") return [intent.pathPattern];
  if (intent.kind === "profile-range") return [intent.startPathPattern, intent.endPathPattern];
  return [];
}

function validateFieldRule(
  value: unknown,
  index: number,
  issues: AtsAdapterManifestIssue[]
): value is AtsAdapterFieldRule {
  const path = `manifest.fields[${index}]`;
  if (!record(value)) {
    issues.push({ code: "invalid-shape", path });
    return false;
  }
  exactKeys(
    value,
    ["id", "semanticKeys", "semanticLabels", "roles", "capability", "decision", "intent", "verification"],
    path,
    issues,
    ["semanticLabels"]
  );
  let valid = true;
  if (!identifier(value.id)) {
    issues.push({ code: "invalid-value", path: `${path}.id` });
    valid = false;
  }
  if (!stringArray(value.semanticKeys) || value.semanticKeys.length === 0 || !value.semanticKeys.every(semanticKey)) {
    issues.push({ code: "invalid-value", path: `${path}.semanticKeys` });
    valid = false;
  }
  if (value.semanticLabels !== undefined && (!stringArray(value.semanticLabels, 50) || value.semanticLabels.length === 0)) {
    issues.push({ code: "invalid-value", path: `${path}.semanticLabels` });
    valid = false;
  }
  if (
    !Array.isArray(value.roles)
    || value.roles.length === 0
    || !value.roles.every((role) => (PAGE_CONTROL_ROLES as readonly unknown[]).includes(role))
    || new Set(value.roles).size !== value.roles.length
  ) {
    issues.push({ code: "invalid-value", path: `${path}.roles` });
    valid = false;
  }
  if (!(ATS_CONTROL_CAPABILITIES as readonly unknown[]).includes(value.capability)) {
    issues.push({ code: "invalid-value", path: `${path}.capability` });
    valid = false;
  }
  if (!(ATS_FIELD_DECISIONS as readonly unknown[]).includes(value.decision)) {
    issues.push({ code: "invalid-value", path: `${path}.decision` });
    valid = false;
  }
  if (!(ATS_VERIFICATION_KINDS as readonly unknown[]).includes(value.verification)) {
    issues.push({ code: "invalid-value", path: `${path}.verification` });
    valid = false;
  }
  const validIntent = validateIntent(value.intent, `${path}.intent`, issues);
  if (!validIntent) valid = false;
  if (!valid) return false;

  const rule = value as unknown as AtsAdapterFieldRule;
  const isResume = rule.intent.kind === "saved-resume";
  const isManual = rule.intent.kind === "manual";
  const sensitive = intentPaths(rule.intent).some((pattern) => canonicalField(pattern)?.sensitive === true);
  const unsafe = (rule.decision === "exclude") !== isManual
    || (rule.decision !== "exclude" && isManual)
    || (isResume && (
      rule.decision !== "confirm"
      || rule.capability !== "file-upload"
      || rule.verification !== "attachment-gate"
    ))
    || (!isResume && rule.capability === "file-upload")
    || (!isResume && rule.decision !== "exclude" && rule.verification === "none")
    || (sensitive && rule.decision !== "confirm");
  if (unsafe) {
    issues.push({ code: "unsafe-decision", path });
    return false;
  }
  return true;
}

function validateManifest(value: unknown, issues: AtsAdapterManifestIssue[]): value is AtsAdapterManifest {
  if (!record(value)) {
    issues.push({ code: "invalid-shape", path: "manifest" });
    return false;
  }
  exactKeys(value, ["schemaVersion", "family", "detection", "fields", "repeatables", "exclusions"], "manifest", issues);
  if (value.schemaVersion !== ATS_ADAPTER_SCHEMA_VERSION) {
    issues.push({ code: "invalid-value", path: "manifest.schemaVersion" });
  }

  if (!record(value.family)) issues.push({ code: "invalid-shape", path: "manifest.family" });
  else {
    exactKeys(value.family, ["id", "version"], "manifest.family", issues);
    if (!identifier(value.family.id)) issues.push({ code: "invalid-value", path: "manifest.family.id" });
    if (!version(value.family.version)) issues.push({ code: "invalid-value", path: "manifest.family.version" });
  }

  if (!record(value.detection)) issues.push({ code: "invalid-shape", path: "manifest.detection" });
  else {
    exactKeys(
      value.detection,
      ["httpsOnly", "exactHosts", "hostSuffixes", "pathPrefixes", "semanticMarkers", "semanticLabelMarkers", "minimumSemanticMarkers"],
      "manifest.detection",
      issues,
      ["semanticLabelMarkers"]
    );
    if (value.detection.httpsOnly !== true) issues.push({ code: "invalid-value", path: "manifest.detection.httpsOnly" });
    const exactHostValues = value.detection.exactHosts;
    const hostSuffixValues = value.detection.hostSuffixes;
    const exactHosts = stringArray(exactHostValues, 50) && exactHostValues.every(host);
    const hostSuffixes = stringArray(hostSuffixValues, 50) && hostSuffixValues.every(host);
    if (!exactHosts) issues.push({ code: "invalid-value", path: "manifest.detection.exactHosts" });
    if (!hostSuffixes) issues.push({ code: "invalid-value", path: "manifest.detection.hostSuffixes" });
    if (exactHosts && hostSuffixes && exactHostValues.length + hostSuffixValues.length === 0) {
      issues.push({ code: "invalid-value", path: "manifest.detection" });
    }
    if (!stringArray(value.detection.pathPrefixes, 50) || !value.detection.pathPrefixes.every(pathPrefix)) {
      issues.push({ code: "invalid-value", path: "manifest.detection.pathPrefixes" });
    }
    if (!stringArray(value.detection.semanticMarkers, 100) || !value.detection.semanticMarkers.every(semanticKey)) {
      issues.push({ code: "invalid-value", path: "manifest.detection.semanticMarkers" });
    }
    if (
      value.detection.semanticLabelMarkers !== undefined
      && (!stringArray(value.detection.semanticLabelMarkers, 100) || value.detection.semanticLabelMarkers.length === 0)
    ) issues.push({ code: "invalid-value", path: "manifest.detection.semanticLabelMarkers" });
    if (
      !Number.isInteger(value.detection.minimumSemanticMarkers)
      || Number(value.detection.minimumSemanticMarkers) < 0
      || Number(value.detection.minimumSemanticMarkers) > 20
    ) issues.push({ code: "invalid-value", path: "manifest.detection.minimumSemanticMarkers" });
  }

  if (!Array.isArray(value.fields) || value.fields.length === 0 || value.fields.length > 500) {
    issues.push({ code: "invalid-shape", path: "manifest.fields" });
  }
  else {
    value.fields.forEach((field, index) => validateFieldRule(field, index, issues));
    const ids = value.fields.filter(record).map((field) => field.id).filter((id): id is string => typeof id === "string");
    ids.forEach((id, index) => {
      if (ids.indexOf(id) !== index) issues.push({ code: "duplicate-id", path: `manifest.fields[${index}].id` });
    });
  }

  if (!Array.isArray(value.repeatables) || value.repeatables.length > ATS_REPEATABLE_COLLECTIONS.length) {
    issues.push({ code: "invalid-shape", path: "manifest.repeatables" });
  }
  else {
    value.repeatables.forEach((item, index) => {
      const path = `manifest.repeatables[${index}]`;
      if (!record(item)) {
        issues.push({ code: "invalid-shape", path });
        return;
      }
      exactKeys(
        item,
        ["collection", "sectionSemanticKeys", "recordSemanticPrefixes", "addControlLabels", "saveControlLabels", "maximumCreatesPerRun"],
        path,
        issues
      );
      if (!(ATS_REPEATABLE_COLLECTIONS as readonly unknown[]).includes(item.collection)) {
        issues.push({ code: "invalid-value", path: `${path}.collection` });
      }
      for (const key of ["sectionSemanticKeys", "recordSemanticPrefixes"] as const) {
        if (!stringArray(item[key], 50) || item[key].length === 0 || !item[key].every(semanticKey)) {
          issues.push({ code: "invalid-value", path: `${path}.${key}` });
        }
      }
      for (const key of ["addControlLabels", "saveControlLabels"] as const) {
        if (!stringArray(item[key], 20) || item[key].length === 0) {
          issues.push({ code: "invalid-value", path: `${path}.${key}` });
        }
      }
      if (!Number.isInteger(item.maximumCreatesPerRun) || Number(item.maximumCreatesPerRun) < 1 || Number(item.maximumCreatesPerRun) > 10) {
        issues.push({ code: "invalid-value", path: `${path}.maximumCreatesPerRun` });
      }
    });
    const collections = value.repeatables.filter(record).map((item) => item.collection).filter((item): item is string => typeof item === "string");
    collections.forEach((collection, index) => {
      if (collections.indexOf(collection) !== index) {
        issues.push({ code: "duplicate-id", path: `manifest.repeatables[${index}].collection` });
      }
    });
  }

  if (!record(value.exclusions)) issues.push({ code: "invalid-shape", path: "manifest.exclusions" });
  else {
    exactKeys(value.exclusions, ["finalSubmitLabels"], "manifest.exclusions", issues);
    if (!stringArray(value.exclusions.finalSubmitLabels, 50)) {
      issues.push({ code: "invalid-value", path: "manifest.exclusions.finalSubmitLabels" });
    }
  }
  return issues.length === 0;
}

export function validateAtsAdapterManifest(value: unknown): AtsAdapterManifestValidation {
  const issues: AtsAdapterManifestIssue[] = [];
  return validateManifest(value, issues)
    ? { ok: true, manifest: value }
    : { ok: false, issues };
}

export function assertAtsAdapterManifest(value: unknown): asserts value is AtsAdapterManifest {
  const validation = validateAtsAdapterManifest(value);
  if (!validation.ok) {
    const summary = validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(",");
    throw new Error(`Invalid ATS adapter manifest: ${summary}`);
  }
}
