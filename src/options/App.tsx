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
import { MappingRepository } from "../mapping/mappingRepository";
import type { SavedFieldMapping } from "../mapping/types";
import { PrivacyConsentRepository } from "../privacy/consentRepository";
import { parseLocalData, serializeLocalData } from "../privacy/localData";
import { extractResumeText } from "../resume/extractResumeText";
import { mergeResumeIntoProfile, parseResumeText } from "../resume/parseResume";
import { ProfileRepository } from "../storage/profileRepository";
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

interface ResumeImportFeedback {
  status: "idle" | "parsing" | "success" | "error";
  message: string;
  detail: string;
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

const repository = new ProfileRepository();
const mappingRepository = new MappingRepository();
const consentRepository = new PrivacyConsentRepository();

export function App() {
  return (
    <ProfileEditor
      repository={repository}
      mappingRepository={mappingRepository}
      consentRepository={consentRepository}
    />
  );
}

export function ProfileEditor({
  repository: profileRepository,
  mappingRepository: fieldMappingRepository,
  consentRepository: privacyConsentRepository
}: {
  repository: ProfileRepositoryLike;
  mappingRepository?: OptionsMappingRepositoryLike;
  consentRepository?: OptionsConsentRepositoryLike;
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
      privacyConsentRepository?.hasAcknowledged() ?? Promise.resolve(true)
    ]).then(([loadedProfile, loadedMappings, acknowledged]) => {
      if (!active) return;
      profileRef.current = loadedProfile;
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

  async function importResume(file: File | undefined) {
    if (!file) return;
    setResumeImport({ status: "parsing", message: "正在本机解析简历…", detail: "解析期间不会发送网络请求。" });
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
        detail: `${formatLabel}${pageLabel}${ocrLabel} 已在本机完成解析。请直接在下方表格检查，确认后点击“保存档案”。${parsed.warnings[0] ? ` ${parsed.warnings[0]}` : ""}`
      });
    }
    catch (error) {
      setResumeImport({
        status: "error",
        message: error instanceof Error ? error.message : "简历解析失败，请换一个文件重试。",
        detail: "原文件和提取出的全文均未保存。"
      });
    }
  }

  async function deleteLocalData() {
    if (!profileRepository.clear) return;
    const empty = await profileRepository.clear();
    await fieldMappingRepository?.clear();
    profileRef.current = empty;
    setProfile(empty);
    setMappings([]);
    setDirty(false);
    setConfirmDelete(false);
    setPrivacyMessage("个人档案和网站字段对应关系已从本机删除。")
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
            <article><strong>点击后才读取</strong><p>只有你主动扫描时，扩展才读取当前页面的表单标题和控件类型。</p></article>
            <article><strong>不会替你提交</strong><p>密码、验证码和附件保持手动；敏感字段默认不选择。</p></article>
          </div>
          <button className="primary-button onboarding-button" type="button" onClick={acknowledgePrivacy}>我已了解，开始建立档案</button>
        </section>
      </main>
    );
  }

  const navigation = [
    ["basic", "基本信息", <UserRound size={17} />],
    ["education", "教育经历", <GraduationCap size={17} />],
    ["work", "实习经历", <BriefcaseBusiness size={17} />],
    ["projects", "项目经历", <FolderKanban size={17} />],
    ["works", "作品", <Link2 size={17} />],
    ["awards", "获奖", <Award size={17} />],
    ["languages", "语言能力", <Languages size={17} />],
    ["preference", "求职偏好", <MapPinned size={17} />],
    ["answers", "常用回答", <MessageSquareText size={17} />]
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

      <section className="resume-import-card" aria-labelledby="resume-import-title">
        <div className="resume-import-icon" aria-hidden="true"><FileText size={28} /></div>
        <div className="resume-import-copy">
          <p className="eyebrow">从现有简历开始</p>
          <h2 id="resume-import-title">上传简历，填入这张信息表</h2>
          <p id="resume-import-description">支持文字版 PDF 和 DOCX，最大 10 MB。文件只在当前页面解析，不上传，也不会自动保存。</p>
          {resumeImport.status !== "idle" ? (
            <div className={`resume-import-feedback ${resumeImport.status}`} role={resumeImport.status === "error" ? "alert" : "status"} aria-live="polite">
              <strong>{resumeImport.message}</strong>
              <span>{resumeImport.detail}</span>
            </div>
          ) : null}
        </div>
        <label className={`resume-upload-button ${resumeImport.status === "parsing" ? "disabled" : ""}`}>
          <Upload size={18} aria-hidden="true" />
          {resumeImport.status === "parsing" ? "正在解析" : "选择简历"}
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
            <SectionHeader index="01" icon={<UserRound size={21} />} title="基本信息" description="用于招聘系统中最常见的身份和联系方式字段。" />
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
            <SectionHeader index="02" icon={<GraduationCap size={21} />} title="教育经历" description="至少保留一段最高学历；可继续添加辅修或前置学历。" />
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
            <SectionHeader index="03" icon={<BriefcaseBusiness size={21} />} title="实习经历" description="只添加真实经历；空白记录不会计入档案完成度。" />
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
            <SectionHeader index="04" icon={<FolderKanban size={21} />} title="项目经历" description="记录你在项目中的角色、动作和可验证成果。" />
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
            <SectionHeader index="05" icon={<Link2 size={21} />} title="作品" description="对应小米招聘页的作品链接与作品描述；附件仍由你在网页中手动上传。" />
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
            <SectionHeader index="06" icon={<Award size={21} />} title="获奖" description="记录奖项名称、获奖时间和说明；证明附件保持手动上传。" />
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
            <SectionHeader index="07" icon={<Languages size={21} />} title="语言能力" description="对应招聘页的语言与熟练程度，可添加多条。" />
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
            <SectionHeader index="08" icon={<MapPinned size={21} />} title="求职偏好" description="多个岗位或城市请用顿号分隔，方便不同网站复用。" />
            <div className="field-grid">
              <Field label="目标岗位" value={profile.jobPreference.targetRoles} placeholder="例如：产品经理、产品运营" onChange={(value) => update((draft) => { draft.jobPreference.targetRoles = value; })} />
              <Field label="意向城市" value={profile.jobPreference.preferredCities} placeholder="例如：上海、杭州" onChange={(value) => update((draft) => { draft.jobPreference.preferredCities = value; })} />
              <Field label="可到岗日期" type="date" value={profile.jobPreference.availableDate} onChange={(value) => update((draft) => { draft.jobPreference.availableDate = value; })} />
            </div>
          </section>

          <section className="form-card" id="answers">
            <SectionHeader index="09" icon={<MessageSquareText size={21} />} title="常用回答" description="保存事实素材，遇到不同字数限制时再进行调整。" />
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
              <h2 id="attachment-title">招聘网站附件仍需手动上传</h2>
              <p>上方上传只用于整理本地信息表。小米等招聘页中的简历、获奖证明和个人证件仍由你手动选择与确认；扩展不会保存文件路径、证件号码或验证码。</p>
            </div>
          </section>

          <section className="privacy-controls" aria-labelledby="privacy-controls-title">
            <SectionHeader index="10" icon={<ShieldCheck size={21} />} title="本地数据管理" description="导出备份、恢复档案，或删除这台设备上的全部个人数据。" />
            <div className="privacy-stats">
              <div><strong>1</strong><span>份求职档案</span></div>
              <div><strong>{mappings.length}</strong><span>条网站字段对应关系</span></div>
            </div>
            <div className="privacy-actions">
              <button className="secondary-button action-with-icon" type="button" onClick={exportData}><Download size={17} />导出本地数据</button>
              <label className="secondary-button action-with-icon import-button">
                <Upload size={17} />导入本地数据
                <input type="file" accept="application/json,.json" aria-label="导入本地数据" onChange={(event) => { void importData(event.target.files?.[0]); event.target.value = ""; }} />
              </label>
              <button className="delete-data-button action-with-icon" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={17} />删除全部本地数据</button>
            </div>
            {confirmDelete ? (
              <div className="delete-confirmation" role="alert">
                <div><strong>确认永久删除？</strong><p>求职档案和所有网站字段对应关系都会从这台设备移除。此操作无法撤销。</p></div>
                <div><button className="secondary-button" type="button" onClick={() => setConfirmDelete(false)}>取消</button><button className="delete-confirm-button" type="button" onClick={() => { void deleteLocalData(); }}>确认永久删除</button></div>
              </div>
            ) : null}
            {privacyMessage ? <p className="privacy-feedback" aria-live="polite">{privacyMessage}</p> : null}
          </section>
        </div>
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
