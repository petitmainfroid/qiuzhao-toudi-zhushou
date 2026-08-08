import { getProfileValue, type CandidateProfile } from "../domain/profile";
import { canonicalFields } from "../matching/catalog";
import type {
  FillProposal,
  FillResult,
  FillSelection,
  ScanResult
} from "../content/engine";
import type { ContentRequest, ContentResponse } from "../shared/messages";
import type { SavedFieldMapping } from "../mapping/types";
import {
  createMissingRepeatableRecords,
  type RepeatableCreateResult,
  type RepeatableGroupKey
} from "../content/repeatableRecords";
import type {
  ResumeAttachmentCandidate,
  ResumeAttachmentResult
} from "../content/resumeAttachment";
import type { EmbeddedBridgeRequest, EmbeddedBridgeResponse } from "../bridge/protocol";
import { AtsAdapterRegistry, ChromeRecruitmentKernelApi } from "../adapter-sdk";
import {
  feishuRecruitingManifest,
  isFeishuRecruitingApplicationUrl
} from "../ats/adapters/feishu";
import { AdapterPageBridge } from "./adapterPageBridge";
import { ChromePowerSessionBridge } from "./powerSessionBridge";
import { RoutedPageBridge } from "./routedPageBridge";

export interface PageBridge {
  scan(profile: CandidateProfile, mappings?: SavedFieldMapping[]): Promise<ScanResult>;
  createRepeatableRecords?(profile: CandidateProfile, group: RepeatableGroupKey): Promise<RepeatableCreateResult>;
  attachResume?(
    file: File,
    candidate: ResumeAttachmentCandidate,
    sha256: string,
    approvedAt: number
  ): Promise<ResumeAttachmentResult>;
  fill(profile: CandidateProfile, selections: FillSelection[], mappings?: SavedFieldMapping[]): Promise<FillResult>;
}

function extensionRuntimeAvailable(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id && chrome.scripting && chrome.tabs);
}

async function activeTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (typeof tabId !== "number") throw new Error("没有找到当前活动页面。");
  return tabId;
}

async function activeTabUrl(): Promise<string> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url;
  if (!url) throw new Error("active-page-url-unavailable");
  return url;
}

async function prepareContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function sendToTab(tabId: number, request: ContentRequest): Promise<ContentResponse> {
  return chrome.tabs.sendMessage(tabId, request) as Promise<ContentResponse>;
}

function bridgeRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().replaceAll("-", "");
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sendRuntime(request: EmbeddedBridgeRequest): Promise<EmbeddedBridgeResponse> {
  return chrome.runtime.sendMessage(request) as Promise<EmbeddedBridgeResponse>;
}

async function resolveKernelUploadTarget(candidate: ResumeAttachmentCandidate): Promise<ResumeAttachmentCandidate> {
  const status = await sendRuntime({ type: "POWER_SESSION_STATUS", requestId: bridgeRequestId() });
  if (!status.ok || !("session" in status)) return candidate;
  const session = status.session;
  if (session.status !== "active" || !session.sessionId || session.origin !== candidate.destinationOrigin) return candidate;
  const found = await sendRuntime({
    type: "POWER_PAGE_FIND",
    requestId: bridgeRequestId(),
    query: { text: candidate.fieldLabel, limit: 20 }
  });
  if (!found.ok || !("result" in found)) return candidate;
  const fileMatches = found.result.matches.filter((match) =>
    match.safety === "file" && match.label === candidate.fieldLabel
  );
  if (fileMatches.length !== 1) return candidate;
  return {
    ...candidate,
    kernelTarget: {
      sessionId: session.sessionId,
      snapshotId: found.result.snapshotId,
      ref: fileMatches[0]!.ref
    }
  };
}

export class ChromePageBridge implements PageBridge {
  async scan(profile: CandidateProfile, mappings: SavedFieldMapping[] = []): Promise<ScanResult> {
    const tabId = await activeTabId();
    await prepareContentScript(tabId);
    const response = await sendToTab(tabId, { type: "SCAN_PAGE", profile, mappings });
    if (!("ok" in response) || !response.ok || !("fields" in response.result)) {
      throw new Error("error" in response ? response.error : "当前页面扫描失败。");
    }
    const result = response.result;
    if (result.resumeAttachment?.status !== "ready" || !result.resumeAttachment.candidate) return result;
    return {
      ...result,
      resumeAttachment: {
        ...result.resumeAttachment,
        candidate: await resolveKernelUploadTarget(result.resumeAttachment.candidate)
      }
    };
  }

  async fill(profile: CandidateProfile, selections: FillSelection[], mappings: SavedFieldMapping[] = []): Promise<FillResult> {
    const tabId = await activeTabId();
    await prepareContentScript(tabId);
    const response = await sendToTab(tabId, { type: "FILL_PAGE", profile, selections, mappings });
    if (!("ok" in response) || !response.ok || !("outcomes" in response.result)) {
      throw new Error("error" in response ? response.error : "当前页面填写失败。");
    }
    return response.result;
  }

  async createRepeatableRecords(profile: CandidateProfile, group: RepeatableGroupKey): Promise<RepeatableCreateResult> {
    const tabId = await activeTabId();
    await prepareContentScript(tabId);
    const response = await sendToTab(tabId, { type: "CREATE_REPEATABLE_RECORDS", profile, group });
    if (!("ok" in response) || !response.ok || !("createdCount" in response.result)) {
      throw new Error("error" in response ? response.error : "创建招聘经历记录失败。");
    }
    return response.result;
  }

  async attachResume(
    _file: File,
    candidate: ResumeAttachmentCandidate,
    _sha256: string,
    _approvedAt: number
  ): Promise<ResumeAttachmentResult> {
    const target = candidate.kernelTarget;
    if (!target) return { status: "rejected", reason: "stale-reference" };
    const authorizationResponse = await sendRuntime({
      type: "POWER_PAGE_UPLOAD_AUTHORIZE",
      requestId: bridgeRequestId(),
      sessionId: target.sessionId,
      snapshotId: target.snapshotId,
      ref: target.ref
    });
    if (!("ok" in authorizationResponse) || !authorizationResponse.ok) {
      throw new Error("error" in authorizationResponse ? authorizationResponse.error : "简历附件授权失败。");
    }
    if (!("uploadAuthorization" in authorizationResponse)) {
      return { status: "rejected", reason: "invalid-authorization" };
    }

    const response = await sendRuntime({
      type: "POWER_PAGE_UPLOAD",
      requestId: bridgeRequestId(),
      authorizationId: authorizationResponse.uploadAuthorization.authorizationId,
      sessionId: target.sessionId,
      snapshotId: target.snapshotId,
      ref: target.ref
    });
    if (!("ok" in response) || !response.ok || !("upload" in response)) {
      throw new Error("error" in response ? response.error : "简历附件传输失败。");
    }
    return response.upload.status === "verified"
      ? { status: "attached" }
      : { status: "rejected", reason: response.upload.reason ?? "verification-failed" };
  }
}

function previewProposal(
  profile: CandidateProfile,
  elementId: string,
  fieldLabel: string,
  profilePath: string,
  canonicalLabel: string,
  confidence: "high" | "medium",
  requiresConfirmation: boolean,
  comparisonStatus: FillProposal["comparisonStatus"] = "empty"
): FillProposal {
  const value = getProfileValue(profile, profilePath);
  return {
    elementId,
    fieldLabel,
    profilePath,
    canonicalLabel,
    score: confidence === "high" ? 0.985 : 0.72,
    confidence,
    reasons: confidence === "high"
      ? [`字段标题“${fieldLabel}”与档案字段完全一致`]
      : [`字段标题“${fieldLabel}”需要结合页面上下文确认`],
    requiresConfirmation,
    fingerprint: `preview|${elementId}`,
    mappingSource: "rule",
    hasValue: value.trim().length > 0,
    valuePreview: value,
    comparisonStatus,
    ...(comparisonStatus === "conflict" ? { comparisonToken: `preview-conflict-${elementId}` } : {})
  };
}

export class PreviewPageBridge implements PageBridge {
  async scan(profile: CandidateProfile, mappings: SavedFieldMapping[] = []): Promise<ScanResult> {
    const fields: FillProposal[] = [
      previewProposal(profile, "preview-name", "姓名", "basic.fullName", "姓名", "high", false),
      previewProposal(profile, "preview-email", "联系邮箱", "basic.email", "邮箱", "high", false, "equal"),
      previewProposal(profile, "preview-birth", "出生日期", "basic.birthDate", "出生日期", "high", true, "conflict"),
      previewProposal(profile, "preview-project", "项目介绍", "projects.0.description", "项目描述", "medium", true),
      {
        elementId: "preview-file",
        fieldLabel: "上传简历",
        profilePath: null,
        canonicalLabel: null,
        score: 0,
        confidence: "none",
        reasons: ["文件选择必须由用户亲自完成"],
        requiresConfirmation: true,
        excludedReason: "unsupported-control",
        fingerprint: "preview|preview-file",
        mappingSource: "rule",
        hasValue: false,
        valuePreview: "",
        comparisonStatus: "unreadable"
      }
    ];
    const remappedFields = fields.map((field) => {
      const saved = mappings.find(
        (mapping) => mapping.site === "http://127.0.0.1:4173" && mapping.fingerprint === field.fingerprint
      );
      if (!saved || field.excludedReason) return field;
      const value = getProfileValue(profile, saved.profilePath);
      const canonical = canonicalFields.find((item) => item.path === saved.profilePath);
      if (!canonical) return field;
      return {
        ...field,
        profilePath: saved.profilePath,
        canonicalLabel: canonical.label,
        confidence: "high" as const,
        score: 1,
        reasons: ["使用你为此网站保存的字段对应关系"],
        requiresConfirmation: Boolean(canonical.sensitive),
        hasValue: Boolean(value.trim()),
        valuePreview: value,
        comparisonStatus: "empty" as const,
        mappingSource: "saved" as const
      };
    });
    const fillable = remappedFields.filter(
      (field) => field.profilePath && field.hasValue && field.comparisonStatus !== "equal"
    );
    return {
      title: "招聘表单验证页",
      site: "http://127.0.0.1:4173",
      fields: remappedFields,
      resumeAttachment: {
        status: "ready",
        candidateCount: 1,
        candidate: {
          elementId: "preview-file",
          fieldLabel: "上传简历",
          destinationOrigin: "http://127.0.0.1:4173",
          acceptsPdf: true
        }
      },
      summary: {
        total: fields.length,
        fillable: fillable.length,
        high: fillable.filter(
          (field) => field.comparisonStatus === "empty" && field.confidence === "high" && !field.requiresConfirmation
        ).length,
        needsConfirmation: fillable.filter(
          (field) => field.comparisonStatus !== "empty" || field.requiresConfirmation
        ).length,
        excluded: remappedFields.filter((field) => field.excludedReason).length,
        empty: remappedFields.filter((field) => field.comparisonStatus === "empty").length,
        equal: remappedFields.filter((field) => field.comparisonStatus === "equal").length,
        conflict: remappedFields.filter((field) => field.comparisonStatus === "conflict").length,
        unreadable: remappedFields.filter((field) => field.comparisonStatus === "unreadable").length
      }
    };
  }

  async fill(_profile: CandidateProfile, selections: FillSelection[]): Promise<FillResult> {
    return {
      outcomes: selections.map((selection) => ({ ...selection, status: "filled" as const })),
      filledCount: selections.length,
      skippedCount: 0
    };
  }

  async createRepeatableRecords(profile: CandidateProfile, group: RepeatableGroupKey): Promise<RepeatableCreateResult> {
    return createMissingRepeatableRecords(profile, group);
  }

  async attachResume(
    file: File,
    candidate: ResumeAttachmentCandidate,
    _sha256: string,
    _approvedAt: number
  ): Promise<ResumeAttachmentResult> {
    if (
      candidate.elementId !== "preview-file"
      || candidate.destinationOrigin !== "http://127.0.0.1:4173"
      || file.type !== "application/pdf"
      || !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return { status: "rejected", reason: "candidate-changed" };
    }
    return { status: "attached" };
  }
}

export function resolvePageBridge(): PageBridge {
  if (!extensionRuntimeAvailable()) return new PreviewPageBridge();
  const powerSession = new ChromePowerSessionBridge();
  const feishuBridge = new AdapterPageBridge(
    new ChromeRecruitmentKernelApi(),
    new AtsAdapterRegistry([feishuRecruitingManifest]),
    powerSession
  );
  return new RoutedPageBridge(
    feishuBridge,
    new ChromePageBridge(),
    activeTabUrl,
    isFeishuRecruitingApplicationUrl
  );
}
