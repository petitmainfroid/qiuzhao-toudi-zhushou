import { getProfileValue, type CandidateProfile } from "../domain/profile";
import { canonicalFields } from "../matching/catalog";
import { describeControl, discoverFields, findControlByElementId } from "../matching/dom";
import type { MatchResult } from "../matching/types";
import { createFieldFingerprint } from "../mapping/fingerprint";
import type { SavedFieldMapping } from "../mapping/types";
import { profileValuePreview as safeProfileValuePreview } from "../privacy/sensitivePreview";
import { readControlCandidates, writeControlVerified } from "./pageDriver";
import {
  scanRepeatableRecords,
  supportsRepeatableRecordAdapter,
  type RepeatableRecordsScan
} from "./repeatableRecords";
import { scanResumeAttachment, type ResumeAttachmentScan } from "./resumeAttachment";
import { defaultAtsMatchingRuntime } from "../ats/defaultRuntime";
import {
  type AtsMatchingRuntime,
  type AtsScanMetadata
} from "../ats/matchingRuntime";
import { normalizeComparableValue } from "./valueNormalization";
import {
  completeRepeatableLifecycles,
  type RepeatableLifecycleResult,
  type RepeatableLifecycleWrite
} from "./repeatableLifecycle";

export { normalizeComparableValue } from "./valueNormalization";

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
  ats?: AtsScanMetadata;
  fields: FillProposal[];
  repeatableRecords?: RepeatableRecordsScan;
  resumeAttachment?: ResumeAttachmentScan;
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
  repeatableLifecycles?: RepeatableLifecycleResult[];
}

function previewValue(profilePath: string, value: string): string {
  const collapsed = safeProfileValuePreview(profilePath, value);
  return collapsed.length > 72 ? `${collapsed.slice(0, 69)}…` : collapsed;
}

function profileWriteValue(profile: CandidateProfile, match: MatchResult): string {
  if (!match.profilePath) return "";
  const primary = getProfileValue(profile, match.profilePath).trim();
  if (!match.companionProfilePath) return primary;
  const companion = getProfileValue(profile, match.companionProfilePath).trim();
  if (!primary || !companion) return "";
  return JSON.stringify({ start: primary, end: companion });
}

function profileValuePreview(profile: CandidateProfile, match: MatchResult): string {
  if (!match.profilePath) return "";
  const primary = getProfileValue(profile, match.profilePath).trim();
  if (!match.companionProfilePath) return primary;
  const companion = getProfileValue(profile, match.companionProfilePath).trim();
  return primary && companion ? `${primary} → ${companion}` : "";
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

function currentControlCandidates(element: HTMLElement): string[] | null {
  return readControlCandidates(element);
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
  if (match.companionProfilePath) {
    return { match, mappingSource: "rule", fingerprint };
  }
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
      requiresConfirmation: Boolean(canonical.sensitive),
      ...(match.atsTemplate ? { atsTemplate: match.atsTemplate } : {})
    }
  };
}

export function scanPage(
  profile: CandidateProfile,
  mappings: SavedFieldMapping[] = [],
  atsRuntime: AtsMatchingRuntime = defaultAtsMatchingRuntime
): ScanResult {
  conflictSnapshots.clear();
  const descriptors = discoverFields();
  const site = currentSite();
  const atsSession = atsRuntime.resolve(descriptors);
  const ruleMatches = descriptors.map((descriptor) => atsSession.match(descriptor));
  const fields = ruleMatches.map<FillProposal>((ruleMatch, index) => {
    const applied = applySavedMapping(descriptors[index], ruleMatch, mappings, site);
    const match = applied.match;
    const value = profileWriteValue(profile, match);
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
      valuePreview: previewValue(match.profilePath ?? "", profileValuePreview(profile, match)),
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
    ats: atsSession.metadata,
    fields,
    repeatableRecords: scanRepeatableRecords(profile, { template: atsSession.template }),
    resumeAttachment: scanResumeAttachment(),
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

export async function fillControl(element: HTMLElement, value: string): Promise<boolean> {
  const result = await writeControlVerified(element, value);
  return result.status === "verified";
}

export async function fillPage(
  profile: CandidateProfile,
  selections: FillSelection[],
  mappings: SavedFieldMapping[] = [],
  atsRuntime: AtsMatchingRuntime = defaultAtsMatchingRuntime
): Promise<FillResult> {
  const site = currentSite();
  const pageDescriptors = discoverFields();
  const descriptorByElementId = new Map(pageDescriptors.map((descriptor) => [descriptor.elementId, descriptor]));
  const atsSession = atsRuntime.resolve(pageDescriptors);
  const outcomes: FillItemOutcome[] = [];
  const repeatableWrites: RepeatableLifecycleWrite[] = [];
  for (const selection of selections) {
    const element = findControlByElementId(selection.elementId);
    if (!element) {
      outcomes.push({ ...selection, status: "skipped", reason: "field-not-found" });
      continue;
    }
    const descriptor = descriptorByElementId.get(selection.elementId) ?? describeControl(element, 0);
    const verifiedMatch = applySavedMapping(
      descriptor,
      atsSession.match(descriptor),
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
    const value = profileWriteValue(profile, verifiedMatch);
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
    const write = await writeControlVerified(element, value, {
      normalize: (candidate) => normalizeComparableValue(selection.profilePath, candidate),
      ...(verifiedMatch.atsTemplate ? {
        driverHint: verifiedMatch.atsTemplate.driverHint,
        verification: verifiedMatch.atsTemplate.verification
      } : {})
    });
    if (write.status !== "verified") {
      outcomes.push({
        ...selection,
        status: "skipped",
        reason: write.reason === "verification-failed"
          ? "write-verification-failed"
          : "unsupported-value-or-control"
      });
      continue;
    }
    outcomes.push({ ...selection, status: "filled" });
    repeatableWrites.push({ element, profilePath: selection.profilePath, value });
  }

  const repeatableLifecycles = supportsRepeatableRecordAdapter({ template: atsSession.template })
    ? await completeRepeatableLifecycles(repeatableWrites, { template: atsSession.template })
    : [];

  return {
    outcomes,
    filledCount: outcomes.filter((outcome) => outcome.status === "filled").length,
    skippedCount: outcomes.filter((outcome) => outcome.status === "skipped").length,
    ...(repeatableLifecycles.length > 0 ? { repeatableLifecycles } : {})
  };
}
