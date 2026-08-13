import type { PrivacySafeControl, PrivacySafePageState } from "../bridge/protocol";
import {
  type AtsAdapterControlSummary,
  type AtsAdapterFieldRule,
  type AtsAdapterManifest,
  type AtsAdapterPageSummary,
  type AtsAdapterPlan,
  type AtsAdapterPlannedField,
  type AtsAdapterPlannedRepeatable,
  type AtsAdapterSkipReason,
  type AtsFieldIntent
} from "./contracts";
import { assertAtsAdapterManifest } from "./manifestValidation";

export interface AtsAdapterDetectionResult {
  familyId: string;
  familyVersion: string;
  score: number;
  manifest: AtsAdapterManifest;
}

export type AtsAdapterResolution =
  | { status: "matched"; detection: AtsAdapterDetectionResult; plan: AtsAdapterPlan }
  | { status: "unmatched" | "ambiguous"; candidates: string[] };

function normalizeSemanticKey(value: string): string {
  return value.trim().toLowerCase().replace(/\[\d+\]/g, "[]");
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function templatePath(path: string): string {
  const segments = path.split("/").map((segment) => {
    if (/^\d{4,}$/.test(segment)) return ":id";
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
    if (/^[a-z0-9_-]{20,}$/i.test(segment)) return ":id";
    return segment;
  });
  return segments.join("/") || "/";
}

function summarizeControl(control: PrivacySafeControl): AtsAdapterControlSummary {
  return {
    controlKey: control.ref,
    role: control.role,
    tag: control.tag,
    ...(control.inputType ? { inputType: control.inputType } : {}),
    semantics: { ...control.semantics },
    ...(control.options ? { optionLabels: [...control.options] } : {}),
    disabled: control.disabled,
    readOnly: control.readOnly,
    required: control.required,
    multiple: control.multiple,
    boundary: control.boundary,
    safety: control.safety
  };
}

export function toAtsAdapterPageSummary(state: PrivacySafePageState): AtsAdapterPageSummary {
  return {
    snapshotKey: state.snapshotId,
    origin: state.origin,
    pathTemplate: templatePath(state.path),
    controls: state.controls.map(summarizeControl)
  };
}

function controlExactLabels(control: AtsAdapterControlSummary): string[] {
  return [...new Set([
    control.semantics.label,
    control.semantics.ariaLabel,
    control.semantics.placeholder
  ].filter((value): value is string => Boolean(value)).map(normalizeText).filter(Boolean))];
}

function detectionMarkerCount(summary: AtsAdapterPageSummary, manifest: AtsAdapterManifest): number {
  const technicalMarkers = new Set(manifest.detection.semanticMarkers.map(normalizeSemanticKey));
  const labelMarkers = new Set((manifest.detection.semanticLabelMarkers ?? []).map(normalizeText));
  const evidence = new Set<string>();
  for (const control of summary.controls) {
    const technicalKey = controlSemanticKey(control);
    if (technicalKey) {
      if (technicalMarkers.has(technicalKey)) evidence.add(`technical:${technicalKey}`);
      continue;
    }
    for (const label of controlExactLabels(control)) {
      if (labelMarkers.has(label)) evidence.add(`label:${label}`);
    }
  }
  return evidence.size;
}

function hostMatches(hostname: string, manifest: AtsAdapterManifest): { matched: boolean; exact: boolean } {
  const exact = manifest.detection.exactHosts.includes(hostname);
  const suffix = manifest.detection.hostSuffixes.some((candidate) =>
    hostname === candidate || hostname.endsWith(`.${candidate}`)
  );
  return { matched: exact || suffix, exact };
}

function detectionScore(summary: AtsAdapterPageSummary, manifest: AtsAdapterManifest): number | null {
  let url: URL;
  try {
    url = new URL(summary.origin);
  }
  catch {
    return null;
  }
  if (manifest.detection.httpsOnly && url.protocol !== "https:") return null;
  const host = hostMatches(url.hostname.toLowerCase(), manifest);
  if (!host.matched) return null;
  const pathMatched = manifest.detection.pathPrefixes.length === 0
    || manifest.detection.pathPrefixes.some((prefix) =>
      prefix === "/" ? summary.pathTemplate === "/" : summary.pathTemplate.startsWith(prefix)
    );
  if (!pathMatched) return null;
  const markerMatches = detectionMarkerCount(summary, manifest);
  if (markerMatches < manifest.detection.minimumSemanticMarkers) return null;
  return (host.exact ? 1_000 : 500)
    + (manifest.detection.pathPrefixes.length > 0 ? 100 : 0)
    + markerMatches;
}

function controlSemanticKey(control: AtsAdapterControlSummary): string {
  return normalizeSemanticKey(control.semantics.name ?? "");
}

function exactControlSemanticKey(control: AtsAdapterControlSummary): string {
  return (control.semantics.name ?? "").trim().toLowerCase();
}

function ruleMatchesLabel(control: AtsAdapterControlSummary, rule: AtsAdapterFieldRule): boolean {
  const aliases = new Set((rule.semanticLabels ?? []).map(normalizeText));
  return aliases.size > 0 && controlExactLabels(control).some((label) => aliases.has(label));
}

function inferredRecordIndex(
  summary: AtsAdapterPageSummary,
  control: AtsAdapterControlSummary,
  rule: AtsAdapterFieldRule
): number | null {
  const technicalIndex = recordIndex(control);
  if (technicalIndex !== null) return technicalIndex;
  if (controlSemanticKey(control) || !ruleMatchesLabel(control, rule)) return null;
  const matches = summary.controls.filter((candidate) =>
    !controlSemanticKey(candidate)
    && ruleMatchesLabel(candidate, rule)
    && rule.roles.includes(candidate.role)
  );
  const index = matches.findIndex((candidate) => candidate.controlKey === control.controlKey);
  return index >= 0 ? index : null;
}

function recordIndex(control: AtsAdapterControlSummary): number | null {
  const match = /\[(\d+)\]/.exec(control.semantics.name ?? "");
  return match ? Number(match[1]) : null;
}

function controlSemanticText(control: AtsAdapterControlSummary): string {
  return normalizeText([
    control.semantics.label,
    control.semantics.ariaLabel,
    control.semantics.placeholder,
    control.semantics.name,
    control.semantics.nearbyText
  ].filter(Boolean).join(" "));
}

function matchesAnyLabel(control: AtsAdapterControlSummary, labels: string[]): boolean {
  const corpus = controlSemanticText(control);
  return Boolean(corpus) && labels.some((label) => corpus.includes(normalizeText(label)));
}

function plannedRepeatables(
  summary: AtsAdapterPageSummary,
  manifest: AtsAdapterManifest
): AtsAdapterPlannedRepeatable[] {
  return manifest.repeatables.map((rule) => {
    const prefixes = rule.recordSemanticPrefixes.map(normalizeSemanticKey);
    const sectionKeys = rule.sectionSemanticKeys.map(normalizeSemanticKey);
    const recordIndexes = [...new Set(summary.controls.flatMap((control) => {
      const key = controlSemanticKey(control);
      const index = recordIndex(control);
      return index !== null && prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`))
        ? [index]
        : [];
    }))].sort((left, right) => left - right);
    const safeButtons = summary.controls.filter((control) =>
      control.role === "button"
      && control.safety === "ordinary"
      && !control.disabled
      && !control.readOnly
      && !finalSubmitLabel(control, manifest)
    );
    const matchesSectionKey = (control: AtsAdapterControlSummary) => {
      const key = controlSemanticKey(control);
      return !key || sectionKeys.some((sectionKey) => key === sectionKey || key.startsWith(`${sectionKey}.`));
    };
    const matchesRecordKey = (control: AtsAdapterControlSummary) => {
      const key = controlSemanticKey(control);
      return prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`));
    };
    return {
      collection: rule.collection,
      recordIndexes,
      addControlKeys: safeButtons
        .filter((control) => matchesAnyLabel(control, rule.addControlLabels) && matchesSectionKey(control))
        .map((control) => control.controlKey),
      saveControls: safeButtons
        .filter((control) => matchesAnyLabel(control, rule.saveControlLabels))
        .filter((control) => matchesRecordKey(control)
          || (!controlSemanticKey(control) && manifest.repeatables.length === 1))
        .map((control) => ({ controlKey: control.controlKey, recordIndex: recordIndex(control) })),
      maximumCreatesPerRun: rule.maximumCreatesPerRun
    };
  });
}

function resolvedIntent(intent: AtsFieldIntent, index: number | null): AtsFieldIntent | null {
  const resolve = (path: string) => {
    if (!path.includes("{index}")) return path;
    return index === null ? null : path.replaceAll("{index}", String(index));
  };
  if (intent.kind === "profile-field") {
    const path = resolve(intent.pathPattern);
    return path ? { kind: "profile-field", pathPattern: path } : null;
  }
  if (intent.kind === "profile-range") {
    const start = resolve(intent.startPathPattern);
    const end = resolve(intent.endPathPattern);
    return start && end
      ? { kind: "profile-range", startPathPattern: start, endPathPattern: end }
      : null;
  }
  return intent;
}

function finalSubmitLabel(control: AtsAdapterControlSummary, manifest: AtsAdapterManifest): boolean {
  if (control.safety === "final-submit") return true;
  const semanticText = normalizeText([
    control.semantics.label,
    control.semantics.ariaLabel,
    control.semantics.placeholder,
    control.semantics.name,
    control.semantics.nearbyText
  ].filter(Boolean).join(" "));
  return manifest.exclusions.finalSubmitLabels.some((label) => semanticText.includes(normalizeText(label)));
}

function safetyAllows(control: AtsAdapterControlSummary, rule: AtsAdapterFieldRule): boolean {
  if (control.safety === "ordinary") return rule.intent.kind !== "saved-resume";
  return control.safety === "file"
    && rule.intent.kind === "saved-resume"
    && rule.decision === "confirm";
}

function skip(control: AtsAdapterControlSummary, reason: AtsAdapterSkipReason) {
  return { controlKey: control.controlKey, reason } as const;
}

export class AtsAdapterRegistry {
  private readonly manifests: AtsAdapterManifest[];

  constructor(manifests: readonly AtsAdapterManifest[]) {
    manifests.forEach(assertAtsAdapterManifest);
    const ids = manifests.map((manifest) => manifest.family.id);
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate ATS adapter family id.");
    this.manifests = manifests.map((manifest) => structuredClone(manifest));
  }

  detect(summary: AtsAdapterPageSummary): AtsAdapterResolution {
    const candidates = this.manifests
      .map((manifest) => ({ manifest, score: detectionScore(summary, manifest) }))
      .filter((candidate): candidate is { manifest: AtsAdapterManifest; score: number } => candidate.score !== null)
      .sort((left, right) => right.score - left.score || left.manifest.family.id.localeCompare(right.manifest.family.id));
    if (candidates.length === 0) return { status: "unmatched", candidates: [] };
    const best = candidates[0]!;
    const tied = candidates.filter((candidate) => candidate.score === best.score);
    if (tied.length !== 1) {
      return { status: "ambiguous", candidates: tied.map((candidate) => candidate.manifest.family.id) };
    }
    const detection: AtsAdapterDetectionResult = {
      familyId: best.manifest.family.id,
      familyVersion: best.manifest.family.version,
      score: best.score,
      manifest: structuredClone(best.manifest)
    };
    return {
      status: "matched",
      detection,
      plan: this.plan(summary, best.manifest)
    };
  }

  private plan(summary: AtsAdapterPageSummary, manifest: AtsAdapterManifest): AtsAdapterPlan {
    const fields: AtsAdapterPlannedField[] = [];
    const skipped: AtsAdapterPlan["skipped"] = [];
    for (const control of summary.controls) {
      if (control.disabled || control.readOnly) {
        skipped.push(skip(control, "unavailable-control"));
        continue;
      }
      if (finalSubmitLabel(control, manifest)) {
        skipped.push(skip(control, "final-submit"));
        continue;
      }
      const semanticKey = controlSemanticKey(control);
      const semanticRules = semanticKey
        ? manifest.fields.filter((rule) => rule.semanticKeys.includes(semanticKey))
        : manifest.fields.filter((rule) => ruleMatchesLabel(control, rule));
      if (semanticRules.length === 0) {
        skipped.push(skip(control, "unknown-field"));
        continue;
      }
      const compatibleRules = semanticRules.filter((rule) => rule.roles.includes(control.role));
      if (compatibleRules.length === 0) {
        skipped.push(skip(control, "incompatible-role"));
        continue;
      }
      if (compatibleRules.length !== 1) {
        skipped.push(skip(control, "ambiguous-rule"));
        continue;
      }
      const rule = compatibleRules[0]!;
      if (rule.decision === "exclude" || rule.intent.kind === "manual") {
        skipped.push(skip(control, "adapter-excluded"));
        continue;
      }
      if (!safetyAllows(control, rule)) {
        skipped.push(skip(control, "unsafe-control"));
        continue;
      }
      const intent = resolvedIntent(rule.intent, inferredRecordIndex(summary, control, rule));
      if (!intent) {
        skipped.push(skip(control, "missing-record-index"));
        continue;
      }
      fields.push({
        controlKey: control.controlKey,
        ruleId: rule.id,
        semanticKey: exactControlSemanticKey(control)
          || control.semantics.label
          || control.semantics.ariaLabel
          || control.semantics.placeholder
          || semanticKey,
        label: control.semantics.label
          ?? control.semantics.ariaLabel
          ?? control.semantics.placeholder
          ?? control.semantics.name
          ?? semanticKey,
        role: control.role,
        tag: control.tag,
        boundary: control.boundary,
        capability: rule.capability,
        decision: rule.decision,
        intent,
        verification: rule.verification
      });
    }
    return {
      familyId: manifest.family.id,
      familyVersion: manifest.family.version,
      snapshotKey: summary.snapshotKey,
      origin: summary.origin,
      pathTemplate: summary.pathTemplate,
      fields,
      repeatables: plannedRepeatables(summary, manifest),
      skipped
    };
  }
}
