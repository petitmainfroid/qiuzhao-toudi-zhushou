import type { AtsFamilyTemplate, AtsTemplateRepeatableRule } from "../ats/templateContracts";
import type { RepeatableGroupKey } from "../domain/repeatableGroups";
import { normalizeComparableValue } from "./valueNormalization";
import { readControlCandidates, type PageControl } from "./pageDriver";

export type RepeatableLifecycleReason =
  | "no-save-required"
  | "ambiguous-save-control"
  | "save-control-changed"
  | "save-control-disabled"
  | "navigation-changed"
  | "mutation-timeout"
  | "verification-failed";

export interface RepeatableLifecycleWrite {
  element: PageControl;
  profilePath: string;
  value: string;
}

export interface RepeatableLifecycleResult {
  group: RepeatableGroupKey;
  index: number;
  status: "saved" | "verified" | "stopped";
  fieldCount: number;
  saveClicked: boolean;
  reason?: RepeatableLifecycleReason;
}

export interface RepeatableLifecycleOptions {
  template: AtsFamilyTemplate;
  mutationTimeoutMs?: number;
}

interface RecordPlan {
  group: RepeatableGroupKey;
  index: number;
  root: HTMLElement;
  writes: RepeatableLifecycleWrite[];
  rule: AtsTemplateRepeatableRule;
  finalSubmitExclusions: string[];
}

const FINAL_LABEL_PATTERN = /提交|投递|申请|submit|apply/i;

function pathOwner(
  profilePath: string,
  rules: readonly AtsTemplateRepeatableRule[]
): { group: RepeatableGroupKey; index: number; rule: AtsTemplateRepeatableRule } | null {
  const match = /^([A-Za-z][A-Za-z0-9]*)\.(\d+)\./.exec(profilePath);
  if (!match) return null;
  const rule = rules.find((candidate) => candidate.group === match[1]);
  return rule ? { group: rule.group, index: Number(match[2]), rule } : null;
}

function recordRoot(element: PageControl, rule: AtsTemplateRepeatableRule): HTMLElement | null {
  return element.closest<HTMLElement>(rule.recordRootSelectors.join(", "));
}

function buildPlans(
  writes: readonly RepeatableLifecycleWrite[],
  template: AtsFamilyTemplate
): RecordPlan[] {
  const byRoot = new Map<HTMLElement, RecordPlan>();
  for (const write of writes) {
    const owner = pathOwner(write.profilePath, template.repeatableRules);
    const root = owner ? recordRoot(write.element, owner.rule) : null;
    if (!owner || !root) continue;
    const existing = byRoot.get(root);
    if (existing) existing.writes.push(write);
    else byRoot.set(root, {
      ...owner,
      root,
      writes: [write],
      finalSubmitExclusions: template.finalSubmitExclusions
    });
  }
  return [...byRoot.values()].sort((left, right) =>
    left.group.localeCompare(right.group) || left.index - right.index
  );
}

function saveCandidates(plan: RecordPlan): HTMLElement[] {
  const saveLabels = new Set(plan.rule.saveLabels);
  return Array.from(plan.root.querySelectorAll<HTMLElement>(
    plan.rule.saveControlSelectors.join(", ")
  )).filter((candidate) => {
    const label = (candidate.textContent ?? "").replace(/\s+/g, " ").trim();
    const templateFinalSubmit = plan.finalSubmitExclusions.some((item) => label.includes(item));
    if (!saveLabels.has(label) || FINAL_LABEL_PATTERN.test(label) || templateFinalSubmit) return false;
    if (candidate.closest("[data-final-submit], .final-submit")) return false;
    if (candidate instanceof HTMLButtonElement && candidate.type === "submit") return false;
    return true;
  });
}

function controlDisabled(control: HTMLElement): boolean {
  return ("disabled" in control && Boolean((control as HTMLButtonElement).disabled))
    || control.getAttribute("aria-disabled") === "true";
}

function saveFingerprint(plan: RecordPlan, control: HTMLElement): string {
  return [
    plan.group,
    plan.index,
    plan.root.querySelectorAll("input, textarea, select, [contenteditable='true']").length,
    control.tagName.toLowerCase(),
    [...control.classList].sort().join("."),
    (control.textContent ?? "").replace(/\s+/g, " ").trim()
  ].join("|");
}

function valuesVerified(writes: readonly RepeatableLifecycleWrite[]): boolean {
  return writes.every((write) => {
    if (!write.element.isConnected) return false;
    const candidates = readControlCandidates(write.element);
    if (!candidates?.length) return false;
    const expected = normalizeComparableValue(write.profilePath, write.value);
    return Boolean(expected) && candidates.some(
      (candidate) => normalizeComparableValue(write.profilePath, candidate) === expected
    );
  });
}

function savedState(plan: RecordPlan, original: HTMLElement): boolean {
  if (!original.isConnected || controlDisabled(original)) return true;
  if (plan.root.dataset.saved === "true" || plan.root.getAttribute("data-status") === "saved") return true;
  if (plan.root.classList.contains("saved") || plan.root.classList.contains("is-saved")) return true;
  return !plan.rule.saveLabels.includes((original.textContent ?? "").replace(/\s+/g, " ").trim());
}

async function waitForSavedState(plan: RecordPlan, control: HTMLElement, timeoutMs: number): Promise<boolean> {
  if (savedState(plan, control)) return true;
  return new Promise((resolve) => {
    let complete = false;
    const finish = (value: boolean) => {
      if (complete) return;
      complete = true;
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(timer);
      resolve(value);
    };
    const check = () => {
      if (savedState(plan, control)) finish(true);
    };
    const observer = new MutationObserver(check);
    observer.observe(plan.root, { childList: true, subtree: true, attributes: true, characterData: true });
    const interval = window.setInterval(check, 25);
    const timer = window.setTimeout(() => finish(false), timeoutMs);
  });
}

function currentHref(): string {
  return typeof location === "undefined" ? "local" : location.href;
}

async function completePlan(plan: RecordPlan, timeoutMs: number): Promise<RepeatableLifecycleResult> {
  const base = { group: plan.group, index: plan.index, fieldCount: plan.writes.length };
  if (!valuesVerified(plan.writes)) {
    return { ...base, status: "stopped", saveClicked: false, reason: "verification-failed" };
  }

  const candidates = saveCandidates(plan);
  if (candidates.length === 0) {
    return { ...base, status: "verified", saveClicked: false, reason: "no-save-required" };
  }
  if (candidates.length > 1) {
    return { ...base, status: "stopped", saveClicked: false, reason: "ambiguous-save-control" };
  }
  const save = candidates[0];
  if (controlDisabled(save)) {
    return { ...base, status: "stopped", saveClicked: false, reason: "save-control-disabled" };
  }
  const initialHref = currentHref();
  const fingerprint = saveFingerprint(plan, save);
  await Promise.resolve();
  if (!save.isConnected || saveFingerprint(plan, save) !== fingerprint) {
    return { ...base, status: "stopped", saveClicked: false, reason: "save-control-changed" };
  }

  save.click();
  const mutated = await waitForSavedState(plan, save, timeoutMs);
  if (currentHref() !== initialHref) {
    return { ...base, status: "stopped", saveClicked: true, reason: "navigation-changed" };
  }
  if (!mutated) {
    return { ...base, status: "stopped", saveClicked: true, reason: "mutation-timeout" };
  }
  if (!valuesVerified(plan.writes)) {
    return { ...base, status: "stopped", saveClicked: true, reason: "verification-failed" };
  }
  return { ...base, status: "saved", saveClicked: true };
}

export async function completeRepeatableLifecycles(
  writes: readonly RepeatableLifecycleWrite[],
  options: RepeatableLifecycleOptions
): Promise<RepeatableLifecycleResult[]> {
  const timeoutMs = Math.min(2_000, Math.max(50, Math.round(options.mutationTimeoutMs ?? 800)));
  const results: RepeatableLifecycleResult[] = [];
  for (const plan of buildPlans(writes, options.template)) {
    results.push(await completePlan(plan, timeoutMs));
    if (results.at(-1)?.reason === "navigation-changed") break;
  }
  return results;
}
