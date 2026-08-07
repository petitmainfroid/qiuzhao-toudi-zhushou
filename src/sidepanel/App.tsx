import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  FileUp,
  FileWarning,
  Fingerprint,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { calculateProfileCompletion, getProfileValue, type CandidateProfile } from "../domain/profile";
import type { FillProposal, FillResult, ScanResult } from "../content/engine";
import type {
  FocusedRecoveryFailureReason,
  FocusedRecoveryTargetResult
} from "../content/focusedRecovery";
import {
  MAX_RESUME_ATTACHMENT_BYTES,
  type ResumeAttachmentCandidate,
  type ResumeAttachmentFailureReason
} from "../content/resumeAttachment";
import { canonicalFields } from "../matching/catalog";
import { MappingRepository } from "../mapping/mappingRepository";
import type { SavedFieldMapping } from "../mapping/types";
import { PrivacyConsentRepository } from "../privacy/consentRepository";
import { ProfileRepository } from "../storage/profileRepository";
import {
  SavedResumeRepository,
  type SavedResumeRepositoryLike
} from "../storage/savedResumeRepository";
import {
  executePreparedAutoFill,
  startAutoFillWorkflow,
  type AutoFillPlan,
  type AutoFillStage
} from "./autoFillWorkflow";
import { resolvePageBridge, type PageBridge } from "./pageBridge";
import "../styles/theme.css";
import "./sidepanel.css";

export interface SidePanelRepositoryLike {
  load(): Promise<CandidateProfile>;
}

export interface SidePanelMappingRepositoryLike {
  load(): Promise<SavedFieldMapping[]>;
  save(mapping: Omit<SavedFieldMapping, "updatedAt">): Promise<SavedFieldMapping[]>;
}

export interface SidePanelConsentRepositoryLike {
  hasAcknowledged(): Promise<boolean>;
  acknowledge(): Promise<void>;
}

const repository = new ProfileRepository();
const mappingRepository = new MappingRepository();
const consentRepository = new PrivacyConsentRepository();
const savedResumeRepository = new SavedResumeRepository();
const pageBridge = resolvePageBridge();

function openOptions() {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    void chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
  }
  else {
    window.open("/options.html", "_blank", "noopener,noreferrer");
  }
}

export function App({ developerTools }: { developerTools?: ReactNode } = {}) {
  return (
    <SidePanel
      repository={repository}
      mappingRepository={mappingRepository}
      consentRepository={consentRepository}
      savedResumeRepository={savedResumeRepository}
      pageBridge={pageBridge}
      developerTools={developerTools}
    />
  );
}

type OperationState = "idle" | AutoFillStage | "error";
type AttachmentState = "idle" | "hashing" | "ready" | "attaching" | "attached" | "error";
type RecoveryState = "idle" | "reading" | "ready" | "filling" | "filled" | "error";
type ReadyRecoveryTarget = Extract<FocusedRecoveryTargetResult, { status: "ready" }>;

interface PreparedResumeAttachment {
  file: File;
  sha256: string;
  savedAt?: string;
}

function formatAttachmentSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
    : `${Math.max(1, Math.ceil(bytes / 1024))} KiB`;
}

function destinationHost(candidate: ResumeAttachmentCandidate): string {
  try {
    return new URL(candidate.destinationOrigin).host;
  }
  catch {
    return candidate.destinationOrigin;
  }
}

function attachmentFailureMessage(reason?: ResumeAttachmentFailureReason): string {
  if (reason === "authorization-expired" || reason === "stale-confirmation") return "确认已经超过 60 秒，请重新自动填写后再选择文件。";
  if (reason === "digest-mismatch" || reason === "invalid-digest") return "文件摘要发生变化，已停止附件操作。";
  if (reason === "candidate-changed" || reason === "existing-file" || reason === "invalid-destination") return "页面、目标控件或现有附件已经变化，请重新自动填写。";
  if (reason === "invalid-filename" || reason === "invalid-mime" || reason === "invalid-size" || reason === "not-pdf") return "只支持 10 MiB 以内、内容有效的单个 PDF 简历。";
  return "附件没有添加。授权可能已使用或页面不再接受该文件，请重新自动填写。";
}

function recoveryFailureMessage(reason: FocusedRecoveryFailureReason): string {
  if (reason === "no-user-focused-field") return "还没有记录到你亲自点击的字段。请先回到招聘页点击漏填输入框。";
  if (reason === "focus-expired" || reason === "authorization-expired") return "这次字段授权已过期。请重新点击招聘页中的漏填字段。";
  if (reason === "page-changed") return "招聘页面已经跳转，已停止写入。请在当前页面重新选择字段。";
  if (reason === "field-changed") return "目标字段的结构已经变化，已停止写入。请重新点击它。";
  if (reason === "verification-control") return "验证码、短信码和身份校验必须由你本人填写。";
  if (reason === "sensitive-target" || reason === "sensitive-profile-value") return "敏感信息不能通过单字段补填，请重新自动填写并在集中确认区处理。";
  if (reason === "existing-value") return "这个网页字段已经有内容。为避免覆盖，请通过重新自动填写处理冲突。";
  if (reason === "empty-profile-value") return "所选档案字段没有内容，请先编辑本地档案。";
  if (reason === "unknown-profile-field") return "所选档案字段已变化，请重新选择。";
  if (reason === "write-verification-failed") return "网站没有接受这个值。请手动填写，或重新自动填写后检查匹配。";
  return "这个控件不支持安全补填，请手动处理。";
}

function ProposalCard({
  proposal,
  selected,
  onToggle,
  fieldOptions,
  onRemap,
  selectable = true
}: {
  proposal: FillProposal;
  selected: boolean;
  onToggle: () => void;
  fieldOptions: Array<{ path: string; label: string }>;
  onRemap: (path: string) => void;
  selectable?: boolean;
}) {
  const comparisonLabel = {
    empty: "网页为空",
    equal: "已经一致",
    conflict: "存在冲突",
    unreadable: "无法比较"
  }[proposal.comparisonStatus];
  return (
    <article className={`proposal-card confidence-${proposal.confidence}${selectable ? "" : " proposal-card-readonly"}`}>
      {selectable ? (
        <label className="proposal-select">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`确认填写 ${proposal.fieldLabel}`}
          />
          <span className="custom-checkbox" aria-hidden="true"><Check size={13} /></span>
        </label>
      ) : (
        <span className="proposal-safe-mark" aria-label="自动填写"><Check size={13} /></span>
      )}
      <div className="proposal-content">
        <div className="proposal-heading">
          <strong>{proposal.fieldLabel}</strong>
          <div className="proposal-tags">
            {proposal.mappingSource === "saved" ? <span>已记住</span> : null}
            <span>{comparisonLabel}</span>
          </div>
        </div>
        <p className="proposal-value">{proposal.valuePreview}</p>
        <details>
          <summary>为什么这样匹配 <ChevronDown size={13} aria-hidden="true" /></summary>
          <p>{proposal.reasons.join("；")}</p>
          <label className="remap-field">
            <span>更改对应字段</span>
            <select
              aria-label={`更改 ${proposal.fieldLabel} 对应字段`}
              value={proposal.profilePath ?? ""}
              onChange={(event) => onRemap(event.target.value)}
            >
              {fieldOptions.map((option) => <option key={option.path} value={option.path}>{option.label}</option>)}
            </select>
          </label>
        </details>
      </div>
    </article>
  );
}

export function SidePanel({
  repository: profileRepository,
  mappingRepository: fieldMappingRepository,
  consentRepository: privacyConsentRepository,
  savedResumeRepository: localResumeRepository,
  pageBridge: bridge,
  developerTools
}: {
  repository: SidePanelRepositoryLike;
  mappingRepository?: SidePanelMappingRepositoryLike;
  consentRepository?: SidePanelConsentRepositoryLike;
  savedResumeRepository?: SavedResumeRepositoryLike;
  pageBridge: PageBridge;
  developerTools?: ReactNode;
}) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [plan, setPlan] = useState<AutoFillPlan | null>(null);
  const [lastFillResult, setLastFillResult] = useState<FillResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<OperationState>("idle");
  const [message, setMessage] = useState("");
  const [mappings, setMappings] = useState<SavedFieldMapping[]>([]);
  const [consentAcknowledged, setConsentAcknowledged] = useState<boolean | null>(null);
  const [preparedAttachment, setPreparedAttachment] = useState<PreparedResumeAttachment | null>(null);
  const [attachmentState, setAttachmentState] = useState<AttachmentState>("idle");
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("idle");
  const [recoveryTarget, setRecoveryTarget] = useState<ReadyRecoveryTarget | null>(null);
  const [recoveryProfilePath, setRecoveryProfilePath] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      profileRepository.load(),
      fieldMappingRepository?.load() ?? Promise.resolve([]),
      privacyConsentRepository?.hasAcknowledged() ?? Promise.resolve(true),
      localResumeRepository?.load().catch(() => null) ?? Promise.resolve(null)
    ]).then(([loadedProfile, loadedMappings, acknowledged, loadedResume]) => {
      if (!active) return;
      setProfile(loadedProfile);
      setMappings(loadedMappings);
      setConsentAcknowledged(acknowledged);
      if (loadedResume) {
        setPreparedAttachment({
          file: loadedResume.file,
          sha256: loadedResume.sha256,
          savedAt: loadedResume.savedAt
        });
        setAttachmentState("ready");
      }
    });
    return () => {
      active = false;
    };
  }, [profileRepository, fieldMappingRepository, privacyConsentRepository, localResumeRepository]);

  const completion = useMemo(
    () => (profile ? calculateProfileCompletion(profile) : null),
    [profile]
  );
  const fillable = useMemo(
    () => scan?.fields.filter(
      (field) => field.profilePath && field.hasValue && !field.excludedReason && field.comparisonStatus !== "equal"
    ) ?? [],
    [scan]
  );
  const safeMatches = fillable.filter(
    (field) => field.comparisonStatus === "empty" && field.confidence === "high" && !field.requiresConfirmation
  );
  const confirmationMatches = plan?.confirmationProposals ?? [];
  const equalMatches = scan?.fields.filter((field) => field.comparisonStatus === "equal") ?? [];
  const excluded = scan?.fields.filter(
    (field) => field.excludedReason || !field.profilePath || !field.hasValue
  ) ?? [];
  const fieldOptions = useMemo(
    () => profile
      ? canonicalFields
          .filter((field) => getProfileValue(profile, field.path).trim())
          .map((field) => ({ path: field.path, label: field.label }))
      : [],
    [profile]
  );
  const recoveryFieldOptions = useMemo(
    () => profile
      ? canonicalFields
          .filter((field) => !field.sensitive && getProfileValue(profile, field.path).trim())
          .map((field) => ({ path: field.path, label: field.label }))
      : [],
    [profile]
  );

  async function chooseResumeAttachment(file: File | undefined) {
    setPreparedAttachment(null);
    setAttachmentMessage("");
    if (!file) {
      setAttachmentState("idle");
      return;
    }
    if (
      file.type.toLowerCase() !== "application/pdf"
      || !file.name.toLowerCase().endsWith(".pdf")
      || file.size <= 0
      || file.size > MAX_RESUME_ATTACHMENT_BYTES
    ) {
      setAttachmentState("error");
      setAttachmentMessage("只支持 10 MiB 以内的单个 PDF 简历。");
      return;
    }

    setAttachmentState("hashing");
    try {
      if (localResumeRepository) {
        const saved = await localResumeRepository.save(file);
        setPreparedAttachment({ file: saved.file, sha256: saved.sha256, savedAt: saved.savedAt });
        setAttachmentState("ready");
        setAttachmentMessage("PDF 已保存于本机；以后打开侧边栏可直接复用，上传到网站前仍会再次确认。");
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isPdf = bytes.length >= 5
        && bytes[0] === 0x25
        && bytes[1] === 0x50
        && bytes[2] === 0x44
        && bytes[3] === 0x46
        && bytes[4] === 0x2d;
      if (!isPdf) {
        bytes.fill(0);
        setAttachmentState("error");
        setAttachmentMessage("文件扩展名是 PDF，但内容不是有效的 PDF 文件。");
        return;
      }
      const digestBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer);
      bytes.fill(0);
      const sha256 = Array.from(
        new Uint8Array(digestBuffer),
        (value) => value.toString(16).padStart(2, "0")
      ).join("");
      setPreparedAttachment({ file, sha256 });
      setAttachmentState("ready");
    }
    catch {
      setAttachmentState("error");
      setAttachmentMessage("无法在本机读取这个 PDF，请重新选择。");
    }
  }

  async function attachSelectedResume(candidate: ResumeAttachmentCandidate) {
    if (!preparedAttachment || !bridge.attachResume) return;
    setAttachmentState("attaching");
    setAttachmentMessage("");
    try {
      const result = await bridge.attachResume(
        preparedAttachment.file,
        candidate,
        preparedAttachment.sha256,
        Date.now()
      );
      if (result.status === "attached") {
        setAttachmentState("attached");
        setAttachmentMessage("简历已附加。招聘网站可能已经接收文件；请检查页面，但仍由你本人最终提交。");
      }
      else {
        setAttachmentState("error");
        setAttachmentMessage(attachmentFailureMessage(result.reason));
      }
    }
    catch {
      setAttachmentState("error");
      setAttachmentMessage("附件失败，页面可能已经跳转或会话已失效。请回到招聘页后重新自动填写。");
    }
  }

  function resultMessage(resultPlan: AutoFillPlan, result: FillResult, prefix = ""): string {
    const savedRecords = result.repeatableLifecycles?.filter((item) => item.status === "saved").length ?? 0;
    const stoppedRecords = result.repeatableLifecycles?.filter((item) => item.status === "stopped").length ?? 0;
    const resultParts = [
      result.filledCount > 0 ? `已填写 ${result.filledCount} 项` : "没有修改网页字段",
      result.skippedCount > 0 ? `跳过 ${result.skippedCount} 项` : "",
      resultPlan.repeatableCreatedCount > 0 ? `新增 ${resultPlan.repeatableCreatedCount} 条经历卡片` : "",
      savedRecords > 0 ? `保存并核对 ${savedRecords} 条经历` : "",
      stoppedRecords > 0 ? `${stoppedRecords} 条经历需要手动检查保存` : "",
      resultPlan.alreadyEqualCount > 0 ? `${resultPlan.alreadyEqualCount} 项原本一致` : "",
      resultPlan.excludedCount > 0 ? `${resultPlan.excludedCount} 项未匹配或不支持` : ""
    ].filter(Boolean).join("，");
    return `${prefix ? `${prefix} ` : ""}${resultParts}。请在网页中检查后自行提交。`;
  }

  function applyPlan(resultPlan: AutoFillPlan) {
    setPlan(resultPlan);
    setScan(resultPlan.scan);
    setSelected(new Set());
    setAttachmentState(preparedAttachment ? "ready" : "idle");
    setAttachmentMessage("");
  }

  async function runAutomaticFill(
    activeMappings: SavedFieldMapping[] = mappings,
    prefix = ""
  ) {
    if (!profile) return;
    setState("analyzing");
    setMessage("");
    setPlan(null);
    setScan(null);
    setLastFillResult(null);
    setSelected(new Set());
    setRecoveryState("idle");
    setRecoveryTarget(null);
    setRecoveryProfilePath("");
    setRecoveryMessage("");
    try {
      const prepared = await startAutoFillWorkflow({
        gateway: bridge,
        profile,
        mappings: activeMappings,
        onStage: (stage) => setState(stage)
      });
      applyPlan(prepared.plan);
      if (prepared.status === "awaiting-confirmation") {
        setState("awaiting-confirmation");
        setMessage(prefix);
        return;
      }
      const result = prepared.fillResult ?? { outcomes: [], filledCount: 0, skippedCount: 0 };
      setLastFillResult(result);
      setState("complete");
      setMessage(resultMessage(prepared.plan, result, prefix));
    }
    catch (error) {
      setState("error");
      const detail = error instanceof Error ? error.message : "未知错误";
      setMessage(`自动填写已停止。请确认当前是可编辑的 HTTPS 招聘表单后重试。技术原因：${detail}`);
    }
  }

  async function remapProposal(proposal: FillProposal, profilePath: string) {
    if (!profile || !scan || !fieldMappingRepository) return;
    const canonical = canonicalFields.find((field) => field.path === profilePath);
    if (!canonical) return;
    const nextMappings = await fieldMappingRepository.save({
      site: scan.site,
      fingerprint: proposal.fingerprint,
      profilePath,
      canonicalLabel: canonical.label
    });
    setMappings(nextMappings);
    await runAutomaticFill(
      nextMappings,
      `已记住“${proposal.fieldLabel}”在这个网站对应“${canonical.label}”。`
    );
  }

  function toggleSelection(elementId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(elementId)) next.delete(elementId);
      else next.add(elementId);
      return next;
    });
  }

  async function continueAutomaticFill() {
    if (!profile || !plan) return;
    setState("filling");
    setMessage("");
    try {
      const result = await executePreparedAutoFill(
        {
          gateway: bridge,
          profile,
          mappings,
          onStage: (stage) => setState(stage)
        },
        plan,
        selected
      );
      setLastFillResult(result);
      setState("complete");
      setMessage(resultMessage(plan, result));
    }
    catch (error) {
      setState("error");
      const detail = error instanceof Error ? error.message : "未知错误";
      setMessage(`填写已停止，网页可能已经更新。请重新自动填写。技术原因：${detail}`);
    }
  }

  async function readFocusedRecoveryTarget() {
    if (!bridge.getFocusedRecoveryTarget) {
      setRecoveryState("error");
      setRecoveryMessage("当前环境不支持聚焦字段补填。");
      return;
    }
    setRecoveryState("reading");
    setRecoveryTarget(null);
    setRecoveryProfilePath("");
    setRecoveryMessage("");
    try {
      const result = await bridge.getFocusedRecoveryTarget();
      if (result.status === "rejected") {
        setRecoveryState("error");
        setRecoveryMessage(recoveryFailureMessage(result.reason));
        return;
      }
      setRecoveryTarget(result);
      setRecoveryState("ready");
      setRecoveryMessage(`已锁定“${result.fieldLabel}”；请选择一个档案字段。`);
    }
    catch {
      setRecoveryState("error");
      setRecoveryMessage("无法读取刚刚聚焦的字段。请保持招聘页打开后重试。");
    }
  }

  async function fillFocusedRecoveryTarget() {
    if (!profile || !recoveryTarget || !recoveryProfilePath || !bridge.fillFocusedRecovery) return;
    const value = getProfileValue(profile, recoveryProfilePath).trim();
    setRecoveryState("filling");
    setRecoveryMessage("");
    try {
      const result = await bridge.fillFocusedRecovery(
        recoveryTarget.token,
        recoveryProfilePath,
        value
      );
      if (result.status === "rejected") {
        setRecoveryState("error");
        setRecoveryTarget(null);
        setRecoveryMessage(recoveryFailureMessage(result.reason));
        return;
      }
      setRecoveryState("filled");
      setRecoveryTarget(null);
      setRecoveryProfilePath("");
      setRecoveryMessage(`已将“${result.canonicalLabel}”写入“${result.fieldLabel}”并回读确认。`);
    }
    catch {
      setRecoveryState("error");
      setRecoveryTarget(null);
      setRecoveryMessage("补填已停止。页面可能已经更新，请重新点击漏填字段。");
    }
  }

  async function acknowledgePrivacy() {
    await privacyConsentRepository?.acknowledge();
    setConsentAcknowledged(true);
  }

  if (!profile || !completion || consentAcknowledged === null) {
    return <main className="sidepanel-loading" aria-live="polite">正在读取本地档案…</main>;
  }

  if (!consentAcknowledged) {
    return (
      <main className="sidepanel-shell consent-panel">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true"><Archive size={21} /></span>
          <p className="brand-name">秋招填表助手</p>
        </div>
        <section className="consent-card" aria-labelledby="consent-title">
          <ShieldCheck size={32} aria-hidden="true" />
          <p className="eyebrow">使用前说明</p>
          <h1 id="consent-title">你的档案默认只留在本机。</h1>
          <ul>
            <li>只有点击“自动填写当前页面”后，扩展才读取并处理当前招聘表单。</li>
            <li>敏感、冲突和低置信度字段会集中确认；附件仍需单独确认目标网站。</li>
            <li>扩展会回读检查填写结果，但不会替你提交申请。</li>
          </ul>
          <button className="consent-action" type="button" onClick={acknowledgePrivacy}>我已了解并继续</button>
        </section>
      </main>
    );
  }

  return (
    <main className="sidepanel-shell" data-testid="side-panel">
      <header className="sidepanel-header">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true"><Archive size={21} strokeWidth={1.8} /></span>
          <p className="brand-name">秋招填表助手</p>
        </div>
        <button className="text-button" type="button" onClick={openOptions}>编辑档案<ArrowRight size={15} aria-hidden="true" /></button>
      </header>

      <section className="readiness-card" aria-labelledby="readiness-title">
        <div className="readiness-value">{completion.percentage}%</div>
        <div>
          <p className="eyebrow">档案准备度</p>
          <h1 id="readiness-title">{completion.filled ? "可以自动填写" : "先完成求职档案"}</h1>
          <p>{completion.missing.length ? `还有 ${completion.missing.length} 个基础检查项未填写。` : "基础档案已经准备好，打开申请表后即可一键填写。"}</p>
        </div>
      </section>

      {developerTools}

      {state !== "awaiting-confirmation" ? (
        <section className="autofill-launcher" aria-labelledby="autofill-title">
          <div className="autofill-intro">
            <span className="autofill-icon" aria-hidden="true"><Sparkles size={22} /></span>
            <div>
              <h2 id="autofill-title">自动填写当前申请</h2>
              <p>自动识别、填写并核对；只有例外字段才会请你集中确认。</p>
            </div>
          </div>
          <button
            className="auto-fill-button"
            type="button"
            onClick={() => { void runAutomaticFill(); }}
            disabled={
              !completion.filled
              || ["analyzing", "preparing-records", "filling"].includes(state)
              || attachmentState === "hashing"
              || attachmentState === "attaching"
            }
          >
            <Sparkles size={20} aria-hidden="true" />
            {state === "analyzing"
              ? "正在识别页面"
              : state === "preparing-records"
                ? "正在准备经历卡片"
                : state === "filling"
                  ? "正在填写并核对"
                  : state === "complete" || state === "error"
                    ? "重新自动填写当前页面"
                    : "自动填写当前页面"}
          </button>
        </section>
      ) : null}

      {["analyzing", "preparing-records", "filling"].includes(state) ? (
        <div className="workflow-progress" role="status" aria-live="polite">
          <span className="workflow-spinner" aria-hidden="true" />
          <div>
            <strong>{state === "analyzing"
              ? "正在识别可填写字段"
              : state === "preparing-records"
                ? "正在补齐经历卡片"
                : "正在填写并回读验证"}</strong>
            <p>请保持当前招聘页面打开；不会触发最终投递。</p>
          </div>
        </div>
      ) : null}

      {scan && plan ? (
        <section className="scan-results" aria-live="polite">
          <header className="result-header">
            <div>
              <p className="eyebrow">当前页面</p>
              <h2>{scan.title || "未命名页面"}</h2>
            </div>
            <strong>{lastFillResult?.filledCount ?? plan.safeSelections.length}<span>{lastFillResult ? "项已填写" : "项自动准备"}</span></strong>
          </header>

          {scan.resumeAttachment?.status === "ready" && scan.resumeAttachment.candidate ? (
            <section className="attachment-card" aria-labelledby="resume-attachment-title">
              <div className="group-heading">
                <FileUp size={17} aria-hidden="true" />
                <h3 id="resume-attachment-title">附加简历 PDF</h3>
                <span>单独确认</span>
              </div>
              <p className="attachment-warning">点击确认后，招聘网站可能立即接收文件，不必等到最终提交。</p>
              <dl className="attachment-target">
                <div><dt>目标网站</dt><dd>{scan.resumeAttachment.candidate.destinationOrigin}</dd></div>
                <div><dt>目标控件</dt><dd>{scan.resumeAttachment.candidate.fieldLabel}</dd></div>
              </dl>
              <label className="attachment-picker">
                <span>{attachmentState === "hashing" ? "正在核对文件" : "选择要附加的 PDF 简历"}</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={attachmentState === "hashing" || attachmentState === "attaching" || attachmentState === "attached"}
                  onChange={(event) => { void chooseResumeAttachment(event.currentTarget.files?.[0]); }}
                />
              </label>
              {preparedAttachment ? (
                <div className="attachment-summary">
                  <strong>{preparedAttachment.file.name}</strong>
                  <span>{formatAttachmentSize(preparedAttachment.file.size)}</span>
                  {preparedAttachment.savedAt ? <span className="attachment-local">已保存于本机，可长期复用</span> : null}
                  <span className="attachment-digest"><Fingerprint size={13} aria-hidden="true" />SHA-256 {preparedAttachment.sha256.slice(0, 16)}…</span>
                </div>
              ) : null}
              {preparedAttachment && attachmentState !== "attached" ? (
                <button
                  className="attachment-confirm"
                  type="button"
                  disabled={!bridge.attachResume || attachmentState !== "ready"}
                  onClick={() => { void attachSelectedResume(scan.resumeAttachment!.candidate!); }}
                >
                  <FileUp size={16} aria-hidden="true" />
                  {attachmentState === "attaching"
                    ? "正在附加"
                    : `确认上传到 ${destinationHost(scan.resumeAttachment.candidate)}`}
                </button>
              ) : null}
              {attachmentMessage ? (
                <p className={`attachment-message ${attachmentState === "error" ? "attachment-error" : ""}`}>
                  {attachmentMessage}
                </p>
              ) : null}
            </section>
          ) : null}

          {scan.resumeAttachment && ["ambiguous", "unsupported"].includes(scan.resumeAttachment.status) ? (
            <div className="attachment-unavailable">
              <FileWarning size={16} aria-hidden="true" />
              <p>{scan.resumeAttachment.status === "ambiguous"
                ? `发现 ${scan.resumeAttachment.candidateCount} 个可能的简历控件，无法安全选择，请手动上传。`
                : "页面存在附件控件，但没有唯一的 PDF 简历目标，请手动上传。"}</p>
            </div>
          ) : null}

          {plan.repeatablePreparations.length > 0 ? (
            <div className="repeatable-summary" role="status">
              <Check size={16} aria-hidden="true" />
              <p>
                {plan.repeatableCreatedCount > 0
                  ? `已自动新增 ${plan.repeatableCreatedCount} 条经历卡片并重新识别页面。`
                  : "经历卡片没有自动新增；已保留当前页面中可以安全填写的部分。"}
              </p>
            </div>
          ) : null}

          {state === "awaiting-confirmation" && confirmationMatches.length > 0 ? (
            <section className="confirmation-sheet" aria-labelledby="confirmation-title">
              <div className="confirmation-heading">
                <span className="confirmation-icon" aria-hidden="true"><CircleAlert size={20} /></span>
                <div>
                  <p className="eyebrow">填写前集中确认</p>
                  <h3 id="confirmation-title">只处理这 {confirmationMatches.length} 个例外</h3>
                  <p>{plan.safeSelections.length} 项安全字段已经准备好；以下字段默认不填写。</p>
                </div>
              </div>
              <div className="confirmation-list">
                {confirmationMatches.map((proposal) => (
                  <ProposalCard
                    key={proposal.elementId}
                    proposal={proposal}
                    selected={selected.has(proposal.elementId)}
                    onToggle={() => toggleSelection(proposal.elementId)}
                    fieldOptions={fieldOptions}
                    onRemap={(path) => { void remapProposal(proposal, path); }}
                  />
                ))}
              </div>
              <button
                className="confirmation-continue"
                type="button"
                disabled={attachmentState === "attaching"}
                onClick={() => { void continueAutomaticFill(); }}
              >
                <Check size={18} aria-hidden="true" />
                {plan.safeSelections.length + selected.size > 0
                  ? `确认并继续填写 ${plan.safeSelections.length + selected.size} 项`
                  : "跳过例外并查看结果"}
              </button>
            </section>
          ) : null}

          {safeMatches.length > 0 ? (
            <details className="automatic-match-details">
              <summary><Sparkles size={16} aria-hidden="true" />查看自动匹配详情 {safeMatches.length} 项<ChevronDown size={14} aria-hidden="true" /></summary>
              <p className="group-copy">这些字段由规则确定并自动填写；这里只保留站点纠错入口。</p>
              {safeMatches.map((proposal) => (
                <ProposalCard
                  key={proposal.elementId}
                  proposal={proposal}
                  selected
                  selectable={false}
                  onToggle={() => undefined}
                  fieldOptions={fieldOptions}
                  onRemap={(path) => { void remapProposal(proposal, path); }}
                />
              ))}
            </details>
          ) : null}

          {equalMatches.length > 0 ? (
            <details className="excluded-group consistent-group">
              <summary><Check size={16} aria-hidden="true" />已经一致 {equalMatches.length} 项<ChevronDown size={14} aria-hidden="true" /></summary>
              <ul>{equalMatches.map((field) => <li key={field.elementId}><strong>{field.fieldLabel}</strong><span>网页内容与档案一致，无需重复填写</span></li>)}</ul>
            </details>
          ) : null}

          {excluded.length > 0 ? (
            <details className="excluded-group">
              <summary><FileWarning size={16} aria-hidden="true" />未匹配或已跳过 {excluded.length} 项<ChevronDown size={14} aria-hidden="true" /></summary>
              <ul>{excluded.map((field) => <li key={field.elementId}><strong>{field.fieldLabel}</strong><span>{field.reasons[0] || "档案中没有可用内容"}</span></li>)}</ul>
            </details>
          ) : null}

          {bridge.getFocusedRecoveryTarget && bridge.fillFocusedRecovery ? (
            <details className="manual-recovery">
              <summary>
                <CircleAlert size={16} aria-hidden="true" />
                某个字段没填上？
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div className="manual-recovery-body">
                <p>先回到招聘页，亲自点击一个空白的普通字段，再回来读取。这里只会发送你随后选择的一个档案值。</p>
                <button
                  className="manual-recovery-read"
                  type="button"
                  disabled={recoveryState === "reading" || recoveryState === "filling"}
                  onClick={() => { void readFocusedRecoveryTarget(); }}
                >
                  {recoveryState === "reading" ? "正在读取" : "读取刚刚聚焦的字段"}
                </button>
                {recoveryTarget ? (
                  <div className="manual-recovery-target">
                    <strong>已锁定：{recoveryTarget.fieldLabel}</strong>
                    <label>
                      <span>选择一个本地档案字段</span>
                      <select
                        aria-label="选择要补填的档案字段"
                        value={recoveryProfilePath}
                        onChange={(event) => setRecoveryProfilePath(event.target.value)}
                      >
                        <option value="">只显示字段名称，不显示其他档案值</option>
                        {recoveryFieldOptions.map((option) => (
                          <option key={option.path} value={option.path}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="manual-recovery-fill"
                      type="button"
                      disabled={!recoveryProfilePath || recoveryState === "filling"}
                      onClick={() => { void fillFocusedRecoveryTarget(); }}
                    >
                      {recoveryState === "filling" ? "正在写入并核对" : "填写这个字段"}
                    </button>
                  </div>
                ) : null}
                {recoveryMessage ? (
                  <p className={`manual-recovery-message ${recoveryState === "error" ? "manual-recovery-error" : ""}`} role="status">
                    {recoveryMessage}
                  </p>
                ) : null}
                <p className="manual-recovery-boundary">不处理敏感信息、已有内容、附件、验证码或投递按钮。</p>
              </div>
            </details>
          ) : null}

        </section>
      ) : null}

      {message ? <div className={`operation-message ${state === "error" ? "message-error" : ""}`}>{state === "error" ? <CircleAlert size={18} /> : <Check size={18} />}<p>{message}</p></div> : null}

      <div className="privacy-message">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>只在你点击自动填写后处理当前页面；例外字段集中确认，简历附件单独确认，最终投递始终由你完成。</p>
      </div>
    </main>
  );
}
