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

function field(
  id: string,
  semanticKeys: string[],
  roles: PageControlRole[],
  capability: AtsControlCapability,
  decision: AtsFieldDecision,
  intent: AtsFieldIntent,
  verification: AtsVerificationKind
): AtsAdapterFieldRule {
  return { id, semanticKeys, roles, capability, decision, intent, verification };
}

function textField(id: string, semanticKey: string, pathPattern: string, decision: AtsFieldDecision = "fill") {
  return field(
    id,
    [semanticKey],
    ["textbox"],
    "text",
    decision,
    { kind: "profile-field", pathPattern },
    "normalized-equality"
  );
}

function searchableField(id: string, semanticKey: string, pathPattern: string, decision: AtsFieldDecision = "fill") {
  return field(
    id,
    [semanticKey],
    ["combobox", "listbox"],
    "searchable-combobox",
    decision,
    { kind: "profile-field", pathPattern },
    "selected-option"
  );
}

function monthField(id: string, semanticKey: string, pathPattern: string) {
  return field(
    id,
    [semanticKey],
    ["textbox"],
    "month",
    "fill",
    { kind: "profile-field", pathPattern },
    "normalized-equality"
  );
}

function rangeField(id: string, semanticKey: string, collection: "education" | "workExperiences" | "projects") {
  return field(
    id,
    [semanticKey],
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

function manualField(id: string, semanticKey: string, roles: PageControlRole[]) {
  return field(id, [semanticKey], roles, "text", "exclude", { kind: "manual" }, "none");
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
    hostSuffixes: ["jobs.feishu.cn", "jobs.f.mioffice.cn"],
    pathPrefixes: ["/index/resume/", "/internship/resume/", "/:id/resume/"],
    semanticMarkers: [
      "basic_info.name",
      "basic_info.mobile",
      "basic_info.email",
      "education_list[].school",
      "self_evaluation.self_evaluation"
    ],
    minimumSemanticMarkers: 2
  },
  fields: [
    textField("basic-name", "basic_info.name", "basic.fullName"),
    textField("basic-mobile", "basic_info.mobile", "basic.phone"),
    textField("basic-email", "basic_info.email", "basic.email"),
    textField("basic-age", "basic_info.age", "derived.age", "confirm"),
    searchableField("basic-gender", "basic_info.gender", "basic.gender", "confirm"),
    searchableField("basic-nationality", "basic_info.nationality", "basic.nationality", "confirm"),
    searchableField("basic-hometown", "basic_info.hometown_city", "basic.hometown", "confirm"),
    manualField("basic-identity", "basic_info.identification", ["textbox", "combobox", "listbox"]),
    manualField("basic-preferred-cities", "basic_info.preferred_city_list", ["textbox", "combobox", "listbox"]),

    textField("education-school", "education_list[].school", "education.{index}.school"),
    searchableField("education-degree", "education_list[].degree", "education.{index}.degree"),
    textField("education-major", "education_list[].field_of_study", "education.{index}.major"),
    monthField("education-start", "education_list[].start_end_time.start", "education.{index}.startDate"),
    monthField("education-end", "education_list[].start_end_time.end", "education.{index}.endDate"),
    rangeField("education-range", "education_list[].start_end_time", "education"),
    searchableField("education-type", "education_list[].education_type", "education.{index}.educationType"),

    textField("internship-company", "internship_list[].company", "workExperiences.{index}.company"),
    textField("internship-role", "internship_list[].title", "workExperiences.{index}.role"),
    monthField("internship-start", "internship_list[].start_end_time.start", "workExperiences.{index}.startDate"),
    monthField("internship-end", "internship_list[].start_end_time.end", "workExperiences.{index}.endDate"),
    rangeField("internship-range", "internship_list[].start_end_time", "workExperiences"),
    textField("internship-description", "internship_list[].desc", "workExperiences.{index}.description"),

    textField("works-link", "works_list[].link", "workSamples.{index}.link"),
    textField("works-description", "works_list[].desc", "workSamples.{index}.description"),

    textField("project-name", "project_list[].name", "projects.{index}.name"),
    textField("project-role", "project_list[].role", "projects.{index}.role"),
    monthField("project-start", "project_list[].start_end_time.start", "projects.{index}.startDate"),
    monthField("project-end", "project_list[].start_end_time.end", "projects.{index}.endDate"),
    rangeField("project-range", "project_list[].start_end_time", "projects"),
    textField("project-link", "project_list[].link", "projects.{index}.link"),
    textField("project-description", "project_list[].desc", "projects.{index}.description"),

    textField("award-name", "award_list[].name", "awards.{index}.name"),
    monthField("award-date", "award_list[].date", "awards.{index}.date"),
    textField("award-description", "award_list[].desc", "awards.{index}.description"),
    searchableField("language-name", "language_list[].language", "languages.{index}.language"),
    searchableField("language-level", "language_list[].proficiency", "languages.{index}.proficiency"),
    textField("self-evaluation", "self_evaluation.self_evaluation", "answers.selfEvaluation"),
    field(
      "resume-attachment",
      ["attachment_resume_list.attachment_resume"],
      ["textbox"],
      "file-upload",
      "confirm",
      { kind: "saved-resume" },
      "attachment-gate"
    )
  ],
  repeatables: [
    repeatable("education", "education_list", ["新增教育经历", "添加教育经历", "添加", "新增"]),
    repeatable("workExperiences", "internship_list", ["新增实习经历", "添加实习经历", "添加", "新增"]),
    repeatable("workSamples", "works_list", ["新增作品", "添加作品", "添加", "新增"]),
    repeatable("projects", "project_list", ["新增项目经历", "添加项目经历", "添加", "新增"]),
    repeatable("awards", "award_list", ["新增获奖经历", "添加获奖经历", "添加", "新增"]),
    repeatable("languages", "language_list", ["新增语言能力", "添加语言能力", "添加", "新增"])
  ],
  exclusions: {
    finalSubmitLabels: ["提交简历", "提交申请", "确认投递", "立即申请", "最终提交"]
  }
};
