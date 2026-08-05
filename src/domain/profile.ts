export const PROFILE_SCHEMA_VERSION = 2;

export interface BasicInfo {
  fullName: string;
  preferredName: string;
  gender: string;
  birthDate: string;
  phone: string;
  email: string;
  nationality: string;
  currentCity: string;
  hometown: string;
  politicalStatus: string;
}

export interface EducationRecord {
  id: string;
  school: string;
  degree: string;
  educationType: string;
  major: string;
  startDate: string;
  endDate: string;
  gpa: string;
  ranking: string;
}

export interface WorkExperienceRecord {
  id: string;
  company: string;
  department: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  outcome: string;
  link: string;
}

export interface WorkSampleRecord {
  id: string;
  link: string;
  description: string;
}

export interface AwardRecord {
  id: string;
  name: string;
  date: string;
  description: string;
}

export interface LanguageRecord {
  id: string;
  language: string;
  proficiency: string;
}

export interface JobPreference {
  targetRoles: string;
  preferredCities: string;
  availableDate: string;
}

export interface ReusableAnswers {
  selfIntroduction: string;
  selfEvaluation: string;
  strengths: string;
  careerPlan: string;
}

export interface CandidateProfile {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  updatedAt: string;
  basic: BasicInfo;
  education: EducationRecord[];
  workExperiences: WorkExperienceRecord[];
  projects: ProjectRecord[];
  workSamples: WorkSampleRecord[];
  awards: AwardRecord[];
  languages: LanguageRecord[];
  jobPreference: JobPreference;
  answers: ReusableAnswers;
}

export interface CompletionItem {
  path: string;
  label: string;
  filled: boolean;
}

export interface ProfileCompletion {
  filled: number;
  total: number;
  percentage: number;
  missing: CompletionItem[];
}

export interface ProfileValidation {
  valid: boolean;
  errors: Record<string, string>;
}

type UnknownRecord = Record<string, unknown>;

function recordId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEducationRecord(): EducationRecord {
  return {
    id: recordId("education"),
    school: "",
    degree: "",
    educationType: "",
    major: "",
    startDate: "",
    endDate: "",
    gpa: "",
    ranking: ""
  };
}

export function createWorkExperienceRecord(): WorkExperienceRecord {
  return {
    id: recordId("work"),
    company: "",
    department: "",
    role: "",
    startDate: "",
    endDate: "",
    description: ""
  };
}

export function createProjectRecord(): ProjectRecord {
  return {
    id: recordId("project"),
    name: "",
    role: "",
    startDate: "",
    endDate: "",
    description: "",
    outcome: "",
    link: ""
  };
}

export function createWorkSampleRecord(): WorkSampleRecord {
  return {
    id: recordId("work-sample"),
    link: "",
    description: ""
  };
}

export function createAwardRecord(): AwardRecord {
  return {
    id: recordId("award"),
    name: "",
    date: "",
    description: ""
  };
}

export function createLanguageRecord(): LanguageRecord {
  return {
    id: recordId("language"),
    language: "",
    proficiency: ""
  };
}

export function createEmptyProfile(): CandidateProfile {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    updatedAt: "",
    basic: {
      fullName: "",
      preferredName: "",
      gender: "",
      birthDate: "",
      phone: "",
      email: "",
      nationality: "",
      currentCity: "",
      hometown: "",
      politicalStatus: ""
    },
    education: [createEducationRecord()],
    workExperiences: [],
    projects: [],
    workSamples: [],
    awards: [],
    languages: [],
    jobPreference: {
      targetRoles: "",
      preferredCities: "",
      availableDate: ""
    },
    answers: {
      selfIntroduction: "",
      selfEvaluation: "",
      strengths: "",
      careerPlan: ""
    }
  };
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeEducation(value: unknown): EducationRecord {
  const source = asRecord(value);
  return {
    ...createEducationRecord(),
    id: asString(source.id) || recordId("education"),
    school: asString(source.school),
    degree: asString(source.degree),
    educationType: asString(source.educationType),
    major: asString(source.major),
    startDate: asString(source.startDate),
    endDate: asString(source.endDate),
    gpa: asString(source.gpa),
    ranking: asString(source.ranking)
  };
}

function normalizeWork(value: unknown): WorkExperienceRecord {
  const source = asRecord(value);
  return {
    ...createWorkExperienceRecord(),
    id: asString(source.id) || recordId("work"),
    company: asString(source.company),
    department: asString(source.department),
    role: asString(source.role),
    startDate: asString(source.startDate),
    endDate: asString(source.endDate),
    description: asString(source.description)
  };
}

function normalizeProject(value: unknown): ProjectRecord {
  const source = asRecord(value);
  return {
    ...createProjectRecord(),
    id: asString(source.id) || recordId("project"),
    name: asString(source.name),
    role: asString(source.role),
    startDate: asString(source.startDate),
    endDate: asString(source.endDate),
    description: asString(source.description),
    outcome: asString(source.outcome),
    link: asString(source.link)
  };
}

function normalizeWorkSample(value: unknown): WorkSampleRecord {
  const source = asRecord(value);
  return {
    ...createWorkSampleRecord(),
    id: asString(source.id) || recordId("work-sample"),
    link: asString(source.link),
    description: asString(source.description)
  };
}

function normalizeAward(value: unknown): AwardRecord {
  const source = asRecord(value);
  return {
    ...createAwardRecord(),
    id: asString(source.id) || recordId("award"),
    name: asString(source.name),
    date: asString(source.date),
    description: asString(source.description)
  };
}

function normalizeLanguage(value: unknown): LanguageRecord {
  const source = asRecord(value);
  return {
    ...createLanguageRecord(),
    id: asString(source.id) || recordId("language"),
    language: asString(source.language),
    proficiency: asString(source.proficiency)
  };
}

function migrateLegacyProfile(source: UnknownRecord): CandidateProfile {
  const profile = createEmptyProfile();
  const legacyBasic = asRecord(source.basic);
  const legacyEducation = asRecord(source.education);
  profile.basic.fullName = asString(source.name) || asString(legacyBasic.fullName);
  profile.basic.phone = asString(source.phone) || asString(legacyBasic.phone);
  profile.basic.email = asString(source.email) || asString(legacyBasic.email);
  profile.basic.currentCity = asString(source.currentCity) || asString(legacyBasic.currentCity);
  profile.education[0] = normalizeEducation({
    school: source.school ?? legacyEducation.school,
    degree: source.degree ?? legacyEducation.degree,
    major: source.major ?? legacyEducation.major,
    startDate: legacyEducation.startDate,
    endDate: legacyEducation.endDate
  });
  return profile;
}

export function migrateProfile(value: unknown): CandidateProfile {
  const source = asRecord(value);
  if (source.schemaVersion !== PROFILE_SCHEMA_VERSION && source.schemaVersion !== 1) {
    return migrateLegacyProfile(source);
  }

  const profile = createEmptyProfile();
  const basic = asRecord(source.basic);
  const jobPreference = asRecord(source.jobPreference);
  const answers = asRecord(source.answers);
  const education = Array.isArray(source.education)
    ? source.education.map(normalizeEducation)
    : [];

  return {
    ...profile,
    updatedAt: asString(source.updatedAt),
    basic: {
      fullName: asString(basic.fullName),
      preferredName: asString(basic.preferredName),
      gender: asString(basic.gender),
      birthDate: asString(basic.birthDate),
      phone: asString(basic.phone),
      email: asString(basic.email),
      nationality: asString(basic.nationality),
      currentCity: asString(basic.currentCity),
      hometown: asString(basic.hometown),
      politicalStatus: asString(basic.politicalStatus)
    },
    education: education.length > 0 ? education : [createEducationRecord()],
    workExperiences: Array.isArray(source.workExperiences)
      ? source.workExperiences.map(normalizeWork)
      : [],
    projects: Array.isArray(source.projects)
      ? source.projects.map(normalizeProject)
      : [],
    workSamples: Array.isArray(source.workSamples)
      ? source.workSamples.map(normalizeWorkSample)
      : [],
    awards: Array.isArray(source.awards)
      ? source.awards.map(normalizeAward)
      : [],
    languages: Array.isArray(source.languages)
      ? source.languages.map(normalizeLanguage)
      : [],
    jobPreference: {
      targetRoles: asString(jobPreference.targetRoles),
      preferredCities: asString(jobPreference.preferredCities),
      availableDate: asString(jobPreference.availableDate)
    },
    answers: {
      selfIntroduction: asString(answers.selfIntroduction),
      selfEvaluation: asString(answers.selfEvaluation),
      strengths: asString(answers.strengths),
      careerPlan: asString(answers.careerPlan)
    }
  };
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function hasMeaningfulFields(record: object): boolean {
  return Object.entries(record).some(
    ([key, value]) => key !== "id" && typeof value === "string" && hasText(value)
  );
}

function required(path: string, label: string, value: string): CompletionItem {
  return { path, label, filled: hasText(value) };
}

export function calculateProfileCompletion(profile: CandidateProfile): ProfileCompletion {
  const firstEducation = profile.education[0] ?? createEducationRecord();
  const items: CompletionItem[] = [
    required("basic.fullName", "姓名", profile.basic.fullName),
    required("basic.phone", "手机号码", profile.basic.phone),
    required("basic.email", "邮箱", profile.basic.email),
    required("basic.nationality", "国籍（地区）", profile.basic.nationality),
    required("basic.currentCity", "当前城市", profile.basic.currentCity),
    required("education.0.school", "毕业院校", firstEducation.school),
    required("education.0.degree", "学历", firstEducation.degree),
    required("education.0.educationType", "学历类型", firstEducation.educationType),
    required("education.0.major", "专业", firstEducation.major),
    required("education.0.startDate", "入学时间", firstEducation.startDate),
    required("education.0.endDate", "毕业时间", firstEducation.endDate),
    required("jobPreference.targetRoles", "目标岗位", profile.jobPreference.targetRoles),
    required("jobPreference.preferredCities", "意向城市", profile.jobPreference.preferredCities)
  ];

  profile.education.slice(1).forEach((record, index) => {
    if (!hasMeaningfulFields(record)) return;
    const itemIndex = index + 1;
    items.push(
      required(`education.${itemIndex}.school`, `教育经历 ${itemIndex + 1} · 院校`, record.school),
      required(`education.${itemIndex}.degree`, `教育经历 ${itemIndex + 1} · 学历`, record.degree),
      required(`education.${itemIndex}.educationType`, `教育经历 ${itemIndex + 1} · 学历类型`, record.educationType),
      required(`education.${itemIndex}.major`, `教育经历 ${itemIndex + 1} · 专业`, record.major)
    );
  });

  profile.workExperiences.forEach((record, index) => {
    if (!hasMeaningfulFields(record)) return;
    items.push(
      required(`workExperiences.${index}.company`, `实习经历 ${index + 1} · 公司`, record.company),
      required(`workExperiences.${index}.role`, `实习经历 ${index + 1} · 岗位`, record.role),
      required(`workExperiences.${index}.description`, `实习经历 ${index + 1} · 描述`, record.description)
    );
  });

  profile.projects.forEach((record, index) => {
    if (!hasMeaningfulFields(record)) return;
    items.push(
      required(`projects.${index}.name`, `项目经历 ${index + 1} · 名称`, record.name),
      required(`projects.${index}.role`, `项目经历 ${index + 1} · 角色`, record.role),
      required(`projects.${index}.description`, `项目经历 ${index + 1} · 描述`, record.description)
    );
  });

  profile.awards.forEach((record, index) => {
    if (!hasMeaningfulFields(record)) return;
    items.push(required(`awards.${index}.name`, `获奖 ${index + 1} · 名称`, record.name));
  });

  profile.languages.forEach((record, index) => {
    if (!hasMeaningfulFields(record)) return;
    items.push(
      required(`languages.${index}.language`, `语言能力 ${index + 1} · 语言`, record.language),
      required(`languages.${index}.proficiency`, `语言能力 ${index + 1} · 熟练程度`, record.proficiency)
    );
  });

  const filled = items.filter((item) => item.filled).length;
  return {
    filled,
    total: items.length,
    percentage: items.length === 0 ? 0 : Math.round((filled / items.length) * 100),
    missing: items.filter((item) => !item.filled)
  };
}

export function setProfileUpdatedNow(profile: CandidateProfile): CandidateProfile {
  return {
    ...migrateProfile(profile),
    updatedAt: new Date().toISOString()
  };
}

export function validateProfile(profile: CandidateProfile): ProfileValidation {
  const errors: Record<string, string> = {};
  const phone = profile.basic.phone.trim();
  const email = profile.basic.email.trim();

  if (phone && !/^[+\d][\d\s-]{6,19}$/.test(phone)) {
    errors["basic.phone"] = "请输入有效的手机号码，可包含国家或地区区号。";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors["basic.email"] = "请输入有效的邮箱地址。";
  }

  profile.education.forEach((record, index) => {
    if (record.startDate && record.endDate && record.startDate > record.endDate) {
      errors[`education.${index}.endDate`] = "毕业时间不能早于入学时间。";
    }
  });
  profile.workExperiences.forEach((record, index) => {
    if (record.startDate && record.endDate && record.startDate > record.endDate) {
      errors[`workExperiences.${index}.endDate`] = "结束时间不能早于开始时间。";
    }
  });
  profile.projects.forEach((record, index) => {
    if (record.startDate && record.endDate && record.startDate > record.endDate) {
      errors[`projects.${index}.endDate`] = "结束时间不能早于开始时间。";
    }
  });

  return { valid: Object.keys(errors).length === 0, errors };
}

export function getProfileValue(profile: CandidateProfile, path: string): string {
  if (path === "derived.age") return ageFromBirthDate(profile.basic.birthDate);
  const segments = path.split(".").filter(Boolean);
  let current: unknown = profile;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return "";
      current = current[index];
      continue;
    }
    if (current === null || typeof current !== "object") return "";
    if (!(segment in current)) return "";
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : "";
}

export function ageFromBirthDate(birthDate: string, today = new Date()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  let age = today.getFullYear() - year;
  const beforeBirthday = today.getMonth() + 1 < month
    || (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age <= 150 ? String(age) : "";
}
