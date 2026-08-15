import { EmbeddedCdpError } from "./opencliCdp";
import { findPageControls, type PrivacySafePageStateService } from "./pageState";
import type {
  EmbeddedBridgeRequest,
  PageFindMatch,
  PageFindResult,
  PageWaitFailureReason,
  PageWaitResult,
  PowerSessionView,
  PrivacySafeControl,
  PrivacySafePageState
} from "./protocol";

export type PageWaitRequest = Extract<EmbeddedBridgeRequest, { type: "POWER_PAGE_WAIT" }>;

export interface PageWorkflowDependencies {
  pageStateService: Pick<PrivacySafePageStateService, "read">;
  session(): Promise<PowerSessionView>;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

function durationBucket(duration: number): PageWaitResult["durationBucket"] {
  if (duration < 100) return "lt-100ms";
  if (duration <= 500) return "100-500ms";
  return "gt-500ms";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function filteredResult(result: PageFindResult, matches: PageFindMatch[]): PageFindResult {
  return { ...result, matches };
}

function matchesControlState(control: PrivacySafeControl, wanted: "enabled" | "disabled" | "expanded" | "collapsed"): boolean {
  if (wanted === "enabled") return !control.disabled;
  if (wanted === "disabled") return control.disabled;
  if (wanted === "expanded") return control.expanded === true;
  return control.expanded === false;
}

function stablePageSignature(state: PrivacySafePageState): string {
  return JSON.stringify({
    origin: state.origin,
    path: state.path,
    controls: state.controls.map((control) => ({
      role: control.role,
      tag: control.tag,
      inputType: control.inputType ?? "",
      semantics: control.semantics,
      options: control.options ?? [],
      disabled: control.disabled,
      readOnly: control.readOnly,
      required: control.required,
      multiple: control.multiple,
      expanded: control.expanded ?? null,
      boundary: control.boundary,
      safety: control.safety
    }))
  });
}

function sessionFailure(session: PowerSessionView, expectedSessionId: string): PageWaitFailureReason | null {
  if (session.status !== "active") {
    return session.reason === "origin-changed" ? "origin-changed" : "session-inactive";
  }
  if (session.sessionId !== expectedSessionId) return "invalid-session";
  return null;
}

export class PageWorkflowService {
  constructor(private readonly dependencies: PageWorkflowDependencies) {}

  async wait(request: PageWaitRequest): Promise<PageWaitResult> {
    const startedAt = this.dependencies.now();
    let polls = 0;
    let initialPath: string | undefined;
    let stableSignature: string | undefined;
    let stableSince = startedAt;

    const finish = (
      status: PageWaitResult["status"],
      extras: Partial<Pick<PageWaitResult, "reason" | "result" | "path">> = {}
    ): PageWaitResult => ({
      requestId: request.requestId,
      condition: request.condition.kind,
      status,
      polls,
      durationBucket: durationBucket(this.dependencies.now() - startedAt),
      ...extras
    });

    while (true) {
      const session = await this.dependencies.session();
      const invalid = sessionFailure(session, request.sessionId);
      if (invalid) return finish("failed", { reason: invalid });
      initialPath ??= session.path;
      polls += 1;

      try {
        if (request.condition.kind === "same-origin-navigation") {
          if (session.path !== initialPath) return finish("matched", { path: session.path });
        }
        else {
          const state = await this.dependencies.pageStateService.read(session);
          if (state.origin !== session.origin) return finish("failed", { reason: "origin-changed" });

          if (request.condition.kind === "find") {
            const result = findPageControls(state, request.condition.query);
            if (result.matches.length >= request.condition.minimumMatches) {
              return finish("matched", { result });
            }
          }
          else if (request.condition.kind === "control-state") {
            const condition = request.condition;
            const result = findPageControls(state, condition.query);
            const byReference = new Map(state.controls.map((control) => [control.ref, control]));
            const matches = result.matches.filter((match) => {
              const control = byReference.get(match.ref);
              return control ? matchesControlState(control, condition.state) : false;
            });
            if (matches.length >= condition.minimumMatches) {
              return finish("matched", { result: filteredResult(result, matches) });
            }
          }
          else if (request.condition.kind === "option-list") {
            const condition = request.condition;
            const result = findPageControls(state, condition.query);
            const byReference = new Map(state.controls.map((control) => [control.ref, control]));
            const wantedOption = condition.optionText ? normalize(condition.optionText) : "";
            const matches = result.matches.filter((match) => {
              const options = byReference.get(match.ref)?.options ?? [];
              return options.length >= condition.minimumOptions
                && (!wantedOption || options.some((option) => normalize(option) === wantedOption));
            });
            if (matches.length > 0) return finish("matched", { result: filteredResult(result, matches) });
          }
          else {
            const signature = stablePageSignature(state);
            if (signature !== stableSignature) {
              stableSignature = signature;
              stableSince = this.dependencies.now();
            }
            else if (this.dependencies.now() - stableSince >= request.condition.quietMs) {
              return finish("matched", { path: state.path });
            }
          }
        }
      }
      catch (error) {
        if (error instanceof EmbeddedCdpError) {
          const reason: PageWaitFailureReason = error.code === "origin-changed"
            ? "origin-changed"
            : error.code === "session-inactive"
              ? "session-inactive"
              : "bridge-failed";
          return finish("failed", { reason });
        }
        return finish("failed", { reason: "bridge-failed" });
      }

      const elapsed = this.dependencies.now() - startedAt;
      if (elapsed >= request.timeoutMs) return finish("timeout", { reason: "timeout" });
      await this.dependencies.sleep(Math.min(request.pollIntervalMs, request.timeoutMs - elapsed));
    }
  }
}

export function createChromePageWorkflowService(
  session: () => Promise<PowerSessionView>,
  pageStateService: Pick<PrivacySafePageStateService, "read">
): PageWorkflowService {
  return new PageWorkflowService({
    pageStateService,
    session,
    now: () => Date.now(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  });
}
