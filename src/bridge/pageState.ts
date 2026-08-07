import { EmbeddedCdpError, ensureAttached, sendDebuggerCommand } from "./opencliCdp";
import type {
  PageControlBoundary,
  PageControlRole,
  PageControlSafety,
  PageFindMatch,
  PageFindQuery,
  PageFindResult,
  PrivacySafeControl,
  PrivacySafePageState,
  PowerSessionView
} from "./protocol";

const MAX_DOM_NODES = 50_000;
const MAX_CONTROLS = 1_000;
const MAX_TEXT_LENGTH = 120;
const MAX_OPTIONS = 50;
const SAFE_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "email",
  "file",
  "image",
  "month",
  "number",
  "password",
  "radio",
  "range",
  "reset",
  "search",
  "submit",
  "tel",
  "text",
  "time",
  "url",
  "week"
]);
const INTERACTIVE_ROLES = new Set<PageControlRole>([
  "textbox",
  "combobox",
  "listbox",
  "option",
  "checkbox",
  "radio",
  "switch",
  "button",
  "link"
]);
const FILE_METADATA_PATTERN = /(?:^|[\s\\/])[^\\/\s]{1,80}\.(?:pdf|docx?|pptx?|xlsx?|png|jpe?g|gif|html?|zip|rar)(?=$|[\s,，;；:：)）])/i;
const UPLOAD_STATUS_PATTERN = /上次上传|上传时间|更新于|last\s+uploaded|last\s+modified/i;
const TIMESTAMP_PATTERN = /\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b/;
const DATE_DISPLAY_PATTERN = /^(?:19|20)\d{2}\s*(?:[-/.年])\s*(?:0?[1-9]|1[0-2])(?:\s*月)?(?:\s*(?:[-~至])\s*(?:19|20)?\d{0,4}\s*(?:[-/.年])?\s*(?:0?[1-9]|1[0-2])(?:\s*月)?)?$/;
const SECTION_BY_TECHNICAL_NAME: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(?:attachment_resume(?:_list)?)(?:\.|\[|$)/i, "简历"],
  [/^basic_info(?:\.|\[|$)/i, "基本信息"],
  [/^education(?:_list)?(?:\.|\[|$)/i, "教育经历"],
  [/^(?:internship|career)(?:_list)?(?:\.|\[|$)/i, "实习经历"],
  [/^(?:works?|portfolio)(?:_list)?(?:\.|\[|$)/i, "作品"],
  [/^project(?:_list)?(?:\.|\[|$)/i, "项目经历"],
  [/^award(?:_list)?(?:\.|\[|$)/i, "获奖"],
  [/^language(?:_list)?(?:\.|\[|$)/i, "语言能力"],
  [/^self_evaluation(?:\.|\[|$)/i, "自我评价"]
];
const SECTION_BY_CLASS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:^|\s)uploadResume(?:\s|$)/i, "简历"],
  [/(?:^|\s)resumeEditForm-(?:basic|base)(?:\s|$)/i, "基本信息"],
  [/(?:^|\s)resumeEditForm-education(?:\s|$)/i, "教育经历"],
  [/(?:^|\s)resumeEditForm-internship(?:\s|$)/i, "实习经历"],
  [/(?:^|\s)resumeEditForm-works?(?:\s|$)/i, "作品"],
  [/(?:^|\s)resumeEditForm-project(?:\s|$)/i, "项目经历"],
  [/(?:^|\s)resumeEditForm-award(?:\s|$)/i, "获奖"],
  [/(?:^|\s)resumeEditForm-language(?:\s|$)/i, "语言能力"],
  [/(?:^|\s)resumeEditForm-self(?:\s|$)/i, "自我评价"]
];
const KNOWN_SECTION_LABELS = new Map([
  ["简历", "简历"],
  ["基本信息", "基本信息"],
  ["教育经历", "教育经历"],
  ["实习经历", "实习经历"],
  ["作品", "作品"],
  ["项目经历", "项目经历"],
  ["获奖", "获奖"],
  ["语言能力", "语言能力"],
  ["自我评价", "自我评价"]
]);
const FORM_ITEM_CLASS_PATTERN = /form[-_]?item|form[-_]?field/i;
const FIELD_WRAPPER_CLASS_PATTERN = /field[-_]?wrapper/i;
const REQUIRED_CLASS_PATTERN = /(?:^|[\s_-])(?:is[\s_-]?)?required(?:[\s_-]|$)|required[\s_-]?(?:mark|field|item)/i;
const KNOWN_FIELD_LABELS = new Map<string, string>([
  ["简历附件", "简历附件"],
  ["上传简历", "简历附件"],
  ["姓名", "姓名"],
  ["手机号码", "手机号码"],
  ["手机号", "手机号码"],
  ["邮箱", "邮箱"],
  ["国籍（地区）", "国籍（地区）"],
  ["国籍", "国籍（地区）"],
  ["年龄", "年龄"],
  ["性别", "性别"],
  ["家乡", "家乡"],
  ["个人证件", "个人证件"],
  ["期望工作地点", "期望工作地点"],
  ["学校名称", "学校名称"],
  ["学历", "学历"],
  ["专业", "专业"],
  ["起止时间", "起止时间"],
  ["学历类型", "学历类型"],
  ["公司名称", "公司名称"],
  ["职位名称", "职位名称"],
  ["描述", "描述"],
  ["作品链接", "作品链接"],
  ["作品附件", "作品附件"],
  ["项目名称", "项目名称"],
  ["项目角色", "项目角色"],
  ["项目链接", "项目链接"],
  ["获奖名称", "获奖名称"],
  ["获奖时间", "获奖时间"],
  ["语言", "语言"],
  ["精通程度", "精通程度"],
  ["自我评价", "自我评价"]
]);

export interface CdpDomNode {
  backendNodeId?: number;
  nodeId?: number;
  nodeType?: number;
  nodeName?: string;
  localName?: string;
  nodeValue?: string;
  frameId?: string;
  attributes?: string[];
  children?: CdpDomNode[];
  shadowRoots?: CdpDomNode[];
  shadowRootType?: "user-agent" | "open" | "closed";
  contentDocument?: CdpDomNode;
  templateContent?: CdpDomNode;
}

interface ReferenceTarget {
  frameKey: string;
  backendNodeId: number;
}

interface FlatNode {
  node: CdpDomNode;
  parent: FlatNode | null;
  frameKey: string;
  boundary: PageControlBoundary;
}

interface FlattenedDocument {
  nodes: FlatNode[];
  frameKeys: Set<string>;
  openShadowRootCount: number;
}

function randomToken(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export class OpaqueReferenceRegistry {
  private sessionId = "";
  private readonly nonce: string;
  private readonly byTarget = new Map<string, string>();
  private readonly byReference = new Map<string, ReferenceTarget>();
  private referenceCounter = 0;
  private snapshotCounter = 0;

  constructor(createNonce: () => string = randomToken) {
    this.nonce = createNonce();
  }

  reference(sessionId: string, frameKey: string, backendNodeId: number): string {
    this.useSession(sessionId);
    const targetKey = `${frameKey}:${backendNodeId}`;
    const existing = this.byTarget.get(targetKey);
    if (existing) return existing;
    this.referenceCounter += 1;
    const ref = `node_${this.nonce}_${this.referenceCounter.toString(36).padStart(4, "0")}`;
    this.byTarget.set(targetKey, ref);
    this.byReference.set(ref, { frameKey, backendNodeId });
    return ref;
  }

  snapshot(sessionId: string): string {
    this.useSession(sessionId);
    this.snapshotCounter += 1;
    return `state_${this.nonce}_${this.snapshotCounter.toString(36).padStart(4, "0")}`;
  }

  resolve(sessionId: string, reference: string): ReferenceTarget | null {
    if (sessionId !== this.sessionId) return null;
    return this.byReference.get(reference) ?? null;
  }

  private useSession(sessionId: string): void {
    if (this.sessionId === sessionId) return;
    this.sessionId = sessionId;
    this.byTarget.clear();
    this.byReference.clear();
    this.referenceCounter = 0;
    this.snapshotCounter = 0;
  }
}

function attribute(node: CdpDomNode, wanted: string): string | undefined {
  const attributes = node.attributes ?? [];
  for (let index = 0; index + 1 < attributes.length; index += 2) {
    if (attributes[index]?.toLowerCase() === wanted) return attributes[index + 1] ?? "";
  }
  return undefined;
}

function hasAttribute(node: CdpDomNode, wanted: string): boolean {
  return attribute(node, wanted) !== undefined;
}

function sanitizeSemanticText(value: string | undefined, maxLength = MAX_TEXT_LENGTH): string {
  if (!value) return "";
  const normalized = value
    .replace(/https?:\/\/\S+/gi, "[链接]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[邮箱]")
    .replace(/\b\d{7,}\b/g, "[长数字]")
    .replace(/\s+/g, " ")
    .trim();
  if (
    FILE_METADATA_PATTERN.test(normalized)
    || UPLOAD_STATUS_PATTERN.test(normalized)
    || TIMESTAMP_PATTERN.test(normalized)
    || DATE_DISPLAY_PATTERN.test(normalized)
  ) return "";
  return normalized.slice(0, maxLength);
}

function nodeName(node: CdpDomNode): string {
  return (node.localName || node.nodeName || "").toLowerCase();
}

function safeInputType(node: CdpDomNode): string | undefined {
  if (nodeName(node) !== "input") return undefined;
  const rawType = (attribute(node, "type") || "text").toLowerCase();
  return SAFE_INPUT_TYPES.has(rawType) ? rawType : "text";
}

function flattenDocument(root: CdpDomNode): FlattenedDocument {
  const nodes: FlatNode[] = [];
  const frameKeys = new Set<string>();
  let openShadowRootCount = 0;
  let visited = 0;

  function visit(
    node: CdpDomNode,
    parent: FlatNode | null,
    inheritedFrameKey: string,
    boundary: PageControlBoundary
  ): void {
    visited += 1;
    if (visited > MAX_DOM_NODES) {
      throw new EmbeddedCdpError("bridge-failed", "页面结构过大，已停止只读扫描。");
    }
    const frameKey = node.frameId || inheritedFrameKey;
    frameKeys.add(frameKey);
    const current: FlatNode = { node, parent, frameKey, boundary };
    nodes.push(current);

    for (const child of node.children ?? []) visit(child, current, frameKey, boundary);
    for (const shadowRoot of node.shadowRoots ?? []) {
      if (shadowRoot.shadowRootType !== "open") continue;
      openShadowRootCount += 1;
      visit(shadowRoot, current, frameKey, "open-shadow");
    }
    if (node.contentDocument) {
      visit(node.contentDocument, current, node.contentDocument.frameId || frameKey, "same-origin-frame");
    }
    if (node.templateContent) visit(node.templateContent, current, frameKey, boundary);
  }

  visit(root, null, root.frameId || "main", "main");
  return { nodes, frameKeys, openShadowRootCount };
}

function textContent(node: CdpDomNode, maxLength = MAX_TEXT_LENGTH): string {
  const chunks: string[] = [];
  let length = 0;
  function collect(current: CdpDomNode): void {
    if (length >= maxLength) return;
    const name = nodeName(current);
    if (["script", "style", "noscript"].includes(name)) return;
    if (current.nodeType === 3 && current.nodeValue) {
      chunks.push(current.nodeValue);
      length += current.nodeValue.length;
    }
    for (const child of current.children ?? []) collect(child);
  }
  collect(node);
  return sanitizeSemanticText(chunks.join(" "), maxLength);
}

function closestAttribute(record: FlatNode, wanted: string, maxDepth = 20): string {
  let current: FlatNode | null = record;
  for (let depth = 0; current && depth <= maxDepth; depth += 1, current = current.parent) {
    const value = sanitizeSemanticText(attribute(current.node, wanted), 100);
    if (value) return value;
  }
  return "";
}

function closestFormItem(record: FlatNode, maxDepth = 20): FlatNode | null {
  let current: FlatNode | null = record;
  let weakWrapper: FlatNode | null = null;
  for (let depth = 0; current && depth <= maxDepth; depth += 1, current = current.parent) {
    const className = attribute(current.node, "class") || "";
    if (
      attribute(current.node, "data-form-field-name") !== undefined
      || attribute(current.node, "data-form-field-i18n-name") !== undefined
      || FORM_ITEM_CLASS_PATTERN.test(className)
    ) return current;
    if (!weakWrapper && FIELD_WRAPPER_CLASS_PATTERN.test(className)) weakWrapper = current;
  }
  return weakWrapper;
}

function normalizedKnownText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/^[*＊\s]+/, "")
    .replace(/[：:*＊\s]+$/, "")
    .replace(/\s+/g, "")
    .trim();
}

function canonicalKnownText(value: string, known: Map<string, string>): string {
  return known.get(normalizedKnownText(value)) || "";
}

function directSemanticText(node: CdpDomNode, maxLength = 40): string {
  return sanitizeSemanticText(
    (node.children ?? [])
      .filter((child) => child.nodeType === 3 && child.nodeValue)
      .map((child) => child.nodeValue)
      .join(" "),
    maxLength
  );
}

function knownTextsInSubtree(
  node: CdpDomNode,
  known: Map<string, string>,
  maxDepth: number
): Set<string> {
  const matches = new Set<string>();
  function visit(current: CdpDomNode, depth: number): void {
    if (depth > maxDepth || matches.size > 1) return;
    const match = canonicalKnownText(directSemanticText(current), known);
    if (match) matches.add(match);
    for (const child of current.children ?? []) visit(child, depth + 1);
  }
  visit(node, 0);
  return matches;
}

function logicalControlCountInSubtree(node: CdpDomNode, maxDepth: number): number {
  let count = 0;
  function visit(current: CdpDomNode, depth: number): void {
    if (depth > maxDepth || count > 2) return;
    const role = implicitRole(current);
    if (role && role !== "option") count += 1;
    for (const child of current.children ?? []) visit(child, depth + 1);
  }
  visit(node, 0);
  return count;
}

function nearestUniqueKnownText(
  record: FlatNode,
  known: Map<string, string>,
  maxAncestorDepth: number,
  maxSubtreeDepth: number
): string {
  let current: FlatNode | null = record;
  for (let depth = 0; current && depth <= maxAncestorDepth; depth += 1, current = current.parent) {
    // A page or section can contain one allow-listed caption alongside many
    // unrelated controls. Only use this fallback while the ancestor still
    // describes one logical field (or a two-control range).
    if (logicalControlCountInSubtree(current.node, maxSubtreeDepth) > 2) break;
    const matches = knownTextsInSubtree(current.node, known, maxSubtreeDepth);
    if (matches.size === 1) return [...matches][0]!;
  }
  return "";
}

function descendantAttribute(node: CdpDomNode, wanted: string, maxDepth = 12): string {
  function visit(current: CdpDomNode, depth: number): string {
    if (depth > maxDepth) return "";
    const value = attribute(current, wanted);
    if (value !== undefined) return value;
    for (const child of current.children ?? []) {
      const match = visit(child, depth + 1);
      if (match) return match;
    }
    return "";
  }
  return visit(node, 0);
}

function descendantTextByPredicate(
  node: CdpDomNode,
  predicate: (candidate: CdpDomNode) => boolean,
  maxDepth = 8
): string {
  function visit(current: CdpDomNode, depth: number): string {
    if (depth > maxDepth) return "";
    if (predicate(current)) {
      const text = textContent(current, 80);
      if (text) return text;
    }
    for (const child of current.children ?? []) {
      const match = visit(child, depth + 1);
      if (match) return match;
    }
    return "";
  }
  return visit(node, 0);
}

function formItemLabel(record: FlatNode): string {
  const context = closestFormItem(record);
  if (context) {
    const metadataLabel = sanitizeSemanticText(
      descendantAttribute(context.node, "data-form-field-i18n-name"),
      100
    );
    if (metadataLabel) return canonicalKnownText(metadataLabel, KNOWN_FIELD_LABELS) || metadataLabel;
    const structuralLabel = descendantTextByPredicate(context.node, (candidate) => {
      const candidateClass = attribute(candidate, "class") || "";
      return nodeName(candidate) === "label"
        || /form[-_]?item[-_\w]*label|form[-_]?field[-_\w]*label|field[-_\w]*label|label[-_\w]*text/i.test(candidateClass);
    }, 14);
    if (structuralLabel) {
      return canonicalKnownText(structuralLabel, KNOWN_FIELD_LABELS) || structuralLabel;
    }
  }
  return nearestUniqueKnownText(record, KNOWN_FIELD_LABELS, 12, 6);
}

function formItemTechnicalName(record: FlatNode): string {
  const context = closestFormItem(record);
  if (!context) return "";
  const metadataName = sanitizeSemanticText(
    descendantAttribute(context.node, "data-form-field-name"),
    80
  );
  if (metadataName) return metadataName;
  const nativeName = descendantAttribute(context.node, "name");
  return sanitizeSemanticText(nativeName, 80);
}

function sectionFromTechnicalName(value: string): string {
  for (const [pattern, label] of SECTION_BY_TECHNICAL_NAME) {
    if (pattern.test(value)) return label;
  }
  return "";
}

function sectionForRecord(record: FlatNode, technicalName = ""): string {
  const byName = sectionFromTechnicalName(technicalName);
  if (byName) return byName;
  let current: FlatNode | null = record;
  for (let depth = 0; current && depth <= 20; depth += 1, current = current.parent) {
    const className = attribute(current.node, "class") || "";
    for (const [pattern, label] of SECTION_BY_CLASS) {
      if (pattern.test(className)) return label;
    }
    if (["section", "fieldset"].includes(nodeName(current.node))) {
      const heading = descendantTextByPredicate(current.node, (candidate) =>
        ["h1", "h2", "h3", "h4", "legend"].includes(nodeName(candidate))
      );
      if (heading) return heading;
    }
    const knownSection = knownTextsInSubtree(current.node, KNOWN_SECTION_LABELS, 5);
    if (knownSection.size === 1) return [...knownSection][0]!;
  }
  return "";
}

function nodeHasRequiredMarker(node: CdpDomNode): boolean {
  if (hasAttribute(node, "required") || attribute(node, "aria-required") === "true") return true;
  for (const key of ["data-required", "data-form-field-required"]) {
    const value = attribute(node, key)?.toLowerCase();
    if (value === "" || value === "true" || value === "1" || value === "required") return true;
  }
  return REQUIRED_CLASS_PATTERN.test(attribute(node, "class") || "")
    || /^[*＊]$/.test(directSemanticText(node));
}

function descendantHasRequiredMarker(node: CdpDomNode, maxDepth = 8): boolean {
  function visit(current: CdpDomNode, depth: number): boolean {
    if (depth > maxDepth) return false;
    if (nodeHasRequiredMarker(current)) return true;
    return (current.children ?? []).some((child) => visit(child, depth + 1));
  }
  return visit(node, 0);
}

function hasRequiredMarker(record: FlatNode): boolean {
  let current: FlatNode | null = record;
  for (let depth = 0; current && depth <= 20; depth += 1, current = current.parent) {
    if (nodeHasRequiredMarker(current.node)) return true;
  }
  const context = closestFormItem(record);
  return context ? descendantHasRequiredMarker(context.node) : false;
}

function implicitRole(node: CdpDomNode): PageControlRole | null {
  const explicit = attribute(node, "role")?.toLowerCase() as PageControlRole | undefined;
  if (explicit && INTERACTIVE_ROLES.has(explicit)) return explicit;
  const name = nodeName(node);
  if (name === "textarea") return "textbox";
  if (name === "select") return hasAttribute(node, "multiple") ? "listbox" : "combobox";
  if (name === "button") return "button";
  if (name === "a" && attribute(node, "href") !== undefined) return "link";
  if (attribute(node, "contenteditable")?.toLowerCase() === "true") return "textbox";
  if (name !== "input") return null;
  const type = (attribute(node, "type") || "text").toLowerCase();
  if (type === "hidden") return null;
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  if (["button", "submit", "reset", "image"].includes(type)) return "button";
  return "textbox";
}

function publicTag(node: CdpDomNode): PrivacySafeControl["tag"] {
  const name = nodeName(node);
  if (name === "input" || name === "textarea" || name === "select" || name === "button" || name === "a") {
    return name;
  }
  if (attribute(node, "contenteditable")?.toLowerCase() === "true") return "contenteditable";
  return "custom";
}

function previousSemanticText(record: FlatNode, recordByNode: Map<CdpDomNode, FlatNode>): string {
  const parent = record.parent?.node;
  if (!parent) return "";
  const siblings = parent.children ?? [];
  const index = siblings.indexOf(record.node);
  if (index < 1) return "";
  const candidates: string[] = [];
  for (let offset = 1; offset <= 2 && index - offset >= 0; offset += 1) {
    const sibling = siblings[index - offset]!;
    const siblingRecord = recordByNode.get(sibling);
    if (!siblingRecord || implicitRole(sibling)) continue;
    const name = nodeName(sibling);
    if (!["div", "span", "p", "dt", "th", "legend", "h1", "h2", "h3", "h4", "h5", "h6"].includes(name)) continue;
    const text = textContent(sibling, 80);
    if (text) candidates.unshift(text);
  }
  return sanitizeSemanticText(candidates.join(" "));
}

function classifySafety(control: Omit<PrivacySafeControl, "ref" | "safety">): PageControlSafety {
  const corpus = sanitizeSemanticText([
    control.semantics.label,
    control.semantics.ariaLabel,
    control.semantics.placeholder,
    control.semantics.name,
    control.semantics.nearbyText
  ].filter(Boolean).join(" ")).toLowerCase();
  if (control.inputType === "password" || /密码|password|passcode/.test(corpus)) return "credential";
  if (/验证码|短信码|校验码|captcha|verification\s*code|sms\s*code|otp/.test(corpus)) return "verification";
  if (/身份证|护照|银行卡|社会信用|id\s*card|passport|bank\s*card/.test(corpus)) return "identity";
  if (control.inputType === "file") return "file";
  if (
    control.inputType === "submit"
    || /提交申请|提交简历|投递简历|最终提交|确认投递|立即申请|submit\s*application|final\s*submit|apply\s*now/.test(corpus)
  ) return "final-submit";
  return "ordinary";
}

function optionCaptions(node: CdpDomNode): string[] {
  const options: string[] = [];
  function collect(current: CdpDomNode): void {
    if (options.length >= MAX_OPTIONS) return;
    if (nodeName(current) === "option" || attribute(current, "role")?.toLowerCase() === "option") {
      const caption = textContent(current, 80);
      if (caption && !options.includes(caption)) options.push(caption);
    }
    for (const child of current.children ?? []) collect(child);
  }
  collect(node);
  return options;
}

function buildControls(
  flattened: FlattenedDocument,
  sessionId: string,
  registry: OpaqueReferenceRegistry
): PrivacySafeControl[] {
  const recordByNode = new Map(flattened.nodes.map((record) => [record.node, record]));
  const nodesById = new Map<string, CdpDomNode>();
  const labelByFor = new Map<string, string>();
  for (const record of flattened.nodes) {
    const id = attribute(record.node, "id");
    if (id) nodesById.set(id, record.node);
    if (nodeName(record.node) === "label") {
      const target = attribute(record.node, "for");
      const text = textContent(record.node);
      if (target && text) labelByFor.set(target, text);
    }
  }

  const controls: PrivacySafeControl[] = [];
  for (const record of flattened.nodes) {
    if (controls.length >= MAX_CONTROLS) break;
    const role = implicitRole(record.node);
    const backendNodeId = record.node.backendNodeId;
    if (!role || typeof backendNodeId !== "number") continue;
    if (hasAttribute(record.node, "hidden") || attribute(record.node, "aria-hidden") === "true") continue;

    const id = attribute(record.node, "id");
    const ariaLabel = sanitizeSemanticText(attribute(record.node, "aria-label"));
    const ariaLabelledBy = (attribute(record.node, "aria-labelledby") || "")
      .split(/\s+/)
      .map((labelId) => nodesById.get(labelId))
      .filter((node): node is CdpDomNode => Boolean(node))
      .map((node) => textContent(node, 80))
      .filter(Boolean)
      .join(" ");
    let wrappingLabel = "";
    let ancestor = record.parent;
    for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parent) {
      if (nodeName(ancestor.node) === "label") {
        wrappingLabel = textContent(ancestor.node);
        break;
      }
    }
    const ownText = role === "button" || role === "link" || role === "option"
      ? textContent(record.node)
      : "";
    const placeholder = sanitizeSemanticText(attribute(record.node, "placeholder"), 80);
    const formFieldName = closestAttribute(record, "data-form-field-name") || formItemTechnicalName(record);
    const metadataLabel = closestAttribute(record, "data-form-field-i18n-name");
    const itemLabel = formItemLabel(record);
    const technicalName = sanitizeSemanticText(attribute(record.node, "name") || formFieldName, 80);
    const section = sectionForRecord(record, technicalName || formFieldName);
    const nearbyText = previousSemanticText(record, recordByNode);
    const associatedLabel = id ? labelByFor.get(id) || "" : "";
    const rawLabel = sanitizeSemanticText(
      associatedLabel || metadataLabel || itemLabel || wrappingLabel || ariaLabelledBy || ariaLabel || ownText || placeholder || nearbyText
        || attribute(record.node, "title") || technicalName,
      100
    );
    const label = canonicalKnownText(rawLabel, KNOWN_FIELD_LABELS) || rawLabel;
    const inputType = safeInputType(record.node);
    const base: Omit<PrivacySafeControl, "ref" | "safety"> = {
      role,
      tag: publicTag(record.node),
      ...(inputType ? { inputType } : {}),
      semantics: {
        ...(label ? { label } : {}),
        ...(ariaLabel && ariaLabel !== label ? { ariaLabel } : {}),
        ...(placeholder && placeholder !== label ? { placeholder } : {}),
        ...(technicalName && technicalName !== label ? { name: technicalName } : {}),
        ...(nearbyText && nearbyText !== label ? { nearbyText } : {}),
        ...(section ? { section } : {})
      },
      ...(role === "combobox" || role === "listbox" ? { options: optionCaptions(record.node) } : {}),
      disabled: hasAttribute(record.node, "disabled") || attribute(record.node, "aria-disabled") === "true",
      readOnly: hasAttribute(record.node, "readonly") || attribute(record.node, "aria-readonly") === "true",
      required: hasRequiredMarker(record),
      multiple: hasAttribute(record.node, "multiple") || attribute(record.node, "aria-multiselectable") === "true",
      boundary: record.boundary
    };
    controls.push({
      ref: registry.reference(sessionId, record.frameKey, backendNodeId),
      ...base,
      safety: classifySafety(base)
    });
  }
  return controls;
}

function collectSections(flattened: FlattenedDocument, controls: PrivacySafeControl[]): string[] {
  const sections = new Set<string>();
  for (const record of flattened.nodes) {
    const knownHeading = canonicalKnownText(directSemanticText(record.node), KNOWN_SECTION_LABELS);
    if (knownHeading) sections.add(knownHeading);
    const section = sectionForRecord(record, closestAttribute(record, "data-form-field-name"));
    if (section) sections.add(section);
  }
  for (const control of controls) {
    if (control.semantics.section) sections.add(control.semantics.section);
  }
  return [...sections].slice(0, 50);
}

export function buildPrivacySafePageState(
  root: CdpDomNode,
  session: Pick<PowerSessionView, "sessionId" | "origin" | "path">,
  registry: OpaqueReferenceRegistry
): PrivacySafePageState {
  if (!session.sessionId || !session.origin || !session.path) {
    throw new EmbeddedCdpError("session-inactive", "请先连接当前 HTTPS 招聘页面。");
  }
  const flattened = flattenDocument(root);
  const controls = buildControls(flattened, session.sessionId, registry);
  const sections = collectSections(flattened, controls);
  return {
    snapshotId: registry.snapshot(session.sessionId),
    origin: session.origin,
    path: session.path,
    sections,
    controls,
    summary: {
      controlCount: controls.length,
      frameCount: flattened.frameKeys.size,
      openShadowRootCount: flattened.openShadowRootCount,
      blockedControlCount: controls.filter((control) => control.safety !== "ordinary").length,
      sectionCount: sections.length
    }
  };
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function scoreSignal(query: string, signal: string, weight: number): number {
  const wanted = normalized(query);
  const candidate = normalized(signal);
  if (!wanted || !candidate) return 0;
  if (wanted === candidate) return weight;
  if (candidate.includes(wanted)) return weight * 0.92;
  if (wanted.includes(candidate) && candidate.length >= 2) return weight * 0.76;
  const queryTokens = query.toLowerCase().split(/[\s,，/|]+/).map(normalized).filter(Boolean);
  if (queryTokens.length === 0) return 0;
  const matched = queryTokens.filter((token) => candidate.includes(token)).length;
  return matched > 0 ? weight * 0.68 * (matched / queryTokens.length) : 0;
}

export function findPageControls(state: PrivacySafePageState, query: PageFindQuery): PageFindResult {
  const roles = query.roles ? new Set(query.roles) : null;
  const matches: PageFindMatch[] = [];
  for (const control of state.controls) {
    if (roles && !roles.has(control.role)) continue;
    const signals: Array<[string, string | undefined, number]> = [
      ["字段标签", control.semantics.label, 1],
      ["ARIA 标签", control.semantics.ariaLabel, 0.98],
      ["占位提示", control.semantics.placeholder, 0.9],
      ["附近文字", control.semantics.nearbyText, 0.82],
      ["所在分组", control.semantics.section, 0.78],
      ["技术名称", control.semantics.name, 0.72],
      ["选项文字", control.options?.join(" "), 0.62]
    ];
    let score = 0;
    const reasons: string[] = [];
    for (const [reason, signal, weight] of signals) {
      if (!signal) continue;
      const candidate = scoreSignal(query.text, signal, weight);
      if (candidate > score) score = candidate;
      if (candidate >= 0.5) reasons.push(reason);
    }
    if (score < 0.25) continue;
    matches.push({
      ref: control.ref,
      role: control.role,
      label: control.semantics.label || control.semantics.ariaLabel || control.semantics.placeholder || control.semantics.name || "未命名控件",
      score: Number(score.toFixed(3)),
      reasons: reasons.slice(0, 3),
      safety: control.safety
    });
  }
  matches.sort((left, right) => right.score - left.score || left.label.localeCompare(right.label) || left.ref.localeCompare(right.ref));
  return {
    snapshotId: state.snapshotId,
    query: sanitizeSemanticText(query.text, 120),
    searchedControlCount: state.controls.length,
    matches: matches.slice(0, query.limit ?? 8)
  };
}

function secureLocation(rawUrl: string | undefined): { origin: string; path: string } {
  try {
    const url = new URL(rawUrl ?? "");
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe");
    return { origin: url.origin, path: url.pathname };
  }
  catch {
    throw new EmbeddedCdpError("unsupported-page", "只允许读取没有内嵌凭据的 HTTPS 页面结构。");
  }
}

export class PrivacySafePageStateService {
  constructor(private readonly registry = new OpaqueReferenceRegistry()) {}

  async read(session: PowerSessionView): Promise<PrivacySafePageState> {
    if (
      session.status !== "active"
      || typeof session.tabId !== "number"
      || !session.sessionId
      || !session.origin
      || !session.path
    ) {
      throw new EmbeddedCdpError("session-inactive", "请先连接当前 HTTPS 招聘页面。");
    }
    await ensureAttached(session.tabId);
    const before = secureLocation((await chrome.tabs.get(session.tabId)).url);
    if (before.origin !== session.origin) {
      throw new EmbeddedCdpError("origin-changed", "页面已切换到其他站点，结构读取已停止。");
    }
    const documentResult = await sendDebuggerCommand<{ root?: CdpDomNode }>({ tabId: session.tabId }, "DOM.getDocument", {
      depth: -1,
      pierce: true
    });
    if (!documentResult.root) throw new EmbeddedCdpError("bridge-failed", "浏览器没有返回页面结构。");
    const after = secureLocation((await chrome.tabs.get(session.tabId)).url);
    if (after.origin !== session.origin) {
      throw new EmbeddedCdpError("origin-changed", "页面在结构读取期间切换到了其他站点，已停止。");
    }
    return buildPrivacySafePageState(documentResult.root, { ...session, path: after.path }, this.registry);
  }

  async find(session: PowerSessionView, query: PageFindQuery): Promise<PageFindResult> {
    return findPageControls(await this.read(session), query);
  }
}
