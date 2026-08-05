export const AGENT_PROTOCOL_VERSION = 1 as const;

export type AgentCommandName = "status" | "scan" | "preview" | "fill";

export interface AgentCommandEnvelope {
  protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  capability: string;
  requestId: string;
  tabId: number;
  pageUrl: string;
}

export type AgentCommand =
  | (AgentCommandEnvelope & { command: "status" })
  | (AgentCommandEnvelope & { command: "scan" })
  | (AgentCommandEnvelope & { command: "preview"; scanId: string })
  | (AgentCommandEnvelope & {
      command: "fill";
      scanId: string;
      approvalId: string;
      suggestionIds: string[];
    });

export interface AgentPreviewItem {
  suggestionId: string;
  fieldLabel: string;
  profilePath: string | null;
  confidence: "high" | "medium" | "low" | "none";
  requiresConfirmation: boolean;
  comparisonStatus: "empty" | "equal" | "conflict" | "unreadable";
  excludedReason?: string;
}

export interface AgentPreviewResult {
  scanId: string;
  title: string;
  site: string;
  items: AgentPreviewItem[];
  summary: {
    total: number;
    fillable: number;
    safeHigh: number;
    needsConfirmation: number;
    excluded: number;
    empty: number;
    equal: number;
    conflict: number;
    unreadable: number;
  };
}

// Deliberately absent from this protocol: arbitrary selectors/values, page
// values, file upload, credentials, verification, CAPTCHA, and submission.
