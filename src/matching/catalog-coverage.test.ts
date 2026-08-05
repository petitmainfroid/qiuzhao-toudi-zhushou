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
  "basic.hometown",
  "basic.politicalStatus",
  "education.0.school",
  "education.0.degree",
  "education.0.educationType",
  "education.0.major",
  "education.0.startDate",
  "education.0.endDate",
  "education.0.gpa",
  "education.0.ranking",
  "workExperiences.0.company",
  "workExperiences.0.department",
  "workExperiences.0.role",
  "workExperiences.0.startDate",
  "workExperiences.0.endDate",
  "workExperiences.0.description",
  "projects.0.name",
  "projects.0.role",
  "projects.0.startDate",
  "projects.0.endDate",
  "projects.0.description",
  "projects.0.outcome",
  "projects.0.link",
  "workSamples.0.link",
  "workSamples.0.description",
  "awards.0.name",
  "awards.0.date",
  "awards.0.description",
  "languages.0.language",
  "languages.0.proficiency",
  "jobPreference.targetRoles",
  "jobPreference.preferredCities",
  "jobPreference.availableDate",
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
