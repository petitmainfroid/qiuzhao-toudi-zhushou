import {
  fillPage,
  scanPage,
  type FillResult,
  type FillSelection,
  type ScanResult
} from "../content/engine";
import type { CandidateProfile } from "../domain/profile";
import type { SavedFieldMapping } from "../mapping/types";
import {
  type AgentCommand,
  type AgentPreviewItem,
  type AgentPreviewResult
} from "./protocol";
import { AgentSessionError, AgentSessionGuard, createAgentCapability } from "./session";

export interface AgentControllerDependencies {
  session: AgentSessionGuard;
  profile: CandidateProfile;
  mappings?: SavedFieldMapping[];
  now?: () => number;
  currentPageUrl?: () => string;
  idFactory?: () => string;
  scan?: (profile: CandidateProfile, mappings: SavedFieldMapping[]) => ScanResult;
  fill?: (
    profile: CandidateProfile,
    selections: FillSelection[],
    mappings: SavedFieldMapping[]
  ) => Promise<FillResult>;
}

export type AgentCommandResult =
  | {
      command: "status";
      connected: true;
      tabId: number;
      pageUrl: string;
      expiresAt: number;
    }
  | { command: "scan"; scanId: string; summary: AgentPreviewResult["summary"] }
  | { command: "preview"; preview: AgentPreviewResult }
  | { command: "fill"; result: FillResult };

interface StoredScan {
  preview: AgentPreviewResult;
  selections: Map<string, FillSelection>;
}

function opaqueId(prefix: string): string {
  return `${prefix}_${createAgentCapability()}`;
}

export class AgentBridgeController {
  private readonly mappings: SavedFieldMapping[];
  private readonly now: () => number;
  private readonly currentPageUrl: () => string;
  private readonly idFactory: () => string;
  private readonly scanPage: NonNullable<AgentControllerDependencies["scan"]>;
  private readonly fillPage: NonNullable<AgentControllerDependencies["fill"]>;
  private latestScan: StoredScan | null = null;

  constructor(private readonly dependencies: AgentControllerDependencies) {
    this.mappings = dependencies.mappings ?? [];
    this.now = dependencies.now ?? Date.now;
    this.currentPageUrl = dependencies.currentPageUrl ?? (() => location.href);
    this.idFactory = dependencies.idFactory ?? (() => opaqueId("agent"));
    this.scanPage = dependencies.scan ?? scanPage;
    this.fillPage = dependencies.fill ?? fillPage;
  }

  approveFill(input: {
    scanId: string;
    suggestionIds: string[];
    approvedByUserGesture: boolean;
  }): string {
    const approvalId = this.idFactory();
    this.dependencies.session.approveFill({
      approvalId,
      scanId: input.scanId,
      suggestionIds: input.suggestionIds,
      now: this.now(),
      approvedByUserGesture: input.approvedByUserGesture
    });
    return approvalId;
  }

  async handle(command: AgentCommand): Promise<AgentCommandResult> {
    const actualPageUrl = this.currentPageUrl();
    if (command.pageUrl !== actualPageUrl) {
      throw new AgentSessionError("WRONG_PAGE", "Agent 请求声明的页面与当前页面不一致。");
    }
    this.dependencies.session.authorize(command, this.now());

    if (command.command === "status") {
      return {
        command: "status",
        connected: true,
        tabId: this.dependencies.session.tabId,
        pageUrl: this.dependencies.session.pageUrl,
        expiresAt: this.dependencies.session.expiresAt
      };
    }

    if (command.command === "scan") {
      const raw = this.scanPage(this.dependencies.profile, this.mappings);
      const scanId = this.idFactory();
      const selections = new Map<string, FillSelection>();
      const items: AgentPreviewItem[] = raw.fields.map((field) => {
        const suggestionId = this.idFactory();
        if (
          field.profilePath && field.hasValue && !field.excludedReason &&
          field.comparisonStatus !== "equal" && field.comparisonStatus !== "unreadable"
        ) {
          selections.set(suggestionId, {
            elementId: field.elementId,
            profilePath: field.profilePath,
            ...(field.comparisonStatus === "conflict" && field.comparisonToken
              ? { conflictApprovalToken: field.comparisonToken }
              : {})
          });
        }
        return {
          suggestionId,
          fieldLabel: field.fieldLabel,
          profilePath: field.profilePath,
          confidence: field.confidence,
          requiresConfirmation: field.requiresConfirmation,
          comparisonStatus: field.comparisonStatus,
          ...(field.excludedReason ? { excludedReason: field.excludedReason } : {})
        };
      });
      const preview: AgentPreviewResult = {
        scanId,
        title: raw.title,
        site: raw.site,
        items,
        summary: {
          total: raw.summary.total,
          fillable: raw.summary.fillable,
          safeHigh: raw.summary.high,
          needsConfirmation: raw.summary.needsConfirmation,
          excluded: raw.summary.excluded,
          empty: raw.summary.empty,
          equal: raw.summary.equal,
          conflict: raw.summary.conflict,
          unreadable: raw.summary.unreadable
        }
      };
      this.latestScan = { preview, selections };
      this.dependencies.session.recordScan(scanId, [...selections.keys()]);
      return { command: "scan", scanId, summary: preview.summary };
    }

    if (!this.latestScan || command.scanId !== this.latestScan.preview.scanId) {
      throw new AgentSessionError("SCAN_MISMATCH", "Agent 命令不属于最近一次扫描。");
    }

    if (command.command === "preview") {
      return { command: "preview", preview: this.latestScan.preview };
    }

    this.dependencies.session.consumeFill({
      approvalId: command.approvalId,
      scanId: command.scanId,
      suggestionIds: command.suggestionIds,
      now: this.now()
    });
    const selections = command.suggestionIds.map((suggestionId) => {
      const selection = this.latestScan?.selections.get(suggestionId);
      if (!selection) {
        throw new AgentSessionError("INVALID_SELECTION", "Agent 填写包含未知建议编号。");
      }
      return selection;
    });
    const result = await this.fillPage(this.dependencies.profile, selections, this.mappings);
    return { command: "fill", result };
  }
}
