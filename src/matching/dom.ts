import type { ControlKind, FieldDescriptor } from "./types";

const FIELD_ID_ATTRIBUTE = "data-qiuzhao-field-id";

type SupportedControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function labelText(label: HTMLLabelElement): string {
  const clone = label.cloneNode(true) as HTMLLabelElement;
  clone.querySelectorAll("input, textarea, select, button, [contenteditable='true']")
    .forEach((control) => control.remove());
  return cleanText(clone.textContent);
}

function textWithoutControls(element: Element | null): string {
  if (!element) return "";
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(
    "input, textarea, select, button, [contenteditable='true'], [role='listbox'], [role='option']"
  ).forEach((control) => control.remove());
  return cleanText(clone.textContent);
}

function closestFormItem(element: SupportedControl): Element | null {
  return element.closest("[data-form-field-name]")
    ?? element.closest(".atsx-form-item, .ud-form-item, .form-item, .form-group");
}

function kindFor(element: SupportedControl): ControlKind {
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return "select";
  if (element instanceof HTMLInputElement) {
    if (element.closest(".atsx-date-picker-period, [class*='date-picker-period']")) {
      return "date-range";
    }
    if (element.closest(".atsx-select, .ud-select, [role='combobox']")) {
      return "custom-select";
    }
    const type = element.type.toLowerCase();
    const supported = new Set<ControlKind>([
      "text", "email", "tel", "date", "month", "number", "radio", "checkbox",
      "file", "password", "hidden", "button"
    ]);
    if (["submit", "reset", "image"].includes(type)) return "button";
    return supported.has(type as ControlKind) ? (type as ControlKind) : "text";
  }
  if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
    return "contenteditable";
  }
  return "unknown";
}

function associatedLabel(element: SupportedControl): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const labels = Array.from(element.labels ?? [])
      .map(labelText)
      .filter(Boolean);
    if (labels.length > 0) return labels.join(" ");
  }

  const parentLabel = element.closest("label");
  if (parentLabel) return labelText(parentLabel);
  const formItem = closestFormItem(element);
  const dataLabel = cleanText(formItem?.getAttribute("data-form-field-i18n-name"));
  if (dataLabel) return dataLabel;
  const itemLabel = formItem?.querySelector(
    ".atsx-form-item-label label, .atsx-form-item-label, .ud-form-item-label label, .ud-form-item-label, [class*='form-item-label'] label, [class*='form-item-label']"
  );
  if (itemLabel) return textWithoutControls(itemLabel);
  return "";
}

function nearbyText(element: SupportedControl): string {
  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector(":scope > legend");
  const formItem = closestFormItem(element);
  const container = formItem ?? element.closest("[role='group'], .form-item, .form-group, .field, td, li");
  const section = element.closest(
    "[class*='resumeEditForm-'], [class*='applyFormModuleWrapper'], section, fieldset"
  );
  const sectionHeading = section?.querySelector(
    "h1, h2, h3, legend, [class*='formSection-title'], [class*='ModuleWrapper-title']"
  );
  const previous = element.previousElementSibling;
  return cleanText(
    [legend?.textContent, sectionHeading?.textContent, previous?.textContent, textWithoutControls(container)]
      .filter(Boolean)
      .join(" ")
  );
}

function radioGroupOptions(element: HTMLInputElement): string[] {
  if (element.type !== "radio" || !element.name) return [];
  const formRoot: ParentNode = element.form ?? document;
  return Array.from(formRoot.querySelectorAll<HTMLInputElement>("input[type='radio']"))
    .filter((radio) => radio.name === element.name)
    .map((radio) => {
      const label = associatedLabel(radio);
      return cleanText(label || radio.value);
    })
    .filter(Boolean);
}

function logicalLabel(element: SupportedControl): string {
  if (element instanceof HTMLInputElement && element.type === "radio") {
    const legend = element.closest("fieldset")?.querySelector(":scope > legend");
    const legendText = cleanText(legend?.textContent);
    if (legendText) return legendText;
  }
  return associatedLabel(element);
}

export function describeControl(element: SupportedControl, index: number): FieldDescriptor {
  const existingId = element.getAttribute(FIELD_ID_ATTRIBUTE);
  const elementId = existingId || `field-${Date.now().toString(36)}-${index}`;
  if (!existingId) element.setAttribute(FIELD_ID_ATTRIBUTE, elementId);

  const input = element instanceof HTMLInputElement ? element : null;
  const select = element instanceof HTMLSelectElement ? element : null;
  const formItem = closestFormItem(element);
  return {
    elementId,
    tagName: element.tagName.toLowerCase(),
    inputType: input?.type ?? "",
    kind: kindFor(element),
    label: logicalLabel(element),
    ariaLabel: cleanText(element.getAttribute("aria-label")),
    placeholder: cleanText(element.getAttribute("placeholder")),
    name: cleanText(
      element.getAttribute("name")
      || formItem?.getAttribute("data-form-field-name")
    ),
    domId: cleanText(element.id),
    autocomplete: cleanText(element.getAttribute("autocomplete")),
    contextText: nearbyText(element),
    options: select
      ? Array.from(select.options).map((option) => cleanText(option.textContent)).filter(Boolean)
      : input?.type === "radio"
        ? radioGroupOptions(input)
        : [],
    disabled: "disabled" in element ? Boolean(element.disabled) : false,
    readOnly: "readOnly" in element ? Boolean(element.readOnly) : false
  };
}

export function discoverFields(root: ParentNode = document): FieldDescriptor[] {
  const controls = Array.from(
    root.querySelectorAll<SupportedControl>(
      "input, textarea, select, [contenteditable='true']"
    )
  ).filter((element) => !element.closest("[hidden], [aria-hidden='true']"));
  const radioGroups = new Map<ParentNode, Set<string>>();
  const logicalControls = controls.filter((element) => {
    if (!(element instanceof HTMLInputElement) || element.type !== "radio" || !element.name) return true;
    const owner: ParentNode = element.form ?? root;
    const names = radioGroups.get(owner) ?? new Set<string>();
    if (names.has(element.name)) return false;
    names.add(element.name);
    radioGroups.set(owner, names);
    return true;
  });
  return logicalControls.map(describeControl);
}

export function findControlByElementId(elementId: string): SupportedControl | null {
  const safeId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(elementId)
    : elementId.replace(/["\\]/g, "\\$&");
  return document.querySelector<SupportedControl>(`[${FIELD_ID_ATTRIBUTE}="${safeId}"]`);
}
