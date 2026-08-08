import { describe, expect, it } from "vitest";
import { normalizeComparableValue } from "../content/engine";
import { canonicalFields } from "./catalog";
import { normalizeFieldText } from "./normalize";

const profileLeafPaths = [
  "basic.fullName",
  "basic.preferredName",
  "basic.gender",
  "basic.birthDate",
  "basic.phone",
  "basic.email",
  "basic.nationality",
  "basic.currentCity",
  "basic.currentProvince",
  "basic.currentDistrict",
  "basic.hometown",
  "basic.politicalStatus",
  "basic.identityDocumentType",
  "basic.identityDocumentNumber",
  "basic.ethnicity",
  "basic.maritalStatus",
  "basic.religion",
  "basic.heightCm",
  "basic.weightKg",
  "basic.homeCity",
  "basic.homeProvince",
  "basic.homeDistrict",
  "basic.schoolCity",
  "basic.schoolDistrict",
  "basic.emergencyContactName",
  "basic.emergencyContactPhone",
  "basic.hobbies",
  "education.0.school",
  "education.0.degree",
  "education.0.educationType",
  "education.0.major",
  "education.0.startDate",
  "education.0.endDate",
  "education.0.gpa",
  "education.0.ranking",
  "education.0.college",
  "education.0.majorCategory",
  "education.0.mainCourses",
  "education.0.description",
  "education.0.academicDegree",
  "education.0.schoolProvince",
  "education.0.schoolCity",
  "education.0.currentStatus",
  "education.0.gpaScale",
  "workExperiences.0.company",
  "workExperiences.0.department",
  "workExperiences.0.role",
  "workExperiences.0.startDate",
  "workExperiences.0.endDate",
  "workExperiences.0.description",
  "workExperiences.0.industry",
  "workExperiences.0.location",
  "workExperiences.0.achievement",
  "employmentExperiences.0.company",
  "employmentExperiences.0.industry",
  "employmentExperiences.0.department",
  "employmentExperiences.0.role",
  "employmentExperiences.0.employmentType",
  "employmentExperiences.0.location",
  "employmentExperiences.0.startDate",
  "employmentExperiences.0.endDate",
  "employmentExperiences.0.description",
  "employmentExperiences.0.achievement",
  "projects.0.name",
  "projects.0.role",
  "projects.0.startDate",
  "projects.0.endDate",
  "projects.0.description",
  "projects.0.outcome",
  "projects.0.link",
  "projects.0.responsibilities",
  "workSamples.0.link",
  "workSamples.0.description",
  "awards.0.name",
  "awards.0.date",
  "awards.0.description",
  "awards.0.category",
  "awards.0.level",
  "awards.0.grade",
  "awards.0.issuer",
  "languages.0.language",
  "languages.0.proficiency",
  "languages.0.listeningSpeaking",
  "languages.0.readingWriting",
  "languageExams.0.language",
  "languageExams.0.examType",
  "languageExams.0.score",
  "languageExams.0.examDate",
  "languageExams.0.validUntil",
  "languageExams.0.certificateNumber",
  "jobPreference.targetRoles",
  "jobPreference.preferredCities",
  "jobPreference.availableDate",
  "jobPreference.targetIndustries",
  "jobPreference.expectedSalary",
  "jobPreference.currentSalary",
  "jobPreference.expectedSalaryMin",
  "jobPreference.expectedSalaryMax",
  "jobPreference.salaryCurrency",
  "jobPreference.salaryPeriod",
  "jobPreference.acceptsAdjustment",
  "jobPreference.internalReferral",
  "jobPreference.recruitmentSource",
  "jobPreference.workYears",
  "campusLeadership.0.title",
  "campusLeadership.0.level",
  "campusLeadership.0.organization",
  "campusLeadership.0.startDate",
  "campusLeadership.0.endDate",
  "campusLeadership.0.description",
  "campusActivities.0.name",
  "campusActivities.0.role",
  "campusActivities.0.participationType",
  "campusActivities.0.startDate",
  "campusActivities.0.endDate",
  "campusActivities.0.description",
  "familyMembers.0.name",
  "familyMembers.0.relationship",
  "familyMembers.0.employer",
  "familyMembers.0.phone",
  "familyMembers.0.role",
  "familyMembers.0.birthDate",
  "familyMembers.0.location",
  "familyMembers.0.politicalStatus",
  "certificates.0.name",
  "certificates.0.date",
  "certificates.0.description",
  "certificates.0.issuingOrganization",
  "certificates.0.credentialNumber",
  "certificates.0.validUntil",
  "publications.0.title",
  "publications.0.journal",
  "publications.0.publishedAt",
  "publications.0.tier",
  "publications.0.authorPosition",
  "publications.0.impactFactor",
  "publications.0.link",
  "publications.0.description",
  "patents.0.name",
  "patents.0.number",
  "patents.0.type",
  "patents.0.status",
  "patents.0.description",
  "answers.selfIntroduction",
  "answers.selfEvaluation",
  "answers.strengths",
  "answers.careerPlan"
] as const;

const supportedPaths = [...profileLeafPaths, "derived.age"].sort();
const sensitivePaths = [
  "basic.birthDate",
  "basic.gender",
  "basic.hometown",
  "basic.nationality",
  "basic.politicalStatus",
  "basic.identityDocumentType",
  "basic.identityDocumentNumber",
  "basic.ethnicity",
  "basic.maritalStatus",
  "basic.religion",
  "basic.heightCm",
  "basic.weightKg",
  "basic.homeCity",
  "basic.homeDistrict",
  "basic.homeProvince",
  "basic.emergencyContactName",
  "basic.emergencyContactPhone",
  "familyMembers.0.name",
  "familyMembers.0.relationship",
  "familyMembers.0.employer",
  "familyMembers.0.phone",
  "familyMembers.0.politicalStatus",
  "familyMembers.0.role",
  "familyMembers.0.birthDate",
  "familyMembers.0.location",
  "derived.age"
].sort();

function comparisonVariants(path: string): [string, string] {
  if (path === "basic.email") return [" USER@Example.COM ", "user@example.com"];
  if (path === "basic.phone") return ["+86 138-0013-8000", "8613800138000"];
  if (/date|startDate|endDate|age/i.test(path)) return ["2026-08-05", "2026/08/05"];
  return [" Ａ B，C ", "abc"];
}

describe("canonical field coverage contract", () => {
  it("covers every persisted profile leaf plus the age derivation exactly once", () => {
    const actualPaths = canonicalFields.map(({ path }) => path);
    expect(actualPaths).toHaveLength(new Set(actualPaths).size);
    expect([...actualPaths].sort()).toEqual(supportedPaths);
  });

  it("keeps aliases, control kinds, and alias normalization for every supported field", () => {
    canonicalFields.forEach((field) => {
      expect(field.aliases.length, field.path).toBeGreaterThan(0);
      expect(field.kinds.length, field.path).toBeGreaterThan(0);
      field.aliases.forEach((alias) => {
        expect(normalizeFieldText(alias), `${field.path}: ${alias}`).not.toBe("");
      });
    });
  });

  it("marks the complete confirmation-required sensitivity set", () => {
    expect(canonicalFields.filter(({ sensitive }) => sensitive).map(({ path }) => path).sort())
      .toEqual(sensitivePaths);
  });

  it.each(supportedPaths)("normalizes comparison variants deterministically for %s", (path) => {
    const [left, right] = comparisonVariants(path);
    expect(normalizeComparableValue(path, left)).toBe(normalizeComparableValue(path, right));
  });
});
