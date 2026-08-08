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
  roles: PageControlRole[],
  capability: AtsControlCapability,
  decision: AtsFieldDecision,
  intent: AtsFieldIntent,
  verification: AtsVerificationKind
): AtsAdapterFieldRule {
  return { id, semanticKeys, roles, capability, decision, intent, verification };
}

function textField(
  id: string,
  semanticKeys: string[],
  pathPattern: string,
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKeys,
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
  pathPattern: string,
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKeys,
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
  pathPattern: string,
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKeys,
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
  roles: PageControlRole[] = ["textbox", "combobox", "listbox", "radio", "checkbox"]
) {
  return field(id, semanticKeys, roles, "text", "exclude", { kind: "manual" }, "none");
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
    minimumSemanticMarkers: 3
  },
  fields: [
    manualField("resume-import", ["resumeimportfile"], ["textbox"]),

    textField("basic-name", ["name"], "basic.fullName"),
    textField("basic-mobile", ["mobile"], "basic.phone", "confirm"),
    textField("basic-email", ["email"], "basic.email"),
    searchableField("basic-gender", ["gender"], "basic.gender", "confirm"),
    dateField("basic-birthday", ["birthday"], "basic.birthDate", "confirm"),
    textField("basic-residence", ["residencestate"], "basic.currentCity"),

    manualField("education-school", repeated("recruiteducationlist", "schoolname")),
    searchableField(
      "education-degree",
      repeated("recruiteducationlist", "highestdegree"),
      "education.{index}.degree"
    ),
    textField(
      "education-major",
      repeated("recruiteducationlist", "majorname"),
      "education.{index}.major"
    ),
    manualField("education-start", repeated("recruiteducationlist", "startdate"), ["textbox"]),
    manualField("education-end", repeated("recruiteducationlist", "enddate"), ["textbox"]),
    manualField("education-description", ["recruiteducationlist[].description"], ["textbox"]),

    textField(
      "work-company",
      repeated("recruitworkinglist", "companyname"),
      "workExperiences.{index}.company"
    ),
    textField(
      "work-title",
      repeated("recruitworkinglist", "jobtitle"),
      "workExperiences.{index}.role"
    ),
    manualField("work-start", ["recruitworkinglist[].startdate"], ["textbox"]),
    manualField("work-end", ["recruitworkinglist[].enddate"], ["textbox"]),
    manualField("work-current", repeated("recruitworkinglist", "currentjob"), ["checkbox", "switch"]),
    textField(
      "work-description",
      ["recruitworkinglist[].description"],
      "workExperiences.{index}.description"
    ),

    textField(
      "language-name",
      repeated("recruitlanguagelist", "languagetype"),
      "languages.{index}.language"
    ),
    searchableField(
      "language-level",
      repeated("recruitlanguagelist", "languagelevel"),
      "languages.{index}.proficiency"
    ),
    manualField("skill-name", repeated("recruitskilllist", "skillname"), ["textbox"]),
    manualField("skill-level", repeated("recruitskilllist", "skilllevel")),
    manualField("certificate-name", repeated("recruitcertificatelist", "certificatename"), ["textbox"]),
    manualField("certificate-score", repeated("recruitcertificatelist", "score"), ["textbox"]),
    manualField("certificate-date", repeated("recruitcertificatelist", "obtaindate"), ["textbox"]),

    textField("self-evaluation", ["evaluation"], "answers.selfEvaluation"),
    manualField("portfolio-attachment", ["pptfilelist"], ["textbox"])
  ],
  repeatables: [],
  exclusions: {
    finalSubmitLabels: ["提交申请", "投递申请", "确认投递", "立即申请", "最终提交"]
  }
};
