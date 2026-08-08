import {
  ATS_ADAPTER_SCHEMA_VERSION,
  type AtsAdapterFieldRule,
  type AtsAdapterManifest,
  type AtsAdapterRepeatableRule,
  type AtsControlCapability,
  type AtsFieldDecision,
  type AtsFieldIntent,
  type AtsVerificationKind
} from "../../../adapter-sdk";
import type { PageControlRole } from "../../../bridge/protocol";

export const FEISHU_RECRUITING_FAMILY_ID = "feishu-recruiting";

const FEISHU_RECRUITING_HOST_SUFFIXES = ["jobs.feishu.cn", "jobs.f.mioffice.cn"] as const;
const FEISHU_APPLICATION_PATH = /^\/(?:index|internship|[A-Za-z0-9_-]+)\/resume\/[A-Za-z0-9_-]+\/apply\/?$/;

/**
 * Production routing is intentionally narrower than family detection. It only
 * opts reviewed Feishu application URLs into K5; the manifest then performs a
 * second, semantic fail-closed check after the privacy-safe page scan.
 */
export function isFeishuRecruitingApplicationUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    const trustedHost = FEISHU_RECRUITING_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (url.port === "" || url.port === "443")
      && trustedHost
      && FEISHU_APPLICATION_PATH.test(url.pathname);
  }
  catch {
    return false;
  }
}

function field(
  id: string,
  semanticKeys: string[],
  semanticLabels: string[],
  roles: PageControlRole[],
  capability: AtsControlCapability,
  decision: AtsFieldDecision,
  intent: AtsFieldIntent,
  verification: AtsVerificationKind
): AtsAdapterFieldRule {
  return { id, semanticKeys, semanticLabels, roles, capability, decision, intent, verification };
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
    [semanticKey],
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
    [semanticKey],
    semanticLabels,
    ["combobox", "listbox"],
    "searchable-combobox",
    decision,
    { kind: "profile-field", pathPattern },
    "selected-option"
  );
}

function monthField(id: string, semanticKey: string, semanticLabels: string[], pathPattern: string) {
  return field(
    id,
    [semanticKey],
    semanticLabels,
    ["textbox"],
    "month",
    "fill",
    { kind: "profile-field", pathPattern },
    "normalized-equality"
  );
}

function rangeField(
  id: string,
  semanticKey: string,
  semanticLabels: string[],
  collection: "education" | "workExperiences" | "projects"
) {
  return field(
    id,
    [semanticKey],
    semanticLabels,
    ["textbox"],
    "date-range",
    "fill",
    {
      kind: "profile-range",
      startPathPattern: `${collection}.{index}.startDate`,
      endPathPattern: `${collection}.{index}.endDate`
    },
    "normalized-equality"
  );
}

function manualField(id: string, semanticKey: string, semanticLabels: string[], roles: PageControlRole[]) {
  return field(id, [semanticKey], semanticLabels, roles, "text", "exclude", { kind: "manual" }, "none");
}

function repeatable(
  collection: AtsAdapterRepeatableRule["collection"],
  sectionSemanticKey: string,
  addControlLabels: string[]
): AtsAdapterRepeatableRule {
  return {
    collection,
    sectionSemanticKeys: [sectionSemanticKey],
    recordSemanticPrefixes: [`${sectionSemanticKey}[]`],
    addControlLabels,
    saveControlLabels: ["保存", "完成"],
    maximumCreatesPerRun: 10
  };
}

/**
 * Selector-free migration of the reviewed Feishu ATS family declarations.
 * Company names and host-specific overrides remain Ground Truth concerns; one
 * family manifest covers compatible Feishu tenants and fails closed elsewhere.
 */
export const feishuRecruitingManifest: AtsAdapterManifest = {
  schemaVersion: ATS_ADAPTER_SCHEMA_VERSION,
  family: { id: FEISHU_RECRUITING_FAMILY_ID, version: "1" },
  detection: {
    httpsOnly: true,
    exactHosts: [],
    hostSuffixes: [...FEISHU_RECRUITING_HOST_SUFFIXES],
    pathPrefixes: ["/index/resume/", "/internship/resume/", "/:id/resume/"],
    semanticMarkers: [
      "basic_info.name",
      "basic_info.mobile",
      "basic_info.email",
      "education_list[].school",
      "self_evaluation.self_evaluation"
    ],
    semanticLabelMarkers: ["姓名", "手机号码", "手机号", "邮箱", "学校名称", "项目名称", "自我评价"],
    minimumSemanticMarkers: 2
  },
  fields: [
    textField("basic-name", "basic_info.name", ["姓名"], "basic.fullName"),
    textField("basic-mobile", "basic_info.mobile", ["手机号码", "手机号"], "basic.phone"),
    textField("basic-email", "basic_info.email", ["邮箱"], "basic.email"),
    textField("basic-age", "basic_info.age", ["年龄"], "derived.age", "confirm"),
    searchableField("basic-gender", "basic_info.gender", ["性别"], "basic.gender", "confirm"),
    searchableField("basic-nationality", "basic_info.nationality", ["国籍（地区）", "国籍"], "basic.nationality", "confirm"),
    searchableField("basic-hometown", "basic_info.hometown_city", ["家乡"], "basic.hometown", "confirm"),
    manualField("basic-identity", "basic_info.identification", ["个人证件"], ["textbox", "combobox", "listbox"]),
    manualField("basic-preferred-cities", "basic_info.preferred_city_list", ["期望工作地点"], ["textbox", "combobox", "listbox"]),

    textField("education-school", "education_list[].school", ["学校名称"], "education.{index}.school"),
    searchableField("education-degree", "education_list[].degree", ["学历"], "education.{index}.degree"),
    textField("education-major", "education_list[].field_of_study", ["专业"], "education.{index}.major"),
    monthField("education-start", "education_list[].start_end_time.start", ["入学时间"], "education.{index}.startDate"),
    monthField("education-end", "education_list[].start_end_time.end", ["毕业时间"], "education.{index}.endDate"),
    rangeField("education-range", "education_list[].start_end_time", ["起止时间"], "education"),
    searchableField("education-type", "education_list[].education_type", ["学历类型"], "education.{index}.educationType"),

    textField("internship-company", "internship_list[].company", ["公司名称"], "workExperiences.{index}.company"),
    textField("internship-role", "internship_list[].title", ["职位名称"], "workExperiences.{index}.role"),
    monthField("internship-start", "internship_list[].start_end_time.start", ["开始时间"], "workExperiences.{index}.startDate"),
    monthField("internship-end", "internship_list[].start_end_time.end", ["结束时间"], "workExperiences.{index}.endDate"),
    rangeField("internship-range", "internship_list[].start_end_time", ["起止时间"], "workExperiences"),
    textField("internship-description", "internship_list[].desc", ["描述"], "workExperiences.{index}.description"),

    textField("works-link", "works_list[].link", ["作品链接"], "workSamples.{index}.link"),
    textField("works-description", "works_list[].desc", ["描述"], "workSamples.{index}.description"),

    textField("project-name", "project_list[].name", ["项目名称"], "projects.{index}.name"),
    textField("project-role", "project_list[].role", ["项目角色"], "projects.{index}.role"),
    monthField("project-start", "project_list[].start_end_time.start", ["开始时间"], "projects.{index}.startDate"),
    monthField("project-end", "project_list[].start_end_time.end", ["结束时间"], "projects.{index}.endDate"),
    rangeField("project-range", "project_list[].start_end_time", ["起止时间"], "projects"),
    textField("project-link", "project_list[].link", ["项目链接"], "projects.{index}.link"),
    textField("project-description", "project_list[].desc", ["描述"], "projects.{index}.description"),

    textField("award-name", "award_list[].name", ["获奖名称"], "awards.{index}.name"),
    monthField("award-date", "award_list[].date", ["获奖时间"], "awards.{index}.date"),
    textField("award-description", "award_list[].desc", ["描述"], "awards.{index}.description"),
    searchableField("language-name", "language_list[].language", ["语言"], "languages.{index}.language"),
    searchableField("language-level", "language_list[].proficiency", ["精通程度"], "languages.{index}.proficiency"),
    textField("self-evaluation", "self_evaluation.self_evaluation", ["自我评价"], "answers.selfEvaluation"),
    field(
      "resume-attachment",
      ["attachment_resume_list.attachment_resume"],
      ["简历附件"],
      ["textbox"],
      "file-upload",
      "confirm",
      { kind: "saved-resume" },
      "attachment-gate"
    )
  ],
  repeatables: [
    repeatable("education", "education_list", ["新增教育经历", "添加教育经历"]),
    repeatable("workExperiences", "internship_list", ["新增实习经历", "添加实习经历"]),
    repeatable("workSamples", "works_list", ["新增作品", "添加作品"]),
    repeatable("projects", "project_list", ["新增项目经历", "添加项目经历"]),
    repeatable("awards", "award_list", ["新增获奖经历", "添加获奖经历"]),
    repeatable("languages", "language_list", ["新增语言能力", "添加语言能力"])
  ],
  exclusions: {
    finalSubmitLabels: ["提交简历", "提交申请", "确认投递", "立即申请", "最终提交"]
  }
};
