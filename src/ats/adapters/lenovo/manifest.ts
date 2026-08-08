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

export const LENOVO_TALENT_FAMILY_ID = "lenovo-talent";

const LENOVO_TALENT_HOST = "talent.lenovo.com.cn";
const LENOVO_RESUME_PATH = /^\/account\/resume\/?$/;

/** Routes only the reviewed PC candidate-resume editor. */
export function isLenovoTalentResumeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:"
      && url.hostname.toLowerCase() === LENOVO_TALENT_HOST
      && !url.username
      && !url.password
      && (url.port === "" || url.port === "443")
      && LENOVO_RESUME_PATH.test(url.pathname)
      && (url.hash === "" || url.hash === "#");
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

function textField(id: string, semanticKeys: string[], pathPattern: string) {
  return field(
    id,
    semanticKeys,
    ["textbox"],
    "text",
    "fill",
    { kind: "profile-field", pathPattern },
    "normalized-equality"
  );
}

function searchableField(id: string, semanticKeys: string[], pathPattern: string) {
  return field(
    id,
    semanticKeys,
    ["combobox", "listbox"],
    "searchable-combobox",
    "fill",
    { kind: "profile-field", pathPattern },
    "selected-option"
  );
}

function manualField(
  id: string,
  semanticKeys: string[],
  roles: PageControlRole[] = ["textbox", "combobox", "listbox", "radio", "checkbox"]
) {
  return field(id, semanticKeys, roles, "text", "exclude", { kind: "manual" }, "none");
}

function repeated(group: string, fieldName: string): string[] {
  return [`${group}[].${fieldName}`, fieldName];
}

/**
 * Conservative clean-room declaration of the public Lenovo Talent PC resume
 * component contract. It lists all 55 observed logical fields, but automates
 * only the 15 fields that the current local profile and K5 capabilities can
 * represent without splitting, formatting, conditional, or remote-search
 * guesses. Authenticated rendered DOM behavior remains unproved.
 */
export const lenovoTalentManifest: AtsAdapterManifest = {
  schemaVersion: ATS_ADAPTER_SCHEMA_VERSION,
  family: { id: LENOVO_TALENT_FAMILY_ID, version: "1" },
  detection: {
    httpsOnly: true,
    exactHosts: [LENOVO_TALENT_HOST],
    hostSuffixes: [],
    pathPrefixes: ["/account/resume"],
    semanticMarkers: [
      "email",
      "phone",
      "educationexperiences[].degree",
      "internexperiences[].company",
      "projectexperiences[].projectname",
      "selfevaluation"
    ],
    minimumSemanticMarkers: 3
  },
  fields: [
    field(
      "resume-attachment",
      ["resumeattachment"],
      ["textbox"],
      "file-upload",
      "confirm",
      { kind: "saved-resume" },
      "attachment-gate"
    ),
    manualField("resume-avatar", ["resumeavatar"], ["textbox"]),

    manualField("basic-surname", ["surname"], ["textbox"]),
    manualField("basic-given-name", ["givenname"], ["textbox"]),
    manualField("basic-gender", ["gender"], ["radio", "combobox", "listbox"]),
    manualField("basic-birthday", ["birthday"], ["textbox"]),
    manualField("basic-country", ["country", "countryname"]),
    manualField("basic-certificate-type", ["certificatetype"]),
    manualField("basic-certificate-number", ["certificateno", "certificatenonew"], ["textbox"]),
    manualField("basic-expected-workplace", ["expectworkplacename"]),
    textField("basic-email", ["email"], "basic.email"),
    textField("basic-phone", ["phone"], "basic.phone"),
    manualField("basic-wechat", ["wechat"], ["textbox"]),
    manualField("basic-adjust-job", ["adjustjob"], ["radio", "combobox", "listbox"]),
    manualField("basic-adjust-job-type-1", ["adjustjobtype1"]),
    manualField("basic-adjust-job-type-2", ["adjustjobtype2"]),
    manualField("basic-lenovo-practice", ["lenovopractice"], ["radio", "combobox", "listbox"]),
    manualField("basic-lenovo-relatives", ["lenovorelativesflag"], ["radio", "combobox", "listbox"]),
    manualField("basic-lenovo-campus", ["lenovocampusambassador"]),

    searchableField("education-degree", repeated("educationexperiences", "degree"), "education.{index}.degree"),
    searchableField(
      "education-type",
      repeated("educationexperiences", "cultivationmethod"),
      "education.{index}.educationType"
    ),
    manualField("education-school", ["educationexperiences[].universityname", "universityname"]),
    manualField("education-start", repeated("educationexperiences", "enrollmenttime"), ["textbox"]),
    manualField("education-end", repeated("educationexperiences", "graduatetime"), ["textbox"]),
    manualField("education-department", repeated("educationexperiences", "department"), ["textbox"]),
    textField("education-major", repeated("educationexperiences", "major"), "education.{index}.major"),
    manualField("education-research", repeated("educationexperiences", "researcharea"), ["textbox"]),
    searchableField("education-ranking", repeated("educationexperiences", "ranking"), "education.{index}.ranking"),

    manualField("internship-presence", ["hasinternship"]),
    textField("internship-company", repeated("internexperiences", "company"), "workExperiences.{index}.company"),
    manualField("internship-industry", repeated("internexperiences", "industry")),
    manualField("internship-start", repeated("internexperiences", "entrytime"), ["textbox"]),
    manualField("internship-end", repeated("internexperiences", "depaturedate"), ["textbox"]),
    textField("internship-role", repeated("internexperiences", "position"), "workExperiences.{index}.role"),
    textField(
      "internship-description",
      ["internexperiences[].roleresponsibility"],
      "workExperiences.{index}.description"
    ),

    manualField("project-presence", ["hasproject"]),
    textField("project-name", repeated("projectexperiences", "projectname"), "projects.{index}.name"),
    manualField("project-start", repeated("projectexperiences", "starttime"), ["textbox"]),
    manualField("project-end", repeated("projectexperiences", "endtime"), ["textbox"]),
    textField("project-role", ["projectexperiences[].roleresponsibility"], "projects.{index}.role"),
    textField(
      "project-description",
      repeated("projectexperiences", "projectintrodution"),
      "projects.{index}.description"
    ),

    manualField("skills-english-level", ["englishlevel"]),
    manualField("skills-english-score", ["englishscore"], ["textbox"]),
    manualField("skills-language", ["languagelist[].otherlanguage", "otherlanguage"]),
    manualField("skills-language-speaking", ["languagelist[].listenandspeak", "listenandspeak"]),
    manualField("skills-language-writing", ["languagelist[].readandwrite", "readandwrite"]),
    manualField("skills-programming", ["programminglist[].programability", "programability"]),
    manualField("skills-programming-level", ["programminglist[].proficiencylevel"]),
    manualField("skills-it", ["itlist[].itskills", "itskills"], ["textbox"]),
    manualField("skills-it-level", ["itlist[].proficiencylevel"]),
    textField("skills-strength-hobby", ["strengthhobby"], "answers.strengths"),

    manualField("other-information-channel", ["informationchannell"]),
    manualField("other-referrer-code", ["referreritcode"], ["textbox"]),
    manualField("other-source", ["inputmsg"], ["textbox"]),
    textField("other-self-evaluation", ["selfevaluation"], "answers.selfEvaluation")
  ],
  repeatables: [],
  exclusions: {
    finalSubmitLabels: ["提交申请", "投递申请", "确认投递", "立即申请", "最终提交"]
  }
};
