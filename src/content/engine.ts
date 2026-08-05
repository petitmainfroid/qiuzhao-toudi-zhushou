import { getProfileValue, type CandidateProfile } from "../domain/profile";
import { canonicalFields } from "../matching/catalog";
import { describeControl, discoverFields, findControlByElementId } from "../matching/dom";
import { matchField, matchFields } from "../matching/matcher";
import { normalizeFieldText } from "../matching/normalize";
import type { MatchResult } from "../matching/types";
import { createFieldFingerprint } from "../mapping/fingerprint";
import type { SavedFieldMapping } from "../mapping/types";
import { scanRepeatableRecords, type RepeatableRecordsScan } from "./repeatableRecords";

export interface FillProposal extends MatchResult {
  fingerprint: string;
  mappingSource: "rule" | "saved";
  hasValue: boolean;
  valuePreview: string;
  comparisonStatus: PageValueComparison;
  comparisonToken?: string;
}

export type PageValueComparison = "empty" | "equal" | "conflict" | "unreadable";

export interface ScanResult {
  title: string;
  site: string;
  fields: FillProposal[];
  repeatableRecords?: RepeatableRecordsScan;
  summary: {
    total: number;
    fillable: number;
    high: number;
    needsConfirmation: number;
    excluded: number;
    empty: number;
    equal: number;
    conflict: number;
    unreadable: number;
  };
}

export interface FillSelection {
  elementId: string;
  profilePath: string;
  conflictApprovalToken?: string;
}

export interface FillItemOutcome {
  elementId: string;
  profilePath: string;
  status: "filled" | "skipped";
  reason?: string;
}

export interface FillResult {
  outcomes: FillItemOutcome[];
  filledCount: number;
  skippedCount: number;
}

function previewValue(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 72 ? `${collapsed.slice(0, 69)}…` : collapsed;
}

function currentSite(): string {
  return typeof location !== "undefined" ? location.origin : "local";
}

interface ConflictSnapshot {
  elementId: string;
  profilePath: string;
  normalizedPageValue: string;
}

const conflictSnapshots = new Map<string, ConflictSnapshot>();
let comparisonTokenCounter = 0;

function comparisonToken(): string {
  comparisonTokenCounter += 1;
  return `comparison-${Date.now().toString(36)}-${comparisonTokenCounter.toString(36)}`;
}

export function normalizeComparableValue(profilePath: string, value: string): string {
  const trimmed = value.normalize("NFKC").trim();
  if (/email/i.test(profilePath)) return trimmed.toLowerCase();
  if (/phone|mobile|tel/i.test(profilePath)) return trimmed.replace(/\D/g, "");
  if (/date|startDate|endDate|age/i.test(profilePath)) return trimmed.replace(/\D/g, "");
  return normalizeFieldText(trimmed);
}

function selectedCustomValue(element: HTMLInputElement): string[] {
  const root = element.closest<HTMLElement>(".atsx-select, .ud-select, [role='combobox']");
  const selected = root?.querySelector<HTMLElement>(
    ".selected-value, .ant-select-selection-item, [class*='selection-item'], [data-selected='true']"
  );
  return [element.value, selected?.textContent ?? ""].filter((value) => value.trim());
}

function currentControlCandidates(element: HTMLElement): string[] | null {
  if (element instanceof HTMLInputElement) {
    if (["file", "password", "hidden", "submit", "reset", "button", "image", "checkbox"].includes(element.type)) {
      return null;
    }
    if (element.closest(".atsx-date-picker-period, [class*='date-picker-period']")) return null;
    if (element.type === "radio") {
      if (!element.name) return null;
      const formRoot: ParentNode = element.form ?? document;
      const checked = Array.from(formRoot.querySelectorAll<HTMLInputElement>("input[type='radio']"))
        .find((radio) => radio.name === element.name && radio.checked);
      if (!checked) return [];
      return [checked.value, checked.labels?.[0]?.textContent ?? ""].filter((value) => value.trim());
    }
    if (element.closest(".atsx-select, .ud-select, [role='combobox']")) {
      return selectedCustomValue(element);
    }
    return element.value.trim() ? [element.value] : [];
  }
  if (element instanceof HTMLTextAreaElement) return element.value.trim() ? [element.value] : [];
  if (element instanceof HTMLSelectElement) {
    if (!element.value.trim()) return [];
    const option = element.selectedOptions[0];
    return [element.value, option?.textContent ?? ""].filter((value) => value.trim());
  }
  if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
    const value = element.textContent ?? "";
    return value.trim() ? [value] : [];
  }
  return null;
}

function compareControlValue(
  element: HTMLElement | null,
  elementId: string,
  profilePath: string | null,
  profileValue: string,
  excluded: boolean
): { status: PageValueComparison; token?: string } {
  if (!element || !profilePath || !profileValue.trim() || excluded) return { status: "unreadable" };
  const candidates = currentControlCandidates(element);
  if (candidates === null) return { status: "unreadable" };
  if (candidates.length === 0) return { status: "empty" };
  const normalizedProfile = normalizeComparableValue(profilePath, profileValue);
  const normalizedCandidates = candidates
    .map((value) => normalizeComparableValue(profilePath, value))
    .filter(Boolean);
  if (normalizedCandidates.some((value) => value === normalizedProfile)) return { status: "equal" };

  const token = comparisonToken();
  conflictSnapshots.set(token, {
    elementId,
    profilePath,
    normalizedPageValue: [...new Set(normalizedCandidates)].sort().join("\u001f")
  });
  return { status: "conflict", token };
}

function applySavedMapping(
  descriptor: ReturnType<typeof discoverFields>[number],
  match: MatchResult,
  mappings: SavedFieldMapping[],
  site: string
): { match: MatchResult; mappingSource: "rule" | "saved"; fingerprint: string } {
  const fingerprint = createFieldFingerprint(descriptor);
  const saved = mappings.find(
    (mapping) => mapping.site === site && mapping.fingerprint === fingerprint
  );
  const hardExcluded = match.excludedReason && match.excludedReason !== "unmatched";
  const canonical = saved
    ? canonicalFields.find((field) => field.path === saved.profilePath)
    : undefined;
  if (!saved || !canonical || hardExcluded) {
    return { match, mappingSource: "rule", fingerprint };
  }
  return {
    fingerprint,
    mappingSource: "saved",
    match: {
      elementId: descriptor.elementId,
      fieldLabel: match.fieldLabel,
      profilePath: canonical.path,
      canonicalLabel: canonical.label,
      score: 1,
      confidence: "high",
      reasons: ["使用你为此网站保存的字段对应关系"],
      requiresConfirmation: Boolean(canonical.sensitive)
    }
  };
}

export function scanPage(profile: CandidateProfile, mappings: SavedFieldMapping[] = []): ScanResult {
  conflictSnapshots.clear();
  const descriptors = discoverFields();
  const site = currentSite();
  const ruleMatches = matchFields(descriptors);
  const fields = ruleMatches.map<FillProposal>((ruleMatch, index) => {
    const applied = applySavedMapping(descriptors[index], ruleMatch, mappings, site);
    const match = applied.match;
    const value = match.profilePath ? getProfileValue(profile, match.profilePath) : "";
    const comparison = compareControlValue(
      findControlByElementId(match.elementId),
      match.elementId,
      match.profilePath,
      value,
      Boolean(match.excludedReason)
    );
    return {
      ...match,
      fingerprint: applied.fingerprint,
      mappingSource: applied.mappingSource,
      hasValue: value.trim().length > 0,
      valuePreview: previewValue(value),
      comparisonStatus: comparison.status,
      ...(comparison.token ? { comparisonToken: comparison.token } : {})
    };
  });
  const fillable = fields.filter(
    (field) => field.profilePath && field.hasValue && !field.excludedReason && field.comparisonStatus !== "equal"
  );

  return {
    title: document.title,
    site,
    fields,
    repeatableRecords: scanRepeatableRecords(profile),
    summary: {
      total: fields.length,
      fillable: fillable.length,
      high: fillable.filter((field) => field.confidence === "high" && !field.requiresConfirmation && field.comparisonStatus === "empty").length,
      needsConfirmation: fillable.filter(
        (field) => field.requiresConfirmation || field.comparisonStatus === "conflict" || field.comparisonStatus === "unreadable"
      ).length,
      excluded: fields.filter((field) => field.excludedReason).length,
      empty: fields.filter((field) => field.comparisonStatus === "empty").length,
      equal: fields.filter((field) => field.comparisonStatus === "equal").length,
      conflict: fields.filter((field) => field.comparisonStatus === "conflict").length,
      unreadable: fields.filter((field) => field.comparisonStatus === "unreadable").length
    }
  };
}

function dispatchEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: false }));
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
}

function fillRadio(element: HTMLInputElement, value: string): boolean {
  if (!element.name) return false;
  const formRoot: ParentNode = element.form ?? document;
  const radios = Array.from(formRoot.querySelectorAll<HTMLInputElement>("input[type='radio']"))
    .filter((radio) => radio.name === element.name && !radio.disabled);
  const normalizedTarget = normalizeFieldText(value);
  const target = radios.find((radio) => {
    const label = radio.labels?.[0]?.textContent ?? "";
    return [radio.value, label].some((candidate) => normalizeFieldText(candidate) === normalizedTarget);
  });
  if (!target) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  if (setter) setter.call(target, true);
  else target.checked = true;
  dispatchEvents(target);
  return true;
}

function fillSelect(element: HTMLSelectElement, value: string): boolean {
  const target = normalizeFieldText(value);
  const option = Array.from(element.options).find((candidate) =>
    [candidate.value, candidate.textContent ?? ""].some(
      (optionValue) => normalizeFieldText(optionValue) === target
    )
  );
  if (!option) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(element, option.value);
  else element.value = option.value;
  dispatchEvents(element);
  return true;
}

function isVisibleOption(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest("[hidden], [aria-hidden='true']")) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function waitForDropdown(delay = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function findVisibleExactOption(value: string): HTMLElement | undefined {
  const target = normalizeFieldText(value);
  return Array.from(document.querySelectorAll(
    "[role='option'], .atsx-select-dropdown-menu-item, .ud-select-option"
  )).filter(isVisibleOption).find((candidate) =>
    normalizeFieldText(candidate.textContent ?? "") === target
  );
}

async function fillCustomSelect(element: HTMLInputElement, value: string): Promise<boolean> {
  const selectRoot = element.closest<HTMLElement>(".atsx-select, .ud-select")
    ?? element.closest<HTMLElement>("[role='combobox']");
  const trigger = selectRoot?.querySelector<HTMLElement>("[role='combobox']") ?? selectRoot;
  if (!trigger) return false;

  trigger.click();
  await waitForDropdown();

  const target = normalizeFieldText(value);
  let option = findVisibleExactOption(value);
  if (!option) {
    setNativeValue(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await waitForDropdown(300);
    option = findVisibleExactOption(value);
  }
  if (!option) {
    setNativeValue(element, "");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.blur();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  }

  option.click();
  await waitForDropdown();
  const selectedText = normalizeFieldText(selectRoot?.textContent ?? "");
  return selectedText.includes(target);
}

export async function fillControl(element: HTMLElement, value: string): Promise<boolean> {
  if (element instanceof HTMLInputElement) {
    if (["file", "password", "hidden", "submit", "reset", "button", "image", "checkbox"].includes(element.type)) {
      return false;
    }
    if (element.type === "radio") return fillRadio(element, value);
    if (element.closest(".atsx-date-picker-period, [class*='date-picker-period']")) return false;
    if (element.closest(".atsx-select, .ud-select, [role='combobox']")) {
      return fillCustomSelect(element, value);
    }
    setNativeValue(element, value);
    dispatchEvents(element);
    return true;
  }
  if (element instanceof HTMLTextAreaElement) {
    setNativeValue(element, value);
    dispatchEvents(element);
    return true;
  }
  if (element instanceof HTMLSelectElement) return fillSelect(element, value);
  if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
    element.textContent = value;
    dispatchEvents(element);
    return true;
  }
  return false;
}

export async function fillPage(
  profile: CandidateProfile,
  selections: FillSelection[],
  mappings: SavedFieldMapping[] = []
): Promise<FillResult> {
  const site = currentSite();
  const outcomes: FillItemOutcome[] = [];
  for (const selection of selections) {
    const element = findControlByElementId(selection.elementId);
    if (!element) {
      outcomes.push({ ...selection, status: "skipped", reason: "field-not-found" });
      continue;
    }
    const descriptor = describeControl(element, 0);
    const verifiedMatch = applySavedMapping(
      descriptor,
      matchField(descriptor),
      mappings,
      site
    ).match;
    if (
      verifiedMatch.excludedReason ||
      verifiedMatch.profilePath !== selection.profilePath
    ) {
      outcomes.push({ ...selection, status: "skipped", reason: "mapping-changed" });
      continue;
    }
    const value = getProfileValue(profile, selection.profilePath).trim();
    if (!value) {
      outcomes.push({ ...selection, status: "skipped", reason: "empty-profile-value" });
      continue;
    }
    const comparison = compareControlValue(
      element,
      selection.elementId,
      selection.profilePath,
      value,
      false
    );
    if (comparison.status === "equal") {
      outcomes.push({ ...selection, status: "skipped", reason: "already-equal" });
      continue;
    }
    if (comparison.status === "unreadable") {
      outcomes.push({ ...selection, status: "skipped", reason: "current-value-unreadable" });
      continue;
    }
    if (comparison.status === "conflict") {
      const snapshot = selection.conflictApprovalToken
        ? conflictSnapshots.get(selection.conflictApprovalToken)
        : undefined;
      const currentSnapshot = comparison.token ? conflictSnapshots.get(comparison.token) : undefined;
      if (
        !snapshot || !currentSnapshot ||
        snapshot.elementId !== selection.elementId ||
        snapshot.profilePath !== selection.profilePath ||
        snapshot.normalizedPageValue !== currentSnapshot.normalizedPageValue
      ) {
        outcomes.push({ ...selection, status: "skipped", reason: "conflict-requires-rescan" });
        continue;
      }
    }
    if (!await fillControl(element, value)) {
      outcomes.push({ ...selection, status: "skipped", reason: "unsupported-value-or-control" });
      continue;
    }
    outcomes.push({ ...selection, status: "filled" });
  }

  return {
    outcomes,
    filledCount: outcomes.filter((outcome) => outcome.status === "filled").length,
    skippedCount: outcomes.filter((outcome) => outcome.status === "skipped").length
  };
}
