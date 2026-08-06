import { normalizeFieldText } from "../matching/normalize";

export type PageControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

export type PageWriteFailureReason =
  | "detached"
  | "blocked-control"
  | "disabled-or-readonly"
  | "hidden-control"
  | "option-not-found"
  | "unsupported-control"
  | "verification-failed";

export interface VerifiedPageWrite {
  status: "verified" | "failed";
  attempts: number;
  reason?: PageWriteFailureReason;
}

export interface PageWriteOptions {
  normalize?: (value: string) => string;
  maxAttempts?: number;
  optionTimeoutMs?: number;
  verificationTimeoutMs?: number;
}

const BLOCKED_INPUT_TYPES = new Set([
  "file", "password", "hidden", "submit", "reset", "button", "image", "checkbox"
]);
const CUSTOM_SELECT_SELECTOR = ".atsx-select, .ud-select, .ant-select, .el-select, [role='combobox']";
const OPTION_SELECTOR = [
  "[role='option']",
  ".atsx-select-dropdown-menu-item",
  ".ud-select-option",
  ".ant-select-item-option",
  ".el-select-dropdown__item"
].join(", ");
const SELECTED_OPTION_SELECTOR = [
  ".selected-value",
  ".atsx-select-selection-selected-value",
  ".ant-select-selection-item",
  ".el-select__selected-item",
  "[data-selected='true']",
  "[aria-selected='true']"
].join(", ");

function customSelectRoot(element: Element): HTMLElement | null {
  return element.closest<HTMLElement>(".atsx-select, .ud-select, .ant-select, .el-select")
    ?? element.closest<HTMLElement>("[role='combobox']");
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value!)));
}

function isDateRangeInput(element: PageControl): element is HTMLInputElement {
  return element instanceof HTMLInputElement
    && Boolean(element.closest(".atsx-date-picker-period, [class*='date-picker-period']"));
}

function parseDateRange(value: string): { start: string; end: string } | null {
  try {
    const parsed = JSON.parse(value) as { start?: unknown; end?: unknown };
    if (typeof parsed.start !== "string" || typeof parsed.end !== "string") return null;
    if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(parsed.start) || !/^\d{4}-\d{2}(?:-\d{2})?$/.test(parsed.end)) {
      return null;
    }
    return { start: parsed.start, end: parsed.end };
  }
  catch {
    return null;
  }
}

function dateRangeVisibleStateMatches(element: HTMLInputElement, value: string): boolean {
  const expected = parseDateRange(value);
  const actual = parseDateRange(element.value);
  if (!expected || !actual || actual.start !== expected.start || actual.end !== expected.end) return false;
  const root = element.closest<HTMLElement>(
    ".atsx-date-picker.atsx-date-picker-period-month, .atsx-date-picker.atsx-date-picker-period, [data-date-range]"
  );
  if (!root) return false;
  const visibleDigits = (root.textContent ?? "").replace(/\D/g, "");
  const startDigits = expected.start.replace(/\D/g, "").slice(0, 6);
  const endDigits = expected.end.replace(/\D/g, "").slice(0, 6);
  const startIndex = visibleDigits.indexOf(startDigits);
  const endIndex = visibleDigits.indexOf(endDigits, Math.max(0, startIndex + startDigits.length));
  return startIndex >= 0 && endIndex >= 0;
}

function controlUnavailable(element: PageControl): PageWriteFailureReason | null {
  if (!element.isConnected) return "detached";
  if (element.closest("[hidden], [aria-hidden='true']")) return "hidden-control";
  if (element instanceof HTMLInputElement) {
    if (BLOCKED_INPUT_TYPES.has(element.type.toLowerCase())) return "blocked-control";
    if (element.disabled || element.readOnly) return "disabled-or-readonly";
  }
  else if (element instanceof HTMLTextAreaElement) {
    if (element.disabled || element.readOnly) return "disabled-or-readonly";
  }
  else if (element instanceof HTMLSelectElement) {
    if (element.disabled) return "disabled-or-readonly";
  }
  const style = typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  if (!isDateRangeInput(element) && style && (style.display === "none" || style.visibility === "hidden")) {
    return "hidden-control";
  }
  return null;
}

function selectedCustomValues(element: HTMLInputElement): string[] {
  const root = customSelectRoot(element);
  if (!root) return [];
  const values = Array.from(root.querySelectorAll<HTMLElement>(SELECTED_OPTION_SELECTOR))
    .map((item) => item.textContent?.trim() ?? "")
    .filter(Boolean);
  if (customSelectIsMultiple(root) && values.length > 0) values.push(values.join("、"));
  return values;
}

export function readControlCandidates(element: PageControl): string[] | null {
  if (element instanceof HTMLInputElement) {
    if (BLOCKED_INPUT_TYPES.has(element.type.toLowerCase())) return null;
    if (element.type === "radio") {
      if (!element.name) return null;
      const formRoot: ParentNode = element.form ?? document;
      const checked = Array.from(formRoot.querySelectorAll<HTMLInputElement>("input[type='radio']"))
        .find((radio) => radio.name === element.name && radio.checked);
      if (!checked) return [];
      return [checked.value, checked.labels?.[0]?.textContent ?? ""].filter((value) => value.trim());
    }
    if (element.closest(CUSTOM_SELECT_SELECTOR)) return selectedCustomValues(element);
    return element.value.trim() ? [element.value] : [];
  }
  if (element instanceof HTMLTextAreaElement) return element.value.trim() ? [element.value] : [];
  if (element instanceof HTMLSelectElement) {
    if (!element.multiple && !element.value.trim()) return [];
    const selected = Array.from(element.selectedOptions)
      .flatMap((option) => [option.value, option.textContent ?? ""])
      .filter((value) => value.trim());
    if (element.multiple) {
      const labels = Array.from(element.selectedOptions)
        .map((option) => (option.textContent || option.value).trim())
        .filter(Boolean);
      if (labels.length > 0) selected.push(labels.join("、"));
    }
    return selected;
  }
  if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
    const value = element.textContent ?? "";
    return value.trim() ? [value] : [];
  }
  return null;
}

function dispatchInputEvents(element: HTMLElement, value: string): void {
  if (typeof InputEvent === "function") {
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: false,
      data: value,
      inputType: "insertText"
    }));
  }
  else {
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: false }));
}

function dispatchBeforeInput(element: HTMLElement, value: string): void {
  if (typeof InputEvent !== "function") return;
  element.dispatchEvent(new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: value,
    inputType: "insertText"
  }));
}

function setNativeTextValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
}

function splitMultiValue(value: string): string[] {
  return [...new Set(value.split(/[\n,，、;；]+/).map((item) => item.trim()).filter(Boolean))];
}

function exactOption(options: Iterable<HTMLOptionElement>, value: string): HTMLOptionElement | undefined {
  const target = normalizeFieldText(value);
  return Array.from(options).find((option) =>
    [option.value, option.textContent ?? ""].some((candidate) => normalizeFieldText(candidate) === target)
  );
}

function fillNativeSelect(element: HTMLSelectElement, value: string): boolean {
  if (element.multiple) {
    const requested = splitMultiValue(value);
    if (requested.length === 0) return false;
    const selected = requested.map((item) => exactOption(element.options, item));
    if (selected.some((option) => !option)) return false;
    const selectedSet = new Set(selected as HTMLOptionElement[]);
    for (const option of Array.from(element.options)) option.selected = selectedSet.has(option);
    dispatchInputEvents(element, value);
    return true;
  }
  const option = exactOption(element.options, value);
  if (!option) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(element, option.value);
  else element.value = option.value;
  dispatchInputEvents(element, value);
  return true;
}

function fillRadio(element: HTMLInputElement, value: string): boolean {
  if (!element.name) return false;
  const targetValue = normalizeFieldText(value);
  const formRoot: ParentNode = element.form ?? document;
  const target = Array.from(formRoot.querySelectorAll<HTMLInputElement>("input[type='radio']"))
    .filter((radio) => radio.name === element.name && !radio.disabled)
    .find((radio) => [radio.value, radio.labels?.[0]?.textContent ?? ""]
      .some((candidate) => normalizeFieldText(candidate) === targetValue));
  if (!target) return false;
  target.scrollIntoView?.({ block: "center", inline: "nearest" });
  if (!target.checked) target.click();
  return target.checked;
}

function optionVisible(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest("[hidden], [aria-hidden='true']")) return false;
  const style = typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  return !style || (style.display !== "none" && style.visibility !== "hidden");
}

function visibleExactOption(value: string): HTMLElement | undefined {
  const target = normalizeFieldText(value);
  return Array.from(document.querySelectorAll(OPTION_SELECTOR))
    .filter(optionVisible)
    .find((option) => normalizeFieldText(option.textContent ?? "") === target);
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  if (predicate()) return true;
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value: boolean) => {
      if (finished) return;
      finished = true;
      observer?.disconnect();
      clearInterval(interval);
      clearTimeout(timeout);
      resolve(value);
    };
    const check = () => {
      try {
        if (predicate()) finish(true);
      }
      catch {
        // A transient detached node is handled by the next bounded poll.
      }
    };
    const observer = typeof MutationObserver === "function"
      ? new MutationObserver(check)
      : null;
    observer?.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const interval = setInterval(check, 25);
    const timeout = setTimeout(() => finish(false), timeoutMs);
  });
}

function customSelectIsMultiple(root: HTMLElement): boolean {
  return root.matches("[aria-multiselectable='true'], .ant-select-multiple, .atsx-select-multiple, [class*='select--multiple']")
    || Boolean(root.querySelector("[aria-multiselectable='true']"));
}

async function selectCustomOption(
  element: HTMLInputElement,
  value: string,
  optionTimeoutMs: number
): Promise<boolean> {
  const root = customSelectRoot(element);
  if (!root) return false;
  const trigger = root.matches("[role='combobox']")
    ? root
    : root.querySelector<HTMLElement>("[role='combobox']") ?? root;
  const requested = customSelectIsMultiple(root) ? splitMultiValue(value) : [value];
  if (requested.length === 0) return false;

  for (const item of requested) {
    trigger.click();
    let option = visibleExactOption(item);
    if (!option) {
      setNativeTextValue(element, item);
      if (typeof InputEvent === "function") {
        element.dispatchEvent(new InputEvent("input", { bubbles: true, data: item, inputType: "insertText" }));
      }
      else {
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const found = await waitUntil(() => Boolean(visibleExactOption(item)), optionTimeoutMs);
      if (!found) return false;
      option = visibleExactOption(item);
    }
    if (!option) return false;
    option.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    option.click();
    const selected = await waitUntil(() => selectedCustomValues(element)
      .some((candidate) => normalizeFieldText(candidate) === normalizeFieldText(item)), optionTimeoutMs);
    if (!selected) return false;
  }
  return true;
}

function fillContentEditable(element: HTMLElement, value: string): boolean {
  dispatchBeforeInput(element, value);
  element.textContent = value;
  dispatchInputEvents(element, value);
  return true;
}

async function performWrite(element: PageControl, value: string, optionTimeoutMs: number): Promise<boolean> {
  element.scrollIntoView?.({ block: "center", inline: "nearest" });
  element.focus?.({ preventScroll: true });

  if (element instanceof HTMLInputElement) {
    if (element.type === "radio") return fillRadio(element, value);
    if (element.closest(CUSTOM_SELECT_SELECTOR)) return selectCustomOption(element, value, optionTimeoutMs);
    dispatchBeforeInput(element, value);
    setNativeTextValue(element, value);
    dispatchInputEvents(element, value);
    if (isDateRangeInput(element)) {
      const root = element.closest<HTMLElement>(
        ".atsx-date-picker.atsx-date-picker-period-month, .atsx-date-picker.atsx-date-picker-period, [data-date-range]"
      );
      root?.dispatchEvent(new Event("input", { bubbles: true }));
      root?.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }
  if (element instanceof HTMLTextAreaElement) {
    dispatchBeforeInput(element, value);
    setNativeTextValue(element, value);
    dispatchInputEvents(element, value);
    return true;
  }
  if (element instanceof HTMLSelectElement) return fillNativeSelect(element, value);
  if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
    return fillContentEditable(element, value);
  }
  return false;
}

function matchesExpected(
  element: PageControl,
  value: string,
  normalize: (value: string) => string
): boolean {
  if (isDateRangeInput(element)) return dateRangeVisibleStateMatches(element, value);
  const candidates = readControlCandidates(element);
  if (candidates === null || candidates.length === 0) return false;
  if (element instanceof HTMLSelectElement && element.multiple) {
    const expected = splitMultiValue(value).map(normalize).sort();
    const actual = Array.from(element.selectedOptions)
      .map((option) => normalize(option.textContent || option.value))
      .filter(Boolean)
      .sort();
    return expected.length > 0 && expected.length === actual.length
      && expected.every((item, index) => item === actual[index]);
  }
  if (element instanceof HTMLInputElement && customSelectRoot(element)) {
    const expected = customSelectIsMultiple(customSelectRoot(element)!)
      ? splitMultiValue(value).map(normalize)
      : [normalize(value)];
    const actual = candidates.map(normalize).filter(Boolean);
    return expected.every((item) => actual.includes(item));
  }
  const expected = normalize(value);
  return Boolean(expected) && candidates.some((candidate) => normalize(candidate) === expected);
}

export async function writeControlVerified(
  element: PageControl,
  value: string,
  options: PageWriteOptions = {}
): Promise<VerifiedPageWrite> {
  const unavailable = controlUnavailable(element);
  if (unavailable) return { status: "failed", attempts: 0, reason: unavailable };
  const normalize = options.normalize ?? normalizeFieldText;
  const maxAttempts = bounded(options.maxAttempts, 2, 1, 2);
  const optionTimeoutMs = bounded(options.optionTimeoutMs, 900, 50, 2_000);
  const verificationTimeoutMs = bounded(options.verificationTimeoutMs, 250, 25, 1_000);
  let unsupported = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (!element.isConnected) return { status: "failed", attempts: attempt - 1, reason: "detached" };
    const wrote = await performWrite(element, value, optionTimeoutMs);
    if (!wrote) {
      unsupported = true;
      break;
    }
    const verified = await waitUntil(() => matchesExpected(element, value, normalize), verificationTimeoutMs);
    if (verified) return { status: "verified", attempts: attempt };
  }

  return {
    status: "failed",
    attempts: unsupported ? 1 : maxAttempts,
    reason: unsupported ? "unsupported-control" : "verification-failed"
  };
}
