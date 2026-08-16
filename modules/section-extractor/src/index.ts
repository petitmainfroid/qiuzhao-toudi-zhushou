import type { CdpDomNode } from "../../../shared/bridge/pageState";

export type PageSectionKind = "basic" | "education" | "work" | "internship" | "project" | "language" | "award" | "unknown";

export interface PageSection {
  ref: string;
  kind: PageSectionKind;
  heading: string;
  recordIndex?: number;
  controlRefs: string[];
}

export interface SectionExtractorOptions {
  /** Produces an opaque control reference; never return a selector or value. */
  referenceControl: (backendNodeId: number) => string;
}

interface FlatNode { node: CdpDomNode; parent: FlatNode | null; order: number; }

const SECTION_LABELS: Array<[PageSectionKind, RegExp]> = [
  ["education", /^(?:教育背景|教育经历|学历信息|education(?:al)?\s*(?:experience|background))$/i],
  ["internship", /^(?:实习经历|internship(?:\s*experience)?)$/i],
  ["work", /^(?:工作经历|工作经验|职业经历|work\s*experience|employment)$/i],
  ["project", /^(?:项目经验|项目经历|projects?)$/i],
  ["language", /^(?:语言能力|外语能力|languages?)$/i],
  ["award", /^(?:获奖经历|荣誉经历|奖项荣誉|awards?|honors?)$/i],
  ["basic", /^(?:个人信息|基本信息|联系方式|personal\s*(?:information|details)|contact)$/i]
];

function name(node: CdpDomNode): string { return (node.localName ?? node.nodeName ?? "").toLowerCase(); }
function attr(node: CdpDomNode, key: string): string {
  const attributes = node.attributes ?? [];
  for (let index = 0; index < attributes.length; index += 2) if (attributes[index] === key) return attributes[index + 1] ?? "";
  return "";
}
function directText(node: CdpDomNode): string {
  return (node.children ?? []).filter((child) => child.nodeType === 3).map((child) => child.nodeValue ?? "").join(" ").replace(/\s+/g, " ").trim().slice(0, 80);
}
function kindFor(label: string): PageSectionKind {
  return SECTION_LABELS.find(([, expression]) => expression.test(label))?.[0] ?? "unknown";
}
function interactive(node: CdpDomNode): boolean {
  if (typeof node.backendNodeId !== "number") return false;
  const tag = name(node); const role = attr(node, "role");
  return ["input", "textarea", "select", "button"].includes(tag)
    || ["textbox", "combobox", "listbox", "checkbox", "radio", "switch"].includes(role)
    || /date[^\s]*(?:info|range|period)/i.test(attr(node, "class"));
}
function descendantControls(root: FlatNode, referenceControl: (id: number) => string): string[] {
  const refs: string[] = []; const stack = [root.node];
  while (stack.length) {
    const node = stack.pop()!;
    if (interactive(node)) refs.push(referenceControl(node.backendNodeId!));
    stack.push(...(node.children ?? []), ...(node.shadowRoots ?? []));
  }
  return [...new Set(refs)];
}

function navigationHeading(record: FlatNode): boolean {
  for (let current: FlatNode | null = record; current; current = current.parent) {
    const tag = name(current.node);
    if (tag === "nav" || tag === "aside" || tag === "a" || tag === "button") return true;
    if (/(?:^|[\s_-])(?:sidebar|menu|tabs?|anchor|navigation)(?:[\s_-]|$)/i.test(attr(current.node, "class"))) return true;
    if (tag === "form" || tag === "body") break;
  }
  return false;
}

function fieldCaptionHeading(record: FlatNode): boolean {
  for (let current: FlatNode | null = record; current; current = current.parent) {
    const tag = name(current.node);
    const className = attr(current.node, "class");
    if (tag === "label" || /(?:^|[\s_-])(?:apply[-_]?field|form[-_]?item|form[-_]?field|field[-_]?wrapper)(?:[\s_-]|$)/i.test(className)) {
      return true;
    }
    if (attr(current.node, "data-form-field-name") || attr(current.node, "data-field-name")) return true;
    if (/(?:^|[\s_-])(?:block[-_]?title|section[-_]?title)(?:[\s_-]|$)/i.test(className)) return false;
    if (tag === "form" || tag === "body") break;
  }
  return false;
}

function containsOtherSectionHeading(
  root: CdpDomNode,
  ownHeading: CdpDomNode,
  recordByNode: ReadonlyMap<CdpDomNode, FlatNode>
): boolean {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    const record = recordByNode.get(node);
    if (node !== ownHeading && kindFor(directText(node)) !== "unknown"
      && record && !navigationHeading(record) && !fieldCaptionHeading(record)) return true;
    stack.push(...(node.children ?? []), ...(node.shadowRoots ?? []));
  }
  return false;
}

/** Extracts section boundaries from headings and their local form containers. */
export function extractPageSections(root: CdpDomNode, options: SectionExtractorOptions): PageSection[] {
  const flat: FlatNode[] = [];
  const visit = (node: CdpDomNode, parent: FlatNode | null) => {
    const record = { node, parent, order: flat.length }; flat.push(record);
    for (const child of node.children ?? []) visit(child, record);
    for (const shadow of node.shadowRoots ?? []) visit(shadow, record);
  };
  visit(root, null);
  const recordByNode = new Map(flat.map((record) => [record.node, record]));
  const headings = flat.flatMap((headingNode) => {
    const heading = directText(headingNode.node); const kind = kindFor(heading);
    return kind === "unknown" || navigationHeading(headingNode) || fieldCaptionHeading(headingNode)
      ? []
      : [{ ...headingNode, heading, kind }];
  });
  const counters = new Map<PageSectionKind, number>();
  const sections: PageSection[] = [];
  for (const headingNode of headings) {
    let container = headingNode.parent;
    let depth = 0;
    while (container && depth < 6) {
      if (containsOtherSectionHeading(container.node, headingNode.node, recordByNode)) { container = null; break; }
      if (descendantControls(container, options.referenceControl).length > 0) break;
      container = container.parent;
      depth += 1;
    }
    if (!container) continue;
    const controlRefs = descendantControls(container, options.referenceControl);
    if (controlRefs.length === 0) continue;
    const recordIndex = counters.get(headingNode.kind) ?? 0;
    counters.set(headingNode.kind, recordIndex + 1);
    sections.push({
      ref: `section_${headingNode.order}`,
      kind: headingNode.kind,
      heading: headingNode.heading,
      recordIndex,
      controlRefs: [...new Set(controlRefs)]
    });
  }
  return sections;
}
