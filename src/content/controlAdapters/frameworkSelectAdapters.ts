import { normalizeFieldText } from "../../matching/normalize";
import type { PageControl, PageControlAdapter } from "./contracts";
import {
  KNOWN_SELECT_ROOT_SELECTOR,
  optionVisible,
  prepareControl,
  setNativeTextValue,
  splitMultiValue,
  waitUntil
} from "./shared";

interface FrameworkSelectConfig {
  id: PageControlAdapter["id"];
  rootSelector: string;
  optionSelector: string;
  selectedSelector: string;
  multipleSelector: string;
  excludeKnownRoots?: boolean;
}

const GENERIC_SELECTED = "[data-selected='true'], [aria-selected='true']";

function rootFor(element: PageControl, config: FrameworkSelectConfig): HTMLElement | null {
  const root = element.matches(config.rootSelector)
    ? element
    : element.closest<HTMLElement>(config.rootSelector);
  if (!root) return null;
  if (config.excludeKnownRoots && root.closest(KNOWN_SELECT_ROOT_SELECTOR)) return null;
  return root as HTMLElement;
}

function isMultiple(root: HTMLElement, config: FrameworkSelectConfig): boolean {
  return root.matches(`[aria-multiselectable='true'], ${config.multipleSelector}`)
    || Boolean(root.querySelector(`[aria-multiselectable='true'], ${config.multipleSelector}`));
}

function selectedValues(element: PageControl, config: FrameworkSelectConfig): string[] {
  const root = rootFor(element, config);
  if (!root) return [];
  const values = Array.from(root.querySelectorAll<HTMLElement>(`${config.selectedSelector}, ${GENERIC_SELECTED}`))
    .map((item) => item.textContent?.trim() ?? "")
    .filter(Boolean);
  const ariaValue = root.getAttribute("aria-valuetext")?.trim();
  if (ariaValue) values.push(ariaValue);
  const unique = [...new Set(values)];
  if (isMultiple(root, config) && unique.length > 0) unique.push(unique.join("、"));
  return unique;
}

function visibleExactOption(value: string, config: FrameworkSelectConfig): HTMLElement | undefined {
  const target = normalizeFieldText(value);
  return Array.from(document.querySelectorAll(`${config.optionSelector}, [role='option']`))
    .filter(optionVisible)
    .find((option) => normalizeFieldText(option.textContent ?? "") === target);
}

function dispatchSearchInput(input: HTMLInputElement, value: string): void {
  setNativeTextValue(input, value);
  if (typeof InputEvent === "function") {
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  }
  else {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function verifiesSelection(
  element: PageControl,
  value: string,
  config: FrameworkSelectConfig,
  normalize: (value: string) => string
): boolean {
  const root = rootFor(element, config);
  if (!root) return false;
  const expected = isMultiple(root, config)
    ? splitMultiValue(value).map(normalize)
    : [normalize(value)];
  const actual = selectedValues(element, config).map(normalize).filter(Boolean);
  return expected.length > 0 && expected.every((item) => actual.includes(item));
}

function createFrameworkSelectAdapter(config: FrameworkSelectConfig): PageControlAdapter {
  return {
    id: config.id,
    canHandle(element) {
      return Boolean(rootFor(element, config));
    },
    read(element) {
      return rootFor(element, config) ? selectedValues(element, config) : null;
    },
    async write(element, value, context) {
      const root = rootFor(element, config);
      if (!root) return { status: "failed", reason: "unsupported-control" };
      prepareControl(element);
      const trigger = root.matches("[role='combobox']")
        ? root
        : root.querySelector<HTMLElement>("[role='combobox']") ?? root;
      const input = element instanceof HTMLInputElement
        ? element
        : root.querySelector<HTMLInputElement>("input:not([type='hidden'])");
      const requested = isMultiple(root, config) ? splitMultiValue(value) : [value];
      if (requested.length === 0) return { status: "failed", reason: "option-not-found" };

      for (const item of requested) {
        trigger.click();
        let option = visibleExactOption(item, config);
        if (!option && input) {
          dispatchSearchInput(input, item);
          const found = await waitUntil(() => Boolean(visibleExactOption(item, config)), context.optionTimeoutMs);
          if (!found) return { status: "failed", reason: "option-not-found" };
          option = visibleExactOption(item, config);
        }
        if (!option) return { status: "failed", reason: "option-not-found" };
        option.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        option.click();
        const selected = await waitUntil(
          () => selectedValues(element, config).some(
            (candidate) => context.normalize(candidate) === context.normalize(item)
          ),
          context.optionTimeoutMs
        );
        if (!selected) return { status: "failed", reason: "verification-failed" };
      }
      return { status: "written" };
    },
    verify(element, value, context) {
      return verifiesSelection(element, value, config, context.normalize);
    }
  };
}

export const feishuSelectAdapter = createFrameworkSelectAdapter({
  id: "feishu-select",
  rootSelector: ".atsx-select, .ud-select",
  optionSelector: ".atsx-select-dropdown-menu-item, .ud-select-option",
  selectedSelector: ".selected-value, .atsx-select-selection-selected-value, .ud-select-selection-selected-value",
  multipleSelector: ".atsx-select-multiple, .ud-select-multiple, [class*='select--multiple']"
});

export const antSelectAdapter = createFrameworkSelectAdapter({
  id: "ant-select",
  rootSelector: ".ant-select",
  optionSelector: ".ant-select-item-option",
  selectedSelector: ".ant-select-selection-item",
  multipleSelector: ".ant-select-multiple"
});

export const elementSelectAdapter = createFrameworkSelectAdapter({
  id: "element-select",
  rootSelector: ".el-select",
  optionSelector: ".el-select-dropdown__item",
  selectedSelector: ".el-select__selected-item, .el-select__tags-text",
  multipleSelector: ".el-select--multiple, [class*='select--multiple']"
});

export const ariaComboboxAdapter = createFrameworkSelectAdapter({
  id: "aria-combobox",
  rootSelector: "[role='combobox']",
  optionSelector: "[role='option']",
  selectedSelector: "[data-selected='true'], [aria-selected='true']",
  multipleSelector: "[aria-multiselectable='true']",
  excludeKnownRoots: true
});
