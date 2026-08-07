import {
  ATS_OBSERVATION_SCHEMA_VERSION,
  type AtsObservation,
  type AtsObservedControl
} from "./contracts";

export type AtsObservationAuditCode =
  | "invalid-shape"
  | "forbidden-key"
  | "forbidden-string"
  | "unsafe-source"
  | "unsafe-control"
  | "duplicate-control"
  | "summary-mismatch";

export interface AtsObservationAuditIssue {
  code: AtsObservationAuditCode;
  path: string;
  message: string;
}

export interface AtsObservationAuditResult {
  passed: boolean;
  issues: AtsObservationAuditIssue[];
}

const FORBIDDEN_KEYS = new Set([
  "value", "defaultvalue", "checked", "selected", "outerhtml", "innerhtml", "html",
  "selector", "cssselector", "xpath", "nodeid", "backendnodeid", "cdpid", "snapshotid", "ref",
  "cookie", "cookies", "authorization", "accesstoken", "refreshtoken", "password",
  "header", "headers", "body", "requestbody", "responsebody", "filename", "filepath",
  "digest", "sha256", "base64", "href", "url", "query", "querystring"
]);
const ROOT_KEYS = new Set(["schemaVersion", "capturedAt", "source", "family", "sections", "controls", "summary", "privacy"]);
const SOURCE_KEYS = new Set(["origin", "pathTemplate", "language", "pageType", "captureToolVersion"]);
const FAMILY_KEYS = new Set(["id", "version", "confidence", "evidence"]);
const EVIDENCE_KEYS = new Set(["kind", "detail"]);
const CONTROL_KEYS = new Set([
  "controlKey", "role", "tag", "inputType", "semantics", "options", "disabled", "readOnly",
  "required", "multiple", "boundary", "safety"
]);
const SEMANTIC_KEYS = new Set(["label", "ariaLabel", "placeholder", "name", "nearbyText", "section"]);
const SUMMARY_KEYS = new Set(["controlCount", "blockedControlCount", "frameControlCount", "openShadowControlCount", "sectionCount"]);
const PRIVACY_KEYS = new Set(["currentValuesIncluded", "sessionReferencesIncluded", "queryValuesIncluded", "fileMetadataIncluded"]);
const PAGE_TYPES = new Set(["application", "profile", "screening", "assessment", "unknown"]);
const FAMILY_EVIDENCE_KINDS = new Set(["origin", "path", "control-structure", "semantic-marker"]);
const CONTROL_ROLES = new Set(["textbox", "combobox", "listbox", "option", "checkbox", "radio", "switch", "button", "link"]);
const CONTROL_TAGS = new Set(["input", "textarea", "select", "button", "a", "contenteditable", "custom"]);
const CONTROL_BOUNDARIES = new Set(["main", "same-origin-frame", "open-shadow"]);
const CONTROL_SAFETY = new Set(["ordinary", "credential", "verification", "identity", "final-submit", "file"]);
const PERSONAL_PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i, "email address"],
  [/(?:\+?86[-\s]?)?1[3-9]\d{9}|\b\d{3,4}[-\s]\d{7,8}\b/, "phone number"],
  [/\b\d{17}[\dXx]\b/, "identity number"],
  [/\bBearer\s+[A-Za-z0-9._~-]+/i, "authorization credential"],
  [/\b[A-Za-z]:\\[^\s]+/, "local file path"],
  [/\/(?:Users|home)\/[^\s]+/, "local user path"],
  [/[?&][A-Za-z0-9_.~-]+=[^\s&]+/, "query value"],
  [/(?:[A-Za-z0-9+/]{80,}={0,2})/, "encoded payload"],
  [/(?:^|[\s\\/])[^\\/\s]{1,80}\.(?:pdf|docx?|pptx?|xlsx?|png|jpe?g|gif|html?|zip|rar)(?=$|[\s,，;；:：)）])/i, "file metadata"],
  [/上次上传|上传时间|更新于|last\s+uploaded|last\s+modified/i, "upload status metadata"]
];
const TIMESTAMP_PATTERN = /\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b/;
const DATE_DISPLAY_PATTERN = /^(?:19|20)\d{2}\s*(?:[-/.年])\s*(?:0?[1-9]|1[0-2])(?:\s*月)?(?:\s*(?:[-~至])\s*(?:19|20)?\d{0,4}\s*(?:[-/.年])?\s*(?:0?[1-9]|1[0-2])(?:\s*月)?)?$/;
const FINAL_SUBMIT_PATTERN = /提交申请|提交简历|投递简历|最终提交|确认投递|立即申请|submit\s*application|final\s*submit|apply\s*now/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(
  issues: AtsObservationAuditIssue[],
  code: AtsObservationAuditCode,
  path: string,
  message: string
): void {
  issues.push({ code, path, message });
}

function inspectKeysAndStrings(
  value: unknown,
  path: string,
  issues: AtsObservationAuditIssue[]
): void {
  if (typeof value === "string") {
    if (path === "$.source.origin") return;
    for (const [pattern, description] of PERSONAL_PATTERNS) {
      if (pattern.test(value)) issue(issues, "forbidden-string", path, `Contains ${description}.`);
    }
    if (path.includes(".semantics.") && (TIMESTAMP_PATTERN.test(value) || DATE_DISPLAY_PATTERN.test(value.trim()))) {
      issue(issues, "forbidden-string", path, "Contains current display date metadata.");
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectKeysAndStrings(item, `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      issue(issues, "forbidden-key", `${path}.${key}`, `Forbidden ATS observation key: ${key}.`);
    }
    inspectKeysAndStrings(child, `${path}.${key}`, issues);
  }
}

function exactKeys(
  value: unknown,
  allowed: Set<string>,
  path: string,
  issues: AtsObservationAuditIssue[]
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    issue(issues, "invalid-shape", path, "Expected an object.");
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issue(issues, "invalid-shape", `${path}.${key}`, "Unexpected property.");
  }
  return true;
}

function validControl(value: unknown, index: number, issues: AtsObservationAuditIssue[]): value is AtsObservedControl {
  const path = `$.controls[${index}]`;
  if (!exactKeys(value, CONTROL_KEYS, path, issues)) return false;
  if (typeof value.controlKey !== "string" || !/^control_\d{4}$/.test(value.controlKey)) {
    issue(issues, "invalid-shape", `${path}.controlKey`, "Invalid anonymous control key.");
  }
  if (!CONTROL_ROLES.has(String(value.role))) issue(issues, "invalid-shape", `${path}.role`, "Unsupported control role.");
  if (!CONTROL_TAGS.has(String(value.tag))) issue(issues, "invalid-shape", `${path}.tag`, "Unsupported public control tag.");
  if (!CONTROL_BOUNDARIES.has(String(value.boundary))) issue(issues, "invalid-shape", `${path}.boundary`, "Unsupported control boundary.");
  if (!CONTROL_SAFETY.has(String(value.safety))) issue(issues, "invalid-shape", `${path}.safety`, "Unsupported safety classification.");
  if (value.inputType !== undefined && (typeof value.inputType !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(value.inputType))) {
    issue(issues, "invalid-shape", `${path}.inputType`, "Invalid allowlisted input type.");
  }
  if (!exactKeys(value.semantics, SEMANTIC_KEYS, `${path}.semantics`, issues)) return false;
  for (const [key, semantic] of Object.entries(value.semantics)) {
    if (typeof semantic !== "string" || semantic.length < 1 || semantic.length > 100) {
      issue(issues, "invalid-shape", `${path}.semantics.${key}`, "Semantic text must be a bounded non-empty string.");
    }
  }
  if (value.options !== undefined && (!Array.isArray(value.options) || value.options.length > 50 || value.options.some((item) => typeof item !== "string"))) {
    issue(issues, "invalid-shape", `${path}.options`, "Invalid bounded option captions.");
  }
  if (Array.isArray(value.options) && value.options.some((item) => item.length < 1 || item.length > 80)) {
    issue(issues, "invalid-shape", `${path}.options`, "Option captions must be bounded non-empty strings.");
  }
  for (const key of ["disabled", "readOnly", "required", "multiple"] as const) {
    if (typeof value[key] !== "boolean") issue(issues, "invalid-shape", `${path}.${key}`, "Expected boolean capability.");
  }
  const semanticCorpus = Object.values(value.semantics).filter((item): item is string => typeof item === "string").join(" ");
  if (FINAL_SUBMIT_PATTERN.test(semanticCorpus) && value.safety !== "final-submit") {
    issue(issues, "unsafe-control", `${path}.safety`, "A final-submit-looking control must be blocked.");
  }
  return true;
}

export function auditAtsObservation(value: unknown): AtsObservationAuditResult {
  const issues: AtsObservationAuditIssue[] = [];
  inspectKeysAndStrings(value, "$", issues);
  if (!exactKeys(value, ROOT_KEYS, "$", issues)) return { passed: false, issues };
  if (value.schemaVersion !== ATS_OBSERVATION_SCHEMA_VERSION) {
    issue(issues, "invalid-shape", "$.schemaVersion", "Unsupported ATS observation schema version.");
  }
  if (typeof value.capturedAt !== "string" || !Number.isFinite(Date.parse(value.capturedAt))) {
    issue(issues, "invalid-shape", "$.capturedAt", "Invalid capture timestamp.");
  }
  if (exactKeys(value.source, SOURCE_KEYS, "$.source", issues)) {
    try {
      const origin = new URL(String(value.source.origin));
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.origin !== value.source.origin) {
        throw new Error("unsafe");
      }
    }
    catch {
      issue(issues, "unsafe-source", "$.source.origin", "Origin must be credential-free HTTPS without a path or query.");
    }
    if (typeof value.source.pathTemplate !== "string" || !value.source.pathTemplate.startsWith("/") || /[?#]/.test(value.source.pathTemplate)) {
      issue(issues, "unsafe-source", "$.source.pathTemplate", "Path template must not contain query or fragment data.");
    }
    else if (/(?:^|\/)(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Za-z0-9_-]{16,})(?:\/|$)/i.test(value.source.pathTemplate)) {
      issue(issues, "unsafe-source", "$.source.pathTemplate", "Path identifiers must be replaced by templates.");
    }
    if (typeof value.source.language !== "string" || !/^(?:und|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2})$/.test(value.source.language)) {
      issue(issues, "invalid-shape", "$.source.language", "Invalid language tag.");
    }
    if (!PAGE_TYPES.has(String(value.source.pageType))) {
      issue(issues, "invalid-shape", "$.source.pageType", "Unsupported page type.");
    }
    if (typeof value.source.captureToolVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(value.source.captureToolVersion)) {
      issue(issues, "invalid-shape", "$.source.captureToolVersion", "Invalid capture tool version.");
    }
  }
  if (exactKeys(value.family, FAMILY_KEYS, "$.family", issues) && Array.isArray(value.family.evidence)) {
    if (typeof value.family.id !== "string" || !/^[a-z][a-z0-9-]{1,47}$/.test(value.family.id)) {
      issue(issues, "invalid-shape", "$.family.id", "Invalid ATS family id.");
    }
    if (typeof value.family.version !== "string" || !/^\d+(?:\.\d+){0,2}$/.test(value.family.version)) {
      issue(issues, "invalid-shape", "$.family.version", "Invalid ATS family version.");
    }
    if (typeof value.family.confidence !== "number" || !Number.isFinite(value.family.confidence) || value.family.confidence < 0 || value.family.confidence > 1) {
      issue(issues, "invalid-shape", "$.family.confidence", "Invalid ATS family confidence.");
    }
    if (value.family.evidence.length > 5) issue(issues, "invalid-shape", "$.family.evidence", "Too many family evidence items.");
    value.family.evidence.forEach((item, index) => {
      const path = `$.family.evidence[${index}]`;
      if (!exactKeys(item, EVIDENCE_KEYS, path, issues)) return;
      if (!FAMILY_EVIDENCE_KINDS.has(String(item.kind))) issue(issues, "invalid-shape", `${path}.kind`, "Invalid evidence kind.");
      if (typeof item.detail !== "string" || item.detail.length < 1 || item.detail.length > 80) {
        issue(issues, "invalid-shape", `${path}.detail`, "Evidence detail must be bounded.");
      }
    });
  }
  else if (isRecord(value.family)) {
    issue(issues, "invalid-shape", "$.family.evidence", "Family evidence must be an array.");
  }
  if (!Array.isArray(value.controls) || value.controls.length > 1_000) {
    issue(issues, "invalid-shape", "$.controls", "Controls must be a bounded array.");
  }
  const controls = Array.isArray(value.controls)
    ? value.controls.filter((control, index): control is AtsObservedControl => validControl(control, index, issues))
    : [];
  const keys = controls.map((control) => control.controlKey);
  if (new Set(keys).size !== keys.length) issue(issues, "duplicate-control", "$.controls", "Control keys must be unique.");
  const sections = Array.isArray(value.sections) ? value.sections : [];
  if (
    !Array.isArray(value.sections)
    || value.sections.length > 50
    || value.sections.some((section) => typeof section !== "string" || section.length < 1 || section.length > 80)
  ) {
    issue(issues, "invalid-shape", "$.sections", "Sections must be a bounded array of non-empty labels.");
  }
  if (new Set(sections).size !== sections.length) {
    issue(issues, "invalid-shape", "$.sections", "Section labels must be unique.");
  }
  if (exactKeys(value.summary, SUMMARY_KEYS, "$.summary", issues)) {
    for (const key of SUMMARY_KEYS) {
      if (!Number.isInteger(value.summary[key]) || Number(value.summary[key]) < 0) {
        issue(issues, "invalid-shape", `$.summary.${key}`, "Summary counts must be non-negative integers.");
      }
    }
    const expected = {
      controlCount: controls.length,
      blockedControlCount: controls.filter((control) => control.safety !== "ordinary").length,
      frameControlCount: controls.filter((control) => control.boundary === "same-origin-frame").length,
      openShadowControlCount: controls.filter((control) => control.boundary === "open-shadow").length,
      sectionCount: sections.length
    };
    for (const [key, count] of Object.entries(expected)) {
      if (value.summary[key] !== count) issue(issues, "summary-mismatch", `$.summary.${key}`, `Expected ${count}.`);
    }
  }
  if (exactKeys(value.privacy, PRIVACY_KEYS, "$.privacy", issues)) {
    for (const key of PRIVACY_KEYS) {
      if (value.privacy[key] !== false) issue(issues, "invalid-shape", `$.privacy.${key}`, "Privacy attestation must be false.");
    }
  }
  return { passed: issues.length === 0, issues };
}

export function assertShareableAtsObservation(value: unknown): asserts value is AtsObservation {
  const audit = auditAtsObservation(value);
  if (!audit.passed) {
    throw new Error(`ATS observation privacy audit failed: ${audit.issues.map((item) => `${item.path} ${item.message}`).join("; ")}`);
  }
}
