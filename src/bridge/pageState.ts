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

export interface CdpDomNode {
  backendNodeId?: number;
  nodeId?: number;
  nodeType?: number;
  nodeName?: string;
  localName?: string;
  nodeValue?: string;
  frameId?: string;
  documentURL?: string;
  attributes?: string[];
  children?: CdpDomNode[];
  shadowRoots?: CdpDomNode[];
  shadowRootType?: "user-agent" | "open" | "closed";
  contentDocument?: CdpDomNode;
  templateContent?: CdpDomNode;
}

export interface ReferenceTarget {
  frameKey: string;
  backendNodeId: number;
  fingerprint: string;
  role: PageControlRole;
  tag: PrivacySafeControl["tag"];
  inputType?: string;
  safety: PageControlSafety;
  boundary: PageControlBoundary;
  disabled: boolean;
  readOnly: boolean;
  origin: string;
  path: string;
}

interface ReferenceRegistration extends Omit<ReferenceTarget, "origin" | "path"> {
  ref: string;
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
  private currentSnapshot: {
    id: string;
    sessionId: string;
    references: Map<string, ReferenceTarget>;
  } | null = null;
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
    return ref;
  }

  snapshot(
    sessionId: string,
    origin: string,
    path: string,
    registrations: ReferenceRegistration[]
  ): string {
    this.useSession(sessionId);
    this.snapshotCounter += 1;
    const id = `state_${this.nonce}_${this.snapshotCounter.toString(36).padStart(4, "0")}`;
    this.currentSnapshot = {
      id,
      sessionId,
      references: new Map(registrations.map(({ ref, ...target }) => [
        ref,
        { ...target, origin, path }
      ]))
    };
    return id;
  }

  resolve(sessionId: string, snapshotId: string, reference: string): ReferenceTarget | null {
    if (
      sessionId !== this.sessionId
      || this.currentSnapshot?.sessionId !== sessionId
      || this.currentSnapshot.id !== snapshotId
    ) return null;
    return this.currentSnapshot.references.get(reference) ?? null;
  }

  invalidate(): void {
    this.currentSnapshot = null;
  }

  private useSession(sessionId: string): void {
    if (this.sessionId === sessionId) return;
    this.sessionId = sessionId;
    this.byTarget.clear();
    this.currentSnapshot = null;
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
  const containsFileMetadata = /\.(?:pdf|docx?|rtf|txt|odt)\b|上次上传|最近上传|last\s+uploaded/iu.test(value);
  let sanitized = value
    .replace(/https?:\/\/\S+/gi, "[链接]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[邮箱]")
    .replace(/\b\d{7,}\b/g, "[长数字]");
  if (containsFileMetadata) {
    sanitized = sanitized
      .replace(/[^\s<>:"/\\|?*]{1,80}\.(?:pdf|docx?|rtf|txt|odt)\b/giu, "[文件]")
      .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/g, "[时间]");
  }
  return sanitized
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeTechnicalFieldName(value: string | undefined): string {
  if (!value || value.length > MAX_TEXT_LENGTH) return "";
  return /^(?=.{1,120}$)[A-Za-z][A-Za-z0-9_.-]*(?:\[\d+\][A-Za-z0-9_.-]*)*$/.test(value)
    ? value
    : "";
}

function nearestFieldMetadata(record: FlatNode): { name: string; label: string } {
  let current: FlatNode | null = record;
  for (let depth = 0; current && depth < 8; depth += 1, current = current.parent) {
    const name = safeTechnicalFieldName(attribute(current.node, "data-form-field-name"));
    const label = sanitizeSemanticText(attribute(current.node, "data-form-field-i18n-name"), 80);
    if (name || label) return { name, label };
  }
  return { name: "", label: "" };
}

function fixedDateRangeRoot(node: CdpDomNode): boolean {
  if (hasAttribute(node, "data-date-range")) return true;
  const className = attribute(node, "class") ?? "";
  return /(?:^|\s)atsx-date-picker-period(?:-month)?(?:\s|$)/.test(className)
    || /date-picker-period|date-range|daterange/i.test(className);
}

function fixedDateRangeInputs(record: FlatNode): CdpDomNode[] {
  if (!fixedDateRangeRoot(record.node) || !nearestFieldMetadata(record).name) return [];
  const inputs: CdpDomNode[] = [];
  function collect(node: CdpDomNode): void {
    if (nodeName(node) === "input") {
      const type = safeInputType(node);
      if (
        typeof node.backendNodeId === "number"
        && (type === "date" || type === "month" || type === "text")
        && !hasAttribute(node, "disabled")
        && !hasAttribute(node, "readonly")
        && !hasAttribute(node, "hidden")
        && attribute(node, "aria-hidden") !== "true"
      ) inputs.push(node);
    }
    for (const child of node.children ?? []) collect(child);
  }
  collect(record.node);
  return inputs.length === 2 ? inputs : [];
}

function nodeName(node: CdpDomNode): string {
  return (node.localName || node.nodeName || "").toLowerCase();
}

function safeInputType(node: CdpDomNode): string | undefined {
  if (nodeName(node) !== "input") return undefined;
  const rawType = (attribute(node, "type") || "text").toLowerCase();
  return SAFE_INPUT_TYPES.has(rawType) ? rawType : "text";
}

function hasAncestor(record: FlatNode, name: string): boolean {
  let ancestor = record.parent;
  while (ancestor) {
    if (nodeName(ancestor.node) === name) return true;
    ancestor = ancestor.parent;
  }
  return false;
}

function controlInputType(record: FlatNode): string | undefined {
  const inputType = safeInputType(record.node);
  if (inputType) return inputType;
  if (nodeName(record.node) !== "button") return undefined;
  const rawType = attribute(record.node, "type")?.toLowerCase();
  if (rawType === "button" || rawType === "reset" || rawType === "submit") return rawType;
  return hasAncestor(record, "form") ? "submit" : "button";
}

function documentOrigin(rawUrl: string | undefined): string | null {
  try {
    const url = new URL(rawUrl ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : null;
  }
  catch {
    return null;
  }
}

function flattenDocument(root: CdpDomNode, topOrigin: string): FlattenedDocument {
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
      const childOrigin = documentOrigin(node.contentDocument.documentURL);
      if (childOrigin === topOrigin) {
        visit(node.contentDocument, current, node.contentDocument.frameId || frameKey, "same-origin-frame");
      }
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

function implicitRole(node: CdpDomNode): PageControlRole | null {
  const explicit = attribute(node, "role")?.toLowerCase() as PageControlRole | undefined;
  if (explicit && INTERACTIVE_ROLES.has(explicit)) return explicit;
  const name = nodeName(node);
  if (name === "textarea") return "textbox";
  if (name === "select") return hasAttribute(node, "multiple") ? "listbox" : "combobox";
  if (name === "button") return "button";
  if (name === "a" && attribute(node, "href") !== undefined) return "link";
  if (isContentEditableNode(node)) return "textbox";
  if (name !== "input") return null;
  const type = (attribute(node, "type") || "text").toLowerCase();
  if (type === "hidden") return null;
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  if (["button", "submit", "reset", "image"].includes(type)) return "button";
  return "textbox";
}

function isContentEditableNode(node: CdpDomNode): boolean {
  const value = attribute(node, "contenteditable");
  if (value === undefined) return false;
  return value === "" || value.toLowerCase() === "true" || value.toLowerCase() === "plaintext-only";
}

function labelText(node: CdpDomNode, maxLength = MAX_TEXT_LENGTH): string {
  const chunks: string[] = [];
  let length = 0;
  function collect(current: CdpDomNode, isRoot: boolean): void {
    if (length >= maxLength) return;
    const name = nodeName(current);
    if (["script", "style", "noscript"].includes(name)) return;
    // A wrapping label may contain a textarea/select whose text nodes are user
    // data or option captions. Neither is part of the field label.
    if (!isRoot && implicitRole(current)) return;
    if (current.nodeType === 3 && current.nodeValue) {
      chunks.push(current.nodeValue);
      length += current.nodeValue.length;
    }
    for (const child of current.children ?? []) collect(child, false);
  }
  collect(node, true);
  return sanitizeSemanticText(chunks.join(" "), maxLength);
}

function publicTag(node: CdpDomNode): PrivacySafeControl["tag"] {
  const name = nodeName(node);
  if (name === "input" || name === "textarea" || name === "select" || name === "button" || name === "a") {
    return name;
  }
  if (isContentEditableNode(node)) return "contenteditable";
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

function classifySafety(
  control: Omit<PrivacySafeControl, "ref" | "safety">,
  internalSignals = ""
): PageControlSafety {
  const corpus = sanitizeSemanticText([
    control.semantics.label,
    control.semantics.ariaLabel,
    control.semantics.placeholder,
    control.semantics.name,
    control.semantics.nearbyText,
    internalSignals
  ].filter(Boolean).join(" ")).toLowerCase();
  if (control.inputType === "password" || /current-password|new-password/.test(corpus)) return "credential";
  if (
    /验证码|短信码|校验码|动态码|动态口令|图形码|captcha|verification\s*code|sms\s*code|one-time-code|otp/.test(corpus)
  ) return "verification";
  if (/密码|口令|password|passcode/.test(corpus)) return "credential";
  if (
    /身份证|证件号|护照|银行卡|社会信用|驾驶证|税号|id\s*card|identity|passport|bank\s*card|ssn|tax\s*id/.test(corpus)
  ) return "identity";
  if (control.inputType === "file") return "file";
  if (
    control.inputType === "reset"
    || /删除|清空|重置|撤回|取消申请|注销|delete|remove|clear\s*all|reset|withdraw|cancel\s*application/.test(corpus)
  ) return "destructive";
  if (
    (control.role === "checkbox" || control.role === "switch")
    && /隐私|条款|协议|授权|同意|privacy|terms|agreement|consent|authorize/.test(corpus)
  ) return "consent";
  if (
    control.inputType === "submit"
    || control.inputType === "image"
    || /提交申请|最终提交|确认投递|立即申请|发送申请|submit\s*application|final\s*submit|apply\s*now|send\s*application/.test(corpus)
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

function associatedOptionCaptions(node: CdpDomNode, nodesById: Map<string, CdpDomNode>): string[] {
  const options = optionCaptions(node);
  const associatedIds = [attribute(node, "aria-controls"), attribute(node, "aria-owns")]
    .filter(Boolean)
    .flatMap((value) => value!.split(/\s+/).filter(Boolean));
  for (const id of associatedIds) {
    const associated = nodesById.get(id);
    if (!associated) continue;
    for (const caption of optionCaptions(associated)) {
      if (!options.includes(caption)) options.push(caption);
      if (options.length >= MAX_OPTIONS) return options;
    }
  }
  return options;
}

export interface InspectedControlTarget {
  frameKey: string;
  backendNodeId: number;
  fingerprint: string;
  control: Omit<PrivacySafeControl, "ref">;
}

function fingerprintControl(control: Omit<PrivacySafeControl, "ref">): string {
  return JSON.stringify({
    role: control.role,
    tag: control.tag,
    inputType: control.inputType ?? "",
    semantics: control.semantics,
    options: control.options ?? [],
    disabled: control.disabled,
    readOnly: control.readOnly,
    required: control.required,
    multiple: control.multiple,
    boundary: control.boundary,
    safety: control.safety
  });
}

function inspectControls(flattened: FlattenedDocument): InspectedControlTarget[] {
  const recordByNode = new Map(flattened.nodes.map((record) => [record.node, record]));
  const nodesById = new Map<string, CdpDomNode>();
  const labelByFor = new Map<string, string>();
  const dateRangeRoots = new Map<CdpDomNode, CdpDomNode[]>();
  const dateRangeInputIds = new Set<number>();
  for (const record of flattened.nodes) {
    const id = attribute(record.node, "id");
    if (id) nodesById.set(id, record.node);
    if (nodeName(record.node) === "label") {
      const target = attribute(record.node, "for");
      const text = labelText(record.node);
      if (target && text) labelByFor.set(target, text);
    }
    const inputs = fixedDateRangeInputs(record);
    if (inputs.length === 2) {
      dateRangeRoots.set(record.node, inputs);
      inputs.forEach((input) => dateRangeInputIds.add(input.backendNodeId!));
    }
  }

  const controls: InspectedControlTarget[] = [];
  for (const record of flattened.nodes) {
    if (controls.length >= MAX_CONTROLS) break;
    const dateRangeInputs = dateRangeRoots.get(record.node);
    if (dateRangeInputs) {
      const backendNodeId = record.node.backendNodeId;
      if (typeof backendNodeId !== "number") continue;
      const metadata = nearestFieldMetadata(record);
      const label = metadata.label || previousSemanticText(record, recordByNode) || metadata.name;
      const base: Omit<PrivacySafeControl, "ref" | "safety"> = {
        role: "textbox",
        tag: "custom",
        semantics: {
          ...(label ? { label } : {}),
          name: metadata.name
        },
        disabled: dateRangeInputs.some((input) => hasAttribute(input, "disabled")),
        readOnly: dateRangeInputs.some((input) => hasAttribute(input, "readonly")),
        required: dateRangeInputs.some((input) => hasAttribute(input, "required")),
        multiple: false,
        boundary: record.boundary
      };
      const control = { ...base, safety: classifySafety(base) };
      controls.push({
        frameKey: record.frameKey,
        backendNodeId,
        fingerprint: fingerprintControl(control),
        control
      });
      continue;
    }
    const role = implicitRole(record.node);
    const backendNodeId = record.node.backendNodeId;
    if (!role || typeof backendNodeId !== "number") continue;
    if (dateRangeInputIds.has(backendNodeId)) continue;
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
        wrappingLabel = labelText(ancestor.node);
        break;
      }
    }
    const ownText = role === "button" || role === "link" || role === "option"
      ? textContent(record.node)
      : "";
    const placeholder = sanitizeSemanticText(attribute(record.node, "placeholder"), 80);
    const fieldMetadata = nearestFieldMetadata(record);
    const technicalName = sanitizeSemanticText(attribute(record.node, "name"), 80) || fieldMetadata.name;
    const nearbyText = previousSemanticText(record, recordByNode);
    const associatedLabel = id ? labelByFor.get(id) || "" : "";
    const label = sanitizeSemanticText(
      associatedLabel || wrappingLabel || ariaLabelledBy || ariaLabel || ownText || placeholder
        || fieldMetadata.label || nearbyText
        || attribute(record.node, "title") || technicalName,
      100
    );
    const inputType = controlInputType(record);
    const base: Omit<PrivacySafeControl, "ref" | "safety"> = {
      role,
      tag: publicTag(record.node),
      ...(inputType ? { inputType } : {}),
      semantics: {
        ...(label ? { label } : {}),
        ...(ariaLabel && ariaLabel !== label ? { ariaLabel } : {}),
        ...(placeholder && placeholder !== label ? { placeholder } : {}),
        ...(technicalName && technicalName !== label ? { name: technicalName } : {}),
        ...(nearbyText && nearbyText !== label ? { nearbyText } : {})
      },
      ...(role === "combobox" || role === "listbox"
        ? { options: associatedOptionCaptions(record.node, nodesById) }
        : {}),
      disabled: hasAttribute(record.node, "disabled") || attribute(record.node, "aria-disabled") === "true",
      readOnly: hasAttribute(record.node, "readonly") || attribute(record.node, "aria-readonly") === "true",
      required: hasAttribute(record.node, "required") || attribute(record.node, "aria-required") === "true",
      multiple: hasAttribute(record.node, "multiple") || attribute(record.node, "aria-multiselectable") === "true",
      ...(["true", "false"].includes(attribute(record.node, "aria-expanded") ?? "")
        ? { expanded: attribute(record.node, "aria-expanded") === "true" }
        : {}),
      boundary: record.boundary
    };
    const safety = classifySafety(base, [
      attribute(record.node, "autocomplete"),
      attribute(record.node, "data-purpose"),
      attribute(record.node, "data-action")
    ].filter(Boolean).join(" "));
    const control = {
      ...base,
      safety
    };
    controls.push({
      frameKey: record.frameKey,
      backendNodeId,
      fingerprint: fingerprintControl(control),
      control
    });
  }
  return controls;
}

function buildControls(
  flattened: FlattenedDocument,
  sessionId: string,
  registry: OpaqueReferenceRegistry
): { controls: PrivacySafeControl[]; registrations: ReferenceRegistration[] } {
  const inspected = inspectControls(flattened);
  const registrations: ReferenceRegistration[] = [];
  const controls = inspected.map((target) => {
    const ref = registry.reference(sessionId, target.frameKey, target.backendNodeId);
    registrations.push({
      ref,
      frameKey: target.frameKey,
      backendNodeId: target.backendNodeId,
      fingerprint: target.fingerprint,
      role: target.control.role,
      tag: target.control.tag,
      ...(target.control.inputType ? { inputType: target.control.inputType } : {}),
      safety: target.control.safety,
      boundary: target.control.boundary,
      disabled: target.control.disabled,
      readOnly: target.control.readOnly
    });
    return { ref, ...target.control };
  });
  return { controls, registrations };
}

export function inspectControlTarget(
  root: CdpDomNode,
  origin: string,
  frameKey: string,
  backendNodeId: number
): InspectedControlTarget | null {
  const flattened = flattenDocument(root, origin);
  return inspectControls(flattened).find((target) =>
    target.frameKey === frameKey && target.backendNodeId === backendNodeId
  ) ?? null;
}

export function buildPrivacySafePageState(
  root: CdpDomNode,
  session: Pick<PowerSessionView, "sessionId" | "origin" | "path">,
  registry: OpaqueReferenceRegistry
): PrivacySafePageState {
  if (!session.sessionId || !session.origin || !session.path) {
    throw new EmbeddedCdpError("session-inactive", "请先连接当前 HTTPS 招聘页面。");
  }
  const flattened = flattenDocument(root, session.origin);
  const { controls, registrations } = buildControls(flattened, session.sessionId, registry);
  return {
    snapshotId: registry.snapshot(session.sessionId, session.origin, session.path, registrations),
    origin: session.origin,
    path: session.path,
    controls,
    summary: {
      controlCount: controls.length,
      frameCount: flattened.frameKeys.size,
      openShadowRootCount: flattened.openShadowRootCount,
      blockedControlCount: controls.filter((control) => control.safety !== "ordinary").length
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
  constructor(public readonly registry = new OpaqueReferenceRegistry()) {}

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
