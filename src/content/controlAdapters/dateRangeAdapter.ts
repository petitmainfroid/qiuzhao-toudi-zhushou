import type { PageControlAdapter } from "./contracts";
import {
  dispatchBeforeInput,
  dispatchInputEvents,
  isDateRangeInput,
  prepareControl,
  setNativeTextValue
} from "./shared";

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

function visibleStateMatches(element: HTMLInputElement, value: string): boolean {
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

export const feishuDateRangeAdapter: PageControlAdapter = {
  id: "feishu-date-range",
  canHandle: isDateRangeInput,
  read(element) {
    if (!isDateRangeInput(element)) return null;
    return element.value.trim() ? [element.value] : [];
  },
  async write(element, value) {
    if (!isDateRangeInput(element) || !parseDateRange(value)) {
      return { status: "failed", reason: "unsupported-control" };
    }
    prepareControl(element);
    dispatchBeforeInput(element, value);
    setNativeTextValue(element, value);
    dispatchInputEvents(element, value);
    const root = element.closest<HTMLElement>(
      ".atsx-date-picker.atsx-date-picker-period-month, .atsx-date-picker.atsx-date-picker-period, [data-date-range]"
    );
    root?.dispatchEvent(new Event("input", { bubbles: true }));
    root?.dispatchEvent(new Event("change", { bubbles: true }));
    return { status: "written" };
  },
  verify(element, value) {
    return isDateRangeInput(element) && visibleStateMatches(element, value);
  }
};
