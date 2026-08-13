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

export const CTRIP_CAREERS_FAMILY_ID = "ctrip-careers-custom";

const CTRIP_CAREERS_HOST = "job.ctrip.com";
const CTRIP_EDIT_CV_HASH = /^#\/experienced\/personal-homepage\/editCV(?:\?tabindex=\d+)?$/;

/** Routes only the reviewed experienced-candidate edit-CV SPA surface. */
export function isCtripExperiencedEditCvUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:"
      && url.hostname.toLowerCase() === CTRIP_CAREERS_HOST
      && !url.username
      && !url.password
      && (url.port === "" || url.port === "443")
      && url.pathname === "/"
      && CTRIP_EDIT_CV_HASH.test(url.hash);
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
  semanticKeys: string[],
  semanticLabels: string[],
  pathPattern: string,
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKeys,
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
  semanticKeys: string[],
  semanticLabels: string[],
  pathPattern: string,
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKeys,
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
  semanticKeys: string[],
  semanticLabels: string[],
  pathPattern: string,
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKeys,
    semanticLabels,
    ["textbox"],
    "date",
    decision,
    { kind: "profile-field", pathPattern },
    "normalized-equality"
  );
}

function manualField(
  id: string,
  semanticKeys: string[],
  semanticLabels: string[],
  roles: PageControlRole[] = ["textbox", "combobox", "listbox", "radio", "checkbox"]
) {
  return field(id, semanticKeys, semanticLabels, roles, "text", "exclude", { kind: "manual" }, "none");
}

function repeated(collection: string, fieldName: string): string[] {
  return [`${collection}[].${fieldName}`, fieldName];
}

/**
 * Selector-free clean-room declaration of Ctrip's public edit-CV bundle
 * contract. All 28 logical controls have a decision, while only 14 are mapped
 * because the remaining controls require unsafe parse/upload semantics,
 * unavailable profile fields, full-date precision, or unproved lifecycle UI.
 */
export const ctripCareersManifest: AtsAdapterManifest = {
  schemaVersion: ATS_ADAPTER_SCHEMA_VERSION,
  family: { id: CTRIP_CAREERS_FAMILY_ID, version: "1" },
  detection: {
    httpsOnly: true,
    exactHosts: [CTRIP_CAREERS_HOST],
    hostSuffixes: [],
    pathPrefixes: ["/"],
    semanticMarkers: [
      "name",
      "mobile",
      "email",
      "recruiteducationlist[].highestdegree",
      "recruitworkinglist[].companyname",
      "evaluation"
    ],
    semanticLabelMarkers: [
      "请输入姓名", "请输入手机号", "请输入邮箱", "请选择出生日期", "请输入居住城市", "请输入专业"
    ],
    minimumSemanticMarkers: 3
  },
  fields: [
    manualField("resume-import", ["resumeimportfile"], ["导入简历", "上传简历"], ["textbox"]),

    textField("basic-name", ["name"], ["请输入姓名", "姓名"], "basic.fullName"),
    textField("basic-mobile", ["mobile"], ["请输入手机号", "手机号", "手机号码"], "basic.phone", "confirm"),
    textField("basic-email", ["email"], ["请输入邮箱", "邮箱", "电子邮箱"], "basic.email"),
    searchableField("basic-gender", ["gender"], ["性别"], "basic.gender", "confirm"),
    dateField("basic-birthday", ["birthday"], ["请选择出生日期", "出生日期"], "basic.birthDate", "confirm"),
    textField("basic-residence", ["residencestate"], ["请输入居住城市", "居住城市", "现居城市"], "basic.currentCity"),

    manualField("education-school", repeated("recruiteducationlist", "schoolname"), ["学校名称", "就读学校", "请输入学校"]),
    searchableField(
      "education-degree",
      repeated("recruiteducationlist", "highestdegree"),
      ["学历", "最高学历"],
      "education.{index}.degree"
    ),
    textField(
      "education-major",
      repeated("recruiteducationlist", "majorname"),
      ["请输入专业", "专业", "专业名称"],
      "education.{index}.major"
    ),
    manualField("education-start", repeated("recruiteducationlist", "startdate"), ["开始时间", "入学时间"], ["textbox"]),
    manualField("education-end", repeated("recruiteducationlist", "enddate"), ["结束时间", "毕业时间"], ["textbox"]),
    manualField("education-description", ["recruiteducationlist[].description"], ["教育经历描述"], ["textbox"]),

    textField(
      "work-company",
      repeated("recruitworkinglist", "companyname"),
      ["公司名称", "公司"],
      "workExperiences.{index}.company"
    ),
    textField(
      "work-title",
      repeated("recruitworkinglist", "jobtitle"),
      ["职位名称", "职位"],
      "workExperiences.{index}.role"
    ),
    manualField("work-start", ["recruitworkinglist[].startdate"], ["开始时间"], ["textbox"]),
    manualField("work-end", ["recruitworkinglist[].enddate"], ["结束时间"], ["textbox"]),
    manualField("work-current", repeated("recruitworkinglist", "currentjob"), ["至今", "目前在职"], ["checkbox", "switch"]),
    textField(
      "work-description",
      ["recruitworkinglist[].description"],
      ["工作描述", "工作内容"],
      "workExperiences.{index}.description"
    ),

    textField(
      "language-name",
      repeated("recruitlanguagelist", "languagetype"),
      ["语言", "语言类型"],
      "languages.{index}.language"
    ),
    searchableField(
      "language-level",
      repeated("recruitlanguagelist", "languagelevel"),
      ["熟练程度", "语言水平"],
      "languages.{index}.proficiency"
    ),
    manualField("skill-name", repeated("recruitskilllist", "skillname"), ["技能名称"], ["textbox"]),
    manualField("skill-level", repeated("recruitskilllist", "skilllevel"), ["技能水平"]),
    manualField("certificate-name", repeated("recruitcertificatelist", "certificatename"), ["证书名称"], ["textbox"]),
    manualField("certificate-score", repeated("recruitcertificatelist", "score"), ["证书成绩"], ["textbox"]),
    manualField("certificate-date", repeated("recruitcertificatelist", "obtaindate"), ["获得时间"], ["textbox"]),

    textField("self-evaluation", ["evaluation"], ["自我评价", "个人评价"], "answers.selfEvaluation"),
    manualField("portfolio-attachment", ["pptfilelist"], ["作品集或附件", "附件"], ["textbox"])
  ],
  repeatables: [],
  exclusions: {
    finalSubmitLabels: ["提交申请", "投递申请", "确认投递", "立即申请", "最终提交"]
  }
};
