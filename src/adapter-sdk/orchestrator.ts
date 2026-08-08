import type {
  PageActionFailureReason,
  PageActionIntent,
  PageActionResult,
  PageUploadAuthorizationView,
  PageUploadResult
} from "../bridge/protocol";
import { AtsAdapterRegistry, type AtsAdapterResolution, toAtsAdapterPageSummary } from "./adapterRuntime";
import type { AtsAdapterPlan, AtsAdapterPlannedField } from "./contracts";
import type { AtsRepeatableCollection } from "./contracts";
import type { RecruitmentKernelApi } from "./kernelApi";

export interface AtsFieldSelection {
  controlKey: string;
  confirmed: boolean;
}

export type AtsFieldExecutionReason =
  | PageActionFailureReason
  | "not-in-plan"
  | "confirmation-required"
  | "duplicate-selection"
  | "unsupported-capability"
  | "workflow-timeout"
  | "workflow-refind-failed"
  | "saved-resume-requires-upload-gate";

export interface AtsFieldExecutionOutcome {
  controlKey: string;
  status: "performed" | "verified" | "failed" | "blocked" | "skipped";
  attempts: 0 | 1 | 2;
  reason?: AtsFieldExecutionReason;
  action?: PageActionResult["action"];
}

export interface AtsFieldExecutionRequest {
  sessionId: string;
  authorizationId: string;
  plan: AtsAdapterPlan;
  selections: AtsFieldSelection[];
}

export interface AtsSavedResumeTarget {
  sessionId: string;
  plan: AtsAdapterPlan;
  controlKey: string;
}

export interface AtsRepeatableExecutionRequest {
  sessionId: string;
  authorizationId: string;
  plan: AtsAdapterPlan;
  collection: AtsRepeatableCollection;
}

export interface AtsRepeatableSaveRequest extends AtsRepeatableExecutionRequest {
  recordIndex: number;
}

export type AtsRepeatableExecutionReason =
  | PageActionFailureReason
  | "not-in-plan"
  | "non-contiguous-records"
  | "add-control-unavailable"
  | "add-control-ambiguous"
  | "save-control-unavailable"
  | "save-control-ambiguous"
  | "family-changed"
  | "page-structure-changed"
  | "limit-reached";

export interface AtsRepeatableExecutionOutcome {
  collection: AtsRepeatableCollection;
  status: "created" | "saved" | "up-to-date" | "partial" | "failed" | "blocked";
  initialPageCount: number;
  finalPageCount: number;
  createdCount: number;
  reason?: AtsRepeatableExecutionReason;
}

function requestId(prefix: string): string {
  if (typeof crypto.randomUUID === "function") return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function profileAction(field: AtsAdapterPlannedField): PageActionIntent | null {
  if (field.intent.kind === "profile-range") {
    return field.capability === "date-range"
      ? {
          kind: "fill-range",
          source: {
            kind: "profile-range",
            startPath: field.intent.startPathPattern,
            endPath: field.intent.endPathPattern
          }
        }
      : null;
  }
  if (field.intent.kind !== "profile-field") return null;
  if (field.capability === "toggle") {
    return {
      kind: "check",
      source: { kind: "profile-presence", path: field.intent.pathPattern }
    };
  }
  const kind: "fill" | "select" = [
    "single-select", "multi-select", "choice"
  ].includes(field.capability) ? "select" : "fill";
  if (["searchable-combobox", "file-upload"].includes(field.capability)) return null;
  return {
    kind,
    source: { kind: "profile", path: field.intent.pathPattern }
  };
}

function outcomeFromAction(result: PageActionResult, controlKey = result.ref): AtsFieldExecutionOutcome {
  return {
    controlKey,
    status: result.status,
    attempts: result.attempts,
    ...(result.reason ? { reason: result.reason } : {}),
    action: result.action
  };
}

function staticOutcome(
  controlKey: string,
  status: AtsFieldExecutionOutcome["status"],
  reason: AtsFieldExecutionReason
): AtsFieldExecutionOutcome {
  return { controlKey, status, attempts: 0, reason };
}

function contiguousIndexes(indexes: number[]): boolean {
  return indexes.every((value, index) => value === index);
}

function sameIndexes(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class RecruitmentAdapterOrchestrator {
  constructor(
    private readonly kernel: RecruitmentKernelApi,
    private readonly adapters: AtsAdapterRegistry
  ) {}

  async scan(sessionId: string): Promise<AtsAdapterResolution> {
    const state = await this.kernel.state(sessionId);
    return this.adapters.detect(toAtsAdapterPageSummary(state));
  }

  async executeSelected(request: AtsFieldExecutionRequest): Promise<AtsFieldExecutionOutcome[]> {
    const fields = new Map(request.plan.fields.map((field) => [field.controlKey, field]));
    const seen = new Set<string>();
    const outcomes: AtsFieldExecutionOutcome[] = [];
    for (const selection of request.selections) {
      if (seen.has(selection.controlKey)) {
        outcomes.push(staticOutcome(selection.controlKey, "skipped", "duplicate-selection"));
        continue;
      }
      seen.add(selection.controlKey);
      const field = fields.get(selection.controlKey);
      if (!field) {
        outcomes.push(staticOutcome(selection.controlKey, "blocked", "not-in-plan"));
        continue;
      }
      if (field.decision === "confirm" && !selection.confirmed) {
        outcomes.push(staticOutcome(selection.controlKey, "blocked", "confirmation-required"));
        continue;
      }
      if (field.intent.kind === "saved-resume") {
        outcomes.push(staticOutcome(selection.controlKey, "blocked", "saved-resume-requires-upload-gate"));
        continue;
      }
      if (field.capability === "searchable-combobox" && field.intent.kind === "profile-field") {
        outcomes.push(await this.executeSearchableCombobox(request, field));
        continue;
      }
      const intent = profileAction(field);
      if (!intent) {
        outcomes.push(staticOutcome(selection.controlKey, "skipped", "unsupported-capability"));
        continue;
      }
      const result = await this.kernel.action({
        requestId: requestId("adapter_action"),
        authorizationId: request.authorizationId,
        sessionId: request.sessionId,
        snapshotId: request.plan.snapshotKey,
        ref: field.controlKey,
        intent
      });
      outcomes.push(outcomeFromAction(result));
    }
    return outcomes;
  }

  async createMissingRepeatableRecords(
    request: AtsRepeatableExecutionRequest
  ): Promise<AtsRepeatableExecutionOutcome> {
    let plan = request.plan;
    let repeatable = plan.repeatables.find((candidate) => candidate.collection === request.collection);
    const initialPageCount = repeatable?.recordIndexes.length ?? 0;
    const finish = (
      status: AtsRepeatableExecutionOutcome["status"],
      createdCount: number,
      reason?: AtsRepeatableExecutionReason
    ): AtsRepeatableExecutionOutcome => ({
      collection: request.collection,
      status,
      initialPageCount,
      finalPageCount: repeatable?.recordIndexes.length ?? initialPageCount,
      createdCount,
      ...(reason ? { reason } : {})
    });
    if (!repeatable) return finish("blocked", 0, "not-in-plan");
    if (!contiguousIndexes(repeatable.recordIndexes)) return finish("blocked", 0, "non-contiguous-records");

    let createdCount = 0;
    while (createdCount < repeatable.maximumCreatesPerRun) {
      if (repeatable.addControlKeys.length === 0) {
        return finish(createdCount > 0 ? "partial" : "blocked", createdCount, "add-control-unavailable");
      }
      if (repeatable.addControlKeys.length !== 1) {
        return finish(createdCount > 0 ? "partial" : "blocked", createdCount, "add-control-ambiguous");
      }
      const nextIndex = repeatable.recordIndexes.length;
      const action = await this.kernel.action({
        requestId: requestId("adapter_repeatable_add"),
        authorizationId: request.authorizationId,
        sessionId: request.sessionId,
        snapshotId: plan.snapshotKey,
        ref: repeatable.addControlKeys[0]!,
        intent: {
          kind: "click",
          purpose: "add-repeatable-record",
          source: { kind: "profile-record", collection: request.collection, index: nextIndex }
        }
      });
      if (action.status === "failed" && action.reason === "empty-profile-value") {
        return finish(createdCount > 0 ? "created" : "up-to-date", createdCount);
      }
      if (action.status !== "performed") {
        return finish(action.status === "blocked" ? "blocked" : "failed", createdCount, action.reason ?? "verification-failed");
      }

      const resolution = await this.scan(request.sessionId);
      if (resolution.status !== "matched" || resolution.plan.familyId !== plan.familyId) {
        return finish("failed", createdCount, "family-changed");
      }
      const nextRepeatable = resolution.plan.repeatables.find((candidate) => candidate.collection === request.collection);
      const expectedIndexes = [...repeatable.recordIndexes, nextIndex];
      if (!nextRepeatable || !sameIndexes(nextRepeatable.recordIndexes, expectedIndexes)) {
        return finish("failed", createdCount, "page-structure-changed");
      }
      createdCount += 1;
      plan = resolution.plan;
      repeatable = nextRepeatable;
    }
    return finish("partial", createdCount, "limit-reached");
  }

  async saveRepeatableRecord(request: AtsRepeatableSaveRequest): Promise<AtsRepeatableExecutionOutcome> {
    const repeatable = request.plan.repeatables.find((candidate) => candidate.collection === request.collection);
    const initialPageCount = repeatable?.recordIndexes.length ?? 0;
    const finish = (
      status: AtsRepeatableExecutionOutcome["status"],
      reason?: AtsRepeatableExecutionReason
    ): AtsRepeatableExecutionOutcome => ({
      collection: request.collection,
      status,
      initialPageCount,
      finalPageCount: initialPageCount,
      createdCount: 0,
      ...(reason ? { reason } : {})
    });
    if (!repeatable || !repeatable.recordIndexes.includes(request.recordIndex)) return finish("blocked", "not-in-plan");
    const exact = repeatable.saveControls.filter((control) => control.recordIndex === request.recordIndex);
    const candidates = exact.length > 0
      ? exact
      : repeatable.saveControls.filter((control) => control.recordIndex === null);
    if (candidates.length === 0) return finish("blocked", "save-control-unavailable");
    if (candidates.length !== 1) return finish("blocked", "save-control-ambiguous");
    const action = await this.kernel.action({
      requestId: requestId("adapter_repeatable_save"),
      authorizationId: request.authorizationId,
      sessionId: request.sessionId,
      snapshotId: request.plan.snapshotKey,
      ref: candidates[0]!.controlKey,
      intent: { kind: "click", purpose: "save-repeatable-record" }
    });
    if (action.status !== "performed") {
      return finish(action.status === "blocked" ? "blocked" : "failed", action.reason ?? "verification-failed");
    }
    const resolution = await this.scan(request.sessionId);
    if (resolution.status !== "matched" || resolution.plan.familyId !== request.plan.familyId) {
      return finish("failed", "family-changed");
    }
    const after = resolution.plan.repeatables.find((candidate) => candidate.collection === request.collection);
    if (!after || !sameIndexes(after.recordIndexes, repeatable.recordIndexes)) {
      return finish("failed", "page-structure-changed");
    }
    if (after.saveControls.some((control) => control.controlKey === candidates[0]!.controlKey)) {
      return finish("failed", "verification-failed");
    }
    return finish("saved");
  }

  private async executeSearchableCombobox(
    request: AtsFieldExecutionRequest,
    field: AtsAdapterPlannedField
  ): Promise<AtsFieldExecutionOutcome> {
    if (field.intent.kind !== "profile-field") {
      return staticOutcome(field.controlKey, "skipped", "unsupported-capability");
    }
    const opened = await this.kernel.action({
      requestId: requestId("adapter_open"),
      authorizationId: request.authorizationId,
      sessionId: request.sessionId,
      snapshotId: request.plan.snapshotKey,
      ref: field.controlKey,
      intent: { kind: "click", purpose: "open-control" }
    });
    if (opened.status !== "verified") return outcomeFromAction(opened, field.controlKey);
    const waited = await this.kernel.wait({
      requestId: requestId("adapter_wait"),
      sessionId: request.sessionId,
      condition: {
        kind: "option-list",
        query: { text: field.semanticKey, roles: ["combobox", "listbox"], limit: 5 },
        minimumOptions: 1
      },
      timeoutMs: 3_000,
      pollIntervalMs: 100
    });
    if (waited.status === "timeout") return staticOutcome(field.controlKey, "failed", "workflow-timeout");
    if (waited.status !== "matched" || waited.result?.matches.length !== 1) {
      return staticOutcome(field.controlKey, "failed", "workflow-refind-failed");
    }
    const replacement = waited.result.matches[0]!;
    const selected = await this.kernel.action({
      requestId: requestId("adapter_select"),
      authorizationId: request.authorizationId,
      sessionId: request.sessionId,
      snapshotId: waited.result.snapshotId,
      ref: replacement.ref,
      intent: {
        kind: "select",
        source: { kind: "profile", path: field.intent.pathPattern }
      }
    });
    return outcomeFromAction(selected, field.controlKey);
  }

  async authorizeSavedResume(target: AtsSavedResumeTarget): Promise<PageUploadAuthorizationView> {
    const field = target.plan.fields.find((candidate) => candidate.controlKey === target.controlKey);
    if (
      !field
      || field.intent.kind !== "saved-resume"
      || field.capability !== "file-upload"
      || field.decision !== "confirm"
    ) throw new Error("saved-resume-target-not-in-plan");
    return this.kernel.authorizeUpload(target.sessionId, target.plan.snapshotKey, target.controlKey);
  }

  async uploadSavedResume(
    target: AtsSavedResumeTarget,
    authorizationId: string
  ): Promise<PageUploadResult> {
    const field = target.plan.fields.find((candidate) => candidate.controlKey === target.controlKey);
    if (!field || field.intent.kind !== "saved-resume" || field.decision !== "confirm") {
      throw new Error("saved-resume-target-not-in-plan");
    }
    return this.kernel.upload({
      requestId: requestId("adapter_upload"),
      authorizationId,
      sessionId: target.sessionId,
      snapshotId: target.plan.snapshotKey,
      ref: target.controlKey
    });
  }
}
