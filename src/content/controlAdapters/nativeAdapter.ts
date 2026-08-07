import { normalizeFieldText } from "../../matching/normalize";
import type { PageControlAdapter, PageControl } from "./contracts";
import {
  KNOWN_SELECT_ROOT_SELECTOR,
  dispatchBeforeInput,
  dispatchInputEvents,
  exactOption,
  isDateRangeInput,
  prepareControl,
  setNativeTextValue,
  splitMultiValue
} from "./shared";

function radioCandidates(element: HTMLInputElement): string[] | null {
  if (!element.name) return null;
  const formRoot: ParentNode = element.form ?? document;
  const checked = Array.from(formRoot.querySelectorAll<HTMLInputElement>("input[type='radio']"))
    .find((radio) => radio.name === element.name && radio.checked);
  if (!checked) return [];
  return [checked.value, checked.labels?.[0]?.textContent ?? ""].filter((value) => value.trim());
}

function readNative(element: PageControl): string[] | null {
  if (element instanceof HTMLInputElement) {
    if (element.type === "radio") return radioCandidates(element);
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

function verifyNative(element: PageControl, value: string, normalize: (value: string) => string): boolean {
  const candidates = readNative(element);
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
  const expected = normalize(value);
  return Boolean(expected) && candidates.some((candidate) => normalize(candidate) === expected);
}

export const nativeControlAdapter: PageControlAdapter = {
  id: "native",
  canHandle(element) {
    if (isDateRangeInput(element) || element.closest(`${KNOWN_SELECT_ROOT_SELECTOR}, [role='combobox']`)) return false;
    return element instanceof HTMLInputElement
      || element instanceof HTMLTextAreaElement
      || element instanceof HTMLSelectElement
      || element.isContentEditable
      || element.getAttribute("contenteditable") === "true";
  },
  read: readNative,
  async write(element, value) {
    prepareControl(element);
    if (element instanceof HTMLInputElement) {
      if (element.type === "radio") {
        return fillRadio(element, value)
          ? { status: "written" }
          : { status: "failed", reason: "option-not-found" };
      }
      dispatchBeforeInput(element, value);
      setNativeTextValue(element, value);
      dispatchInputEvents(element, value);
      return { status: "written" };
    }
    if (element instanceof HTMLTextAreaElement) {
      dispatchBeforeInput(element, value);
      setNativeTextValue(element, value);
      dispatchInputEvents(element, value);
      return { status: "written" };
    }
    if (element instanceof HTMLSelectElement) {
      return fillNativeSelect(element, value)
        ? { status: "written" }
        : { status: "failed", reason: "option-not-found" };
    }
    if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
      dispatchBeforeInput(element, value);
      element.textContent = value;
      dispatchInputEvents(element, value);
      return { status: "written" };
    }
    return { status: "failed", reason: "unsupported-control" };
  },
  verify(element, value, context) {
    return verifyNative(element, value, context.normalize);
  }
};
