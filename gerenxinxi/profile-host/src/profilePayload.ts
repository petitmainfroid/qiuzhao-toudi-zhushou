import {
  PROFILE_SCHEMA_VERSION,
  createAwardRecord,
  createCampusActivityRecord,
  createCampusLeadershipRecord,
  createCertificateRecord,
  createEducationRecord,
  createEmptyProfile,
  createFamilyMemberRecord,
  createLanguageRecord,
  createPatentRecord,
  createProjectRecord,
  createPublicationRecord,
  createWorkExperienceRecord,
  createWorkSampleRecord,
  migrateProfile,
  type CandidateProfile
} from "../../../shared/domain/profile";
import { ProfilePayloadValidationError } from "./contracts";

const MAX_REPEATABLE_ITEMS = 100;

type Shape = string | number | Shape[] | { [key: string]: Shape };

function profileShape(): Shape {
  const empty = createEmptyProfile();
  return {
    ...empty,
    education: [createEducationRecord()],
    workExperiences: [createWorkExperienceRecord()],
    projects: [createProjectRecord()],
    workSamples: [createWorkSampleRecord()],
    awards: [createAwardRecord()],
    languages: [createLanguageRecord()],
    campusLeadership: [createCampusLeadershipRecord()],
    campusActivities: [createCampusActivityRecord()],
    familyMembers: [createFamilyMemberRecord()],
    certificates: [createCertificateRecord()],
    publications: [createPublicationRecord()],
    patents: [createPatentRecord()]
  } as unknown as Shape;
}

const CURRENT_PROFILE_SHAPE = profileShape();

function assertClosedShape(value: unknown, shape: Shape, path: string): void {
  if (typeof shape === "string" || typeof shape === "number") {
    if (typeof value !== typeof shape) {
      throw new ProfilePayloadValidationError(`${path} has the wrong value type.`);
    }
    return;
  }

  if (Array.isArray(shape)) {
    if (!Array.isArray(value) || value.length > MAX_REPEATABLE_ITEMS) {
      throw new ProfilePayloadValidationError(`${path} must be a bounded array.`);
    }
    const itemShape = shape[0];
    if (itemShape !== undefined) {
      value.forEach((item, index) => assertClosedShape(item, itemShape, `${path}[${index}]`));
    }
    return;
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProfilePayloadValidationError(`${path} must be an object.`);
  }

  const valueRecord = value as Record<string, unknown>;
  const expectedKeys = Object.keys(shape).sort();
  const actualKeys = Object.keys(valueRecord).sort();
  if (expectedKeys.length !== actualKeys.length || expectedKeys.some((key, index) => key !== actualKeys[index])) {
    throw new ProfilePayloadValidationError(`${path} contains missing or unknown fields.`);
  }
  for (const key of expectedKeys) {
    assertClosedShape(valueRecord[key], shape[key], `${path}.${key}`);
  }
}

export function validateCurrentProfilePayload(value: unknown): CandidateProfile {
  assertClosedShape(value, CURRENT_PROFILE_SHAPE, "profile");
  const profile = value as CandidateProfile;
  if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new ProfilePayloadValidationError("profile.schemaVersion is not current.");
  }
  return migrateProfile(profile);
}
