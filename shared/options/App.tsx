import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Award,
  BriefcaseBusiness,
  Check,
  CircleAlert,
  Download,
  FileText,
  FolderKanban,
  GraduationCap,
  Languages,
  Link2,
  MapPinned,
  MessageSquareText,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound
} from "lucide-react";
import {
  calculateProfileCompletion,
  createAwardRecord,
  createEducationRecord,
  createLanguageRecord,
  createProjectRecord,
  createWorkSampleRecord,
  createWorkExperienceRecord,
  validateProfile,
  type AwardRecord,
  type CandidateProfile,
  type EducationRecord,
  type LanguageRecord,
  type ProjectRecord,
  type WorkSampleRecord,
  type WorkExperienceRecord
} from "../domain/profile";
import type { SavedFieldMapping } from "../mapping/types";
import { parseLocalData, serializeLocalData } from "../privacy/localData";
import { detectResumeFormat, extractResumeText } from "../resume/extractResumeText";
import { mergeResumeIntoProfile, parseResumeText } from "../resume/parseResume";
import {
  type SavedResumeMetadata,
  type SavedResumeRepositoryLike
} from "../storage/savedResumeRepository";
import "../styles/theme.css";
import "./dossier.css";

const GENDER_OPTIONS = ["男", "女", "保密"];
const DEGREE_OPTIONS = ["博士", "MBA", "硕士", "本科", "大专", "高中", "专职", "初中", "小学", "其他"];
const EDUCATION_TYPE_OPTIONS = ["海外及港澳台", "统招全日制", "统招非全日制", "自考", "其他"];
const LANGUAGE_OPTIONS = [
  "英语", "法语", "日语", "韩语", "德语", "俄语", "西班牙语", "葡萄牙语", "阿拉伯语",
  "印地语", "印度斯坦语", "孟加拉语", "豪萨语", "旁遮普语", "波斯语", "斯瓦西里语",
  "泰卢固语", "土耳其语", "意大利语", "爪哇语", "泰米尔语", "马拉地语", "越南语",
  "普通话", "粤语", "印尼语", "马来语", "泰语", "塞尔维亚语"
];
const PROFICIENCY_OPTIONS = ["入门", "日常会话", "商务会话", "熟练", "流利", "无障碍沟通", "母语"];

interface ResumeImportFeedback {
  status: "idle" | "parsing" | "success" | "error";
  message: string;
  detail: string;
}

function formatSavedResumeSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
    : `${Math.max(1, Math.ceil(bytes / 1024))} KiB`;
}

export interface ProfileRepositoryLike {
  load(): Promise<CandidateProfile>;
  save(profile: CandidateProfile): Promise<CandidateProfile>;
  clear?(): Promise<CandidateProfile>;
}

export interface LocalProfileImportPreview {
  confirmationToken: string;
  expiresAt: string;
  expectedCurrentProfileVersion: string;
  sourceFormat: "profile-service-v1" | "legacy-extension-v1";
  authenticityVerified: false;
  changedPathCount: number;
  conflictPathCount: number;
  changedPaths: readonly string[];
  conflictPaths: readonly string[];
  pathsTruncated: boolean;
}

export interface LocalProfileImportRollback {
  rollbackToken: string;
  expiresAt: string;
  expectedImportedProfileVersion: string;
}

export interface ProfileLocalDataRepositoryLike {
  exportData(): Promise<{ serialized: string; suggestedFileName: string }>;
  previewImport(serialized: string): Promise<LocalProfileImportPreview>;
  confirmImport(input: {
    confirmationToken: string;
    expectedCurrentProfileVersion: string;
    serialized: string;
  }): Promise<{ profile: CandidateProfile; rollback: LocalProfileImportRollback }>;
  rollbackImport(input: {
    rollbackToken: string;
    expectedImportedProfileVersion: string;
  }): Promise<{ profile: CandidateProfile }>;
}

export interface OptionsMappingRepositoryLike {
  load(): Promise<SavedFieldMapping[]>;
  replace(mappings: SavedFieldMapping[]): Promise<SavedFieldMapping[]>;
  clear(): Promise<void>;
}

export interface OptionsConsentRepositoryLike {
  hasAcknowledged(): Promise<boolean>;
  acknowledge(): Promise<void>;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: "text" | "email" | "tel" | "date" | "month" | "url";
  placeholder?: string;
  autoComplete?: string;
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  autoComplete
}: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  const preservedValue = value && !options.includes(value) ? value : null;
  return (
    <label className="field">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择</option>
        {preservedValue ? <option value={preservedValue}>{preservedValue}（已导入）</option> : null}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 5,
  placeholder
}: TextAreaFieldProps) {
  return (
    <label className="field field-wide">
      <span>{label}</span>
      <textarea
        aria-label={label}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <small className="character-count" aria-hidden="true">{value.length} 字</small>
    </label>
  );
}

interface SectionHeaderProps {
  icon: React.ReactNode;
  index: string;
  title: string;
  description: string;
}

function SectionHeader({ icon, index, title, description }: SectionHeaderProps) {
  return (
    <header className="section-header">
      <div className="section-index">{index}</div>
      <div className="section-icon" aria-hidden="true">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

export function ProfileEditor({
  repository: profileRepository,
  localDataRepository,
  mappingRepository: fieldMappingRepository,
  consentRepository: privacyConsentRepository,
  savedResumeRepository: localResumeRepository
}: {
  repository: ProfileRepositoryLike;
  localDataRepository?: ProfileLocalDataRepositoryLike;
  mappingRepository?: OptionsMappingRepositoryLike;
  consentRepository?: OptionsConsentRepositoryLike;
  savedResumeRepository?: SavedResumeRepositoryLike;
}) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const profileRef = useRef<CandidateProfile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [mappings, setMappings] = useState<SavedFieldMapping[]>([]);
  const [consentAcknowledged, setConsentAcknowledged] = useState<boolean | null>(null);
  const [privacyMessage, setPrivacyMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importPreview, setImportPreview] = useState<LocalProfileImportPreview | null>(null);
  const [importRollback, setImportRollback] = useState<LocalProfileImportRollback | null>(null);
  const [profileImportBusy, setProfileImportBusy] = useState<"confirm" | "rollback" | null>(null);
  const pendingImport = useRef<string | null>(null);
  const [savedResume, setSavedResume] = useState<SavedResumeMetadata | null>(null);
  const [resumeImport, setResumeImport] = useState<ResumeImportFeedback>({
    status: "idle",
    message: "",
    detail: ""
  });

  useEffect(() => {
    let active = true;
    void Promise.all([
      profileRepository.load(),
      fieldMappingRepository?.load() ?? Promise.resolve([]),
      privacyConsentRepository?.hasAcknowledged() ?? Promise.resolve(true),
      localResumeRepository?.load().catch(() => null) ?? Promise.resolve(null)
    ]).then(([loadedProfile, loadedMappings, acknowledged, loadedResume]) => {
      if (!active) return;
      profileRef.current = loadedProfile;
      setProfile(loadedProfile);
      setMappings(loadedMappings);
      setConsentAcknowledged(acknowledged);
      setSavedResume(loadedResume);
    });
    return () => {
      active = false;
    };
  }, [profileRepository, fieldMappingRepository, privacyConsentRepository, localResumeRepository]);

  const completion = useMemo(
    () => (profile ? calculateProfileCompletion(profile) : null),
    [profile]
  );
  const validation = useMemo(
    () => (profile ? validateProfile(profile) : { valid: true, errors: {} }),
    [profile]
  );

  function update(mutator: (draft: CandidateProfile) => void) {
    setProfile((current) => {
      if (!current) return current;
      const draft = structuredClone(current);
      mutator(draft);
      profileRef.current = draft;
      return draft;
    });
    setDirty(true);
    setSaveError("");
  }

  async function saveProfile() {
    if (!profile || !validation.valid) {
      setSaveError("请先修正标出的格式或日期问题。未完成的字段可以稍后补充。");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const saved = await profileRepository.save(profile);
      profileRef.current = saved;
      setProfile(saved);
      setDirty(false);
    }
    catch {
      setSaveError("保存失败。档案没有被覆盖，请稍后重试。")
    }
    finally {
      setSaving(false);
    }
  }

  async function acknowledgePrivacy() {
    await privacyConsentRepository?.acknowledge();
    setConsentAcknowledged(true);
  }

  function downloadLocalData(serialized: string, suggestedFileName: string) {
    const safeName = /^qiuzhao-profile-[0-9-]+\.json$/.test(suggestedFileName)
      ? suggestedFileName
      : `qiuzhao-profile-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportData() {
    if (!profile) return;
    try {
      const exported = localDataRepository
        ? await localDataRepository.exportData()
        : {
            serialized: serializeLocalData(profile, mappings),
            suggestedFileName: `qiuzhao-profile-${new Date().toISOString().slice(0, 10)}.json`
          };
      downloadLocalData(exported.serialized, exported.suggestedFileName);
      setPrivacyMessage(localDataRepository
        ? "当前已保存的本地档案已经导出。"
        : "本地档案和网站字段对应关系已经导出。");
    }
    catch (error) {
      setPrivacyMessage(error instanceof Error ? error.message : "导出失败，请稍后重试。");
    }
  }

  async function importData(file: File | undefined) {
    if (!file) return;
    try {
      const serialized = await file.text();
      if (localDataRepository) {
        const preview = await localDataRepository.previewImport(serialized);
        pendingImport.current = serialized;
        setImportPreview(preview);
        setImportRollback(null);
        setPrivacyMessage("导入预览已生成。确认前不会修改当前档案。");
        return;
      }
      const bundle = parseLocalData(serialized);
      const savedProfile = await profileRepository.save(bundle.profile);
      const savedMappings = fieldMappingRepository
        ? await fieldMappingRepository.replace(bundle.mappings)
        : bundle.mappings;
      profileRef.current = savedProfile;
      setProfile(savedProfile);
      setMappings(savedMappings);
      setDirty(false);
      setPrivacyMessage("导入完成。档案和字段对应关系已替换为文件中的版本。")
    }
    catch (error) {
      setPrivacyMessage(error instanceof Error ? error.message : "导入失败，请检查文件内容。")
    }
  }

  function cancelImport() {
    pendingImport.current = null;
    setImportPreview(null);
    setPrivacyMessage("已取消导入，当前档案没有变化。");
  }

  async function confirmProfileImport() {
    if (!localDataRepository || !importPreview || pendingImport.current === null || profileImportBusy) return;
    setProfileImportBusy("confirm");
    try {
      const result = await localDataRepository.confirmImport({
        confirmationToken: importPreview.confirmationToken,
        expectedCurrentProfileVersion: importPreview.expectedCurrentProfileVersion,
        serialized: pendingImport.current
      });
      profileRef.current = result.profile;
      setProfile(result.profile);
      setDirty(false);
      setImportRollback(result.rollback);
      setPrivacyMessage("导入完成。你可以在回滚有效期内撤销这次导入。");
    }
    catch (error) {
      setPrivacyMessage(error instanceof Error ? error.message : "导入确认失败，请重新选择文件预览。");
    }
    finally {
      setProfileImportBusy(null);
      pendingImport.current = null;
      setImportPreview(null);
    }
  }

  async function rollbackProfileImport() {
    if (!localDataRepository || !importRollback || profileImportBusy) return;
    const rollback = importRollback;
    setProfileImportBusy("rollback");
    try {
      const result = await localDataRepository.rollbackImport({
        rollbackToken: rollback.rollbackToken,
        expectedImportedProfileVersion: rollback.expectedImportedProfileVersion
      });
      profileRef.current = result.profile;
      setProfile(result.profile);
      setDirty(false);
      setImportRollback(null);
      setPrivacyMessage("本次导入已经回滚，档案恢复为导入前版本。");
    }
    catch (error) {
      setPrivacyMessage(error instanceof Error ? error.message : "回滚失败；请重新加载档案检查当前版本。");
    }
    finally {
      setProfileImportBusy(null);
    }
  }

  async function importResume(file: File | undefined, savedOnly = false) {
    if (!file && !savedOnly) return;
    setResumeImport({ status: "parsing", message: "正在本机解析简历…", detail: "解析期间不会发送网络请求。" });
    let locallySavedPdf: SavedResumeMetadata | null = savedOnly ? savedResume : null;
    let saveWarning = "";
    if (file && detectResumeFormat(file) === "pdf" && localResumeRepository) {
      try {
        locallySavedPdf = await localResumeRepository.save(file);
        setSavedResume(locallySavedPdf);
      }
      catch (error) {
        saveWarning = error instanceof Error ? error.message : "PDF 无法保存到本机。";
      }
    }
    try {
      const storedParsed = locallySavedPdf && localResumeRepository?.parseSaved
        ? await localResumeRepository.parseSaved()
        : null;
      if (!file && !storedParsed) throw new Error("当前没有可重新解析的本机 PDF 简历。");
      const extracted = storedParsed
        ? { format: "pdf" as const, text: "", pageCount: storedParsed.pageCount, usedOcr: storedParsed.usedOcr }
        : await extractResumeText(file!);
      const parsed = storedParsed ?? parseResumeText(extracted.text);
      if (parsed.populatedPaths.length === 0) {
        throw new Error("没有识别到可填入档案的内容。请检查简历章节标题，或换用文字版 PDF/DOCX。");
      }
      const current = profileRef.current;
      if (!current) throw new Error("本地档案尚未读取完成，请稍后重试。");
      const merged = mergeResumeIntoProfile(current, parsed.profile);
      profileRef.current = merged.profile;
      setProfile(merged.profile);
      if (merged.importedFieldCount > 0) setDirty(true);
      setSaveError("");

      const formatLabel = extracted.format.toUpperCase();
      const pageLabel = extracted.pageCount ? `，${extracted.pageCount} 页` : "";
      const ocrLabel = extracted.usedOcr ? "，已在本机使用 OCR 读取异常文字层" : "";
      const preservedLabel = merged.preservedFieldCount > 0
        ? `；保留了 ${merged.preservedFieldCount} 个已有非空值`
        : "";
      const recordLabel = merged.addedRecordCount > 0
        ? `，新增 ${merged.addedRecordCount} 条经历`
        : "";
      const resultMessage = merged.importedFieldCount > 0
        ? `已识别 ${parsed.populatedPaths.length} 项，填入 ${merged.importedFieldCount} 项${recordLabel}${preservedLabel}。`
        : merged.preservedFieldCount > 0
          ? `已识别 ${parsed.populatedPaths.length} 项；表格已有内容，保留了 ${merged.preservedFieldCount} 个不同的已有值。`
          : `已识别 ${parsed.populatedPaths.length} 项，这些内容已经在表格中。`;
      setResumeImport({
        status: "success",
        message: resultMessage,
        detail: `${formatLabel}${pageLabel}${ocrLabel} 已在本机完成解析。${locallySavedPdf ? "PDF 原件已保存为常用简历，之后可直接用于招聘网站。" : saveWarning ? `PDF 原件未保存：${saveWarning}` : "DOCX 只用于提取信息，不会保存为网站附件。"} 请直接在下方表格检查，确认后点击“保存档案”。${parsed.warnings[0] ? ` ${parsed.warnings[0]}` : ""}`
      });
    }
    catch (error) {
      setResumeImport({
        status: "error",
        message: error instanceof Error ? error.message : "简历解析失败，请换一个文件重试。",
        detail: locallySavedPdf
          ? "PDF 原件已经安全保存于本机，可继续在招聘网站复用；只是在这次解析中没有提取出档案内容。"
          : saveWarning
            ? `原文件未保存：${saveWarning}`
            : "原文件和提取出的全文均未保存。"
      });
    }
  }

  async function deleteSavedResume() {
    if (!localResumeRepository) return;
    await localResumeRepository.clear();
    setSavedResume(null);
    setPrivacyMessage("已从本机删除保存的 PDF 简历；结构化档案不受影响。")
  }

  async function deleteLocalData() {
    if (!profileRepository.clear) return;
    const empty = await profileRepository.clear();
    await fieldMappingRepository?.clear();
    await localResumeRepository?.clear();
    profileRef.current = empty;
    setProfile(empty);
    setMappings([]);
    setSavedResume(null);
    setDirty(false);
    setConfirmDelete(false);
    setPrivacyMessage("个人档案、网站字段对应关系和保存的 PDF 简历已从本机删除。")
  }

  if (!profile || !completion || consentAcknowledged === null) {
    return (
      <main className="loading-screen" aria-live="polite">
        <Archive size={24} aria-hidden="true" />
        <span>正在读取本地档案…</span>
      </main>
    );
  }

  if (!consentAcknowledged) {
    return (
      <main className="privacy-onboarding">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true"><Archive size={22} /></span>
          <p className="brand-name">秋招填表助手</p>
        </div>
        <section className="onboarding-card" aria-labelledby="privacy-title">
          <ShieldCheck size={38} aria-hidden="true" />
          <p className="eyebrow">使用前说明</p>
          <h1 id="privacy-title">先确认数据如何被使用。</h1>
          <div className="onboarding-points">
            <article><strong>保存在本机</strong><p>档案和纠错映射默认使用浏览器扩展存储，不发送到我们的服务器。</p></article>
            <article><strong>点击后才读取</strong><p>浏览器会提示较强的网页与调试权限；只有你主动连接或扫描时，扩展才处理目标 HTTPS 页，跨站后会暂停。</p></article>
            <article><strong>不会替你提交</strong><p>密码、验证码和其他附件保持手动；常用 PDF 每次附加仍需确认，敏感字段默认不选择。</p></article>
          </div>
          <button className="primary-button onboarding-button" type="button" onClick={acknowledgePrivacy}>我已了解，开始建立档案</button>
        </section>
      </main>
    );
  }

  const navigation = [
    ["resume", "常用简历", <FileText size={17} />],
    ["basic", "基本信息", <UserRound size={17} />],
    ["education", "教育经历", <GraduationCap size={17} />],
    ["work", "实习经历", <BriefcaseBusiness size={17} />],
    ["projects", "项目经历", <FolderKanban size={17} />],
    ["works", "作品", <Link2 size={17} />],
    ["awards", "获奖", <Award size={17} />],
    ["languages", "语言能力", <Languages size={17} />],
    ["preference", "求职偏好", <MapPinned size={17} />],
    ["answers", "常用回答", <MessageSquareText size={17} />],
    ["privacy", "本地数据", <ShieldCheck size={17} />]
  ] as const;

  function updateEducation(index: number, key: keyof EducationRecord, value: string) {
    update((draft) => {
      draft.education[index][key] = value;
    });
  }

  function updateWork(index: number, key: keyof WorkExperienceRecord, value: string) {
    update((draft) => {
      draft.workExperiences[index][key] = value;
    });
  }

  function updateProject(index: number, key: keyof ProjectRecord, value: string) {
    update((draft) => {
      draft.projects[index][key] = value;
    });
  }

  function updateWorkSample(index: number, key: keyof WorkSampleRecord, value: string) {
    update((draft) => {
      draft.workSamples[index][key] = value;
    });
  }

  function updateAward(index: number, key: keyof AwardRecord, value: string) {
    update((draft) => {
      draft.awards[index][key] = value;
    });
  }

  function updateLanguage(index: number, key: keyof LanguageRecord, value: string) {
    update((draft) => {
      draft.languages[index][key] = value;
    });
  }

  return (
    <main className="app-shell options-shell" data-testid="profile-editor">
      <header className="options-header">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">
            秋
          </span>
          <div>
            <p className="brand-name">秋招投递助手</p>
            <span className="brand-subtitle">个人档案</span>
          </div>
        </div>
        <nav className="top-navigation" aria-label="档案导航">
          <a aria-current="page" href="#profile-title">我的档案</a>
          <a href="#privacy">本地数据</a>
        </nav>
        <div className="header-actions">
          <button className="primary-button save-top" type="button" onClick={saveProfile} disabled={saving}>
            <Save size={17} aria-hidden="true" />
            {saving ? "正在保存" : "保存档案"}
          </button>
        </div>
      </header>

      <section className="welcome-card" aria-labelledby="profile-title">
        <div>
          <p className="eyebrow">档案 01 · 个人资料</p>
          <h1 id="profile-title">建立一次，后续重复使用</h1>
          <p className="welcome-copy">
            按招聘档案的章节整理真实资料。保存后，Codex 可以在你的授权范围内读取对应字段并填写招聘网页。
          </p>
          <div className="save-state" aria-live="polite">
            {dirty ? <CircleAlert size={16} /> : <Check size={16} />}
            <span>
              {dirty
                ? "有未保存的更改"
                : profile.updatedAt
                  ? `已保存于 ${new Date(profile.updatedAt).toLocaleString("zh-CN", { hour12: false })}`
                  : "尚未保存档案"}
            </span>
          </div>
        </div>
        <div className="completion-card">
          <div className="completion-ring" style={{ "--progress": `${completion.percentage * 3.6}deg` } as React.CSSProperties}>
            <div>
              <strong>{completion.percentage}%</strong>
              <span>已完成</span>
            </div>
          </div>
          <p><strong>{completion.filled} / {completion.total}</strong><span>基础检查项有内容</span></p>
        </div>
      </section>

      <div className="editor-layout">
        <aside className="section-nav" aria-label="档案章节">
          <div className="sidebar-heading">
            <p>档案目录</p>
            <span>{dirty ? "有未保存更改" : "所有更改已保存"}</span>
          </div>
          {navigation.map(([id, label, icon], index) => (
            <a href={`#${id}`} key={id}>
              <span className="nav-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </a>
          ))}
          <div className="missing-summary">
            <strong>{completion.filled}/{completion.total}</strong>
            <span>基础检查项已完成</span>
            {completion.missing.slice(0, 4).map((item) => (
              <a key={item.path} href={`#${item.path.split(".")[0]}`}>{item.label}</a>
            ))}
          </div>
        </aside>

        <div className="form-sections">
          <section className="form-card resume-import-card" id="resume" aria-labelledby="resume-import-title">
            <SectionHeader index="01" icon={<FileText size={21} />} title="常用简历" description="从简历提取档案信息；附件是否保存取决于当前本地工作台能力。" />
            <div className="resume-import-content">
              <div className="resume-import-copy">
                <p className="eyebrow">从现有简历开始</p>
                <h3 id="resume-import-title">上传简历，填入这张信息表</h3>
                <p id="resume-import-description">支持文字版 PDF 和 DOCX，最大 10 MB。DOCX 只用于提取信息，所有处理均在本机完成。</p>
                {resumeImport.status !== "idle" ? (
                  <div className={`resume-import-feedback ${resumeImport.status}`} role={resumeImport.status === "error" ? "alert" : "status"} aria-live="polite">
                    <strong>{resumeImport.message}</strong>
                    <span>{resumeImport.detail}</span>
                  </div>
                ) : null}
                {savedResume ? (
                  <div className="saved-resume-status" aria-label="已保存的常用简历">
                    <div>
                      <strong>已保存常用 PDF</strong>
                      <span>{savedResume.name} · {formatSavedResumeSize(savedResume.size)}</span>
                      <span>SHA-256 {savedResume.sha256.slice(0, 12)}… · 仅保存在本机</span>
                    </div>
                    {localResumeRepository?.parseSaved ? (
                      <button
                        type="button"
                        disabled={resumeImport.status === "parsing"}
                        onClick={() => { void importResume(undefined, true); }}
                      >重新解析</button>
                    ) : null}
                    <button type="button" onClick={() => { void deleteSavedResume(); }}>删除 PDF</button>
                  </div>
                ) : null}
              </div>
              <label className={`resume-upload-button ${resumeImport.status === "parsing" ? "disabled" : ""}`}>
                <Upload size={24} aria-hidden="true" />
                <strong>{resumeImport.status === "parsing" ? "正在解析" : savedResume ? "替换简历" : "选择简历"}</strong>
                <span>PDF / DOCX · 本机处理</span>
                <input
                  type="file"
                  accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
                  aria-label="上传简历并解析"
                  aria-describedby="resume-import-description"
                  disabled={resumeImport.status === "parsing"}
                  onChange={(event) => {
                    void importResume(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          </section>

          <section className="form-card" id="basic">
            <SectionHeader index="02" icon={<UserRound size={21} />} title="基本信息" description="用于招聘系统中最常见的身份和联系方式字段。" />
            <div className="field-grid">
              <Field label="姓名" value={profile.basic.fullName} autoComplete="name" onChange={(value) => update((draft) => { draft.basic.fullName = value; })} />
              <Field label="常用英文名" value={profile.basic.preferredName} onChange={(value) => update((draft) => { draft.basic.preferredName = value; })} />
              <SelectField label="性别" value={profile.basic.gender} options={GENDER_OPTIONS} onChange={(value) => update((draft) => { draft.basic.gender = value; })} />
              <Field label="出生日期" type="date" value={profile.basic.birthDate} autoComplete="bday" onChange={(value) => update((draft) => { draft.basic.birthDate = value; })} />
              <Field label="手机号码" type="tel" value={profile.basic.phone} autoComplete="tel" error={validation.errors["basic.phone"]} onChange={(value) => update((draft) => { draft.basic.phone = value; })} />
              <Field label="邮箱" type="email" value={profile.basic.email} autoComplete="email" error={validation.errors["basic.email"]} onChange={(value) => update((draft) => { draft.basic.email = value; })} />
              <Field label="国籍（地区）" value={profile.basic.nationality} placeholder="例如：中国" onChange={(value) => update((draft) => { draft.basic.nationality = value; })} />
              <Field label="当前城市" value={profile.basic.currentCity} autoComplete="address-level2" onChange={(value) => update((draft) => { draft.basic.currentCity = value; })} />
              <Field label="籍贯" value={profile.basic.hometown} onChange={(value) => update((draft) => { draft.basic.hometown = value; })} />
              <Field label="政治面貌" value={profile.basic.politicalStatus} onChange={(value) => update((draft) => { draft.basic.politicalStatus = value; })} />
            </div>
          </section>

          <section className="form-card" id="education">
            <SectionHeader index="03" icon={<GraduationCap size={21} />} title="教育经历" description="至少保留一段最高学历；可继续添加辅修或前置学历。" />
            {profile.education.map((record, index) => (
              <article className="repeat-card" key={record.id}>
                <div className="repeat-heading">
                  <h3>教育经历 {index + 1}</h3>
                  {profile.education.length > 1 ? (
                    <button className="icon-text-button danger-button" type="button" aria-label={`删除教育经历 ${index + 1}`} onClick={() => update((draft) => { draft.education.splice(index, 1); })}>
                      <Trash2 size={16} />删除
                    </button>
                  ) : null}
                </div>
                <div className="field-grid">
                  <Field label="院校名称" value={record.school} onChange={(value) => updateEducation(index, "school", value)} />
                  <SelectField label="学历" value={record.degree} options={DEGREE_OPTIONS} onChange={(value) => updateEducation(index, "degree", value)} />
                  <SelectField label="学历类型" value={record.educationType} options={EDUCATION_TYPE_OPTIONS} onChange={(value) => updateEducation(index, "educationType", value)} />
                  <Field label="专业" value={record.major} onChange={(value) => updateEducation(index, "major", value)} />
                  <Field label="入学时间" type="month" value={record.startDate} onChange={(value) => updateEducation(index, "startDate", value)} />
                  <Field label="毕业时间" type="month" value={record.endDate} error={validation.errors[`education.${index}.endDate`]} onChange={(value) => updateEducation(index, "endDate", value)} />
                  <Field label="GPA" value={record.gpa} onChange={(value) => updateEducation(index, "gpa", value)} />
                  <Field label="专业排名" value={record.ranking} placeholder="例如：前 10%" onChange={(value) => updateEducation(index, "ranking", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.education.push(createEducationRecord()); })}>
              <Plus size={17} />添加一段教育经历
            </button>
          </section>

          <section className="form-card" id="work">
            <SectionHeader index="04" icon={<BriefcaseBusiness size={21} />} title="实习经历" description="只添加真实经历；空白记录不会计入档案完成度。" />
            {profile.workExperiences.length === 0 ? <p className="empty-copy">尚未添加实习经历。</p> : null}
            {profile.workExperiences.map((record, index) => (
              <article className="repeat-card" key={record.id}>
                <div className="repeat-heading">
                  <h3>实习经历 {index + 1}</h3>
                  <button className="icon-text-button danger-button" type="button" aria-label={`删除实习经历 ${index + 1}`} onClick={() => update((draft) => { draft.workExperiences.splice(index, 1); })}><Trash2 size={16} />删除</button>
                </div>
                <div className="field-grid">
                  <Field label="公司名称" value={record.company} onChange={(value) => updateWork(index, "company", value)} />
                  <Field label="部门" value={record.department} onChange={(value) => updateWork(index, "department", value)} />
                  <Field label="岗位名称" value={record.role} onChange={(value) => updateWork(index, "role", value)} />
                  <Field label="开始时间" type="month" value={record.startDate} onChange={(value) => updateWork(index, "startDate", value)} />
                  <Field label="结束时间" type="month" value={record.endDate} error={validation.errors[`workExperiences.${index}.endDate`]} onChange={(value) => updateWork(index, "endDate", value)} />
                  <TextAreaField label="工作描述" value={record.description} onChange={(value) => updateWork(index, "description", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.workExperiences.push(createWorkExperienceRecord()); })}><Plus size={17} />添加一段实习经历</button>
          </section>

          <section className="form-card" id="projects">
            <SectionHeader index="05" icon={<FolderKanban size={21} />} title="项目经历" description="记录你在项目中的角色、动作和可验证成果。" />
            {profile.projects.length === 0 ? <p className="empty-copy">尚未添加项目经历。</p> : null}
            {profile.projects.map((record, index) => (
              <article className="repeat-card" key={record.id}>
                <div className="repeat-heading">
                  <h3>项目经历 {index + 1}</h3>
                  <button className="icon-text-button danger-button" type="button" aria-label={`删除项目经历 ${index + 1}`} onClick={() => update((draft) => { draft.projects.splice(index, 1); })}><Trash2 size={16} />删除</button>
                </div>
                <div className="field-grid">
                  <Field label="项目名称" value={record.name} onChange={(value) => updateProject(index, "name", value)} />
                  <Field label="承担角色" value={record.role} onChange={(value) => updateProject(index, "role", value)} />
                  <Field label="开始时间" type="month" value={record.startDate} onChange={(value) => updateProject(index, "startDate", value)} />
                  <Field label="结束时间" type="month" value={record.endDate} error={validation.errors[`projects.${index}.endDate`]} onChange={(value) => updateProject(index, "endDate", value)} />
                  <TextAreaField label="项目描述" value={record.description} onChange={(value) => updateProject(index, "description", value)} />
                  <TextAreaField label="项目成果" value={record.outcome} rows={3} onChange={(value) => updateProject(index, "outcome", value)} />
                  <Field label="项目链接" type="url" value={record.link} placeholder="https://" onChange={(value) => updateProject(index, "link", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.projects.push(createProjectRecord()); })}><Plus size={17} />添加一段项目经历</button>
          </section>

          <section className="form-card" id="works">
            <SectionHeader index="06" icon={<Link2 size={21} />} title="作品" description="保存作品链接与说明；附件仍由你在招聘网页中手动上传。" />
            {profile.workSamples.length === 0 ? <p className="empty-copy">尚未添加作品。</p> : null}
            {profile.workSamples.map((record, index) => (
              <article className="repeat-card" key={record.id}>
                <div className="repeat-heading">
                  <h3>作品 {index + 1}</h3>
                  <button className="icon-text-button danger-button" type="button" aria-label={`删除作品 ${index + 1}`} onClick={() => update((draft) => { draft.workSamples.splice(index, 1); })}><Trash2 size={16} />删除</button>
                </div>
                <div className="field-grid">
                  <Field label="作品链接" type="url" value={record.link} placeholder="https://" onChange={(value) => updateWorkSample(index, "link", value)} />
                  <TextAreaField label="作品描述" value={record.description} onChange={(value) => updateWorkSample(index, "description", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.workSamples.push(createWorkSampleRecord()); })}><Plus size={17} />添加一个作品</button>
          </section>

          <section className="form-card" id="awards">
            <SectionHeader index="07" icon={<Award size={21} />} title="获奖" description="记录奖项名称、获奖时间和说明；证明附件保持手动上传。" />
            {profile.awards.length === 0 ? <p className="empty-copy">尚未添加获奖记录。</p> : null}
            {profile.awards.map((record, index) => (
              <article className="repeat-card" key={record.id}>
                <div className="repeat-heading">
                  <h3>获奖 {index + 1}</h3>
                  <button className="icon-text-button danger-button" type="button" aria-label={`删除获奖 ${index + 1}`} onClick={() => update((draft) => { draft.awards.splice(index, 1); })}><Trash2 size={16} />删除</button>
                </div>
                <div className="field-grid">
                  <Field label="获奖名称" value={record.name} onChange={(value) => updateAward(index, "name", value)} />
                  <Field label="获奖时间" type="month" value={record.date} onChange={(value) => updateAward(index, "date", value)} />
                  <TextAreaField label="获奖描述" value={record.description} onChange={(value) => updateAward(index, "description", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.awards.push(createAwardRecord()); })}><Plus size={17} />添加一条获奖记录</button>
          </section>

          <section className="form-card" id="languages">
            <SectionHeader index="08" icon={<Languages size={21} />} title="语言能力" description="记录语言与熟练程度，可添加多条。" />
            {profile.languages.length === 0 ? <p className="empty-copy">尚未添加语言能力。</p> : null}
            {profile.languages.map((record, index) => (
              <article className="repeat-card" key={record.id}>
                <div className="repeat-heading">
                  <h3>语言能力 {index + 1}</h3>
                  <button className="icon-text-button danger-button" type="button" aria-label={`删除语言能力 ${index + 1}`} onClick={() => update((draft) => { draft.languages.splice(index, 1); })}><Trash2 size={16} />删除</button>
                </div>
                <div className="field-grid">
                  <SelectField label="语言" value={record.language} options={LANGUAGE_OPTIONS} onChange={(value) => updateLanguage(index, "language", value)} />
                  <SelectField label="熟练程度" value={record.proficiency} options={PROFICIENCY_OPTIONS} onChange={(value) => updateLanguage(index, "proficiency", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.languages.push(createLanguageRecord()); })}><Plus size={17} />添加一项语言能力</button>
          </section>

          <section className="form-card" id="preference">
            <SectionHeader index="09" icon={<MapPinned size={21} />} title="求职偏好" description="多个岗位或城市请用顿号分隔，方便不同网站复用。" />
            <div className="field-grid">
              <Field label="目标岗位" value={profile.jobPreference.targetRoles} placeholder="例如：产品经理、产品运营" onChange={(value) => update((draft) => { draft.jobPreference.targetRoles = value; })} />
              <Field label="意向城市" value={profile.jobPreference.preferredCities} placeholder="例如：上海、杭州" onChange={(value) => update((draft) => { draft.jobPreference.preferredCities = value; })} />
              <Field label="可到岗日期" type="date" value={profile.jobPreference.availableDate} onChange={(value) => update((draft) => { draft.jobPreference.availableDate = value; })} />
            </div>
          </section>

          <section className="form-card" id="answers">
            <SectionHeader index="10" icon={<MessageSquareText size={21} />} title="常用回答" description="保存事实素材，遇到不同字数限制时再进行调整。" />
            <div className="field-grid">
              <TextAreaField label="自我介绍" value={profile.answers.selfIntroduction} onChange={(value) => update((draft) => { draft.answers.selfIntroduction = value; })} />
              <TextAreaField label="自我评价" value={profile.answers.selfEvaluation} onChange={(value) => update((draft) => { draft.answers.selfEvaluation = value; })} />
              <TextAreaField label="个人优势" value={profile.answers.strengths} onChange={(value) => update((draft) => { draft.answers.strengths = value; })} />
              <TextAreaField label="职业规划" value={profile.answers.careerPlan} onChange={(value) => update((draft) => { draft.answers.careerPlan = value; })} />
            </div>
          </section>

          <section className="attachment-note" aria-labelledby="attachment-title">
            <FileText size={22} aria-hidden="true" />
            <div>
              <h2 id="attachment-title">常用 PDF 可复用，目标网站仍需确认</h2>
              <p>上方选择的 PDF 原件会保存在本机加密档案库中，不保存原文件路径，也不会上传到云端。后续可在招聘网页中经你确认后复用；获奖证明、个人证件、验证码和最终提交不自动处理。</p>
            </div>
          </section>

          <section className="privacy-controls" id="privacy" aria-labelledby="privacy-controls-title">
            <SectionHeader index="11" icon={<ShieldCheck size={21} />} title="本地数据管理" description="导出备份、恢复档案，或删除这台设备上的全部个人数据。" />
            <div className="privacy-stats">
              <div><strong>1</strong><span>份求职档案</span></div>
              <div><strong>{mappings.length}</strong><span>条网站字段对应关系</span></div>
              <div><strong>{savedResume ? 1 : 0}</strong><span>份本机 PDF 简历</span></div>
            </div>
            <div className="privacy-actions">
              <button className="secondary-button action-with-icon" type="button" onClick={() => { void exportData(); }}><Download size={17} />导出本地数据</button>
              <label className="secondary-button action-with-icon import-button">
                <Upload size={17} />导入本地数据
                <input type="file" accept="application/json,.json" aria-label="导入本地数据" onChange={(event) => { void importData(event.target.files?.[0]); event.target.value = ""; }} />
              </label>
              <button className="delete-data-button action-with-icon" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={17} />删除全部本地数据</button>
            </div>
            {importPreview ? (
              <div className="import-confirmation" role="alert" aria-label="导入档案预览">
                <div>
                  <strong>导入前请确认变更</strong>
                  <p>
                    将变更 {importPreview.changedPathCount} 个字段，其中 {importPreview.conflictPathCount} 个会覆盖当前已有内容。
                    文件完整性摘要只能发现意外损坏，不能证明文件来源可信。
                  </p>
                  {importPreview.conflictPaths.length > 0 ? (
                    <p>冲突字段：{importPreview.conflictPaths.join("、")}{importPreview.pathsTruncated ? "（仅显示部分）" : ""}</p>
                  ) : null}
                </div>
                <div>
                  <button className="secondary-button" type="button" disabled={profileImportBusy !== null} onClick={cancelImport}>取消</button>
                  <button className="primary-button" type="button" disabled={profileImportBusy !== null} onClick={() => { void confirmProfileImport(); }}>
                    {profileImportBusy === "confirm" ? "正在导入…" : "确认导入并替换档案"}
                  </button>
                </div>
              </div>
            ) : null}
            {importRollback ? (
              <div className="import-rollback" role="status">
                <span>刚刚的导入可以在本次本地会话的有效期内撤销。</span>
                <button className="secondary-button" type="button" disabled={profileImportBusy !== null} onClick={() => { void rollbackProfileImport(); }}>
                  {profileImportBusy === "rollback" ? "正在回滚…" : "撤销本次导入"}
                </button>
              </div>
            ) : null}
            {confirmDelete ? (
              <div className="delete-confirmation" role="alert">
                <div><strong>确认永久删除？</strong><p>求职档案、所有网站字段对应关系和保存的 PDF 简历都会从这台设备移除。此操作无法撤销。</p></div>
                <div><button className="secondary-button" type="button" onClick={() => setConfirmDelete(false)}>取消</button><button className="delete-confirm-button" type="button" onClick={() => { void deleteLocalData(); }}>确认永久删除</button></div>
              </div>
            ) : null}
            {privacyMessage ? <p className="privacy-feedback" aria-live="polite">{privacyMessage}</p> : null}
          </section>
        </div>

        <aside className="profile-dock" aria-label="档案管理">
          <header><p>档案管理</p><span>本机</span></header>
          <div className="profile-choice" aria-current="true">
            <strong>默认档案</strong>
            <span>供本地 Agent 读取字段</span>
          </div>
          <dl>
            <div><dt>保存位置</dt><dd>本机加密档案库</dd></div>
            <div><dt>Agent 读取</dt><dd>仅字段状态</dd></div>
            <div><dt>网页提交</dt><dd>不自动执行</dd></div>
          </dl>
          <a href="#privacy">管理本地数据</a>
        </aside>
      </div>

      <footer className="save-footer">
        <div aria-live="polite">
          {saveError ? <span className="save-error"><CircleAlert size={16} />{saveError}</span> : dirty ? "有未保存的更改" : "当前更改已保存"}
        </div>
        <button className="primary-button" type="button" onClick={saveProfile} disabled={saving}>
          <Save size={17} aria-hidden="true" />{saving ? "正在保存" : "保存档案"}
        </button>
      </footer>
    </main>
  );
}
