import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  FileUp,
  FileWarning,
  Fingerprint,
  ListPlus,
  ScanSearch,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { calculateProfileCompletion, getProfileValue, type CandidateProfile } from "../domain/profile";
import type { FillProposal, FillSelection, ScanResult } from "../content/engine";
import type { RepeatableGroupKey } from "../content/repeatableRecords";
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
import { resolvePageBridge, type PageBridge } from "./pageBridge";
import { PowerSessionCard } from "./PowerSessionCard";
import { resolvePowerSessionBridge } from "./powerSessionBridge";
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
const powerSessionBridge = resolvePowerSessionBridge();

function openOptions() {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    void chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
  }
  else {
    window.open("/options.html", "_blank", "noopener,noreferrer");
  }
}

export function App() {
  return (
    <SidePanel
      repository={repository}
      mappingRepository={mappingRepository}
      consentRepository={consentRepository}
      savedResumeRepository={savedResumeRepository}
      pageBridge={pageBridge}
    />
  );
}

type OperationState = "idle" | "scanning" | "creating" | "ready" | "filling" | "complete" | "error";
type AttachmentState = "idle" | "hashing" | "ready" | "attaching" | "attached" | "error";

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
  if (reason === "authorization-expired" || reason === "stale-confirmation") return "确认已经超过 60 秒，请重新扫描后再选择文件。";
  if (reason === "digest-mismatch" || reason === "invalid-digest") return "文件摘要发生变化，已停止附件操作。";
  if (reason === "candidate-changed" || reason === "existing-file" || reason === "invalid-destination") return "页面、目标控件或现有附件已经变化，请重新扫描。";
  if (reason === "invalid-filename" || reason === "invalid-mime" || reason === "invalid-size" || reason === "not-pdf") return "只支持 10 MiB 以内、内容有效的单个 PDF 简历。";
  return "附件没有添加。授权可能已使用或页面不再接受该文件，请重新扫描。";
}

function ProposalCard({
  proposal,
  selected,
  onToggle,
  fieldOptions,
  onRemap
}: {
  proposal: FillProposal;
  selected: boolean;
  onToggle: () => void;
  fieldOptions: Array<{ path: string; label: string }>;
  onRemap: (path: string) => void;
}) {
  const comparisonLabel = {
    empty: "网页为空",
    equal: "已经一致",
    conflict: "存在冲突",
    unreadable: "无法比较"
  }[proposal.comparisonStatus];
  return (
    <article className={`proposal-card confidence-${proposal.confidence}`}>
      <label className="proposal-select">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`选择 ${proposal.fieldLabel}`}
        />
        <span className="custom-checkbox" aria-hidden="true"><Check size={13} /></span>
      </label>
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
  pageBridge: bridge
}: {
  repository: SidePanelRepositoryLike;
  mappingRepository?: SidePanelMappingRepositoryLike;
  consentRepository?: SidePanelConsentRepositoryLike;
  savedResumeRepository?: SavedResumeRepositoryLike;
  pageBridge: PageBridge;
}) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<OperationState>("idle");
  const [message, setMessage] = useState("");
  const [mappings, setMappings] = useState<SavedFieldMapping[]>([]);
  const [consentAcknowledged, setConsentAcknowledged] = useState<boolean | null>(null);
  const [preparedAttachment, setPreparedAttachment] = useState<PreparedResumeAttachment | null>(null);
  const [attachmentState, setAttachmentState] = useState<AttachmentState>("idle");
  const [attachmentMessage, setAttachmentMessage] = useState("");

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
  const confirmationMatches = fillable.filter(
    (field) => field.comparisonStatus !== "empty" || field.requiresConfirmation || field.confidence !== "high"
  );
  const equalMatches = scan?.fields.filter((field) => field.comparisonStatus === "equal") ?? [];
  const excluded = scan?.fields.filter(
    (field) => field.excludedReason || !field.profilePath || !field.hasValue
  ) ?? [];
  const missingRepeatableGroups = scan?.repeatableRecords?.adapterId
    ? scan.repeatableRecords.groups.filter((group) => group.missingCount > 0)
    : [];
  const fieldOptions = useMemo(
    () => profile
      ? canonicalFields
          .filter((field) => getProfileValue(profile, field.path).trim())
          .map((field) => ({ path: field.path, label: field.label }))
      : [],
    [profile]
  );

  function useScanResult(result: ScanResult) {
    setScan(result);
    setSelected(new Set(
      result.fields
        .filter(
          (field) => field.profilePath && field.hasValue && field.comparisonStatus === "empty" &&
            field.confidence === "high" && !field.requiresConfirmation
        )
        .map((field) => field.elementId)
    ));
    setAttachmentState(preparedAttachment ? "ready" : "idle");
    setAttachmentMessage("");
    setState("ready");
  }

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
      setAttachmentMessage("附件失败，页面可能已经跳转或会话已失效。请重新连接当前招聘页并扫描。");
    }
  }

  async function scanCurrentPage() {
    if (!profile) return;
    setState("scanning");
    setMessage("");
    try {
      const result = await bridge.scan(profile, mappings);
      useScanResult(result);
    }
    catch (error) {
      setState("error");
      const detail = error instanceof Error ? error.message : "未知错误";
      setMessage(`无法读取当前页面。请先连接当前 HTTPS 招聘页后再试。技术原因：${detail}`);
    }
  }

  async function remapProposal(proposal: FillProposal, profilePath: string) {
    if (!profile || !scan || !fieldMappingRepository) return;
    const canonical = canonicalFields.find((field) => field.path === profilePath);
    if (!canonical) return;
    setState("scanning");
    const nextMappings = await fieldMappingRepository.save({
      site: scan.site,
      fingerprint: proposal.fingerprint,
      profilePath,
      canonicalLabel: canonical.label
    });
    setMappings(nextMappings);
    const result = await bridge.scan(profile, nextMappings);
    useScanResult(result);
    setMessage(`已记住“${proposal.fieldLabel}”在这个网站对应“${canonical.label}”。`);
  }

  function toggleSelection(elementId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(elementId)) next.delete(elementId);
      else next.add(elementId);
      return next;
    });
  }

  async function fillSelected() {
    if (!profile || !scan || selected.size === 0) return;
    const selections: FillSelection[] = scan.fields
      .filter((field) => selected.has(field.elementId) && field.profilePath)
      .map((field) => ({
        elementId: field.elementId,
        profilePath: field.profilePath!,
        ...(field.comparisonStatus === "conflict" && field.comparisonToken
          ? { conflictApprovalToken: field.comparisonToken }
          : {})
      }));
    setState("filling");
    setMessage("");
    try {
      const result = await bridge.fill(profile, selections, mappings);
      setMessage(`已填写 ${result.filledCount} 项${result.skippedCount ? `，跳过 ${result.skippedCount} 项` : ""}。请在网页中检查后自行提交。`);
      setState("complete");
    }
    catch {
      setState("error");
      setMessage("填写失败，网页可能已经更新。请重新扫描后再试。");
    }
  }

  async function createRepeatableRecords(group: RepeatableGroupKey) {
    if (!profile || !bridge.createRepeatableRecords) return;
    setState("creating");
    setMessage("");
    try {
      const result = await bridge.createRepeatableRecords(profile, group);
      const refreshed = await bridge.scan(profile, mappings);
      useScanResult(refreshed);
      if (result.createdCount > 0) {
        setMessage(
          result.remainingCount > 0
            ? `已创建 ${result.createdCount} 条记录；页面结构发生变化，仍有 ${result.remainingCount} 条需要再次确认创建。`
            : `已创建 ${result.createdCount} 条记录并重新扫描。请确认新出现的填写建议。`
        );
      }
      else {
        setMessage("没有创建记录：页面结构或添加控件已经变化，请检查网页后重新扫描。");
      }
    }
    catch (error) {
      setState("error");
      const detail = error instanceof Error ? error.message : "未知错误";
      setMessage(`创建记录已停止，网页未继续操作。技术原因：${detail}`);
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
            <li>浏览器会提示网页与调试权限；只有点击连接或扫描后，扩展才处理目标 HTTPS 页面，跨站后会暂停。</li>
            <li>敏感字段默认不选；附件只有在选择 PDF 并再次确认目标网站后才会添加。</li>
            <li>扩展只填写已选字段，不会替你提交申请。</li>
          </ul>
          <button className="scan-button" type="button" onClick={acknowledgePrivacy}>我已了解并继续</button>
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
          <h1 id="readiness-title">{completion.filled ? "可以开始匹配" : "先完成求职档案"}</h1>
          <p>{completion.missing.length ? `还有 ${completion.missing.length} 个基础检查项未填写。` : "基础档案已经完整，可以扫描当前招聘页面。"}</p>
        </div>
      </section>

      <PowerSessionCard bridge={powerSessionBridge} />

      <button className="scan-button" type="button" onClick={scanCurrentPage} disabled={!completion.filled || state === "scanning" || state === "creating" || state === "filling" || attachmentState === "hashing" || attachmentState === "attaching"}>
        <ScanSearch size={20} aria-hidden="true" />
        {state === "scanning" ? "正在扫描" : scan ? "重新扫描当前页面" : "扫描当前页面"}
      </button>

      {scan ? (
        <section className="scan-results" aria-live="polite">
          <header className="result-header">
            <div>
              <p className="eyebrow">当前页面</p>
              <h2>{scan.title || "未命名页面"}</h2>
            </div>
            <strong>{fillable.length}<span>项可填写</span></strong>
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

          {missingRepeatableGroups.length > 0 ? (
            <div className="repeatable-plan" aria-labelledby="repeatable-plan-title">
              <div className="group-heading">
                <ListPlus size={16} aria-hidden="true" />
                <h3 id="repeatable-plan-title">先补齐经历卡片</h3>
                <span>{missingRepeatableGroups.length}</span>
              </div>
              <p className="group-copy">只会在对应分区点击唯一的添加控件；每增加一条都会重新检查页面结构。</p>
              <div className="repeatable-list">
                {missingRepeatableGroups.map((group) => (
                  <article className="repeatable-item" key={group.key}>
                    <div>
                      <strong>{group.label}</strong>
                      <p>档案 {group.profileCount} 条 · 网页 {group.pageCount} 条 · 缺少 {group.missingCount} 条</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`创建缺失的${group.label}`}
                      disabled={!group.canCreate || !bridge.createRepeatableRecords || state === "creating" || state === "filling" || attachmentState === "attaching"}
                      onClick={() => { void createRepeatableRecords(group.key); }}
                    >
                      {state === "creating" ? "正在检查" : "创建并重扫"}
                    </button>
                    {!group.canCreate ? <p className="repeatable-warning">添加控件不唯一或已变化，已停止自动创建。</p> : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {safeMatches.length > 0 ? (
            <div className="match-group">
              <div className="group-heading"><Sparkles size={16} aria-hidden="true" /><h3>安全匹配</h3><span>{safeMatches.length}</span></div>
              <p className="group-copy">高置信且不属于敏感信息，已默认选择。</p>
              {safeMatches.map((proposal) => <ProposalCard key={proposal.elementId} proposal={proposal} selected={selected.has(proposal.elementId)} onToggle={() => toggleSelection(proposal.elementId)} fieldOptions={fieldOptions} onRemap={(path) => { void remapProposal(proposal, path); }} />)}
            </div>
          ) : null}

          {confirmationMatches.length > 0 ? (
            <div className="match-group confirmation-group">
              <div className="group-heading"><CircleAlert size={16} aria-hidden="true" /><h3>需要你确认</h3><span>{confirmationMatches.length}</span></div>
              <p className="group-copy">已有网页内容、敏感信息或上下文不够明确，默认不选择；勾选冲突项表示确认覆盖当前内容。</p>
              {confirmationMatches.map((proposal) => <ProposalCard key={proposal.elementId} proposal={proposal} selected={selected.has(proposal.elementId)} onToggle={() => toggleSelection(proposal.elementId)} fieldOptions={fieldOptions} onRemap={(path) => { void remapProposal(proposal, path); }} />)}
            </div>
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

          <button className="fill-button" type="button" disabled={selected.size === 0 || state === "filling" || attachmentState === "attaching"} onClick={fillSelected}>
            <Check size={18} aria-hidden="true" />
            {state === "filling" ? "正在填写" : `填写已选 ${selected.size} 项`}
          </button>
        </section>
      ) : null}

      {message ? <div className={`operation-message ${state === "error" ? "message-error" : ""}`}>{state === "error" ? <CircleAlert size={18} /> : <Check size={18} />}<p>{message}</p></div> : null}

      <div className="privacy-message">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>只在你点击连接、扫描或填写后处理目标页面；跨站会暂停，简历附件需要单独确认，也不会自动提交申请。</p>
      </div>
    </main>
  );
}
