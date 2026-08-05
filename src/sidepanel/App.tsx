import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  FileWarning,
  ListPlus,
  ScanSearch,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { calculateProfileCompletion, getProfileValue, type CandidateProfile } from "../domain/profile";
import type { FillProposal, FillSelection, ScanResult } from "../content/engine";
import type { RepeatableGroupKey } from "../content/repeatableRecords";
import { canonicalFields } from "../matching/catalog";
import { MappingRepository } from "../mapping/mappingRepository";
import type { SavedFieldMapping } from "../mapping/types";
import { PrivacyConsentRepository } from "../privacy/consentRepository";
import { ProfileRepository } from "../storage/profileRepository";
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
const pageBridge = resolvePageBridge();

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
      pageBridge={pageBridge}
    />
  );
}

type OperationState = "idle" | "scanning" | "creating" | "ready" | "filling" | "complete" | "error";

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
  pageBridge: bridge
}: {
  repository: SidePanelRepositoryLike;
  mappingRepository?: SidePanelMappingRepositoryLike;
  consentRepository?: SidePanelConsentRepositoryLike;
  pageBridge: PageBridge;
}) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<OperationState>("idle");
  const [message, setMessage] = useState("");
  const [mappings, setMappings] = useState<SavedFieldMapping[]>([]);
  const [consentAcknowledged, setConsentAcknowledged] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      profileRepository.load(),
      fieldMappingRepository?.load() ?? Promise.resolve([]),
      privacyConsentRepository?.hasAcknowledged() ?? Promise.resolve(true)
    ]).then(([loadedProfile, loadedMappings, acknowledged]) => {
      if (!active) return;
      setProfile(loadedProfile);
      setMappings(loadedMappings);
      setConsentAcknowledged(acknowledged);
    });
    return () => {
      active = false;
    };
  }, [profileRepository, fieldMappingRepository, privacyConsentRepository]);

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
    setState("ready");
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
      setMessage(`无法读取当前页面。请在招聘网页中重新点击扩展图标后再试。技术原因：${detail}`);
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
            <li>只有点击扫描后，扩展才读取当前招聘页面的表单标题。</li>
            <li>敏感字段默认不选；密码、验证码和附件不会自动填写。</li>
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

      <button className="scan-button" type="button" onClick={scanCurrentPage} disabled={!completion.filled || state === "scanning" || state === "creating" || state === "filling"}>
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
                      disabled={!group.canCreate || !bridge.createRepeatableRecords || state === "creating" || state === "filling"}
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

          <button className="fill-button" type="button" disabled={selected.size === 0 || state === "filling"} onClick={fillSelected}>
            <Check size={18} aria-hidden="true" />
            {state === "filling" ? "正在填写" : `填写已选 ${selected.size} 项`}
          </button>
        </section>
      ) : null}

      {message ? <div className={`operation-message ${state === "error" ? "message-error" : ""}`}>{state === "error" ? <CircleAlert size={18} /> : <Check size={18} />}<p>{message}</p></div> : null}

      <div className="privacy-message">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>只在你点击后读取当前页面；不会读取密码，也不会自动提交申请。</p>
      </div>
    </main>
  );
}
