import { getProfileValue, type CandidateProfile } from "../domain/profile";
import { canonicalFields } from "../matching/catalog";
import type { FillProposal, FillResult, FillSelection, ScanResult } from "../content/engine";
import type {
  RepeatableCreateReason,
  RepeatableCreateResult,
  RepeatableGroupKey,
  RepeatableGroupScan,
  RepeatableRecordsScan
} from "../content/repeatableRecords";
import type {
  ResumeAttachmentCandidate,
  ResumeAttachmentResult,
  ResumeAttachmentScan
} from "../content/resumeAttachment";
import type { SavedFieldMapping } from "../mapping/types";
import type { PowerSessionView } from "../bridge/protocol";
import { AtsAdapterRegistry } from "../adapter-sdk/adapterRuntime";
import type {
  AtsAdapterPlan,
  AtsAdapterPlannedField,
  AtsAdapterSkipReason,
  AtsRepeatableCollection
} from "../adapter-sdk/contracts";
import type { RecruitmentKernelApi } from "../adapter-sdk/kernelApi";
import {
  RecruitmentAdapterOrchestrator,
  type AtsFieldExecutionOutcome,
  type AtsRepeatableExecutionReason
} from "../adapter-sdk/orchestrator";
import type { PageBridge } from "./pageBridge";

export interface AdapterPageBridgeSession {
  status(): Promise<PowerSessionView>;
}

interface ActiveAdapterPlan {
  sessionId: string;
  profileRevision: string;
  plan: AtsAdapterPlan;
}

const repeatableLabels: Record<AtsRepeatableCollection, string> = {
  education: "教育经历",
  workExperiences: "实习或工作经历",
  projects: "项目经历",
  workSamples: "作品",
  awards: "获奖经历",
  languages: "语言能力"
};

const skipReasons: Record<AtsAdapterSkipReason, string> = {
  "unknown-field": "ATS 适配器没有声明这个字段，已跳过",
  "ambiguous-rule": "多个适配规则同时命中，已停止猜测",
  "incompatible-role": "控件类型与 ATS 适配规则不兼容",
  "missing-record-index": "重复区块没有可靠的记录序号",
  "adapter-excluded": "ATS 适配器要求手动处理这个字段",
  "unsafe-control": "该控件属于受保护类型，不能自动填写",
  "final-submit": "最终投递控件永远不会自动操作",
  "unavailable-control": "控件已禁用或只读"
};

function profileRevision(profile: CandidateProfile): string {
  return JSON.stringify(profile);
}

function normalizedCatalogPath(path: string): string {
  return path.replace(/\.\d+(?=\.|$)/g, ".0");
}

function canonicalField(path: string) {
  return canonicalFields.find((field) => field.path === normalizedCatalogPath(path));
}

function profilePaths(field: AtsAdapterPlannedField): { primary: string; companion?: string } | null {
  if (field.intent.kind === "profile-field") return { primary: field.intent.pathPattern };
  if (field.intent.kind === "profile-range") {
    return {
      primary: field.intent.startPathPattern,
      companion: field.intent.endPathPattern
    };
  }
  return null;
}

function proposalFingerprint(plan: AtsAdapterPlan, field: AtsAdapterPlannedField): string {
  const paths = profilePaths(field);
  return [
    "adapter",
    plan.familyId,
    plan.familyVersion,
    field.ruleId,
    field.semanticKey,
    paths?.primary ?? field.intent.kind,
    paths?.companion ?? ""
  ].join("|");
}

function plannedProposal(profile: CandidateProfile, plan: AtsAdapterPlan, field: AtsAdapterPlannedField): FillProposal {
  const paths = profilePaths(field);
  if (!paths) {
    return {
      elementId: field.controlKey,
      fieldLabel: field.label,
      profilePath: null,
      canonicalLabel: null,
      score: 0,
      confidence: "none",
      reasons: [field.intent.kind === "saved-resume"
        ? "简历附件需要通过单独的本地文件上传确认"
        : "这个字段需要手动处理"],
      requiresConfirmation: true,
      excludedReason: "unsupported-control",
      fingerprint: proposalFingerprint(plan, field),
      mappingSource: "rule",
      hasValue: false,
      valuePreview: "",
      comparisonStatus: "unreadable"
    };
  }

  const primaryValue = getProfileValue(profile, paths.primary).trim();
  const companionValue = paths.companion
    ? getProfileValue(profile, paths.companion).trim()
    : "";
  const hasValue = paths.companion
    ? Boolean(primaryValue && companionValue)
    : Boolean(primaryValue);
  const canonical = canonicalField(paths.primary);

  return {
    elementId: field.controlKey,
    fieldLabel: field.label,
    profilePath: paths.primary,
    ...(paths.companion ? { companionProfilePath: paths.companion } : {}),
    canonicalLabel: canonical?.label ?? field.label,
    score: 1,
    confidence: "high",
    reasons: [
      `由 ${plan.familyId} 适配器的声明式规则 ${field.ruleId} 精确映射`,
      "K5 隐私扫描不读取网页现有值，填写前必须由你确认"
    ],
    requiresConfirmation: true,
    fingerprint: proposalFingerprint(plan, field),
    mappingSource: "rule",
    hasValue,
    valuePreview: hasValue
      ? paths.companion ? `${primaryValue} → ${companionValue}` : primaryValue
      : "",
    comparisonStatus: "unreadable"
  };
}

function skippedProposal(plan: AtsAdapterPlan, controlKey: string, reason: AtsAdapterSkipReason): FillProposal {
  return {
    elementId: controlKey,
    fieldLabel: "已跳过的网页控件",
    profilePath: null,
    canonicalLabel: null,
    score: 0,
    confidence: "none",
    reasons: [skipReasons[reason]],
    requiresConfirmation: true,
    excludedReason: reason === "unavailable-control" ? "disabled-or-readonly" : "unmatched",
    fingerprint: ["adapter", plan.familyId, plan.familyVersion, "skipped", controlKey].join("|"),
    mappingSource: "rule",
    hasValue: false,
    valuePreview: "",
    comparisonStatus: "unreadable"
  };
}

function meaningfulRecord(record: object): boolean {
  return Object.entries(record).some(([key, value]) =>
    key !== "id" && typeof value === "string" && value.trim().length > 0
  );
}

function profileCollection(profile: CandidateProfile, collection: AtsRepeatableCollection): object[] {
  return profile[collection];
}

function contiguousIndexes(indexes: number[]): boolean {
  return indexes.every((value, index) => value === index);
}

function repeatableGroup(
  profile: CandidateProfile,
  repeatable: AtsAdapterPlan["repeatables"][number]
): RepeatableGroupScan {
  const profileCount = profileCollection(profile, repeatable.collection).filter(meaningfulRecord).length;
  const pageCount = repeatable.recordIndexes.length;
  const missingCount = Math.max(0, profileCount - pageCount);
  let reason: RepeatableCreateReason | undefined;
  if (!contiguousIndexes(repeatable.recordIndexes)) reason = "page-structure-changed";
  else if (missingCount === 0) reason = profileCount < pageCount ? "page-has-extra-records" : "up-to-date";
  else if (repeatable.addControlKeys.length === 0) reason = "add-control-not-found";
  else if (repeatable.addControlKeys.length > 1) reason = "ambiguous-add-control";
  return {
    key: repeatable.collection,
    label: repeatableLabels[repeatable.collection],
    profileCount,
    pageCount,
    indexes: [...repeatable.recordIndexes],
    missingCount,
    canCreate: missingCount > 0 && !reason,
    ...(reason ? { reason } : {})
  };
}

function repeatableScan(profile: CandidateProfile, plan: AtsAdapterPlan): RepeatableRecordsScan {
  return {
    adapterId: plan.familyId,
    groups: plan.repeatables.map((repeatable) => repeatableGroup(profile, repeatable))
  };
}

function resumeAttachment(sessionId: string, plan: AtsAdapterPlan): ResumeAttachmentScan {
  const candidates = plan.fields.filter((field) => field.intent.kind === "saved-resume");
  if (candidates.length === 0) return { status: "not-found", candidate: null, candidateCount: 0 };
  if (candidates.length !== 1) {
    return { status: "ambiguous", candidate: null, candidateCount: candidates.length };
  }
  const field = candidates[0]!;
  return {
    status: "ready",
    candidateCount: 1,
    candidate: {
      elementId: field.controlKey,
      fieldLabel: field.label,
      destinationOrigin: plan.origin,
      acceptsPdf: true,
      kernelTarget: {
        sessionId,
        snapshotId: plan.snapshotKey,
        ref: field.controlKey
      }
    }
  };
}

function scanResult(profile: CandidateProfile, sessionId: string, plan: AtsAdapterPlan): ScanResult {
  const fields = [
    ...plan.fields.map((field) => plannedProposal(profile, plan, field)),
    ...plan.skipped.map((field) => skippedProposal(plan, field.controlKey, field.reason))
  ];
  const fillable = fields.filter((field) => field.profilePath && field.hasValue && !field.excludedReason);
  return {
    title: `${plan.familyId} 招聘表单`,
    site: plan.origin,
    fields,
    repeatableRecords: repeatableScan(profile, plan),
    resumeAttachment: resumeAttachment(sessionId, plan),
    summary: {
      total: fields.length,
      fillable: fillable.length,
      high: 0,
      needsConfirmation: fillable.length,
      excluded: fields.filter((field) => Boolean(field.excludedReason)).length,
      empty: 0,
      equal: 0,
      conflict: 0,
      unreadable: fields.length
    }
  };
}

function executionReason(outcome: AtsFieldExecutionOutcome): string | undefined {
  return outcome.reason ? String(outcome.reason) : undefined;
}

function mapRepeatableReason(reason?: AtsRepeatableExecutionReason): RepeatableCreateReason | undefined {
  if (!reason) return undefined;
  if (reason === "non-contiguous-records" || reason === "page-structure-changed") return "page-structure-changed";
  if (reason === "family-changed" || reason === "origin-changed" || reason === "session-inactive") {
    return "navigation-changed";
  }
  if (reason === "add-control-unavailable") return "add-control-not-found";
  if (reason === "add-control-ambiguous") return "ambiguous-add-control";
  if (reason === "limit-reached") return "limit-reached";
  if (reason === "disabled-or-readonly") return "add-control-disabled";
  if (reason === "stale-reference") return "add-control-changed";
  if (reason === "empty-profile-value") return "up-to-date";
  if (reason === "not-in-plan") return "no-supported-adapter";
  return "page-structure-changed";
}

/**
 * Compatibility bridge for moving the existing side-panel UI onto the K5 kernel.
 * It is intentionally injectable and is not the production default until real ATS
 * manifests are registered. Saved field mappings never override adapter declarations.
 */
export class AdapterPageBridge implements PageBridge {
  private readonly orchestrator: RecruitmentAdapterOrchestrator;
  private active: ActiveAdapterPlan | null = null;

  constructor(
    kernel: RecruitmentKernelApi,
    adapters: AtsAdapterRegistry,
    private readonly session: AdapterPageBridgeSession
  ) {
    this.orchestrator = new RecruitmentAdapterOrchestrator(kernel, adapters);
    this.kernel = kernel;
  }

  private readonly kernel: RecruitmentKernelApi;

  private async activeSessionId(): Promise<string> {
    const session = await this.session.status();
    if (session.status !== "active" || !session.sessionId) throw new Error("kernel-session-inactive");
    return session.sessionId;
  }

  private requireActive(profile: CandidateProfile): ActiveAdapterPlan {
    if (!this.active) throw new Error("adapter-plan-missing-rescan-required");
    if (this.active.profileRevision !== profileRevision(profile)) {
      throw new Error("profile-changed-rescan-required");
    }
    return this.active;
  }

  async scan(profile: CandidateProfile, _mappings: SavedFieldMapping[] = []): Promise<ScanResult> {
    const sessionId = await this.activeSessionId();
    const resolution = await this.orchestrator.scan(sessionId);
    if (resolution.status !== "matched") {
      this.active = null;
      throw new Error(resolution.status === "ambiguous" ? "ats-adapter-ambiguous" : "ats-adapter-unmatched");
    }
    this.active = { sessionId, profileRevision: profileRevision(profile), plan: resolution.plan };
    return scanResult(profile, sessionId, resolution.plan);
  }

  async fill(
    profile: CandidateProfile,
    selections: FillSelection[],
    _mappings: SavedFieldMapping[] = []
  ): Promise<FillResult> {
    const active = this.requireActive(profile);
    if (await this.activeSessionId() !== active.sessionId) throw new Error("kernel-session-changed-rescan-required");

    const planned = new Map(active.plan.fields.flatMap((field) => {
      const paths = profilePaths(field);
      return paths ? [[field.controlKey, { field, paths }] as const] : [];
    }));
    const valid: Array<{ selection: FillSelection; outcomeIndex: number }> = [];
    const outcomes: Array<FillResult["outcomes"][number] | undefined> = new Array(selections.length);
    for (const [outcomeIndex, selection] of selections.entries()) {
      const candidate = planned.get(selection.elementId);
      if (!candidate || candidate.paths.primary !== selection.profilePath) {
        outcomes[outcomeIndex] = {
          elementId: selection.elementId,
          profilePath: selection.profilePath,
          status: "skipped",
          reason: "not-in-current-adapter-plan"
        };
        continue;
      }
      valid.push({ selection, outcomeIndex });
    }

    if (valid.length > 0) {
      const authorization = await this.kernel.authorizeActions(active.sessionId);
      const executed = await this.orchestrator.executeSelected({
        sessionId: active.sessionId,
        authorizationId: authorization.authorizationId,
        plan: active.plan,
        selections: valid.map(({ selection }) => ({ controlKey: selection.elementId, confirmed: true }))
      });
      for (const [index, { selection, outcomeIndex }] of valid.entries()) {
        const outcome = executed[index];
        outcomes[outcomeIndex] = {
          elementId: selection.elementId,
          profilePath: selection.profilePath,
          status: outcome?.status === "verified" ? "filled" : "skipped",
          ...(outcome?.status === "verified" ? {} : { reason: outcome ? executionReason(outcome) : "missing-outcome" })
        };
      }
    }

    const completedOutcomes = outcomes.filter((outcome): outcome is FillResult["outcomes"][number] => Boolean(outcome));
    return {
      outcomes: completedOutcomes,
      filledCount: completedOutcomes.filter((outcome) => outcome.status === "filled").length,
      skippedCount: completedOutcomes.filter((outcome) => outcome.status === "skipped").length
    };
  }

  async createRepeatableRecords(
    profile: CandidateProfile,
    group: RepeatableGroupKey
  ): Promise<RepeatableCreateResult> {
    const active = this.requireActive(profile);
    if (await this.activeSessionId() !== active.sessionId) throw new Error("kernel-session-changed-rescan-required");
    const before = active.plan.repeatables.find((repeatable) => repeatable.collection === group);
    const requestedCount = before ? repeatableGroup(profile, before).missingCount : 0;
    if (!before) {
      return {
        group,
        status: "skipped",
        initialPageCount: 0,
        finalPageCount: 0,
        requestedCount,
        createdCount: 0,
        remainingCount: requestedCount,
        reason: "no-supported-adapter"
      };
    }
    const beforeView = repeatableGroup(profile, before);
    if (!beforeView.canCreate) {
      return {
        group,
        status: "skipped",
        initialPageCount: beforeView.pageCount,
        finalPageCount: beforeView.pageCount,
        requestedCount,
        createdCount: 0,
        remainingCount: requestedCount,
        ...(beforeView.reason ? { reason: beforeView.reason } : {})
      };
    }
    const authorization = await this.kernel.authorizeActions(active.sessionId);
    const result = await this.orchestrator.createMissingRepeatableRecords({
      sessionId: active.sessionId,
      authorizationId: authorization.authorizationId,
      plan: active.plan,
      collection: group
    });
    const remainingCount = Math.max(0, requestedCount - result.createdCount);
    const status: RepeatableCreateResult["status"] = result.status === "up-to-date"
      ? "skipped"
      : result.status === "created" && remainingCount === 0
        ? "created"
        : result.createdCount > 0
          ? "partial"
          : "stopped";
    const reason = mapRepeatableReason(result.reason);
    const mapped: RepeatableCreateResult = {
      group,
      status,
      initialPageCount: result.initialPageCount,
      finalPageCount: result.finalPageCount,
      requestedCount,
      createdCount: result.createdCount,
      remainingCount,
      ...(reason ? { reason } : {})
    };
    await this.scan(profile);
    return mapped;
  }

  async attachResume(
    file: File,
    candidate: ResumeAttachmentCandidate,
    _sha256: string,
    _approvedAt: number
  ): Promise<ResumeAttachmentResult> {
    if (
      file.type.toLowerCase() !== "application/pdf"
      || !file.name.toLowerCase().endsWith(".pdf")
      || file.size <= 0
    ) return { status: "rejected", reason: "not-pdf" };

    const active = this.active;
    const target = candidate.kernelTarget;
    if (!active || !target) return { status: "rejected", reason: "stale-reference" };
    if (await this.activeSessionId() !== active.sessionId) return { status: "rejected", reason: "session-inactive" };
    const fields = active.plan.fields.filter((field) => field.intent.kind === "saved-resume");
    const field = fields.length === 1 ? fields[0] : null;
    if (
      !field
      || candidate.elementId !== field.controlKey
      || candidate.destinationOrigin !== active.plan.origin
      || target.sessionId !== active.sessionId
      || target.snapshotId !== active.plan.snapshotKey
      || target.ref !== field.controlKey
    ) return { status: "rejected", reason: "candidate-changed" };

    try {
      const authorization = await this.orchestrator.authorizeSavedResume({
        sessionId: active.sessionId,
        plan: active.plan,
        controlKey: field.controlKey
      });
      const result = await this.orchestrator.uploadSavedResume({
        sessionId: active.sessionId,
        plan: active.plan,
        controlKey: field.controlKey
      }, authorization.authorizationId);
      return result.status === "verified"
        ? { status: "attached" }
        : { status: "rejected", reason: result.reason ?? "verification-failed" };
    }
    catch {
      return { status: "rejected", reason: "bridge-failed" };
    }
  }
}
