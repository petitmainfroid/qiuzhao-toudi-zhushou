import {
  ATS_ADAPTER_SCHEMA_VERSION,
  type AtsAdapterFieldRule,
  type AtsAdapterManifest,
  type AtsControlCapability,
  type AtsFieldDecision,
  type AtsFieldIntent,
  type AtsVerificationKind
} from "../../../adapter-sdk";
import type { PageControlRole } from "../../../bridge/protocol";

export const MOKA_FAMILY_ID = "moka";

const MOKA_HOST = "app.mokahr.com";
const MOKA_CAMPUS_PATH = /^\/campus_apply\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{1,80}\/?$/;

/**
 * The public Moka contract proves the campus tenant path and candidate resume
 * hash route. The manifest still requires technical field markers after K1.
 */
export function isMokaCandidateResumeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const hashPath = url.hash.split("?", 1)[0];
    return url.protocol === "https:"
      && url.hostname.toLowerCase() === MOKA_HOST
      && !url.username
      && !url.password
      && (url.port === "" || url.port === "443")
      && MOKA_CAMPUS_PATH.test(url.pathname)
      && hashPath === "#/candidateHome/resume";
  }
  catch {
    return false;
  }
}

function field(
  id: string,
  semanticKey: string,
  semanticLabels: string[],
  roles: PageControlRole[],
  capability: AtsControlCapability,
  decision: AtsFieldDecision,
  intent: AtsFieldIntent,
  verification: AtsVerificationKind
): AtsAdapterFieldRule {
  return { id, semanticKeys: [semanticKey], semanticLabels, roles, capability, decision, intent, verification };
}

function textField(
  id: string,
  semanticKey: string,
  semanticLabels: string[],
  pathPattern: string,
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKey,
    semanticLabels,
    ["textbox"],
    "text",
    decision,
    { kind: "profile-field", pathPattern },
    "normalized-equality"
  );
}

function searchableField(
  id: string,
  semanticKey: string,
  semanticLabels: string[],
  pathPattern: string,
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKey,
    semanticLabels,
    ["combobox", "listbox"],
    "searchable-combobox",
    decision,
    { kind: "profile-field", pathPattern },
    "selected-option"
  );
}

function dateField(
  id: string,
  semanticKey: string,
  semanticLabels: string[],
  pathPattern: string,
  capability: "date" | "month",
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKey,
    semanticLabels,
    ["textbox"],
    capability,
    decision,
    { kind: "profile-field", pathPattern },
    "normalized-equality"
  );
}

function manualField(
  id: string,
  semanticKey: string,
  semanticLabels: string[],
  roles: PageControlRole[] = ["textbox", "combobox", "listbox"]
) {
  return field(id, semanticKey, semanticLabels, roles, "text", "exclude", { kind: "manual" }, "none");
}

/**
 * Conservative field-only migration of Moka's public standard-resume contract.
 * Group and field ids are joined into normalized semantic keys. The public
 * evidence does not prove logged-in add/save DOM controls, so this version does
 * not declare repeatable lifecycle actions or a resume attachment.
 */
export const mokaManifest: AtsAdapterManifest = {
  schemaVersion: ATS_ADAPTER_SCHEMA_VERSION,
  family: { id: MOKA_FAMILY_ID, version: "1" },
  detection: {
    httpsOnly: true,
    exactHosts: [MOKA_HOST],
    hostSuffixes: [],
    pathPrefixes: ["/campus_apply/"],
    semanticMarkers: [
      "basicinfo.name",
      "basicinfo.phone",
      "educationinfo[].school",
      "practiceinfo[].company",
      "projectinfo[].projectname",
      "selfdescription.personal"
    ],
    semanticLabelMarkers: [
      "姓名", "请输入手机号", "手机号码", "邮箱", "请输入就读学校", "学校名称", "请输入专业名称", "项目名称"
    ],
    minimumSemanticMarkers: 3
  },
  fields: [
    textField("basic-name", "basicinfo.name", ["姓名"], "basic.fullName"),
    textField("basic-phone", "basicinfo.phone", ["请输入手机号", "手机号码", "手机号"], "basic.phone"),
    textField("basic-email", "basicinfo.email", ["邮箱", "电子邮箱"], "basic.email"),
    searchableField("basic-gender", "basicinfo.gender", ["性别"], "basic.gender", "confirm"),
    dateField("basic-birth-date", "basicinfo.birthdate", ["出生日期", "出生年月"], "basic.birthDate", "date", "confirm"),
    textField("basic-location", "basicinfo.location", ["当前城市", "现居城市", "所在城市"], "basic.currentCity"),
    manualField("basic-experience", "basicinfo.experience", ["工作年限"]),
    manualField("basic-highest-degree", "basicinfo.academicdegree", ["最高学历"]),
    manualField("basic-last-company", "basicinfo.lastcompany", ["最近一家公司"]),
    manualField("basic-citizen-id", "basicinfo.citizenid", ["证件号码", "身份证号"], ["textbox"]),

    manualField("job-current-salary", "jobintention.salary", ["目前薪资", "当前薪资"]),
    manualField("job-expected-salary", "jobintention.aimsalary", ["期望薪资"]),
    textField("job-expected-location", "jobintention.forwardlocation", ["期望工作地点", "期望城市"], "jobPreference.preferredCities", "confirm"),

    manualField("work-start", "experienceinfo[].startdate", ["开始时间"], ["textbox"]),
    manualField("work-end", "experienceinfo[].enddate", ["结束时间"], ["textbox"]),
    manualField("work-company", "experienceinfo[].company", ["公司名称"], ["textbox"]),
    manualField("work-title", "experienceinfo[].title", ["职位名称"], ["textbox"]),
    manualField("work-summary", "experienceinfo[].summary", ["工作描述", "描述"], ["textbox"]),

    dateField("education-start", "educationinfo[].startdate", ["开始时间", "入学时间"], "education.{index}.startDate", "month"),
    dateField("education-end", "educationinfo[].enddate", ["结束时间", "毕业时间"], "education.{index}.endDate", "month"),
    textField("education-school", "educationinfo[].school", ["请输入就读学校", "学校名称", "就读学校"], "education.{index}.school"),
    textField("education-major", "educationinfo[].speciality", ["请输入专业名称", "专业名称", "专业"], "education.{index}.major"),
    searchableField("education-degree", "educationinfo[].academicdegree", ["学历", "学位"], "education.{index}.degree"),

    dateField("internship-start", "practiceinfo[].startdate", ["开始时间"], "workExperiences.{index}.startDate", "month"),
    dateField("internship-end", "practiceinfo[].enddate", ["结束时间"], "workExperiences.{index}.endDate", "month"),
    textField("internship-company", "practiceinfo[].company", ["公司名称"], "workExperiences.{index}.company"),
    textField("internship-title", "practiceinfo[].title", ["职位名称"], "workExperiences.{index}.role"),
    textField("internship-summary", "practiceinfo[].summary", ["工作描述", "描述"], "workExperiences.{index}.description"),

    dateField("project-start", "projectinfo[].startdate", ["开始时间"], "projects.{index}.startDate", "month"),
    dateField("project-end", "projectinfo[].enddate", ["结束时间"], "projects.{index}.endDate", "month"),
    textField("project-name", "projectinfo[].projectname", ["项目名称"], "projects.{index}.name"),
    textField("project-title", "projectinfo[].title", ["项目角色", "担任角色"], "projects.{index}.role"),
    textField("project-description", "projectinfo[].projectdescription", ["项目描述"], "projects.{index}.description"),
    manualField("project-responsibilities", "projectinfo[].responsibilities", ["项目职责"], ["textbox"]),

    textField("language-name", "languageinfo[].language", ["语言", "语言名称"], "languages.{index}.language"),
    searchableField("language-level", "languageinfo[].level", ["语言水平", "熟练程度"], "languages.{index}.proficiency"),
    manualField("language-listen-speak", "languageinfo[].listenandspeak", ["听说能力"]),
    manualField("language-read-write", "languageinfo[].readandwrite", ["读写能力"]),

    textField("self-description", "selfdescription.personal", ["自我评价", "个人评价", "个人优势"], "answers.selfEvaluation"),
    dateField("award-date", "awardinfo[].awarddate", ["获奖时间"], "awards.{index}.date", "date"),
    textField("award-name", "awardinfo[].awardname", ["获奖名称", "奖项名称"], "awards.{index}.name")
  ],
  repeatables: [],
  exclusions: {
    finalSubmitLabels: ["提交申请", "投递申请", "确认投递", "立即申请", "最终提交"]
  }
};
