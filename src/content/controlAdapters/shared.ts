import { normalizeFieldText } from "../../matching/normalize";
import type { PageControl } from "./contracts";

export const KNOWN_SELECT_ROOT_SELECTOR = ".atsx-select, .ud-select, .ant-select, .el-select";

const BLOCKED_INPUT_TYPES = new Set([
  "file", "password", "hidden", "submit", "reset", "button", "image", "checkbox"
]);

const SUBMIT_TEXT = [
  "提交申请", "提交简历", "投递申请", "投递简历", "确认投递", "submitapplication"
].map(normalizeFieldText);

export function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value!)));
}

function submitLike(element: PageControl): boolean {
  if (element.matches("button, input[type='submit'], input[type='button'], input[type='reset'], [role='button']")) return true;
  if (element.closest("button, [role='button']")) return true;
  const text = normalizeFieldText([
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("name"),
    element instanceof HTMLInputElement ? element.labels?.[0]?.textContent : ""
  ].filter(Boolean).join(" "));
  return SUBMIT_TEXT.some((pattern) => text.includes(pattern));
}

export function controlUnavailable(element: PageControl):
  | "detached"
  | "blocked-control"
  | "disabled-or-readonly"
  | "hidden-control"
  | null {
  if (!element.isConnected) return "detached";
  if (element.closest("[hidden], [aria-hidden='true']")) return "hidden-control";
  if (submitLike(element)) return "blocked-control";
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
  if (element.getAttribute("aria-disabled") === "true") return "disabled-or-readonly";
  const style = typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  if (!isDateRangeInput(element) && style && (style.display === "none" || style.visibility === "hidden")) {
    return "hidden-control";
  }
  return null;
}

export function isDateRangeInput(element: PageControl): element is HTMLInputElement {
  return element instanceof HTMLInputElement
    && Boolean(element.closest(".atsx-date-picker-period, [class*='date-picker-period']"));
}

export function dispatchBeforeInput(element: HTMLElement, value: string): void {
  if (typeof InputEvent !== "function") return;
  element.dispatchEvent(new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: value,
    inputType: "insertText"
  }));
}

export function dispatchInputEvents(element: HTMLElement, value: string): void {
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

export function setNativeTextValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
}

export function splitMultiValue(value: string): string[] {
  return [...new Set(value.split(/[\n,，、；;]+/).map((item) => item.trim()).filter(Boolean))];
}

export function exactOption(options: Iterable<HTMLOptionElement>, value: string): HTMLOptionElement | undefined {
  const target = normalizeFieldText(value);
  return Array.from(options).find((option) =>
    [option.value, option.textContent ?? ""].some((candidate) => normalizeFieldText(candidate) === target)
  );
}

export function optionVisible(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest("[hidden], [aria-hidden='true']")) return false;
  const style = typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  return !style || (style.display !== "none" && style.visibility !== "hidden");
}

export async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
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
        // Detached transient nodes are retried only within this bounded wait.
      }
    };
    const observer = typeof MutationObserver === "function" ? new MutationObserver(check) : null;
    observer?.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const interval = setInterval(check, 25);
    const timeout = setTimeout(() => finish(false), timeoutMs);
  });
}

export function prepareControl(element: PageControl): void {
  element.scrollIntoView?.({ block: "center", inline: "nearest" });
  element.focus?.({ preventScroll: true });
}
