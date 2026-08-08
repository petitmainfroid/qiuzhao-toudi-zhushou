import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Award,
  BadgeCheck,
  BookOpen,
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
  ShieldAlert,
  Trash2,
  Upload,
  UserRound,
  UsersRound
} from "lucide-react";
import {
  calculateProfileCompletion,
  createAwardRecord,
  createEducationRecord,
  createEmploymentExperienceRecord,
  createLanguageExamRecord,
  createLanguageRecord,
  createProjectRecord,
  createWorkSampleRecord,
  createWorkExperienceRecord,
  validateProfile,
  type AwardRecord,
  type CandidateProfile,
  type EducationRecord,
  type EmploymentExperienceRecord,
  type LanguageExamRecord,
  type LanguageRecord,
  type ProjectRecord,
  type WorkSampleRecord,
  type WorkExperienceRecord
} from "../domain/profile";
import { MappingRepository } from "../mapping/mappingRepository";
import type { SavedFieldMapping } from "../mapping/types";
import { PrivacyConsentRepository } from "../privacy/consentRepository";
import { parseLocalData, serializeLocalData } from "../privacy/localData";
import { extractResumeText } from "../resume/extractResumeText";
import { mergeResumeIntoProfile, parseResumeText } from "../resume/parseResume";
import { ProfileRepository } from "../storage/profileRepository";
import {
  SavedResumeRepository,
  type SavedResumeMetadata,
  type SavedResumeRepositoryLike
} from "../storage/savedResumeRepository";
import { SupplementalProfileSections } from "./SupplementalProfileSections";
import "../styles/theme.css";
import "./options.css";

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
const LANGUAGE_EXAM_OPTIONS = ["CET-4（四级）", "CET-6（六级）", "TEM-4（专四）", "TEM-8（专八）", "IELTS（雅思）", "TOEFL（托福）", "TOEIC（托业）", "JLPT（日语能力测试）", "TOPIK（韩语能力考试）", "DELF / DALF（法语）", "TestDaF（德语）", "其他"];
const MARITAL_STATUS_OPTIONS = ["未婚", "已婚", "离异", "丧偶", "其他"];
const IDENTITY_DOCUMENT_OPTIONS = ["居民身份证", "护照", "港澳居民来往内地通行证", "台湾居民来往大陆通行证", "外国人永久居留身份证", "其他证件"];
const YES_NO_OPTIONS = ["是", "否"];
const WORK_YEARS_OPTIONS = ["应届生", "1年以下", "1-3年", "3-5年", "5-10年", "10年以上"];
const ACADEMIC_DEGREE_OPTIONS = ["学士", "硕士", "博士", "无学位", "其他"];
const EDUCATION_STATUS_OPTIONS = ["在读", "已毕业", "肄业", "其他"];
const EMPLOYMENT_TYPE_OPTIONS = ["全职", "兼职", "创业", "其他"];
const SALARY_CURRENCY_OPTIONS = ["人民币 CNY", "美元 USD", "港币 HKD", "欧元 EUR", "其他"];
const SALARY_PERIOD_OPTIONS = ["月薪", "年薪", "日薪", "时薪", "其他"];

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
  type?: "text" | "email" | "tel" | "date" | "month" | "url" | "password";
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
  error?: string;
}

function SelectField({ label, value, options, onChange, error }: SelectFieldProps) {
  const preservedValue = value && !options.includes(value) ? value : null;
  return (
    <label className="field">
      <span>{label}</span>
      <select aria-label={label} aria-invalid={Boolean(error)} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择</option>
        {preservedValue ? <option value={preservedValue}>{preservedValue}（已导入）</option> : null}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      {error ? <small className="field-error">{error}</small> : null}
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

const repository = new ProfileRepository();
const mappingRepository = new MappingRepository();
const consentRepository = new PrivacyConsentRepository();
const savedResumeRepository = new SavedResumeRepository();

export function App() {
  return (
    <ProfileEditor
      repository={repository}
      mappingRepository={mappingRepository}
      consentRepository={consentRepository}
      savedResumeRepository={savedResumeRepository}
    />
  );
}

export function ProfileEditor({
  repository: profileRepository,
  mappingRepository: fieldMappingRepository,
  consentRepository: privacyConsentRepository,
  savedResumeRepository: localResumeRepository
}: {
  repository: ProfileRepositoryLike;
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
  const [savedResume, setSavedResume] = useState<SavedResumeMetadata | null>(null);
  const [resumeImport, setResumeImport] = useState<ResumeImportFeedback>({
    status: "idle",
    message: "",
    detail: ""
  });
  const [resumeVaultFeedback, setResumeVaultFeedback] = useState<ResumeImportFeedback>({
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

  function exportData() {
    if (!profile) return;
    const serialized = serializeLocalData(profile, mappings);
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `qiuzhao-profile-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setPrivacyMessage("本地档案和网站字段对应关系已经导出。")
  }

  async function importData(file: File | undefined) {
    if (!file) return;
    try {
      const bundle = parseLocalData(await file.text());
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

  async function saveReusableResume(file: File | undefined) {
    if (!file || !localResumeRepository) return;
    setResumeVaultFeedback({
      status: "parsing",
      message: "正在保存常用 PDF…",
      detail: "文件只会写入这台设备的扩展本地数据库。"
    });
    try {
      const metadata = await localResumeRepository.save(file);
      setSavedResume(metadata);
      setResumeVaultFeedback({
        status: "success",
        message: "常用 PDF 已保存",
        detail: "以后在招聘网站发现唯一且明确的简历控件时，可在侧边栏确认后上传。"
      });
    }
    catch (error) {
      setResumeVaultFeedback({
        status: "error",
        message: error instanceof Error ? error.message : "PDF 无法保存到本机。",
        detail: "没有更改已经保存的结构化档案。"
      });
    }
  }

  async function importResume(file: File | undefined) {
    if (!file) return;
    setResumeImport({ status: "parsing", message: "正在本机解析简历…", detail: "这一步只提取信息，不会设置网站上传附件。" });
    try {
      const extracted = await extractResumeText(file);
      const parsed = parseResumeText(extracted.text);
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
        detail: `${formatLabel}${pageLabel}${ocrLabel} 已在本机完成解析，原文件不会因此成为网站附件。请直接在下方表格检查，确认后点击“保存档案”。${parsed.warnings[0] ? ` ${parsed.warnings[0]}` : ""}`
      });
    }
    catch (error) {
      setResumeImport({
        status: "error",
        message: error instanceof Error ? error.message : "简历解析失败，请换一个文件重试。",
        detail: "原文件和提取出的全文均未保存；已设置的常用 PDF 不受影响。"
      });
    }
  }

  async function deleteSavedResume() {
    if (!localResumeRepository) return;
    await localResumeRepository.clear();
    setSavedResume(null);
    setResumeVaultFeedback({ status: "idle", message: "", detail: "" });
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
    ["preference", "求职期望", <MapPinned size={17} />],
    ["education", "教育经历", <GraduationCap size={17} />],
    ["work", "实习与工作", <BriefcaseBusiness size={17} />],
    ["projects", "项目经历", <FolderKanban size={17} />],
    ["works", "作品", <Link2 size={17} />],
    ["campus", "校园经历", <UsersRound size={17} />],
    ["awards", "获奖经历", <Award size={17} />],
    ["languages", "语言能力", <Languages size={17} />],
    ["certificates", "证书信息", <BadgeCheck size={17} />],
    ["research", "论文与专利", <BookOpen size={17} />],
    ["family", "家庭与联系人", <ShieldAlert size={17} />],
    ["answers", "常用问答", <MessageSquareText size={17} />]
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

  function updateEmployment(index: number, key: keyof EmploymentExperienceRecord, value: string) {
    update((draft) => {
      draft.employmentExperiences ??= [];
      draft.employmentExperiences[index][key] = value;
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

  function updateLanguageExam(index: number, key: keyof LanguageExamRecord, value: string) {
    update((draft) => {
      draft.languageExams ??= [];
      draft.languageExams[index][key] = value;
    });
  }

  return (
    <main className="app-shell options-shell" data-testid="profile-editor">
      <header className="options-header">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">
            <Archive size={22} strokeWidth={1.8} />
          </span>
          <p className="brand-name">秋招填表助手</p>
        </div>
        <div className="header-actions">
          <div className="local-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>档案默认仅保存在这台设备</span>
          </div>
          <button className="primary-button save-top" type="button" onClick={saveProfile} disabled={saving}>
            <Save size={17} aria-hidden="true" />
            {saving ? "正在保存" : "保存档案"}
          </button>
        </div>
      </header>

      <section className="welcome-card" aria-labelledby="profile-title">
        <div>
          <p className="eyebrow">求职档案</p>
          <h1 id="profile-title">只整理一次，之后专心检查。</h1>
          <p className="welcome-copy">
            维护真实的教育、实习和项目经历。打开招聘网页后，由侧边栏预览匹配结果，再由你决定是否填写。
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
        <div className="completion-ring" style={{ "--progress": `${completion.percentage * 3.6}deg` } as React.CSSProperties}>
          <div>
            <strong>{completion.percentage}%</strong>
            <span>{completion.missing.length === 0 ? "基础档案完整" : `还差 ${completion.missing.length} 项`}</span>
          </div>
        </div>
      </section>

      <section className="resume-import-card dossier-resume-card" id="resume" aria-label="常用简历操作">
        <SectionHeader index="01" icon={<FileText size={21} />} title="常用简历" description="保存招聘网站上传附件，与从简历提取档案信息是两个独立动作。" />
        <div className="resume-action-grid">
          <article className="resume-action-card">
            <p className="eyebrow">网站附件</p>
            <h3>设置常用简历 PDF</h3>
            <p>保存一份 PDF 原件到这台设备。招聘网页识别到唯一简历控件后，仍需在侧边栏确认才会上传。</p>
            {savedResume ? (
              <div className="saved-resume-status" aria-label="已保存的常用简历">
                <div>
                  <strong>已保存常用 PDF</strong>
                  <span>{savedResume.name} · {formatSavedResumeSize(savedResume.size)}</span>
                  <span>SHA-256 {savedResume.sha256.slice(0, 12)}… · 仅保存在本机</span>
                </div>
                <button type="button" onClick={() => { void deleteSavedResume(); }}>删除 PDF</button>
              </div>
            ) : <p className="resume-empty-state">尚未设置常用 PDF</p>}
            {resumeVaultFeedback.status !== "idle" ? (
              <div className={`resume-import-feedback ${resumeVaultFeedback.status}`} role={resumeVaultFeedback.status === "error" ? "alert" : "status"} aria-live="polite">
                <strong>{resumeVaultFeedback.message}</strong>
                <span>{resumeVaultFeedback.detail}</span>
              </div>
            ) : null}
            <label className={`resume-upload-button ${resumeVaultFeedback.status === "parsing" ? "disabled" : ""}`}>
              <Upload size={18} aria-hidden="true" />
              {resumeVaultFeedback.status === "parsing" ? "正在保存" : savedResume ? "替换常用 PDF" : "选择常用 PDF"}
              <input
                type="file"
                accept="application/pdf,.pdf"
                aria-label="设置常用简历 PDF"
                disabled={resumeVaultFeedback.status === "parsing"}
                onChange={(event) => {
                  void saveReusableResume(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </article>

          <article className="resume-action-card">
            <p className="eyebrow">资料提取</p>
            <h3 id="resume-import-title">从简历导入档案信息</h3>
            <p id="resume-import-description">支持文字版 PDF 和 DOCX，最大 10 MB。只把识别结果放入未保存草稿，不会设置网站附件。</p>
            {resumeImport.status !== "idle" ? (
              <div className={`resume-import-feedback ${resumeImport.status}`} role={resumeImport.status === "error" ? "alert" : "status"} aria-live="polite">
                <strong>{resumeImport.message}</strong>
                <span>{resumeImport.detail}</span>
              </div>
            ) : null}
            <label className={`resume-upload-button ${resumeImport.status === "parsing" ? "disabled" : ""}`}>
              <Upload size={18} aria-hidden="true" />
              {resumeImport.status === "parsing" ? "正在解析" : "选择文件并解析"}
              <input
                type="file"
                accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
                aria-label="从简历导入档案信息"
                aria-describedby="resume-import-description"
                disabled={resumeImport.status === "parsing"}
                onChange={(event) => {
                  void importResume(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </article>
        </div>
      </section>

      <div className="editor-layout">
        <aside className="section-nav" aria-label="档案章节">
          <p>档案章节</p>
          {navigation.map(([id, label, icon]) => (
            <a href={`#${id}`} key={id}>
              <span aria-hidden="true">{icon}</span>
              {label}
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
          <section className="form-card" id="basic">
            <SectionHeader index="02" icon={<UserRound size={21} />} title="基本信息" description="常用身份、联系方式和结构化所在地；敏感字段在网页写入时仍需确认。" />
            <div className="sensitive-notice" role="note">证件资料会保存在这台设备的扩展本地存储中，目前尚未加密；招聘网页填写前仍需逐项确认。不要在这里保存网站密码、验证码或 CAPTCHA。</div>
            <div className="field-grid">
              <Field label="姓名" value={profile.basic.fullName} autoComplete="name" onChange={(value) => update((draft) => { draft.basic.fullName = value; })} />
              <Field label="常用英文名" value={profile.basic.preferredName} onChange={(value) => update((draft) => { draft.basic.preferredName = value; })} />
              <SelectField label="性别" value={profile.basic.gender} options={GENDER_OPTIONS} onChange={(value) => update((draft) => { draft.basic.gender = value; })} />
              <Field label="出生日期" type="date" value={profile.basic.birthDate} autoComplete="bday" onChange={(value) => update((draft) => { draft.basic.birthDate = value; })} />
              <Field label="手机号码" type="tel" value={profile.basic.phone} autoComplete="tel" error={validation.errors["basic.phone"]} onChange={(value) => update((draft) => { draft.basic.phone = value; })} />
              <Field label="邮箱" type="email" value={profile.basic.email} autoComplete="email" error={validation.errors["basic.email"]} onChange={(value) => update((draft) => { draft.basic.email = value; })} />
              <Field label="国籍（地区）" value={profile.basic.nationality} placeholder="例如：中国" onChange={(value) => update((draft) => { draft.basic.nationality = value; })} />
              <Field label="现居省份" value={profile.basic.currentProvince ?? ""} onChange={(value) => update((draft) => { draft.basic.currentProvince = value; })} />
              <Field label="当前城市" value={profile.basic.currentCity} autoComplete="address-level2" onChange={(value) => update((draft) => { draft.basic.currentCity = value; })} />
              <Field label="现居区县" value={profile.basic.currentDistrict ?? ""} onChange={(value) => update((draft) => { draft.basic.currentDistrict = value; })} />
              <Field label="籍贯" value={profile.basic.hometown} onChange={(value) => update((draft) => { draft.basic.hometown = value; })} />
              <Field label="政治面貌" value={profile.basic.politicalStatus} onChange={(value) => update((draft) => { draft.basic.politicalStatus = value; })} />
              <SelectField label="证件类型" value={profile.basic.identityDocumentType ?? ""} options={IDENTITY_DOCUMENT_OPTIONS} error={validation.errors["basic.identityDocumentType"]} onChange={(value) => update((draft) => { draft.basic.identityDocumentType = value; })} />
              <Field label="证件号码" type="password" autoComplete="off" value={profile.basic.identityDocumentNumber ?? ""} error={validation.errors["basic.identityDocumentNumber"]} onChange={(value) => update((draft) => { draft.basic.identityDocumentNumber = value; })} />
              <Field label="民族" value={profile.basic.ethnicity ?? ""} onChange={(value) => update((draft) => { draft.basic.ethnicity = value; })} />
              <SelectField label="婚姻状况" value={profile.basic.maritalStatus ?? ""} options={MARITAL_STATUS_OPTIONS} onChange={(value) => update((draft) => { draft.basic.maritalStatus = value; })} />
              <Field label="宗教信仰" value={profile.basic.religion ?? ""} onChange={(value) => update((draft) => { draft.basic.religion = value; })} />
              <Field label="身高（cm）" value={profile.basic.heightCm ?? ""} onChange={(value) => update((draft) => { draft.basic.heightCm = value; })} />
              <Field label="体重（kg）" value={profile.basic.weightKg ?? ""} onChange={(value) => update((draft) => { draft.basic.weightKg = value; })} />
              <Field label="家庭所在省份" value={profile.basic.homeProvince ?? ""} onChange={(value) => update((draft) => { draft.basic.homeProvince = value; })} />
              <Field label="家庭所在城市" value={profile.basic.homeCity ?? ""} onChange={(value) => update((draft) => { draft.basic.homeCity = value; })} />
              <Field label="家庭所在区县" value={profile.basic.homeDistrict ?? ""} onChange={(value) => update((draft) => { draft.basic.homeDistrict = value; })} />
              <TextAreaField label="兴趣爱好" value={profile.basic.hobbies ?? ""} rows={3} onChange={(value) => update((draft) => { draft.basic.hobbies = value; })} />
            </div>
          </section>

          <section className="form-card" id="education">
            <SectionHeader index="04" icon={<GraduationCap size={21} />} title="教育经历" description="学历层级与学位分开保存；从最高学历开始添加。" />
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
                  <SelectField label="学历层级" value={record.degree} options={DEGREE_OPTIONS} onChange={(value) => updateEducation(index, "degree", value)} />
                  <SelectField label="学位" value={record.academicDegree ?? ""} options={ACADEMIC_DEGREE_OPTIONS} onChange={(value) => updateEducation(index, "academicDegree", value)} />
                  <SelectField label="学历类型" value={record.educationType} options={EDUCATION_TYPE_OPTIONS} onChange={(value) => updateEducation(index, "educationType", value)} />
                  <Field label="专业" value={record.major} onChange={(value) => updateEducation(index, "major", value)} />
                  <Field label="学院名称" value={record.college ?? ""} onChange={(value) => updateEducation(index, "college", value)} />
                  <Field label="专业分类" value={record.majorCategory ?? ""} onChange={(value) => updateEducation(index, "majorCategory", value)} />
                  <Field label="学校所在省份" value={record.schoolProvince ?? ""} onChange={(value) => updateEducation(index, "schoolProvince", value)} />
                  <Field label="学校所在城市" value={record.schoolCity ?? ""} onChange={(value) => updateEducation(index, "schoolCity", value)} />
                  <Field label="入学时间" type="month" value={record.startDate} onChange={(value) => updateEducation(index, "startDate", value)} />
                  <Field label="毕业时间" type="month" value={record.endDate} error={validation.errors[`education.${index}.endDate`]} onChange={(value) => updateEducation(index, "endDate", value)} />
                  <SelectField label="当前状态" value={record.currentStatus ?? ""} options={EDUCATION_STATUS_OPTIONS} onChange={(value) => updateEducation(index, "currentStatus", value)} />
                  <Field label="GPA" value={record.gpa} onChange={(value) => updateEducation(index, "gpa", value)} />
                  <Field label="GPA 满分" value={record.gpaScale ?? ""} onChange={(value) => updateEducation(index, "gpaScale", value)} />
                  <Field label="专业排名" value={record.ranking} placeholder="例如：前 10%" onChange={(value) => updateEducation(index, "ranking", value)} />
                  <TextAreaField label="专业主要课程" value={record.mainCourses ?? ""} rows={3} onChange={(value) => updateEducation(index, "mainCourses", value)} />
                  <TextAreaField label="专业描述" value={record.description ?? ""} rows={3} onChange={(value) => updateEducation(index, "description", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.education.push(createEducationRecord()); })}>
              <Plus size={17} />添加一段教育经历
            </button>
          </section>

          <section className="form-card" id="work">
            <SectionHeader index="05" icon={<BriefcaseBusiness size={21} />} title="实习与工作" description="招聘网站经常分别提供实习经历和工作经历，因此这里分开维护。" />
            <div className="subsection-heading"><h3>实习经历</h3><p>校招和实习招聘常用；只添加真实经历。</p></div>
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
                  <Field label="行业类别" value={record.industry ?? ""} onChange={(value) => updateWork(index, "industry", value)} />
                  <Field label="工作地点" value={record.location ?? ""} onChange={(value) => updateWork(index, "location", value)} />
                  <Field label="岗位名称" value={record.role} onChange={(value) => updateWork(index, "role", value)} />
                  <Field label="开始时间" type="month" value={record.startDate} onChange={(value) => updateWork(index, "startDate", value)} />
                  <Field label="结束时间" type="month" value={record.endDate} error={validation.errors[`workExperiences.${index}.endDate`]} onChange={(value) => updateWork(index, "endDate", value)} />
                  <TextAreaField label="工作描述" value={record.description} onChange={(value) => updateWork(index, "description", value)} />
                  <TextAreaField label="实习成果" value={record.achievement ?? ""} rows={3} onChange={(value) => updateWork(index, "achievement", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.workExperiences.push(createWorkExperienceRecord()); })}><Plus size={17} />添加一段实习经历</button>

            <div className="subsection-heading subsection-spacing"><h3>工作经历</h3><p>用于正式全职、兼职或创业经历。</p></div>
            {(profile.employmentExperiences ?? []).length === 0 ? <p className="empty-copy">尚未添加工作经历。</p> : null}
            {(profile.employmentExperiences ?? []).map((record, index) => (
              <article className="repeat-card" key={record.id}>
                <div className="repeat-heading">
                  <h3>工作经历 {index + 1}</h3>
                  <button className="icon-text-button danger-button" type="button" aria-label={`删除工作经历 ${index + 1}`} onClick={() => update((draft) => { draft.employmentExperiences?.splice(index, 1); })}><Trash2 size={16} />删除</button>
                </div>
                <div className="field-grid">
                  <Field label="单位名称" value={record.company} onChange={(value) => updateEmployment(index, "company", value)} />
                  <Field label="行业类别" value={record.industry ?? ""} onChange={(value) => updateEmployment(index, "industry", value)} />
                  <Field label="所在部门" value={record.department} onChange={(value) => updateEmployment(index, "department", value)} />
                  <Field label="岗位名称" value={record.role} onChange={(value) => updateEmployment(index, "role", value)} />
                  <SelectField label="用工类型" value={record.employmentType ?? ""} options={EMPLOYMENT_TYPE_OPTIONS} onChange={(value) => updateEmployment(index, "employmentType", value)} />
                  <Field label="工作地点" value={record.location ?? ""} onChange={(value) => updateEmployment(index, "location", value)} />
                  <Field label="开始时间" type="month" value={record.startDate} onChange={(value) => updateEmployment(index, "startDate", value)} />
                  <Field label="结束时间" type="month" value={record.endDate} error={validation.errors[`employmentExperiences.${index}.endDate`]} onChange={(value) => updateEmployment(index, "endDate", value)} />
                  <TextAreaField label="工作描述" value={record.description} onChange={(value) => updateEmployment(index, "description", value)} />
                  <TextAreaField label="工作成果" value={record.achievement ?? ""} rows={3} onChange={(value) => updateEmployment(index, "achievement", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.employmentExperiences ??= []; draft.employmentExperiences.push(createEmploymentExperienceRecord()); })}><Plus size={17} />添加一段工作经历</button>
          </section>

          <section className="form-card" id="projects">
            <SectionHeader index="06" icon={<FolderKanban size={21} />} title="项目经历" description="记录你在项目中的角色、动作和可验证成果。" />
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
                  <TextAreaField label="项目中职责" value={record.responsibilities ?? ""} rows={3} onChange={(value) => updateProject(index, "responsibilities", value)} />
                  <TextAreaField label="项目成果" value={record.outcome} rows={3} onChange={(value) => updateProject(index, "outcome", value)} />
                  <Field label="项目链接" type="url" value={record.link} placeholder="https://" onChange={(value) => updateProject(index, "link", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.projects.push(createProjectRecord()); })}><Plus size={17} />添加一段项目经历</button>
          </section>

          <section className="form-card" id="works">
            <SectionHeader index="07" icon={<Link2 size={21} />} title="作品" description="保存作品链接与说明；作品附件仍需在招聘页面单独确认。" />
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
            <SectionHeader index="09" icon={<Award size={21} />} title="获奖经历" description="奖项类别、级别和等级分别记录，避免含义混用。" />
            {profile.awards.length === 0 ? <p className="empty-copy">尚未添加获奖记录。</p> : null}
            {profile.awards.map((record, index) => (
              <article className="repeat-card" key={record.id}>
                <div className="repeat-heading">
                  <h3>获奖 {index + 1}</h3>
                  <button className="icon-text-button danger-button" type="button" aria-label={`删除获奖 ${index + 1}`} onClick={() => update((draft) => { draft.awards.splice(index, 1); })}><Trash2 size={16} />删除</button>
                </div>
                <div className="field-grid">
                  <Field label="获奖名称" value={record.name} onChange={(value) => updateAward(index, "name", value)} />
                  <Field label="奖项类别" value={record.category ?? ""} onChange={(value) => updateAward(index, "category", value)} />
                  <Field label="获奖时间" type="month" value={record.date} onChange={(value) => updateAward(index, "date", value)} />
                  <Field label="奖项级别" value={record.level ?? ""} placeholder="例如：国际级、国家级、省级" onChange={(value) => updateAward(index, "level", value)} />
                  <Field label="奖项等级" value={record.grade ?? ""} placeholder="例如：一等奖、银奖" onChange={(value) => updateAward(index, "grade", value)} />
                  <Field label="颁发机构" value={record.issuer ?? ""} onChange={(value) => updateAward(index, "issuer", value)} />
                  <TextAreaField label="获奖描述" value={record.description} onChange={(value) => updateAward(index, "description", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.awards.push(createAwardRecord()); })}><Plus size={17} />添加一条获奖记录</button>
          </section>

          <section className="form-card" id="languages">
            <SectionHeader index="10" icon={<Languages size={21} />} title="语言能力" description="实际使用能力与考试成绩分开；一门语言可以对应多项考试。" />
            <div className="subsection-heading"><h3>语言技能</h3><p>描述实际使用能力，不填写考试名称。</p></div>
            {profile.languages.length === 0 ? <p className="empty-copy">尚未添加语言能力。</p> : null}
            {profile.languages.map((record, index) => (
              <article className="repeat-card" key={record.id}>
                <div className="repeat-heading">
                  <h3>语言能力 {index + 1}</h3>
                  <button className="icon-text-button danger-button" type="button" aria-label={`删除语言能力 ${index + 1}`} onClick={() => update((draft) => { draft.languages.splice(index, 1); })}><Trash2 size={16} />删除</button>
                </div>
                <div className="field-grid">
                  <SelectField label="语言" value={record.language} options={LANGUAGE_OPTIONS} onChange={(value) => updateLanguage(index, "language", value)} />
                  <SelectField label="综合熟练程度" value={record.proficiency} options={PROFICIENCY_OPTIONS} onChange={(value) => updateLanguage(index, "proficiency", value)} />
                  <SelectField label="听说能力" value={record.listeningSpeaking ?? ""} options={PROFICIENCY_OPTIONS} onChange={(value) => updateLanguage(index, "listeningSpeaking", value)} />
                  <SelectField label="读写能力" value={record.readingWriting ?? ""} options={PROFICIENCY_OPTIONS} onChange={(value) => updateLanguage(index, "readingWriting", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.languages.push(createLanguageRecord()); })}><Plus size={17} />添加一项语言能力</button>

            <div className="subsection-heading subsection-spacing"><h3>语言考试</h3><p>每项考试独立记录成绩、日期和有效期。</p></div>
            {(profile.languageExams ?? []).length === 0 ? <p className="empty-copy">尚未添加语言考试。</p> : null}
            {(profile.languageExams ?? []).map((record, index) => (
              <article className="repeat-card" key={record.id}>
                <div className="repeat-heading">
                  <h3>语言考试 {index + 1}</h3>
                  <button className="icon-text-button danger-button" type="button" aria-label={`删除语言考试 ${index + 1}`} onClick={() => update((draft) => { draft.languageExams?.splice(index, 1); })}><Trash2 size={16} />删除</button>
                </div>
                <div className="field-grid">
                  <SelectField label="对应语言" value={record.language} options={LANGUAGE_OPTIONS} onChange={(value) => updateLanguageExam(index, "language", value)} />
                  <SelectField label="考试类型" value={record.examType} options={LANGUAGE_EXAM_OPTIONS} onChange={(value) => updateLanguageExam(index, "examType", value)} />
                  <Field label="成绩" value={record.score} placeholder="例如：520 或 7.0" onChange={(value) => updateLanguageExam(index, "score", value)} />
                  <Field label="考试日期" type="date" value={record.examDate} onChange={(value) => updateLanguageExam(index, "examDate", value)} />
                  <Field label="有效期至" type="date" value={record.validUntil} error={validation.errors[`languageExams.${index}.validUntil`]} onChange={(value) => updateLanguageExam(index, "validUntil", value)} />
                  <Field label="证书编号" value={record.certificateNumber} onChange={(value) => updateLanguageExam(index, "certificateNumber", value)} />
                </div>
              </article>
            ))}
            <button className="add-button" type="button" onClick={() => update((draft) => { draft.languageExams ??= []; draft.languageExams.push(createLanguageExamRecord()); })}><Plus size={17} />添加一项语言考试</button>
          </section>

          <section className="form-card" id="preference">
            <SectionHeader index="03" icon={<MapPinned size={21} />} title="求职期望" description="长期偏好与本次投递上下文分开记录；多个岗位或城市请用顿号分隔。" />
            <div className="field-grid">
              <Field label="目标岗位" value={profile.jobPreference.targetRoles} placeholder="例如：产品经理、产品运营" onChange={(value) => update((draft) => { draft.jobPreference.targetRoles = value; })} />
              <Field label="期望行业" value={profile.jobPreference.targetIndustries ?? ""} placeholder="例如：互联网、企业服务" onChange={(value) => update((draft) => { draft.jobPreference.targetIndustries = value; })} />
              <Field label="意向城市" value={profile.jobPreference.preferredCities} placeholder="例如：上海、杭州" onChange={(value) => update((draft) => { draft.jobPreference.preferredCities = value; })} />
              <Field label="期望薪资下限" value={profile.jobPreference.expectedSalaryMin ?? ""} onChange={(value) => update((draft) => { draft.jobPreference.expectedSalaryMin = value; })} />
              <Field label="期望薪资上限" value={profile.jobPreference.expectedSalaryMax ?? ""} onChange={(value) => update((draft) => { draft.jobPreference.expectedSalaryMax = value; })} />
              <SelectField label="薪资币种" value={profile.jobPreference.salaryCurrency ?? ""} options={SALARY_CURRENCY_OPTIONS} onChange={(value) => update((draft) => { draft.jobPreference.salaryCurrency = value; })} />
              <SelectField label="薪资周期" value={profile.jobPreference.salaryPeriod ?? ""} options={SALARY_PERIOD_OPTIONS} onChange={(value) => update((draft) => { draft.jobPreference.salaryPeriod = value; })} />
              <Field label="当前薪资" value={profile.jobPreference.currentSalary ?? ""} onChange={(value) => update((draft) => { draft.jobPreference.currentSalary = value; })} />
              <Field label="可到岗日期" type="date" value={profile.jobPreference.availableDate} onChange={(value) => update((draft) => { draft.jobPreference.availableDate = value; })} />
              <SelectField label="是否接受岗位调剂" value={profile.jobPreference.acceptsAdjustment ?? ""} options={YES_NO_OPTIONS} onChange={(value) => update((draft) => { draft.jobPreference.acceptsAdjustment = value; })} />
              <SelectField label="是否内推" value={profile.jobPreference.internalReferral ?? ""} options={YES_NO_OPTIONS} onChange={(value) => update((draft) => { draft.jobPreference.internalReferral = value; })} />
              <Field label="招聘信息来源" value={profile.jobPreference.recruitmentSource ?? ""} placeholder="例如：官方网站、校园招聘、员工推荐" onChange={(value) => update((draft) => { draft.jobPreference.recruitmentSource = value; })} />
              <SelectField label="工作经验" value={profile.jobPreference.workYears ?? ""} options={WORK_YEARS_OPTIONS} onChange={(value) => update((draft) => { draft.jobPreference.workYears = value; })} />
            </div>
          </section>

          <section className="form-card" id="answers">
            <SectionHeader index="14" icon={<MessageSquareText size={21} />} title="常用问答" description="保存可复用的事实基础，投递时根据公司、岗位和字数限制再次检查。" />
            <div className="field-grid">
              <TextAreaField label="自我介绍" value={profile.answers.selfIntroduction} onChange={(value) => update((draft) => { draft.answers.selfIntroduction = value; })} />
              <TextAreaField label="自我评价" value={profile.answers.selfEvaluation} onChange={(value) => update((draft) => { draft.answers.selfEvaluation = value; })} />
              <TextAreaField label="个人优势" value={profile.answers.strengths} onChange={(value) => update((draft) => { draft.answers.strengths = value; })} />
              <TextAreaField label="职业规划" value={profile.answers.careerPlan} onChange={(value) => update((draft) => { draft.answers.careerPlan = value; })} />
            </div>
          </section>

          <SupplementalProfileSections profile={profile} validation={validation} update={update} />

          <section className="attachment-note" aria-labelledby="attachment-title">
            <FileText size={22} aria-hidden="true" />
            <div>
              <h2 id="attachment-title">常用 PDF 可复用，目标网站仍需确认</h2>
              <p>上方选择的 PDF 原件会保存在扩展的本地数据库中，不保存文件路径，也不会上传到云端。招聘网页发现唯一简历控件后可直接复用，但每个网站仍要由你确认一次；证件号码可确认后填写，但证件附件、验证码和最终提交不自动处理。</p>
            </div>
          </section>

          <section className="privacy-controls" aria-labelledby="privacy-controls-title">
            <SectionHeader index="14" icon={<ShieldCheck size={21} />} title="本地数据管理" description="导出备份、恢复档案，或删除这台设备上的全部个人数据。" />
            <div className="privacy-stats">
              <div><strong>1</strong><span>份求职档案</span></div>
              <div><strong>{mappings.length}</strong><span>条网站字段对应关系</span></div>
              <div><strong>{savedResume ? 1 : 0}</strong><span>份本机 PDF 简历</span></div>
            </div>
            <div className="privacy-actions">
              <button className="secondary-button action-with-icon" type="button" onClick={exportData}><Download size={17} />导出本地数据</button>
              <label className="secondary-button action-with-icon import-button">
                <Upload size={17} />导入本地数据
                <input type="file" accept="application/json,.json" aria-label="导入本地数据" onChange={(event) => { void importData(event.target.files?.[0]); event.target.value = ""; }} />
              </label>
              <button className="delete-data-button action-with-icon" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={17} />删除全部本地数据</button>
            </div>
            <p className="privacy-export-warning">导出的 JSON 备份会包含证件号码等档案原文，请只保存在你信任的设备中。</p>
            {confirmDelete ? (
              <div className="delete-confirmation" role="alert">
                <div><strong>确认永久删除？</strong><p>求职档案、所有网站字段对应关系和保存的 PDF 简历都会从这台设备移除。此操作无法撤销。</p></div>
                <div><button className="secondary-button" type="button" onClick={() => setConfirmDelete(false)}>取消</button><button className="delete-confirm-button" type="button" onClick={() => { void deleteLocalData(); }}>确认永久删除</button></div>
              </div>
            ) : null}
            {privacyMessage ? <p className="privacy-feedback" aria-live="polite">{privacyMessage}</p> : null}
          </section>
        </div>
        <aside className="profile-dock" aria-label="档案状态">
          <div className="profile-dock-heading">
            <strong>档案管理</strong>
            <span>本机</span>
          </div>
          <div className="profile-dock-card">
            <strong>默认档案</strong>
            <span>{profile.basic.fullName.trim() || "尚未填写姓名"}</span>
          </div>
          <dl>
            <div><dt>保存位置</dt><dd>浏览器本地</dd></div>
            <div><dt>网页提交</dt><dd>不提供</dd></div>
            <div><dt>常用 PDF</dt><dd>{savedResume ? "已设置" : "未设置"}</dd></div>
            <div><dt>完成度</dt><dd>{completion.percentage}%</dd></div>
          </dl>
          <a href="#resume">管理常用简历</a>
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
