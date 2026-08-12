export const PROFILE_SCHEMA_VERSION = 4;

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
  identityDocumentType?: string;
  identityDocumentNumber?: string;
  ethnicity?: string;
  maritalStatus?: string;
  religion?: string;
  heightCm?: string;
  weightKg?: string;
  homeCity?: string;
  homeDistrict?: string;
  schoolCity?: string;
  schoolDistrict?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  hobbies?: string;
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
  college?: string;
  majorCategory?: string;
  mainCourses?: string;
  description?: string;
}

export interface WorkExperienceRecord {
  id: string;
  company: string;
  department: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  industry?: string;
  location?: string;
  achievement?: string;
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
  responsibilities?: string;
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
  category?: string;
  level?: string;
  grade?: string;
}

export interface LanguageRecord {
  id: string;
  language: string;
  proficiency: string;
  qualification?: string;
  listeningSpeaking?: string;
  readingWriting?: string;
  score?: string;
}

export interface JobPreference {
  targetRoles: string;
  preferredCities: string;
  availableDate: string;
  targetIndustries?: string;
  expectedSalary?: string;
  currentSalary?: string;
  acceptsAdjustment?: string;
  internalReferral?: string;
  recruitmentSource?: string;
  workYears?: string;
}

export interface CampusLeadershipRecord {
  id: string;
  title: string;
  level: string;
  organization: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface CampusActivityRecord {
  id: string;
  name: string;
  role: string;
  participationType: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface FamilyMemberRecord {
  id: string;
  name: string;
  relationship: string;
  employer: string;
  phone: string;
  role: string;
  birthDate: string;
  location: string;
}

export interface CertificateRecord {
  id: string;
  name: string;
  date: string;
  description: string;
}

export interface PublicationRecord {
  id: string;
  title: string;
  journal: string;
  publishedAt: string;
  tier: string;
  authorPosition: string;
  impactFactor: string;
  link: string;
  description: string;
}

export interface PatentRecord {
  id: string;
  name: string;
  number: string;
  type: string;
  description: string;
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
  campusLeadership?: CampusLeadershipRecord[];
  campusActivities?: CampusActivityRecord[];
  familyMembers?: FamilyMemberRecord[];
  certificates?: CertificateRecord[];
  publications?: PublicationRecord[];
  patents?: PatentRecord[];
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
    ranking: "",
    college: "",
    majorCategory: "",
    mainCourses: "",
    description: ""
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
    description: "",
    industry: "",
    location: "",
    achievement: ""
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
    link: "",
    responsibilities: ""
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
    description: "",
    category: "",
    level: "",
    grade: ""
  };
}

export function createLanguageRecord(): LanguageRecord {
  return {
    id: recordId("language"),
    language: "",
    proficiency: "",
    qualification: "",
    listeningSpeaking: "",
    readingWriting: "",
    score: ""
  };
}

export function createCampusLeadershipRecord(): CampusLeadershipRecord {
  return { id: recordId("campus-leadership"), title: "", level: "", organization: "", startDate: "", endDate: "", description: "" };
}

export function createCampusActivityRecord(): CampusActivityRecord {
  return { id: recordId("campus-activity"), name: "", role: "", participationType: "", startDate: "", endDate: "", description: "" };
}

export function createFamilyMemberRecord(): FamilyMemberRecord {
  return { id: recordId("family-member"), name: "", relationship: "", employer: "", phone: "", role: "", birthDate: "", location: "" };
}

export function createCertificateRecord(): CertificateRecord {
  return { id: recordId("certificate"), name: "", date: "", description: "" };
}

export function createPublicationRecord(): PublicationRecord {
  return { id: recordId("publication"), title: "", journal: "", publishedAt: "", tier: "", authorPosition: "", impactFactor: "", link: "", description: "" };
}

export function createPatentRecord(): PatentRecord {
  return { id: recordId("patent"), name: "", number: "", type: "", description: "" };
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
      politicalStatus: "",
      identityDocumentType: "",
      identityDocumentNumber: "",
      ethnicity: "",
      maritalStatus: "",
      religion: "",
      heightCm: "",
      weightKg: "",
      homeCity: "",
      homeDistrict: "",
      schoolCity: "",
      schoolDistrict: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      hobbies: ""
    },
    education: [createEducationRecord()],
    workExperiences: [],
    projects: [],
    workSamples: [],
    awards: [],
    languages: [],
    campusLeadership: [],
    campusActivities: [],
    familyMembers: [],
    certificates: [],
    publications: [],
    patents: [],
    jobPreference: {
      targetRoles: "",
      preferredCities: "",
      availableDate: "",
      targetIndustries: "",
      expectedSalary: "",
      currentSalary: "",
      acceptsAdjustment: "",
      internalReferral: "",
      recruitmentSource: "",
      workYears: ""
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
    ranking: asString(source.ranking),
    college: asString(source.college),
    majorCategory: asString(source.majorCategory),
    mainCourses: asString(source.mainCourses),
    description: asString(source.description)
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
    description: asString(source.description),
    industry: asString(source.industry),
    location: asString(source.location),
    achievement: asString(source.achievement)
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
    link: asString(source.link),
    responsibilities: asString(source.responsibilities)
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
    description: asString(source.description),
    category: asString(source.category),
    level: asString(source.level),
    grade: asString(source.grade)
  };
}

function normalizeLanguage(value: unknown): LanguageRecord {
  const source = asRecord(value);
  return {
    ...createLanguageRecord(),
    id: asString(source.id) || recordId("language"),
    language: asString(source.language),
    proficiency: asString(source.proficiency),
    qualification: asString(source.qualification),
    listeningSpeaking: asString(source.listeningSpeaking),
    readingWriting: asString(source.readingWriting),
    score: asString(source.score)
  };
}

function normalizeCampusLeadership(value: unknown): CampusLeadershipRecord {
  const source = asRecord(value);
  return {
    ...createCampusLeadershipRecord(),
    id: asString(source.id) || recordId("campus-leadership"),
    title: asString(source.title),
    level: asString(source.level),
    organization: asString(source.organization),
    startDate: asString(source.startDate),
    endDate: asString(source.endDate),
    description: asString(source.description)
  };
}

function normalizeCampusActivity(value: unknown): CampusActivityRecord {
  const source = asRecord(value);
  return {
    ...createCampusActivityRecord(),
    id: asString(source.id) || recordId("campus-activity"),
    name: asString(source.name),
    role: asString(source.role),
    participationType: asString(source.participationType),
    startDate: asString(source.startDate),
    endDate: asString(source.endDate),
    description: asString(source.description)
  };
}

function normalizeFamilyMember(value: unknown): FamilyMemberRecord {
  const source = asRecord(value);
  return {
    ...createFamilyMemberRecord(),
    id: asString(source.id) || recordId("family-member"),
    name: asString(source.name),
    relationship: asString(source.relationship),
    employer: asString(source.employer),
    phone: asString(source.phone),
    role: asString(source.role),
    birthDate: asString(source.birthDate),
    location: asString(source.location)
  };
}

function normalizeCertificate(value: unknown): CertificateRecord {
  const source = asRecord(value);
  return {
    ...createCertificateRecord(),
    id: asString(source.id) || recordId("certificate"),
    name: asString(source.name),
    date: asString(source.date),
    description: asString(source.description)
  };
}

function normalizePublication(value: unknown): PublicationRecord {
  const source = asRecord(value);
  return {
    ...createPublicationRecord(),
    id: asString(source.id) || recordId("publication"),
    title: asString(source.title),
    journal: asString(source.journal),
    publishedAt: asString(source.publishedAt),
    tier: asString(source.tier),
    authorPosition: asString(source.authorPosition),
    impactFactor: asString(source.impactFactor),
    link: asString(source.link),
    description: asString(source.description)
  };
}

function normalizePatent(value: unknown): PatentRecord {
  const source = asRecord(value);
  return {
    ...createPatentRecord(),
    id: asString(source.id) || recordId("patent"),
    name: asString(source.name),
    number: asString(source.number),
    type: asString(source.type),
    description: asString(source.description)
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
  if (source.schemaVersion !== PROFILE_SCHEMA_VERSION && source.schemaVersion !== 3 && source.schemaVersion !== 2 && source.schemaVersion !== 1) {
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
      politicalStatus: asString(basic.politicalStatus),
      identityDocumentType: asString(basic.identityDocumentType),
      identityDocumentNumber: asString(basic.identityDocumentNumber),
      ethnicity: asString(basic.ethnicity),
      maritalStatus: asString(basic.maritalStatus),
      religion: asString(basic.religion),
      heightCm: asString(basic.heightCm),
      weightKg: asString(basic.weightKg),
      homeCity: asString(basic.homeCity),
      homeDistrict: asString(basic.homeDistrict),
      schoolCity: asString(basic.schoolCity),
      schoolDistrict: asString(basic.schoolDistrict),
      emergencyContactName: asString(basic.emergencyContactName),
      emergencyContactPhone: asString(basic.emergencyContactPhone),
      hobbies: asString(basic.hobbies)
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
    campusLeadership: Array.isArray(source.campusLeadership)
      ? source.campusLeadership.map(normalizeCampusLeadership)
      : [],
    campusActivities: Array.isArray(source.campusActivities)
      ? source.campusActivities.map(normalizeCampusActivity)
      : [],
    familyMembers: Array.isArray(source.familyMembers)
      ? source.familyMembers.map(normalizeFamilyMember)
      : [],
    certificates: Array.isArray(source.certificates)
      ? source.certificates.map(normalizeCertificate)
      : [],
    publications: Array.isArray(source.publications)
      ? source.publications.map(normalizePublication)
      : [],
    patents: Array.isArray(source.patents)
      ? source.patents.map(normalizePatent)
      : [],
    jobPreference: {
      targetRoles: asString(jobPreference.targetRoles),
      preferredCities: asString(jobPreference.preferredCities),
      availableDate: asString(jobPreference.availableDate),
      targetIndustries: asString(jobPreference.targetIndustries),
      expectedSalary: asString(jobPreference.expectedSalary),
      currentSalary: asString(jobPreference.currentSalary),
      acceptsAdjustment: asString(jobPreference.acceptsAdjustment),
      internalReferral: asString(jobPreference.internalReferral),
      recruitmentSource: asString(jobPreference.recruitmentSource),
      workYears: asString(jobPreference.workYears)
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

  (profile.campusLeadership ?? []).forEach((record, index) => {
    if (!hasMeaningfulFields(record)) return;
    items.push(
      required(`campusLeadership.${index}.title`, `在校职务 ${index + 1} · 职务`, record.title),
      required(`campusLeadership.${index}.description`, `在校职务 ${index + 1} · 描述`, record.description)
    );
  });

  (profile.campusActivities ?? []).forEach((record, index) => {
    if (!hasMeaningfulFields(record)) return;
    items.push(
      required(`campusActivities.${index}.name`, `校园活动 ${index + 1} · 名称`, record.name),
      required(`campusActivities.${index}.description`, `校园活动 ${index + 1} · 描述`, record.description)
    );
  });

  (profile.familyMembers ?? []).forEach((record, index) => {
    if (!hasMeaningfulFields(record)) return;
    items.push(
      required(`familyMembers.${index}.name`, `家庭成员 ${index + 1} · 姓名`, record.name),
      required(`familyMembers.${index}.relationship`, `家庭成员 ${index + 1} · 关系`, record.relationship)
    );
  });

  (profile.certificates ?? []).forEach((record, index) => {
    if (!hasMeaningfulFields(record)) return;
    items.push(required(`certificates.${index}.name`, `证书 ${index + 1} · 名称`, record.name));
  });

  (profile.publications ?? []).forEach((record, index) => {
    if (!hasMeaningfulFields(record)) return;
    items.push(required(`publications.${index}.title`, `论文期刊 ${index + 1} · 名称`, record.title));
  });

  (profile.patents ?? []).forEach((record, index) => {
    if (!hasMeaningfulFields(record)) return;
    items.push(required(`patents.${index}.name`, `专利 ${index + 1} · 名称`, record.name));
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
  const emergencyPhone = profile.basic.emergencyContactPhone?.trim() ?? "";
  const identityType = profile.basic.identityDocumentType?.trim() ?? "";
  const identityNumber = profile.basic.identityDocumentNumber?.trim() ?? "";

  if (phone && !/^[+\d][\d\s-]{6,19}$/.test(phone)) {
    errors["basic.phone"] = "请输入有效的手机号码，可包含国家或地区区号。";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors["basic.email"] = "请输入有效的邮箱地址。";
  }
  if (emergencyPhone && !/^[+\d][\d\s-]{6,19}$/.test(emergencyPhone)) {
    errors["basic.emergencyContactPhone"] = "请输入有效的紧急联系人电话。";
  }
  if (identityType && !identityNumber) {
    errors["basic.identityDocumentNumber"] = "选择证件类型后，请填写证件号码。";
  }
  if (identityNumber && !identityType) {
    errors["basic.identityDocumentType"] = "填写证件号码后，请选择证件类型。";
  }
  if (identityNumber && (identityNumber.length < 4 || identityNumber.length > 40 || /[\u0000-\u001f\u007f]/.test(identityNumber))) {
    errors["basic.identityDocumentNumber"] = "证件号码应为 4–40 个有效字符。";
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
  (profile.campusLeadership ?? []).forEach((record, index) => {
    if (record.startDate && record.endDate && record.startDate > record.endDate) {
      errors[`campusLeadership.${index}.endDate`] = "结束时间不能早于开始时间。";
    }
  });
  (profile.campusActivities ?? []).forEach((record, index) => {
    if (record.startDate && record.endDate && record.startDate > record.endDate) {
      errors[`campusActivities.${index}.endDate`] = "结束时间不能早于开始时间。";
    }
  });
  (profile.familyMembers ?? []).forEach((record, index) => {
    const memberPhone = record.phone.trim();
    if (memberPhone && !/^[+\d][\d\s-]{6,19}$/.test(memberPhone)) {
      errors[`familyMembers.${index}.phone`] = "请输入有效的联系电话。";
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
