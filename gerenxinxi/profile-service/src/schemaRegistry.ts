import type { CandidateProfile } from "../../../shared/domain/profile";
import type { CatalogValueKind } from "./types";

export interface ProfileScalarDefinition {
  path: string;
  kind: Exclude<CatalogValueKind, "repeatable">;
  sensitive: boolean;
}

const fields = (root: string, names: readonly string[], sensitive: ReadonlySet<string> = new Set()): ProfileScalarDefinition[] =>
  names.map((name) => ({ path: `${root}.${name}`, kind: /Date$|At$/.test(name) ? "date" : "text", sensitive: sensitive.has(name) }));

const repeatable = (root: string, names: readonly string[], sensitive: ReadonlySet<string> = new Set()): ProfileScalarDefinition[] =>
  fields(`${root}.0`, names, sensitive);

export const PROFILE_REPEATABLE_ROOTS = Object.freeze([
  "education", "workExperiences", "projects", "workSamples", "awards", "languages",
  "campusLeadership", "campusActivities", "familyMembers", "certificates", "publications", "patents"
] as const);

export const PROFILE_SCALAR_REGISTRY: readonly Readonly<ProfileScalarDefinition>[] = Object.freeze([
  ...fields("basic", [
    "fullName", "preferredName", "gender", "birthDate", "phone", "email", "nationality", "currentCity", "hometown",
    "politicalStatus", "identityDocumentType", "identityDocumentNumber", "ethnicity", "maritalStatus", "religion", "heightCm",
    "weightKg", "homeCity", "homeDistrict", "schoolCity", "schoolDistrict", "emergencyContactName", "emergencyContactPhone", "hobbies"
  ], new Set(["birthDate", "identityDocumentType", "identityDocumentNumber", "ethnicity", "religion", "emergencyContactName", "emergencyContactPhone"])),
  ...repeatable("education", ["school", "degree", "educationType", "major", "startDate", "endDate", "gpa", "ranking", "college", "majorCategory", "mainCourses", "description"]),
  ...repeatable("workExperiences", ["experienceType", "company", "department", "role", "startDate", "endDate", "description", "industry", "location", "achievement"]),
  ...repeatable("projects", ["name", "role", "startDate", "endDate", "description", "outcome", "link", "responsibilities"]),
  ...repeatable("workSamples", ["link", "description"]),
  ...repeatable("awards", ["name", "date", "description", "category", "level", "grade"]),
  ...repeatable("languages", ["language", "proficiency", "qualification", "listeningSpeaking", "readingWriting", "score"]),
  ...repeatable("campusLeadership", ["title", "level", "organization", "startDate", "endDate", "description"]),
  ...repeatable("campusActivities", ["name", "role", "participationType", "startDate", "endDate", "description"]),
  ...repeatable("familyMembers", ["name", "relationship", "employer", "phone", "role", "birthDate", "location"], new Set(["name", "phone", "birthDate"])),
  ...repeatable("certificates", ["name", "date", "description"]),
  ...repeatable("publications", ["title", "journal", "publishedAt", "tier", "authorPosition", "impactFactor", "link", "description"]),
  ...repeatable("patents", ["name", "number", "type", "description"], new Set(["number"])),
  ...fields("jobPreference", ["targetRoles", "preferredCities", "availableDate", "targetIndustries", "expectedSalary", "currentSalary", "acceptsAdjustment", "internalReferral", "recruitmentSource", "workYears"], new Set(["expectedSalary", "currentSalary", "internalReferral"])),
  ...fields("answers", ["selfIntroduction", "selfEvaluation", "strengths", "careerPlan"]),
  { path: "derived.age", kind: "text", sensitive: true }
]);

export function concreteScalarDefinitions(profile: CandidateProfile): ProfileScalarDefinition[] {
  return PROFILE_SCALAR_REGISTRY.flatMap((definition) => {
    const match = /^([A-Za-z][A-Za-z0-9_]*)\.0\.(.+)$/.exec(definition.path);
    if (!match) return [definition];
    const records = (profile as unknown as Record<string, unknown>)[match[1]];
    const count = Math.max(1, Array.isArray(records) ? records.length : 0);
    return Array.from({ length: count }, (_, index) => ({ ...definition, path: `${match[1]}.${index}.${match[2]}` }));
  });
}
