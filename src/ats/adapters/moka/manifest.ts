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
  roles: PageControlRole[],
  capability: AtsControlCapability,
  decision: AtsFieldDecision,
  intent: AtsFieldIntent,
  verification: AtsVerificationKind
): AtsAdapterFieldRule {
  return { id, semanticKeys: [semanticKey], roles, capability, decision, intent, verification };
}

function textField(
  id: string,
  semanticKey: string,
  pathPattern: string,
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKey,
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
  pathPattern: string,
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKey,
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
  pathPattern: string,
  capability: "date" | "month",
  decision: AtsFieldDecision = "fill"
) {
  return field(
    id,
    semanticKey,
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
  roles: PageControlRole[] = ["textbox", "combobox", "listbox"]
) {
  return field(id, semanticKey, roles, "text", "exclude", { kind: "manual" }, "none");
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
    minimumSemanticMarkers: 3
  },
  fields: [
    textField("basic-name", "basicinfo.name", "basic.fullName"),
    textField("basic-phone", "basicinfo.phone", "basic.phone"),
    textField("basic-email", "basicinfo.email", "basic.email"),
    searchableField("basic-gender", "basicinfo.gender", "basic.gender", "confirm"),
    dateField("basic-birth-date", "basicinfo.birthdate", "basic.birthDate", "date", "confirm"),
    textField("basic-location", "basicinfo.location", "basic.currentCity"),
    manualField("basic-experience", "basicinfo.experience"),
    manualField("basic-highest-degree", "basicinfo.academicdegree"),
    manualField("basic-last-company", "basicinfo.lastcompany"),
    manualField("basic-citizen-id", "basicinfo.citizenid", ["textbox"]),

    manualField("job-current-salary", "jobintention.salary"),
    manualField("job-expected-salary", "jobintention.aimsalary"),
    textField("job-expected-location", "jobintention.forwardlocation", "jobPreference.preferredCities", "confirm"),

    manualField("work-start", "experienceinfo[].startdate", ["textbox"]),
    manualField("work-end", "experienceinfo[].enddate", ["textbox"]),
    manualField("work-company", "experienceinfo[].company", ["textbox"]),
    manualField("work-title", "experienceinfo[].title", ["textbox"]),
    manualField("work-summary", "experienceinfo[].summary", ["textbox"]),

    dateField("education-start", "educationinfo[].startdate", "education.{index}.startDate", "month"),
    dateField("education-end", "educationinfo[].enddate", "education.{index}.endDate", "month"),
    textField("education-school", "educationinfo[].school", "education.{index}.school"),
    textField("education-major", "educationinfo[].speciality", "education.{index}.major"),
    searchableField("education-degree", "educationinfo[].academicdegree", "education.{index}.degree"),

    dateField("internship-start", "practiceinfo[].startdate", "workExperiences.{index}.startDate", "month"),
    dateField("internship-end", "practiceinfo[].enddate", "workExperiences.{index}.endDate", "month"),
    textField("internship-company", "practiceinfo[].company", "workExperiences.{index}.company"),
    textField("internship-title", "practiceinfo[].title", "workExperiences.{index}.role"),
    textField("internship-summary", "practiceinfo[].summary", "workExperiences.{index}.description"),

    dateField("project-start", "projectinfo[].startdate", "projects.{index}.startDate", "month"),
    dateField("project-end", "projectinfo[].enddate", "projects.{index}.endDate", "month"),
    textField("project-name", "projectinfo[].projectname", "projects.{index}.name"),
    textField("project-title", "projectinfo[].title", "projects.{index}.role"),
    textField("project-description", "projectinfo[].projectdescription", "projects.{index}.description"),
    manualField("project-responsibilities", "projectinfo[].responsibilities", ["textbox"]),

    textField("language-name", "languageinfo[].language", "languages.{index}.language"),
    searchableField("language-level", "languageinfo[].level", "languages.{index}.proficiency"),
    manualField("language-listen-speak", "languageinfo[].listenandspeak"),
    manualField("language-read-write", "languageinfo[].readandwrite"),

    textField("self-description", "selfdescription.personal", "answers.selfEvaluation"),
    dateField("award-date", "awardinfo[].awarddate", "awards.{index}.date", "date"),
    textField("award-name", "awardinfo[].awardname", "awards.{index}.name")
  ],
  repeatables: [],
  exclusions: {
    finalSubmitLabels: ["提交申请", "投递申请", "确认投递", "立即申请", "最终提交"]
  }
};
