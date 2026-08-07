import type {
  AtsFamilyTemplate,
  AtsTemplateFieldRule,
  AtsTemplateRepeatableRule
} from "../../templateContracts";
import { finalSubmitExclusions } from "../generic";
import { FEISHU_RECRUITING_FAMILY_ID } from "./detector";

function rule(
  id: string,
  semanticKey: string,
  profilePathPattern: string | null,
  action: AtsTemplateFieldRule["action"],
  driverHint: AtsTemplateFieldRule["driverHint"] = "native",
  verification: AtsTemplateFieldRule["verification"] = "normalized-equality"
): AtsTemplateFieldRule {
  return {
    id,
    semanticKeys: [semanticKey],
    profilePathPattern,
    action,
    driverHint,
    verification,
    ...(action === "exclude" ? { exclusionReason: "unsupported-control" as const } : {})
  };
}

function repeatableRule(
  group: AtsTemplateRepeatableRule["group"],
  sectionId: string,
  pathAliases: string[],
  sectionSelectors: string[],
  addLabel: string
): AtsTemplateRepeatableRule {
  return {
    group,
    sectionId,
    pathAliases,
    sectionSelectors,
    addControlSelectors: [".formOperate-addBtn", ".createFormSection-addBtn"],
    recordRootSelectors: ["[data-repeatable-record]", ".record", ".resumeEditForm-item"],
    saveControlSelectors: ["button", "[role='button']", ".formOperate-saveBtn", ".resumeEditForm-saveBtn"],
    addLabels: [addLabel, "添加", "新增"],
    saveLabels: ["保存", "完成"],
    maximumCreatesPerRun: 10
  };
}

export const feishuRecruitingTemplate: AtsFamilyTemplate = {
  familyId: FEISHU_RECRUITING_FAMILY_ID,
  version: "1",
  fieldRules: [
    rule("basic-name", "basic_info.name", "basic.fullName", "fill"),
    rule("basic-mobile", "basic_info.mobile", "basic.phone", "fill"),
    rule("basic-email", "basic_info.email", "basic.email", "fill"),
    rule("basic-age", "basic_info.age", "derived.age", "confirm"),
    rule("basic-gender", "basic_info.gender", "basic.gender", "confirm", "feishu-select", "selected-option"),
    rule("basic-nationality", "basic_info.nationality", "basic.nationality", "confirm", "feishu-select", "selected-option"),
    rule("basic-hometown", "basic_info.hometown_city", "basic.hometown", "confirm", "feishu-select", "selected-option"),
    rule("basic-identity", "basic_info.identification", "basic.identityDocumentNumber", "confirm"),
    rule("basic-preferred-cities", "basic_info.preferred_city_list", "jobPreference.preferredCities", "fill", "feishu-select", "selected-option"),

    rule("education-school", "education_list[].school", "education.{index}.school", "fill"),
    rule("education-degree", "education_list[].degree", "education.{index}.degree", "fill", "feishu-select", "selected-option"),
    rule("education-major", "education_list[].field_of_study", "education.{index}.major", "fill"),
    rule("education-start", "education_list[].start_end_time.start", "education.{index}.startDate", "fill", "feishu-date-range"),
    rule("education-end", "education_list[].start_end_time.end", "education.{index}.endDate", "fill", "feishu-date-range"),
    {
      ...rule("education-range", "education_list[].start_end_time", "education.{index}.startDate", "fill", "feishu-date-range"),
      companionProfilePathPattern: "education.{index}.endDate"
    },
    rule("education-type", "education_list[].education_type", "education.{index}.educationType", "fill", "feishu-select", "selected-option"),

    rule("internship-company", "internship_list[].company", "workExperiences.{index}.company", "fill"),
    rule("internship-role", "internship_list[].title", "workExperiences.{index}.role", "fill"),
    rule("internship-start", "internship_list[].start_end_time.start", "workExperiences.{index}.startDate", "fill", "feishu-date-range"),
    rule("internship-end", "internship_list[].start_end_time.end", "workExperiences.{index}.endDate", "fill", "feishu-date-range"),
    {
      ...rule("internship-range", "internship_list[].start_end_time", "workExperiences.{index}.startDate", "fill", "feishu-date-range"),
      companionProfilePathPattern: "workExperiences.{index}.endDate"
    },
    rule("internship-description", "internship_list[].desc", "workExperiences.{index}.description", "fill"),

    rule("works-link", "works_list[].link", "workSamples.{index}.link", "fill"),
    rule("works-attachment", "works_list[].attachment", null, "exclude", "native", "none"),
    rule("works-description", "works_list[].desc", "workSamples.{index}.description", "fill"),

    rule("project-name", "project_list[].name", "projects.{index}.name", "fill"),
    rule("project-role", "project_list[].role", "projects.{index}.role", "fill"),
    rule("project-start", "project_list[].start_end_time.start", "projects.{index}.startDate", "fill", "feishu-date-range"),
    rule("project-end", "project_list[].start_end_time.end", "projects.{index}.endDate", "fill", "feishu-date-range"),
    {
      ...rule("project-range", "project_list[].start_end_time", "projects.{index}.startDate", "fill", "feishu-date-range"),
      companionProfilePathPattern: "projects.{index}.endDate"
    },
    rule("project-link", "project_list[].link", "projects.{index}.link", "fill"),
    rule("project-description", "project_list[].desc", "projects.{index}.description", "fill"),

    rule("award-name", "award_list[].name", "awards.{index}.name", "fill"),
    rule("award-date", "award_list[].date", "awards.{index}.date", "fill", "feishu-select", "selected-option"),
    rule("award-description", "award_list[].desc", "awards.{index}.description", "fill"),
    rule("language-name", "language_list[].language", "languages.{index}.language", "fill", "feishu-select", "selected-option"),
    rule("language-level", "language_list[].proficiency", "languages.{index}.proficiency", "fill", "feishu-select", "selected-option"),
    rule("self-evaluation", "self_evaluation.self_evaluation", "answers.selfEvaluation", "fill"),
    rule("resume-attachment", "attachment_resume_list.attachment_resume", null, "exclude", "native", "none")
  ],
  sections: [
    { id: "resume", labels: ["简历"] },
    { id: "basic", labels: ["基本信息"] },
    { id: "education", labels: ["教育经历"], repeatableGroup: "education" },
    { id: "internship", labels: ["实习经历"], repeatableGroup: "workExperiences" },
    { id: "works", labels: ["作品"], repeatableGroup: "workSamples" },
    { id: "projects", labels: ["项目经历"], repeatableGroup: "projects" },
    { id: "awards", labels: ["获奖"], repeatableGroup: "awards" },
    { id: "languages", labels: ["语言能力"], repeatableGroup: "languages" },
    { id: "self-evaluation", labels: ["自我评价"] }
  ],
  repeatableRules: [
    repeatableRule("education", "education", ["education_list", "education"], [".resumeEditForm-education"], "新增教育经历"),
    repeatableRule("workExperiences", "internship", ["internship_list", "internship"], [".resumeEditForm-internship"], "新增实习经历"),
    repeatableRule("workSamples", "works", ["works_list", "works", "work"], [".resumeEditForm-work", ".resumeEditForm-works"], "新增作品"),
    repeatableRule("projects", "projects", ["project_list", "project"], [".resumeEditForm-project"], "新增项目经历"),
    repeatableRule("awards", "awards", ["award_list", "award"], [".resumeEditForm-award"], "新增获奖经历"),
    repeatableRule("languages", "languages", ["language_list", "language"], [".resumeEditForm-language"], "新增语言能力")
  ],
  finalSubmitExclusions
};
