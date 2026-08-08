import type {
  PageActionFailureReason,
  PageActionIntent,
  PageActionResult,
  PageUploadAuthorizationView,
  PageUploadResult
} from "../bridge/protocol";
import { AtsAdapterRegistry, type AtsAdapterResolution, toAtsAdapterPageSummary } from "./adapterRuntime";
import type { AtsAdapterPlan, AtsAdapterPlannedField } from "./contracts";
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
  status: "verified" | "failed" | "blocked" | "skipped";
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

function requestId(prefix: string): string {
  if (typeof crypto.randomUUID === "function") return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function profileAction(field: AtsAdapterPlannedField): PageActionIntent | null {
  if (field.intent.kind !== "profile-field") return null;
  const kind: "fill" | "select" = [
    "single-select", "multi-select", "choice"
  ].includes(field.capability) ? "select" : "fill";
  if (["searchable-combobox", "date-range", "toggle", "file-upload"].includes(field.capability)) return null;
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
