import { normalizeFieldText } from "../matching/normalize";
import type { PageActionFailureReason, PageActionStrategy } from "../bridge/protocol";

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

export interface FixedPageActionPayload {
  action: "fill" | "type" | "select" | "check" | "click";
  strategy: "primary" | "prepare-keyboard" | "verify-keyboard";
  expected?: string;
  desired?: "checked" | "unchecked";
}

export interface FixedPageActionOutcome {
  performed: boolean;
  verified: boolean;
  strategy: PageActionStrategy;
  reason?: PageActionFailureReason;
}

/**
 * Self-contained page-world action registry. It is deliberately written with
 * only local helpers so the exact function body can be used with the fixed
 * Runtime.callFunctionOn bridge. Callers never provide script or selectors.
 */
export function runFixedPageAction(this: Element, payload: FixedPageActionPayload): FixedPageActionOutcome {
  const element = this;
  const ownerWindow = element.ownerDocument?.defaultView;
  const normalize = (value: string): string => value.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
  const split = (value: string): string[] => [...new Set(
    value.split(/[\n,，、；;]+/).map((item) => item.trim()).filter(Boolean)
  )];
  const fail = (reason: PageActionFailureReason, strategy: PageActionStrategy = "none"): FixedPageActionOutcome => ({
    performed: false,
    verified: false,
    strategy,
    reason
  });
  const contentEditable = element.getAttribute("contenteditable")?.toLowerCase();
  const isContentEditable = (element as HTMLElement).isContentEditable === true
    || contentEditable === ""
    || contentEditable === "true"
    || contentEditable === "plaintext-only";
  const strategyName: PageActionStrategy = payload.strategy === "primary"
    ? payload.action === "select" ? "native-select"
      : payload.action === "check" ? "exact-check"
        : payload.action === "click" ? "open-control"
          : isContentEditable ? "contenteditable-text" : "native-setter"
    : "keyboard-insert";

  if (!ownerWindow || !element.isConnected) return fail("stale-reference", strategyName);
  if (element.closest("[hidden], [aria-hidden='true'], [inert]")) return fail("hidden-control", strategyName);
  const style = ownerWindow.getComputedStyle?.(element);
  if (style && (style.display === "none" || style.visibility === "hidden")) {
    return fail("hidden-control", strategyName);
  }
  const disabled = element.matches(":disabled")
    || element.getAttribute("aria-disabled") === "true"
    || Boolean(element.closest("fieldset:disabled"));
  const readOnly = element.matches("[readonly]") || element.getAttribute("aria-readonly") === "true";
  if (disabled || readOnly) return fail("disabled-or-readonly", strategyName);

  const isInput = element instanceof ownerWindow.HTMLInputElement;
  const isTextarea = element instanceof ownerWindow.HTMLTextAreaElement;
  const isSelect = element instanceof ownerWindow.HTMLSelectElement;
  const inputType = isInput ? element.type.toLowerCase() : "";
  if (isInput && ["file", "password", "hidden", "submit", "reset", "image", "button"].includes(inputType)) {
    return fail("unsafe-control", strategyName);
  }

  const expected = payload.expected ?? "";
  const dispatchBeforeInput = (): boolean => {
    const InputEventConstructor = ownerWindow.InputEvent;
    if (typeof InputEventConstructor !== "function") return true;
    return element.dispatchEvent(new InputEventConstructor("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: expected,
      inputType: "insertText"
    }));
  };
  const dispatchCommittedEvents = (): void => {
    const InputEventConstructor = ownerWindow.InputEvent;
    if (typeof InputEventConstructor === "function") {
      element.dispatchEvent(new InputEventConstructor("input", {
        bubbles: true,
        data: expected,
        inputType: "insertText"
      }));
    }
    else element.dispatchEvent(new ownerWindow.Event("input", { bubbles: true }));
    element.dispatchEvent(new ownerWindow.Event("change", { bubbles: true }));
    element.dispatchEvent(new ownerWindow.FocusEvent("blur", { bubbles: false }));
    element.dispatchEvent(new ownerWindow.FocusEvent("focusout", { bubbles: true }));
  };
  const setTextValue = (): void => {
    const prototype = isTextarea
      ? ownerWindow.HTMLTextAreaElement.prototype
      : ownerWindow.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, expected);
    else (element as HTMLInputElement | HTMLTextAreaElement).value = expected;
  };
  const textVerified = (): boolean => {
    if (isInput || isTextarea) return normalize(element.value) === normalize(expected) && Boolean(normalize(expected));
    if (isContentEditable) return normalize(element.textContent ?? "") === normalize(expected) && Boolean(normalize(expected));
    return false;
  };

  if (payload.strategy === "prepare-keyboard") {
    if (!(isInput || isTextarea || isContentEditable) || isSelect || inputType === "radio" || inputType === "checkbox") {
      return fail("unsupported-control", "keyboard-insert");
    }
    (element as HTMLElement).focus({ preventScroll: true });
    if (isInput || isTextarea) element.select();
    else {
      const selection = ownerWindow.getSelection();
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    return { performed: true, verified: false, strategy: "keyboard-insert" };
  }

  if (payload.strategy === "verify-keyboard") {
    if (!(isInput || isTextarea || isContentEditable)) return fail("unsupported-control", "keyboard-insert");
    dispatchCommittedEvents();
    return textVerified()
      ? { performed: true, verified: true, strategy: "keyboard-insert" }
      : { performed: true, verified: false, strategy: "keyboard-insert", reason: "verification-failed" };
  }

  (element as HTMLElement).scrollIntoView?.({ block: "center", inline: "nearest" });
  (element as HTMLElement).focus?.({ preventScroll: true });

  if (payload.action === "check") {
    const wanted = payload.desired === "checked";
    if (isInput && inputType === "checkbox") {
      if (element.checked !== wanted) element.click();
      return element.checked === wanted
        ? { performed: true, verified: true, strategy: "exact-check" }
        : { performed: true, verified: false, strategy: "exact-check", reason: "verification-failed" };
    }
    const role = element.getAttribute("role");
    if (role !== "checkbox" && role !== "switch") return fail("incompatible-action", "exact-check");
    if ((element.getAttribute("aria-checked") === "true") !== wanted) (element as HTMLElement).click();
    return (element.getAttribute("aria-checked") === "true") === wanted
      ? { performed: true, verified: true, strategy: "exact-check" }
      : { performed: true, verified: false, strategy: "exact-check", reason: "verification-failed" };
  }

  if (payload.action === "click") {
    const role = element.getAttribute("role");
    if ((role !== "combobox" && role !== "listbox") || element.matches("button, a[href]")) {
      return fail("incompatible-action", "open-control");
    }
    (element as HTMLElement).click();
    return element.getAttribute("aria-expanded") === "true"
      ? { performed: true, verified: true, strategy: "open-control" }
      : { performed: true, verified: false, strategy: "open-control", reason: "verification-failed" };
  }

  if ((payload.action === "select" || payload.action === "fill") && isSelect) {
    const requested = element.multiple ? split(expected) : [expected];
    if (!requested.length) return fail("option-not-found", "native-select");
    const chosen: HTMLOptionElement[] = [];
    for (const item of requested) {
      const target = normalize(item);
      const matches = Array.from(element.options).filter((option) =>
        [option.value, option.textContent ?? ""].some((candidate) => normalize(candidate) === target)
      );
      if (matches.length === 0) return fail("option-not-found", "native-select");
      if (matches.length > 1) return fail("option-ambiguous", "native-select");
      chosen.push(matches[0]!);
    }
    const selectedSet = new Set(chosen);
    for (const option of Array.from(element.options)) option.selected = selectedSet.has(option);
    dispatchCommittedEvents();
    const actual = Array.from(element.selectedOptions).map((option) => normalize(option.textContent || option.value)).sort();
    const wanted = requested.map(normalize).sort();
    const verified = actual.length === wanted.length && wanted.every((item, index) => item === actual[index]);
    return verified
      ? { performed: true, verified: true, strategy: "native-select" }
      : { performed: true, verified: false, strategy: "native-select", reason: "verification-failed" };
  }

  if ((payload.action === "select" || payload.action === "fill") && isInput && inputType === "radio") {
    const ownCandidates = new Set([element.value, element.labels?.[0]?.textContent ?? ""].map(normalize).filter(Boolean));
    if (!ownCandidates.has(normalize(expected))) return fail("option-not-found", "exact-radio");
    if (!element.checked) element.click();
    return element.checked
      ? { performed: true, verified: true, strategy: "exact-radio" }
      : { performed: true, verified: false, strategy: "exact-radio", reason: "verification-failed" };
  }

  if (payload.action !== "fill" && payload.action !== "type") {
    return fail("incompatible-action", strategyName);
  }
  if (!expected.trim()) return fail("empty-profile-value", strategyName);
  if (!(isInput || isTextarea || isContentEditable) || inputType === "radio" || inputType === "checkbox") {
    return fail("unsupported-control", strategyName);
  }
  if (!dispatchBeforeInput()) return fail("framework-rejected", strategyName);
  if (isInput || isTextarea) setTextValue();
  else element.textContent = expected;
  dispatchCommittedEvents();
  return textVerified()
    ? { performed: true, verified: true, strategy: strategyName }
    : { performed: true, verified: false, strategy: strategyName, reason: "verification-failed" };
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
