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
  action: "fill" | "type" | "select" | "fill-range" | "check" | "click";
  strategy: "primary" | "prepare-keyboard" | "verify-keyboard";
  expected?: string;
  expectedStart?: string;
  expectedEnd?: string;
  startOnly?: true;
  matchMode?: "administrative-area";
  rangeMode?: "native" | "year-month-select";
  rangeStep?: 0 | 1 | 2 | 3 | "verify";
  desired?: "checked" | "unchecked";
  purpose?: "open-control" | "add-repeatable-record" | "save-repeatable-record";
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
      : payload.action === "fill-range" ? "native-date-range"
      : payload.action === "check" ? "exact-check"
        : payload.action === "click"
          ? payload.purpose === "add-repeatable-record" ? "repeatable-add"
            : payload.purpose === "save-repeatable-record" ? "repeatable-save" : "open-control"
          : isContentEditable ? "contenteditable-text" : "native-setter"
    : "keyboard-insert";

  if (!ownerWindow || !element.isConnected) return fail("stale-reference", strategyName);
  if (element.closest("[hidden], [aria-hidden='true'], [inert]")) return fail("hidden-control", strategyName);
  const style = ownerWindow.getComputedStyle?.(element);
  if (style && (style.display === "none" || style.visibility === "hidden")) {
    return fail("hidden-control", strategyName);
  }
  const isInput = element instanceof ownerWindow.HTMLInputElement;
  const isTextarea = element instanceof ownerWindow.HTMLTextAreaElement;
  const isSelect = element instanceof ownerWindow.HTMLSelectElement;
  const inputType = isInput ? element.type.toLowerCase() : "";
  let structuralSelectTrigger: HTMLElement | null = null;
  let structuralSelectRoot: HTMLElement | null = null;
  if (isInput) {
    let selectAncestor: HTMLElement | null = null;
    let dropdownAncestor: HTMLElement | null = null;
    for (let current = element.parentElement, depth = 0; current && depth < 6; current = current.parentElement, depth += 1) {
      const classes = String(current.className ?? "");
      if (!selectAncestor && /select/iu.test(classes)) selectAncestor = current;
      if (!dropdownAncestor && /dropdown/iu.test(classes)) dropdownAncestor = current;
      if (selectAncestor && dropdownAncestor) break;
      if (current.matches("form, body, html")) break;
    }
    if (selectAncestor && dropdownAncestor) {
      structuralSelectTrigger = selectAncestor;
      structuralSelectRoot = dropdownAncestor;
    }
  }
  const disabled = element.matches(":disabled")
    || element.getAttribute("aria-disabled") === "true"
    || Boolean(element.closest("fieldset:disabled"));
  const readOnly = element.matches("[readonly]") || element.getAttribute("aria-readonly") === "true";
  const semanticRole = element.getAttribute("role");
  const selectIntent = semanticRole === "combobox" || semanticRole === "listbox" || Boolean(structuralSelectRoot);
  const readOnlySelectTrigger = readOnly
    && (payload.action === "select" || payload.action === "click" || payload.action === "fill-range")
    && selectIntent;
  if (disabled || (readOnly && !readOnlySelectTrigger)) return fail("disabled-or-readonly", strategyName);

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

  if (payload.action === "fill-range") {
    const markerSelector = [
      "[data-date-range]",
      "[class*='date-range']",
      "[class*='date-picker-period']",
      "[class*='daterange']"
    ].join(",");
    const root = payload.rangeMode === "year-month-select"
      ? element
      : element.matches(markerSelector)
        ? element
        : element.closest(markerSelector);
    if (!root) return fail("incompatible-action", "native-date-range");
    const expectedStart = payload.expectedStart ?? "";
    const expectedEnd = payload.expectedEnd ?? "";
    const startOnly = payload.startOnly === true;
    const canonicalDate = /^\d{4}-\d{2}(?:-\d{2})?$/;
    if (
      !canonicalDate.test(expectedStart)
      || (!startOnly && (!canonicalDate.test(expectedEnd)
        || expectedStart.length !== expectedEnd.length
        || expectedStart > expectedEnd))
    ) return fail("invalid-profile-range", "native-date-range");

    const datePartMatches = (candidate: string, wanted: string, part: "year" | "month"): boolean => {
      const digits = candidate.replace(/\D/g, "");
      if (part === "year") return digits === wanted;
      return /^\d{1,2}$/.test(digits) && Number(digits) === Number(wanted);
    };

    // Some ATS period-month controls render two visible labels and keep only
    // one hidden input. Each label opens a bounded panel with one year list
    // and one month list. The structural data contract is fixed here; callers
    // still provide only the date-range intent and never a selector.
    const rootClass = String((root as HTMLElement).className ?? "");
    const rootDataCy = root.getAttribute("data-cy") ?? "";
    const periodLabels = Array.from(root.querySelectorAll<HTMLElement>("[data-cy]"))
      .filter((candidate) => /periodInput(?:Begin|End)$/i.test(candidate.getAttribute("data-cy") ?? ""));
    if (/date-picker-period-month/i.test(rootClass) && rootDataCy && periodLabels.length === 2) {
      // This control has its own two-sided adapter. Tell the browser kernel
      // not to apply the generic four-trigger pacing protocol to it.
      if (payload.rangeStep !== undefined) return fail("incompatible-action", "native-date-range");
      const choosePeriodMonth = (side: "Begin" | "End", expectedValue: string): { performed: boolean; verified: boolean } => {
        const label = periodLabels.find((candidate) => new RegExp(`periodInput${side}$`, "i")
          .test(candidate.getAttribute("data-cy") ?? ""));
        if (!label) return { performed: false, verified: false };
        const panelDataCy = `${rootDataCy}${side}Dropdown`;
        const findPanel = (): HTMLElement | undefined => Array.from(
          ownerWindow.document.querySelectorAll<HTMLElement>("[data-cy]")
        ).find((candidate) => candidate.getAttribute("data-cy") === panelDataCy);
        let panel = findPanel();
        if (!panel) {
          label.click();
          panel = findPanel();
        }
        if (!panel) return { performed: true, verified: false };
        const findLists = (): HTMLElement[] => Array.from(panel!.querySelectorAll<HTMLElement>(
          ".atsx-date-picker-period-month-panel-list"
        ));
        let lists = findLists();
        if (lists.length !== 2) return { performed: true, verified: false };
        const exactOption = (list: HTMLElement, wanted: string, part: "year" | "month"): HTMLElement | undefined => {
          const matches = Array.from(list.querySelectorAll<HTMLElement>("[data-cy]"))
            .filter((option) => datePartMatches(option.getAttribute("data-cy") ?? option.textContent ?? "", wanted, part));
          return matches.length === 1 ? matches[0] : undefined;
        };
        const year = exactOption(lists[0]!, expectedValue.slice(0, 4), "year");
        if (!year) return { performed: true, verified: false };
        year.click();
        panel = findPanel();
        if (!panel) return { performed: true, verified: false };
        lists = findLists();
        const month = lists.length === 2 ? exactOption(lists[1]!, expectedValue.slice(5, 7), "month") : undefined;
        if (!month) return { performed: true, verified: false };
        month.click();
        const yearLabel = label.querySelector<HTMLElement>("[data-cy='year']")?.textContent ?? "";
        const monthLabel = label.querySelector<HTMLElement>("[data-cy='month']")?.textContent ?? "";
        return {
          performed: true,
          verified: datePartMatches(yearLabel, expectedValue.slice(0, 4), "year")
            && datePartMatches(monthLabel, expectedValue.slice(5, 7), "month")
        };
      };
      const begin = choosePeriodMonth("Begin", expectedStart);
      if (!begin.verified) return {
        performed: begin.performed,
        verified: false,
        strategy: "year-month-select-range",
        reason: "option-not-found"
      };
      if (startOnly) {
        return begin.verified
          ? { performed: true, verified: true, strategy: "year-month-select-range" }
          : { performed: begin.performed, verified: false, strategy: "year-month-select-range", reason: "option-not-found" };
      }
      const end = choosePeriodMonth("End", expectedEnd);
      return end.verified
        ? { performed: true, verified: true, strategy: "year-month-select-range" }
        : { performed: begin.performed || end.performed, verified: false, strategy: "year-month-select-range", reason: "option-not-found" };
    }

    const allInputs = Array.from(root.querySelectorAll("input"))
      .filter((candidate): candidate is HTMLInputElement => candidate instanceof ownerWindow.HTMLInputElement)
      // A nearby "to present" checkbox belongs to the same date field DOM
      // but is not one of the four ordered year/month triggers.
      .filter((candidate) => ["date", "month", "text"].includes(candidate.type.toLowerCase()));
    const inputs = allInputs
      .filter((candidate) => ["date", "month", "text"].includes(candidate.type.toLowerCase()))
      .filter((candidate) => {
        if (!candidate.isConnected || candidate.disabled || candidate.readOnly) return false;
        if (candidate.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
        const candidateStyle = ownerWindow.getComputedStyle?.(candidate);
        return !candidateStyle || (candidateStyle.display !== "none" && candidateStyle.visibility !== "hidden");
      });
    const nativeSelects = Array.from(root.querySelectorAll("select"))
      .filter((candidate): candidate is HTMLSelectElement => candidate instanceof ownerWindow.HTMLSelectElement);
    const bareComboboxes = Array.from(root.querySelectorAll<HTMLElement>("[role='combobox'], [role='listbox']"));
    if (allInputs.length === 4 || nativeSelects.length === 4 || bareComboboxes.length === 4) {
      const selectableInputs = allInputs.filter((candidate) => {
        if (!candidate.isConnected || candidate.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
        const candidateStyle = ownerWindow.getComputedStyle?.(candidate);
        if (candidateStyle && (candidateStyle.display === "none" || candidateStyle.visibility === "hidden")) return false;
        return true;
      });
      // A four-part range must have exactly four selectable controls.  This
      // prevents an adjacent search box or a "to present" checkbox from being
      // treated as a date part.
      const selectControls = selectableInputs.length === 4
        ? selectableInputs
        : (nativeSelects.length === 4 ? nativeSelects : bareComboboxes).filter((candidate) => {
          if (!candidate.isConnected || candidate.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
          const candidateStyle = ownerWindow.getComputedStyle?.(candidate);
          return !candidateStyle || (candidateStyle.display !== "none" && candidateStyle.visibility !== "hidden");
        });
      if (selectControls.length !== 4) return fail("incompatible-action", "year-month-select-range");
      const values = [expectedStart.slice(0, 4), expectedStart.slice(5, 7), expectedEnd.slice(0, 4), expectedEnd.slice(5, 7)];
      const committedCount = startOnly ? 2 : 4;
      const committed = (): boolean => selectControls.slice(0, committedCount).every((control, index) => {
        const current = control instanceof ownerWindow.HTMLSelectElement
          ? control.selectedOptions[0]?.textContent ?? control.value
          : (control instanceof ownerWindow.HTMLInputElement ? control.value : "")
            || control.getAttribute("aria-valuetext")
            // Some controlled selects keep the readonly input empty and
            // render the committed value in a sibling display node.
            || control.parentElement?.textContent || "";
        return datePartMatches(current, values[index]!, index % 2 === 0 ? "year" : "month");
      });
      const visibleOptions = (anchor: HTMLElement): HTMLElement[] => {
        const anchorRect = anchor.getBoundingClientRect?.();
        const layoutlessTestDom = /jsdom/i.test(ownerWindow.navigator?.userAgent ?? "");
        return Array.from(root.ownerDocument.querySelectorAll<HTMLElement>([
        "[role='option']", ".ant-select-item-option", ".el-select-dropdown__item", ".ud__select__list__item",
        "[class*='option']", "[class*='Option']", "[class*='Menu'][class*='item']",
        "[class*='dropdown'] li", "[class*='Dropdown'] li", "[class*='select'] li", "[class*='Select'] li"
      ].join(","))).filter((option) => {
        if (!option.isConnected || option.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
        const optionStyle = ownerWindow.getComputedStyle?.(option);
        if (optionStyle && (optionStyle.display === "none" || optionStyle.visibility === "hidden")) return false;
        const rect = option.getBoundingClientRect?.();
        if (layoutlessTestDom || !rect || !anchorRect) return true;
        if (!(rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
          && rect.top < ownerWindow.innerHeight && rect.left < ownerWindow.innerWidth)) return false;
        // Portalled menus from prior controls can remain mounted and visible.
        // Bound candidates to the popup column aligned with this trigger.
        return Math.min(anchorRect.right, rect.right) - Math.max(anchorRect.left, rect.left) > 0;
      });
      };
      const choose = (control: HTMLElement, wanted: string, part: "year" | "month"): boolean => {
        if (control instanceof ownerWindow.HTMLSelectElement) {
          const matches = Array.from(control.options).filter((option) => datePartMatches(option.textContent ?? option.value, wanted, part));
          if (matches.length !== 1) return false;
          control.value = matches[0]!.value;
          control.dispatchEvent(new ownerWindow.Event("input", { bubbles: true }));
          control.dispatchEvent(new ownerWindow.Event("change", { bubbles: true }));
          return datePartMatches(control.selectedOptions[0]?.textContent ?? control.value, wanted, part);
        }
        let trigger: HTMLElement = control;
        if (control.getAttribute("role") !== "combobox") {
          for (let current: HTMLElement | null = control; current && current !== root.parentElement; current = current.parentElement) {
            if (/select|dropdown/i.test(String(current.className ?? ""))) {
              trigger = current;
              break;
            }
          }
        }
        const exactOptions = (): HTMLElement[] => visibleOptions(trigger).filter((option) => datePartMatches([
          option.textContent ?? "", option.getAttribute("aria-label") ?? "", option.getAttribute("data-value") ?? ""
        ].join(" "), wanted, part));
        let matches = exactOptions();
        if (matches.length !== 1) {
          // Controlled dropdowns can require pointer/mouse-down instead of a
          // programmatic click. Reuse an already-open uniquely scoped menu;
          // otherwise open this exact trigger and recompute its candidates.
          for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
            trigger.dispatchEvent(new ownerWindow.MouseEvent(eventName, { bubbles: true, cancelable: true }));
          }
          matches = exactOptions();
        }
        if (matches.length !== 1) return false;
        matches[0]!.click();
        // Paired year/month widgets may not commit the visible input until the
        // matching month is chosen. An exact unique option click is therefore
        // allowed to advance, but the four controls are verified together
        // below before the range is reported as filled.
        return true;
      };
      if (payload.rangeStep === "verify") {
        return committed()
          ? { performed: true, verified: true, strategy: "year-month-select-range" }
          : { performed: true, verified: false, strategy: "year-month-select-range", reason: "option-not-found" };
      }
      if (typeof payload.rangeStep === "number") {
        const index = payload.rangeStep;
        return choose(selectControls[index]!, values[index]!, index % 2 === 0 ? "year" : "month")
          ? { performed: true, verified: true, strategy: "year-month-select-range" }
          : { performed: true, verified: false, strategy: "year-month-select-range", reason: "option-not-found" };
      }
      for (let index = 0; index < committedCount; index += 1) {
        if (!choose(selectControls[index]!, values[index]!, index % 2 === 0 ? "year" : "month")) {
          return { performed: true, verified: false, strategy: "year-month-select-range", reason: "option-not-found" };
        }
      }
      return committed()
        ? { performed: true, verified: true, strategy: "year-month-select-range" }
        : { performed: true, verified: false, strategy: "year-month-select-range", reason: "option-not-found" };
    }
    if (inputs.length !== 2) return fail("incompatible-action", "native-date-range");
    const inputValue = (input: HTMLInputElement, value: string): string | null => {
      const type = input.type.toLowerCase();
      if (type === "month") return value.slice(0, 7);
      if (type === "date") return value.length === 10 ? value : null;
      return value;
    };
    const values = [inputValue(inputs[0]!, expectedStart), startOnly ? inputs[1]!.value : inputValue(inputs[1]!, expectedEnd)];
    if (values.some((value) => value === null)) return fail("invalid-profile-range", "native-date-range");
    const dispatchRangeBeforeInput = (input: HTMLInputElement, value: string): boolean => {
      const InputEventConstructor = ownerWindow.InputEvent;
      if (typeof InputEventConstructor !== "function") return true;
      return input.dispatchEvent(new InputEventConstructor("beforeinput", {
        bubbles: true,
        cancelable: true,
        data: value,
        inputType: "insertText"
      }));
    };
    if (!dispatchRangeBeforeInput(inputs[0]!, values[0]!)
      || (!startOnly && !dispatchRangeBeforeInput(inputs[1]!, values[1]!))) {
      return fail("framework-rejected", "native-date-range");
    }
    const previous = inputs.map((input) => input.value);
    const setter = Object.getOwnPropertyDescriptor(ownerWindow.HTMLInputElement.prototype, "value")?.set;
    const setRangeValue = (input: HTMLInputElement, value: string): void => {
      if (setter) setter.call(input, value);
      else input.value = value;
    };
    const dispatchRangeEvents = (input: HTMLInputElement, value: string): void => {
      const InputEventConstructor = ownerWindow.InputEvent;
      if (typeof InputEventConstructor === "function") {
        input.dispatchEvent(new InputEventConstructor("input", {
          bubbles: true,
          data: value,
          inputType: "insertText"
        }));
      }
      else input.dispatchEvent(new ownerWindow.Event("input", { bubbles: true }));
      input.dispatchEvent(new ownerWindow.Event("change", { bubbles: true }));
      input.dispatchEvent(new ownerWindow.FocusEvent("blur", { bubbles: false }));
      input.dispatchEvent(new ownerWindow.FocusEvent("focusout", { bubbles: true }));
    };
    inputs.slice(0, startOnly ? 1 : 2).forEach((input, index) => {
      setRangeValue(input, values[index]!);
      dispatchRangeEvents(input, values[index]!);
    });
    root.dispatchEvent(new ownerWindow.Event("input", { bubbles: true }));
    root.dispatchEvent(new ownerWindow.Event("change", { bubbles: true }));
    const verified = inputs.slice(0, startOnly ? 1 : 2).every((input, index) => input.value === values[index]);
    if (!verified) {
      inputs.forEach((input, index) => {
        setRangeValue(input, previous[index]!);
        dispatchRangeEvents(input, previous[index]!);
      });
      return { performed: true, verified: false, strategy: "native-date-range", reason: "verification-failed" };
    }
    return { performed: true, verified: true, strategy: "native-date-range" };
  }

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
    if (payload.purpose === "add-repeatable-record" || payload.purpose === "save-repeatable-record") {
      const strategy: PageActionStrategy = payload.purpose === "add-repeatable-record"
        ? "repeatable-add"
        : "repeatable-save";
      const submitButton = element instanceof ownerWindow.HTMLButtonElement && element.type.toLowerCase() === "submit";
      const repeatableGroups = [
        { heading: /教育经历|教育背景|education(?:al)?\s*(?:experience|background)/i, fields: /学校|院校|学历|专业|degree|major|school/i },
        { heading: /实习经历|工作经历|职业经历|internship|work\s*experience|employment/i, fields: /公司|职位|岗位|描述|company|employer|position|role|description/i },
        { heading: /作品(?:集|经历)?|portfolio|work\s*samples?/i, fields: /作品|链接|名称|link|title|name/i },
        { heading: /项目经历|项目经验|projects?/i, fields: /项目名称|项目角色|描述|project|role|description/i },
        { heading: /获奖(?:经历)?|荣誉(?:奖项)?|奖项|awards?|honors?/i, fields: /获奖|奖项|荣誉|名称|级别|award|honor|title/i },
        { heading: /语言能力|外语能力|languages?/i, fields: /语言|精通程度|熟练程度|language|proficiency/i }
      ];
      let semanticRepeatableAdd = false;
      if (payload.purpose === "add-repeatable-record") {
        let container: Element | null = element.parentElement;
        for (let depth = 0; container && depth < 10; depth += 1, container = container.parentElement) {
          if (container.matches("body, html")) break;
          const semanticNodes = Array.from(container.querySelectorAll<HTMLElement>(
            "[data-form-field-name], [data-section], [aria-label], h1, h2, h3, h4, h5, h6, legend, [role='heading']"
          )).slice(0, 40);
          const signal = [
            container.getAttribute("data-form-field-name") ?? "",
            container.getAttribute("data-section") ?? "",
            container.getAttribute("aria-label") ?? "",
            ...semanticNodes.flatMap((node) => [
              node.getAttribute("data-form-field-name") ?? "",
              node.getAttribute("data-section") ?? "",
              node.getAttribute("aria-label") ?? "",
              node.matches("h1, h2, h3, h4, h5, h6, legend, [role='heading']") ? node.textContent ?? "" : ""
            ])
          ].join(" ");
          const containerText = (container.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
          if (repeatableGroups.some((group) =>
            group.heading.test(signal) || (group.heading.test(containerText) && group.fields.test(containerText))
          )) {
            semanticRepeatableAdd = true;
            break;
          }
        }
      }
      if (
        (!element.matches("button, input[type='button'], [role='button']") && !semanticRepeatableAdd)
        || submitButton
        || element.matches("input[type='submit']")
      ) {
        return fail("incompatible-action", strategy);
      }
      const href = element.matches("a[href]") ? element.getAttribute("href")?.trim() ?? "" : "";
      const inertRepeatableAnchor = !href || /^javascript:\s*void\s*\(\s*0\s*\)\s*;?$/iu.test(href);
      if (href && !inertRepeatableAnchor) return fail("incompatible-action", strategy);
      const label = normalize([
        element.getAttribute("aria-label") ?? "",
        element.getAttribute("title") ?? "",
        element instanceof ownerWindow.HTMLInputElement ? element.value : "",
        element.textContent ?? ""
      ].join(" "));
      const forbidden = ["submit", "apply", "application", "delete", "remove", "投递", "提交", "申请", "删除", "移除"];
      if (!label || forbidden.some((token) => label.includes(normalize(token)))) {
        return fail("unsafe-control", strategy);
      }
      const allowed = payload.purpose === "add-repeatable-record"
        ? ["add", "addanother", "new", "新增", "添加", "继续添加"]
        : ["save", "done", "confirm", "保存", "完成", "确定"];
      if (!allowed.some((token) => label.includes(normalize(token)))) {
        return fail("incompatible-action", strategy);
      }
      const clickTarget = payload.purpose === "add-repeatable-record"
        ? element.closest<HTMLElement>(".formOperate-addBtn, button, input[type='button'], [role='button']")
          ?? element as HTMLElement
        : element as HTMLElement;
      clickTarget.click();
      return { performed: true, verified: false, strategy };
    }
    const role = element.getAttribute("role");
    if ((role !== "combobox" && role !== "listbox") || element.matches("button, a[href]")) {
      return fail("incompatible-action", "open-control");
    }
    // Feishu-style selects put the interactive trigger around a readonly
    // combobox input. Clicking the input alone does not open the list.
    const trigger = readOnlySelectTrigger
      ? element.parentElement?.closest<HTMLElement>("[class*='select']") ?? element as HTMLElement
      : element as HTMLElement;
    if (readOnlySelectTrigger && /(?:^|\s)ud__select--focus(?:\s|$)/.test(String(trigger.className || ""))) {
      return { performed: true, verified: true, strategy: "open-control" };
    }
    trigger.click();
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

  if (payload.action === "select") {
    const role = element.getAttribute("role");
    if (role !== "combobox" && role !== "listbox" && !structuralSelectRoot) {
      return fail("incompatible-action", "custom-select");
    }
    const comparable = (value: string): string => {
      const normalized = normalize(value);
      if (payload.matchMode !== "administrative-area") return normalized;
      return normalized.replace(/(?:特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市)$/u, "");
    };
    const matchesTarget = (candidate: string): boolean => comparable(candidate) === comparable(expected);
    const optionValues = (option: HTMLElement): string[] => [
      option.textContent ?? "", option.getAttribute("aria-label") ?? "", option.getAttribute("data-value") ?? ""
    ];
    const matchingOptions = (options: HTMLElement[]): HTMLElement[] => {
      const exact = options.filter((option) => optionValues(option).some(
        (candidate) => normalize(candidate) === normalize(expected)
      ));
      const matched = exact.length > 0
        ? exact
        : options.filter((option) => optionValues(option).some(matchesTarget));
      if (payload.matchMode !== "administrative-area" || matched.length < 2) return matched;
      // A municipality tree can expose the same caption at province and city
      // depth. Prefer the single deepest exact node (the city); same-depth
      // duplicates remain ambiguous and are never guessed.
      const withDepth = matched.map((option) => ({
        option,
        depth: Array.from(option.closest<HTMLElement>(".ud__tree__node")?.children ?? [])
          .filter((child) => child.classList.contains("ud__tree__node__indent")).length
      }));
      const maxDepth = Math.max(...withDepth.map((entry) => entry.depth));
      const deepest = withDepth.filter((entry) => entry.depth === maxDepth);
      return maxDepth > 0 && deepest.length === 1 ? [deepest[0]!.option] : matched;
    };
    if (structuralSelectRoot && structuralSelectTrigger && isInput) {
      const selectionMatches = (): boolean => matchesTarget(element.value)
        || Array.from(structuralSelectRoot!.querySelectorAll<HTMLElement>(
          "[aria-selected='true'], [data-selected='true'], [class*='selected'], [class*='active']"
        )).some((selected) => matchesTarget(selected.textContent ?? ""));
      if (selectionMatches()) return { performed: true, verified: true, strategy: "custom-select" };
      // Some framework selects open only from the pointer/mouse-down chain.
      // Keep this fixed and local to the already inspected trigger.
      for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        structuralSelectTrigger.dispatchEvent(new ownerWindow.MouseEvent(eventName, {
          bubbles: true, cancelable: true, button: 0, buttons: eventName.includes("down") ? 1 : 0
        }));
      }
      const layoutlessTestDom = /jsdom/i.test(ownerWindow.navigator?.userAgent ?? "");
      const triggerRect = structuralSelectTrigger.getBoundingClientRect?.();
      const options = Array.from(ownerWindow.document.querySelectorAll<HTMLElement>("[role='option'], [class]"))
        .filter((option) => option.getAttribute("role") === "option"
          || /(?:menu-content-item|select-option)/iu.test(String(option.className ?? "")))
        .filter((option) => {
          if (!option.isConnected || option.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
          const optionStyle = ownerWindow.getComputedStyle?.(option);
          if (optionStyle && (optionStyle.display === "none" || optionStyle.visibility === "hidden")) return false;
          const rect = option.getBoundingClientRect?.();
          if (layoutlessTestDom || !rect || !triggerRect) return true;
          let portal: HTMLElement | null = option.parentElement;
          for (let depth = 0; portal && depth < 6; depth += 1, portal = portal.parentElement) {
            if (/(?:dropdown.*dropdown|select.*menu)/iu.test(String(portal.className ?? ""))) break;
          }
          const portalRect = portal?.getBoundingClientRect?.() ?? rect;
          const horizontallyBound = portalRect.right > triggerRect.left && portalRect.left < triggerRect.right;
          const verticallyBound = Math.abs(portalRect.top - triggerRect.bottom) <= 96
            || Math.abs(portalRect.bottom - triggerRect.top) <= 96;
          return horizontallyBound && verticallyBound && rect.width > 0 && rect.height > 0
            && rect.bottom > 0 && rect.right > 0
            && rect.top < ownerWindow.innerHeight && rect.left < ownerWindow.innerWidth;
        });
      const matches = matchingOptions(options);
      if (matches.length === 0) {
        return { performed: true, verified: false, strategy: "custom-select", reason: "option-not-found" };
      }
      if (matches.length > 1) return fail("option-ambiguous", "custom-select");
      matches[0]!.click();
      return selectionMatches()
        ? { performed: true, verified: true, strategy: "custom-select" }
        : { performed: true, verified: false, strategy: "custom-select", reason: "verification-failed" };
    }
    // UD readonly selects can mount their list in a body-level portal whose
    // transition remains transparent/offscreen in a background CDP tab. They
    // expose no aria-controls link, so bind selection to the sole currently
    // open selector and the newest non-leaving UD dropdown only.
    const udRoot = element.closest<HTMLElement>(".ud__select");
    if (udRoot) {
      const selector = udRoot.querySelector<HTMLElement>(".ud__select__selector");
      if (!selector) return fail("incompatible-action", "custom-select");
      const selectionMatches = () => matchesTarget(selector.textContent ?? "")
        || Array.from(selector.querySelectorAll<HTMLElement>("[class*='selector__selectItem'], [aria-selected='true']"))
          .some((selected) => matchesTarget(selected.textContent ?? ""));
      if (selectionMatches()) {
        return { performed: true, verified: true, strategy: "custom-select" };
      }
      const openSelectors = Array.from(ownerWindow.document.querySelectorAll<HTMLElement>(".ud__select__selector-open"));
      const otherOpen = openSelectors.filter((candidate) => candidate !== selector);
      if (otherOpen.length > 0) {
        // Close every stale portal first. No option is committed in this call;
        // the bounded kernel retry will open only the intended selector.
        for (const candidate of openSelectors) candidate.click();
        return { performed: true, verified: false, strategy: "custom-select", reason: "option-not-found" };
      }
      if (!selector.matches(".ud__select__selector-open")) {
        selector.click();
        return { performed: true, verified: false, strategy: "custom-select", reason: "option-not-found" };
      }
      const udOptionSelector = ".ud__select__list__item, [role='option'], .ud__tree__node__label";
      const dropdowns = Array.from(ownerWindow.document.querySelectorAll<HTMLElement>(".ud__select__dropdown"))
        .filter((dropdown) => !/(?:^|\s)(?:[^\s]*leave[^\s]*|ud__select__dropdown-hidden)(?:\s|$)/i.test(String(dropdown.className ?? "")))
        .filter((dropdown) => dropdown.querySelector(udOptionSelector));
      const dropdown = dropdowns.at(-1);
      if (!dropdown) {
        return { performed: true, verified: false, strategy: "custom-select", reason: "option-not-found" };
      }
      const matches = matchingOptions(Array.from(dropdown.querySelectorAll<HTMLElement>(udOptionSelector)));
      if (matches.length === 0) {
        if (isInput && !element.readOnly && !element.disabled) {
          const setter = Object.getOwnPropertyDescriptor(ownerWindow.HTMLInputElement.prototype, "value")?.set;
          if (setter) setter.call(element, expected);
          else element.value = expected;
          element.dispatchEvent(new ownerWindow.Event("input", { bubbles: true }));
          element.dispatchEvent(new ownerWindow.Event("change", { bubbles: true }));
        }
        return { performed: true, verified: false, strategy: "custom-select", reason: "option-not-found" };
      }
      if (matches.length > 1) return fail("option-ambiguous", "custom-select");
      matches[0]!.click();
      return selectionMatches()
        ? { performed: true, verified: true, strategy: "custom-select" }
        : { performed: true, verified: false, strategy: "custom-select", reason: "option-not-found" };
    }

    // Ensure that the visible portal belongs to this exact readonly Feishu
    // select, rather than using an already-open sibling selector's options.
    if (readOnlySelectTrigger) {
      const trigger = element.parentElement?.closest<HTMLElement>("[class*='select']") ?? element as HTMLElement;
      if (!/(?:^|\s)ud__select--focus(?:\s|$)/.test(String(trigger.className || ""))) trigger.click();
    }
    const optionSelector = [
      "[role='option']",
      ".ant-select-item-option",
      ".el-select-dropdown__item",
      ".ud__select__list__item",
      "[class*='tree__node__label']"
    ].join(",");
    const roots: ParentNode[] = [element.ownerDocument];
    const rootNode = element.getRootNode();
    if (rootNode !== element.ownerDocument && "querySelectorAll" in rootNode) roots.push(rootNode as ParentNode);
    const visibleOptions = () => [...new Set(roots.flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>(optionSelector))))]
      .filter((option) => {
        if (!option.isConnected || option.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
        const optionStyle = ownerWindow.getComputedStyle?.(option);
        if (optionStyle && (optionStyle.display === "none" || optionStyle.visibility === "hidden")) return false;
        const rect = option.getBoundingClientRect?.();
        const layoutlessTestDom = /jsdom/i.test(ownerWindow.navigator?.userAgent ?? "");
        return layoutlessTestDom || !rect || (rect.width > 0 && rect.height > 0
          && rect.bottom > 0 && rect.right > 0
          && rect.top < ownerWindow.innerHeight && rect.left < ownerWindow.innerWidth);
      });
    let options = visibleOptions();
    // Many ATS widgets mount their option list only after the combobox is
    // opened.  This is still an opaque, intent-level select operation: no
    // selector or page value crosses the MCP boundary.
    const matches = matchingOptions(options);
    if (matches.length === 0) {
      // Tree-backed selectors often keep their complete option set behind a
      // local filter.  Supplying the requested value to that *internal*
      // search box is part of the same exact select intent (and never a form
      // field write); a later bounded retry still has to locate one exact
      // visible option before it can choose anything.
      const searchInput = (isInput ? element : element.querySelector<HTMLInputElement>(
        "input:not([type='hidden']):not([readonly])"
      )) as HTMLInputElement | null;
      if (searchInput && !searchInput.readOnly && !searchInput.disabled) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(searchInput, expected);
        else searchInput.value = expected;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        searchInput.dispatchEvent(new Event("change", { bubbles: true }));
        return { performed: true, verified: false, strategy: "custom-select", reason: "option-not-found" };
      }
      // Tree selectors may initially render only parent nodes. Expanding the
      // visible parents is non-committal; the caller must still exact-match a
      // leaf option in a later attempt before any value is selected.
      const expanders = [...new Set(roots.flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>("[class*='tree__node__expandIcon']"))))]
        .filter((expander) => {
          if (!expander.isConnected || expander.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
          const style = ownerWindow.getComputedStyle?.(expander);
          return !style || (style.display !== "none" && style.visibility !== "hidden");
        })
        .slice(0, 48);
      if (expanders.length > 0) {
        for (const expander of expanders) expander.click();
        return { performed: true, verified: false, strategy: "custom-select", reason: "option-not-found" };
      }
      return fail("option-not-found", "custom-select");
    }
    if (matches.length > 1) return fail("option-ambiguous", "custom-select");
    const option = matches[0]!;
    option.click();
    const selected = option.getAttribute("aria-selected") === "true"
      || option.getAttribute("data-selected") === "true"
      || option.matches(".is-selected, .selected, .ant-select-item-option-selected, .ud__select__list__item-selected")
      || Boolean(option.closest("[class*='tree__node']")?.querySelector("[aria-checked='true'], [class*='checked'], [class*='selected']"))
      || (isInput && normalize(element.value) === normalize(expected))
      || normalize(element.getAttribute("aria-valuetext") ?? "") === normalize(expected);
    return selected
      ? { performed: true, verified: true, strategy: "custom-select" }
      : { performed: true, verified: false, strategy: "custom-select", reason: "verification-failed" };
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
const CUSTOM_SELECT_SELECTOR = ".ant-select, .el-select, [role='combobox'], [class*='select'][aria-haspopup]";
const OPTION_SELECTOR = [
  "[role='option']",
  ".ant-select-item-option",
  ".el-select-dropdown__item"
].join(", ");
const SELECTED_OPTION_SELECTOR = [
  ".selected-value",
  ".ant-select-selection-item",
  ".el-select__selected-item",
  "[data-selected='true']",
  "[aria-selected='true']"
].join(", ");

function customSelectRoot(element: Element): HTMLElement | null {
  return element.closest<HTMLElement>(".ant-select, .el-select, [class*='select'][aria-haspopup]")
    ?? element.closest<HTMLElement>("[role='combobox']");
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value!)));
}

function isDateRangeInput(element: PageControl): element is HTMLInputElement {
  return element instanceof HTMLInputElement
    && Boolean(element.closest("[data-date-range], [class*='date-picker-period'], [class*='date-range'], [class*='daterange']"));
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
    "[data-date-range], [class*='date-picker-period'], [class*='date-range'], [class*='daterange']"
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
  return root.matches("[aria-multiselectable='true'], .ant-select-multiple, [class*='select--multiple']")
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
        "[data-date-range], [class*='date-picker-period'], [class*='date-range'], [class*='daterange']"
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
