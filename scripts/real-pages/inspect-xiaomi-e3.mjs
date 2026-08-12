import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const sessionFile = process.argv[2];
if (!sessionFile) throw new Error("usage: inspect-xiaomi-e3 <runtime-session.json>");

const record = JSON.parse(await readFile(sessionFile, "utf8"));
const cdpPort = record?.status?.cdpPort;
if (!Number.isInteger(cdpPort)) throw new Error("runtime_cdp_unavailable");

const targetsResponse = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
if (!targetsResponse.ok) throw new Error("runtime_target_list_failed");
const targets = await targetsResponse.json();
const target = targets.find((candidate) => {
  try {
    const url = new URL(candidate.url);
    return candidate.type === "page"
      && url.origin === "https://xiaomi.jobs.f.mioffice.cn"
      && /^\/internship\/resume\/[^/]+\/apply$/.test(url.pathname);
  }
  catch {
    return false;
  }
});
if (!target?.webSocketDebuggerUrl) throw new Error("xiaomi_application_target_missing");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const diagnosticEvents = [];
let sequence = 0;
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id && process.argv.includes("--diagnose-load")) {
    if (message.method === "Network.loadingFailed") {
      const errorText = String(message.params?.errorText ?? "");
      diagnosticEvents.push({
        kind: "network-failed",
        resourceType: message.params?.type ?? "unknown",
        error: /^net::ERR_[A-Z0-9_]+$/.test(errorText) ? errorText : "network_failed",
        canceled: Boolean(message.params?.canceled)
      });
    }
    if (message.method === "Network.responseReceived" && message.params?.response?.status >= 400) {
      let path = "[invalid-url]";
      try {
        const failedUrl = new URL(message.params.response.url);
        path = `${failedUrl.origin}${failedUrl.pathname.replace(/\d{6,}/g, ":id")}`;
      } catch {}
      diagnosticEvents.push({
        kind: "http-error",
        resourceType: message.params?.type ?? "unknown",
        status: message.params.response.status,
        path
      });
    }
    if (message.method === "Runtime.exceptionThrown") {
      diagnosticEvents.push({
        kind: "runtime-exception"
      });
    }
  }
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message ?? "cdp_command_failed"));
  else entry.resolve(message.result);
});
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  sequence += 1;
  const id = sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

if (process.argv.includes("--reload") || process.argv.includes("--diagnose-load")) {
  await send("Page.enable");
  if (process.argv.includes("--diagnose-load")) {
    await send("Network.enable");
    await send("Runtime.enable");
  }
  await send("Page.reload", { ignoreCache: false });
  await new Promise((resolve) => setTimeout(resolve, process.argv.includes("--diagnose-load") ? 8_000 : 5_000));
}

const renderResult = await send("Runtime.evaluate", {
  returnByValue: true,
  silent: true,
  expression: `(() => ({
    readyState: document.readyState,
    bodyChildCount: document.body?.children.length ?? 0,
    bodyTextLength: document.body?.innerText?.length ?? 0,
    formFieldMarkerCount: document.querySelectorAll('[data-form-field-name], [data-cy]').length,
    resumeSectionCount: document.querySelectorAll('[class*="resumeEditForm-"]').length,
    scriptCount: document.scripts.length,
    loadingMarkerCount: document.querySelectorAll('[class*="loading"], [class*="skeleton"], [class*="animation"]').length
  }))()`
});
const renderState = renderResult?.result?.value ?? {};

const { root } = await send("DOM.getDocument", { depth: -1, pierce: true });
if (!root) throw new Error("dom_document_missing");

const pageStateEntry = fileURLToPath(new URL("../../src/bridge/pageState.ts", import.meta.url));
const bundled = await build({
  entryPoints: [pageStateEntry],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
  logLevel: "silent"
});
const pageStateModuleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
const { buildPrivacySafePageState, OpaqueReferenceRegistry } = await import(pageStateModuleUrl);
const url = new URL(target.url);
const sessionId = `e3_${randomBytes(8).toString("hex")}`;
const registry = new OpaqueReferenceRegistry(() => randomBytes(8).toString("hex"));
const pageState = buildPrivacySafePageState(
  root,
  {
    sessionId,
    origin: url.origin,
    path: "/internship/resume/:id/apply"
  },
  registry
);

async function readPresence(control) {
  if (control.safety !== "ordinary") return "not_read_safety";
  const resolvedTarget = registry.resolve(sessionId, pageState.snapshotId, control.ref);
  if (!resolvedTarget) return "unknown";
  const resolvedNode = await send("DOM.resolveNode", { backendNodeId: resolvedTarget.backendNodeId });
  const objectId = resolvedNode?.object?.objectId;
  if (!objectId) return "unknown";
  const result = await send("Runtime.callFunctionOn", {
    objectId,
    returnByValue: true,
    silent: true,
    functionDeclaration: `function () {
      const presence = (node) => {
        const tag = String(node?.tagName || "").toLowerCase();
        const type = String(node?.type || "").toLowerCase();
        if (type === "checkbox" || type === "radio") return node.checked ? "filled" : "empty";
        if (tag === "input" || tag === "textarea" || tag === "select") {
          return String(node.value || "").trim() ? "filled" : "empty";
        }
        return "unknown";
      };
      const direct = presence(this);
      if (direct !== "unknown") return direct;
      const nested = this.querySelector?.("input:not([type=hidden]), textarea, select");
      const nestedPresence = presence(nested);
      if (nestedPresence !== "unknown") return nestedPresence;
      if (this.isContentEditable) return String(this.textContent || "").trim() ? "filled" : "empty";
      const selected = this.querySelector?.('[aria-selected="true"], [class*="selection-item"], [class*="selection-text"]');
      if (selected && String(selected.textContent || "").trim()) return "filled";
      const ariaValue = this.getAttribute?.("aria-valuetext") || this.getAttribute?.("data-value") || "";
      return String(ariaValue).trim() ? "filled" : "unknown";
    }`
  });
  const value = result?.result?.value;
  return value === "filled" || value === "empty" || value === "unknown" ? value : "unknown";
}

const inspectPresence = process.argv.includes("--presence");
if (pageState.controls.length < 2 || renderState.resumeSectionCount === 0) {
  socket.close();
  process.stdout.write(`${JSON.stringify({
    scope: "real-xiaomi-e3-read-only",
    status: "blocked",
    blocker: { code: "xiaomi_form_not_rendered" },
    origin: url.origin,
    path: "/internship/resume/:id/apply",
    browser: record.status.browser,
    browserVersion: record.status.browserVersion,
    renderState,
    diagnostics: diagnosticEvents.slice(0, 50),
    safety: {
      pageValueReadCount: 0,
      profileValueReadCount: 0,
      writeActionCount: 0,
      finalSubmitActionCount: 0,
      cookieReadCount: 0,
      rawDomPersisted: false
    }
  }, null, 2)}\n`);
  process.exitCode = 2;
  process.exit();
}
const controls = [];
for (let index = 0; index < pageState.controls.length; index += 1) {
  const control = pageState.controls[index];
  controls.push({
  fieldIndex: index + 1,
  role: control.role,
  tag: control.tag,
  ...(control.inputType ? { inputType: control.inputType } : {}),
  label: control.semantics.label
    || control.semantics.ariaLabel
    || control.semantics.placeholder
    || control.semantics.name
    || control.semantics.nearbyText
    || "[无可见标签]",
  ...(control.semantics.name ? { semanticName: control.semantics.name } : {}),
  required: control.required,
  disabled: control.disabled,
  readOnly: control.readOnly,
  multiple: control.multiple,
  boundary: control.boundary,
  safety: control.safety,
  optionCount: control.options?.length ?? 0,
  options: control.options ?? [],
  presence: inspectPresence ? await readPresence(control) : "not_read"
  });
}
socket.close();

function domAttribute(node, wanted) {
  const attributes = node.attributes ?? [];
  for (let index = 0; index + 1 < attributes.length; index += 2) {
    if (attributes[index]?.toLowerCase() === wanted) return attributes[index + 1] ?? "";
  }
  return undefined;
}

function domText(node) {
  const chunks = [];
  function visit(current) {
    if (current.nodeType === 3 && current.nodeValue) chunks.push(current.nodeValue);
    for (const child of current.children ?? []) visit(child);
  }
  visit(node);
  return chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, 40);
}

const repeatableDefinitions = [
  ["education", ["education_list", "education"], ["resumeEditForm-education"]],
  ["workExperiences", ["internship_list", "internship"], ["resumeEditForm-internship"]],
  ["workSamples", ["works_list", "works", "work"], ["resumeEditForm-work", "resumeEditForm-works"]],
  ["projects", ["project_list", "project"], ["resumeEditForm-project"]],
  ["awards", ["award_list", "award"], ["resumeEditForm-award"]],
  ["languages", ["language_list", "language"], ["resumeEditForm-language"]]
];
const structuralPaths = new Set();
const sectionRoots = new Map();
function inspectStructure(node) {
  const formName = domAttribute(node, "data-form-field-name");
  const dataCy = domAttribute(node, "data-cy");
  if (formName) structuralPaths.add(formName);
  if (dataCy) structuralPaths.add(dataCy);
  const classNames = (domAttribute(node, "class") ?? "").split(/\s+/).filter(Boolean);
  classNames.filter((name) => name.startsWith("resumeEditForm-"))
    .forEach((name) => sectionRoots.set(name, node));
  for (const child of node.children ?? []) inspectStructure(child);
  for (const shadowRoot of node.shadowRoots ?? []) inspectStructure(shadowRoot);
  if (node.contentDocument) inspectStructure(node.contentDocument);
}
inspectStructure(root);

function addControlsIn(rootNode) {
  if (!rootNode) return [];
  const matches = [];
  function visit(node) {
    const classNames = (domAttribute(node, "class") ?? "").split(/\s+/).filter(Boolean);
    if (classNames.includes("formOperate-addBtn") || classNames.includes("createFormSection-addBtn")) {
      const label = domText(node);
      if (/^(添加|新增)$/.test(label)) matches.push({ classNames, label });
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(rootNode);
  return matches;
}

const repeatableGroups = repeatableDefinitions.map(([key, aliases, expectedSectionClasses]) => {
  const indexes = new Set();
  for (const path of structuralPaths) {
    for (const alias of aliases) {
      const match = new RegExp(`^${alias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\[(\\d+)\\]`).exec(path);
      if (match) indexes.add(Number(match[1]));
    }
  }
  const sectionRoot = expectedSectionClasses.map((name) => sectionRoots.get(name)).find(Boolean);
  const addControls = addControlsIn(sectionRoot);
  return {
    key,
    pageCount: indexes.size,
    indexes: [...indexes].sort((left, right) => left - right),
    sectionPresent: Boolean(sectionRoot),
    addControlCount: addControls.length,
    addControlKinds: [...new Set(addControls.flatMap((control) => control.classNames)
      .filter((name) => name === "formOperate-addBtn" || name === "createFormSection-addBtn"))]
  };
});

const byRole = Object.fromEntries(
  [...new Set(controls.map((control) => control.role))]
    .sort()
    .map((role) => [role, controls.filter((control) => control.role === role).length])
);
const bySafety = Object.fromEntries(
  [...new Set(controls.map((control) => control.safety))]
    .sort()
    .map((safety) => [safety, controls.filter((control) => control.safety === safety).length])
);

process.stdout.write(`${JSON.stringify({
  scope: "real-xiaomi-e3-read-only",
  origin: url.origin,
  path: "/internship/resume/:id/apply",
  browser: record.status.browser,
  browserVersion: record.status.browserVersion,
  renderState,
  summary: {
    ...pageState.summary,
    byRole,
    bySafety
  },
  repeatableGroups,
  controls,
  safety: {
    pageValueReadCount: inspectPresence
      ? controls.filter((control) => control.presence !== "not_read_safety").length
      : 0,
    profileValueReadCount: 0,
    writeActionCount: 0,
    finalSubmitActionCount: 0,
    cookieReadCount: 0,
    rawDomPersisted: false
  }
}, null, 2)}\n`);
