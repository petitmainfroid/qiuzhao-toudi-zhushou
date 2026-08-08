import { getProfileValue, type CandidateProfile } from "../domain/profile";
import { canonicalFields } from "../matching/catalog";
import type {
  FillProposal,
  FillResult,
  FillSelection,
  ScanResult
} from "../content/engine";
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
import { AtsAdapterRegistry, ChromeRecruitmentKernelApi } from "../adapter-sdk";
import {
  isProductionRecruitmentAdapterUrl,
  productionRecruitmentAdapterManifests
} from "../ats/adapters";
import { AdapterPageBridge } from "./adapterPageBridge";
import { ChromePowerSessionBridge } from "./powerSessionBridge";
import { ProductionAdapterPageBridge } from "./productionAdapterPageBridge";

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
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id && chrome.tabs);
}

async function activeTabUrl(): Promise<string> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url;
  if (!url) throw new Error("active-page-url-unavailable");
  return url;
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
  const adapterBridge = new AdapterPageBridge(
    new ChromeRecruitmentKernelApi(),
    new AtsAdapterRegistry(productionRecruitmentAdapterManifests),
    powerSession
  );
  return new ProductionAdapterPageBridge(
    adapterBridge,
    activeTabUrl,
    isProductionRecruitmentAdapterUrl
  );
}
