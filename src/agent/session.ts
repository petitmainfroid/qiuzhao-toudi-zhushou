import {
  AGENT_PROTOCOL_VERSION,
  type AgentCommandEnvelope
} from "./protocol";

export const AGENT_SESSION_TTL_MS = 10 * 60 * 1000;
export const AGENT_FILL_APPROVAL_TTL_MS = 60 * 1000;

export type AgentSessionErrorCode =
  | "USER_GESTURE_REQUIRED"
  | "INSECURE_PAGE"
  | "INVALID_CAPABILITY"
  | "SESSION_EXPIRED"
  | "WRONG_TAB"
  | "WRONG_PAGE"
  | "INVALID_PROTOCOL"
  | "INVALID_REQUEST_ID"
  | "REPLAYED_REQUEST"
  | "SCAN_MISMATCH"
  | "INVALID_SELECTION"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_MISMATCH"
  | "REVOKED";

export class AgentSessionError extends Error {
  constructor(
    public readonly code: AgentSessionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AgentSessionError";
  }
}

export interface BeginAgentSessionInput {
  capability: string;
  tabId: number;
  pageUrl: string;
  now: number;
  createdByUserGesture: boolean;
  ttlMs?: number;
}

interface FillApproval {
  approvalId: string;
  scanId: string;
  suggestionIds: string[];
  expiresAt: number;
}

function normalizePageUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  }
  catch {
    throw new AgentSessionError("INSECURE_PAGE", "Agent 会话需要有效的 HTTPS 页面地址。");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new AgentSessionError("INSECURE_PAGE", "Agent 会话只允许无内嵌凭据的 HTTPS 页面。");
  }
  url.hash = "";
  return url.href;
}

function normalizeIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function sameIds(left: string[], right: string[]): boolean {
  const a = normalizeIds(left);
  const b = normalizeIds(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function createAgentCapability(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export class AgentSessionGuard {
  readonly capability: string;
  readonly tabId: number;
  readonly pageUrl: string;
  readonly expiresAt: number;

  private revoked = false;
  private readonly requestIds = new Set<string>();
  private latestScan: { scanId: string; suggestionIds: Set<string> } | null = null;
  private fillApproval: FillApproval | null = null;

  constructor(input: BeginAgentSessionInput) {
    if (!input.createdByUserGesture) {
      throw new AgentSessionError(
        "USER_GESTURE_REQUIRED",
        "Agent 会话必须由侧栏中的用户操作创建。"
      );
    }
    if (!Number.isInteger(input.tabId) || input.tabId < 0) {
      throw new AgentSessionError("WRONG_TAB", "Agent 会话需要有效的标签页编号。");
    }
    if (!/^[a-f0-9]{64}$/i.test(input.capability)) {
      throw new AgentSessionError("INVALID_CAPABILITY", "Agent capability 格式无效。");
    }
    const ttlMs = input.ttlMs ?? AGENT_SESSION_TTL_MS;
    if (ttlMs <= 0 || ttlMs > AGENT_SESSION_TTL_MS) {
      throw new AgentSessionError("SESSION_EXPIRED", "Agent 会话有效期必须在十分钟以内。");
    }

    this.capability = input.capability;
    this.tabId = input.tabId;
    this.pageUrl = normalizePageUrl(input.pageUrl);
    this.expiresAt = input.now + ttlMs;
  }

  authorize(envelope: AgentCommandEnvelope, now: number): void {
    if (this.revoked) {
      throw new AgentSessionError("REVOKED", "Agent 会话已经撤销。");
    }
    if (now >= this.expiresAt) {
      throw new AgentSessionError("SESSION_EXPIRED", "Agent 会话已经过期。");
    }
    if (envelope.protocolVersion !== AGENT_PROTOCOL_VERSION) {
      throw new AgentSessionError("INVALID_PROTOCOL", "Agent 协议版本不受支持。");
    }
    if (envelope.capability !== this.capability) {
      throw new AgentSessionError("INVALID_CAPABILITY", "Agent capability 不匹配。");
    }
    if (envelope.tabId !== this.tabId) {
      throw new AgentSessionError("WRONG_TAB", "Agent 请求不属于已授权标签页。");
    }
    if (normalizePageUrl(envelope.pageUrl) !== this.pageUrl) {
      throw new AgentSessionError("WRONG_PAGE", "页面已经导航或不属于已授权地址。");
    }
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(envelope.requestId)) {
      throw new AgentSessionError("INVALID_REQUEST_ID", "Agent 请求编号格式无效。");
    }
    if (this.requestIds.has(envelope.requestId)) {
      throw new AgentSessionError("REPLAYED_REQUEST", "Agent 请求已经处理，不能重放。");
    }
    this.requestIds.add(envelope.requestId);
  }

  recordScan(scanId: string, suggestionIds: string[]): void {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(scanId)) {
      throw new AgentSessionError("SCAN_MISMATCH", "扫描编号格式无效。");
    }
    const normalized = normalizeIds(suggestionIds);
    if (normalized.length !== suggestionIds.length || normalized.some((id) => id.length === 0)) {
      throw new AgentSessionError("INVALID_SELECTION", "扫描建议编号必须唯一且非空。");
    }
    this.latestScan = { scanId, suggestionIds: new Set(normalized) };
    this.fillApproval = null;
  }

  approveFill(input: {
    approvalId: string;
    scanId: string;
    suggestionIds: string[];
    now: number;
    approvedByUserGesture: boolean;
    ttlMs?: number;
  }): void {
    if (!input.approvedByUserGesture) {
      throw new AgentSessionError(
        "USER_GESTURE_REQUIRED",
        "填写批准必须来自侧栏中的即时用户操作。"
      );
    }
    if (!this.latestScan || this.latestScan.scanId !== input.scanId) {
      throw new AgentSessionError("SCAN_MISMATCH", "填写批准不属于最近一次扫描。");
    }
    const selected = normalizeIds(input.suggestionIds);
    if (
      selected.length === 0 ||
      selected.length !== input.suggestionIds.length ||
      selected.some((id) => !this.latestScan?.suggestionIds.has(id))
    ) {
      throw new AgentSessionError(
        "INVALID_SELECTION",
        "填写批准只能包含最近一次扫描中的唯一建议编号。"
      );
    }
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(input.approvalId)) {
      throw new AgentSessionError("APPROVAL_REQUIRED", "填写批准编号格式无效。");
    }
    const ttlMs = input.ttlMs ?? AGENT_FILL_APPROVAL_TTL_MS;
    if (ttlMs <= 0 || ttlMs > AGENT_FILL_APPROVAL_TTL_MS) {
      throw new AgentSessionError("APPROVAL_EXPIRED", "填写批准有效期必须在一分钟以内。");
    }
    this.fillApproval = {
      approvalId: input.approvalId,
      scanId: input.scanId,
      suggestionIds: selected,
      expiresAt: input.now + ttlMs
    };
  }

  consumeFill(input: {
    approvalId: string;
    scanId: string;
    suggestionIds: string[];
    now: number;
  }): void {
    const approval = this.fillApproval;
    if (!approval) {
      throw new AgentSessionError("APPROVAL_REQUIRED", "没有可用的填写批准。");
    }
    if (input.now >= approval.expiresAt) {
      this.fillApproval = null;
      throw new AgentSessionError("APPROVAL_EXPIRED", "填写批准已经过期。");
    }
    if (
      input.approvalId !== approval.approvalId ||
      input.scanId !== approval.scanId ||
      !sameIds(input.suggestionIds, approval.suggestionIds)
    ) {
      throw new AgentSessionError("APPROVAL_MISMATCH", "填写请求与用户批准的选择不一致。");
    }
    this.fillApproval = null;
  }

  revoke(): void {
    this.revoked = true;
    this.latestScan = null;
    this.fillApproval = null;
  }
}
