import { PROFILE_SCHEMA_VERSION, ageFromBirthDate, type CandidateProfile } from "../../../shared/domain/profile";
import { deepFreeze } from "./canonical";
import { ProfileServiceError } from "./errors";
import type { AgentProfileCatalogEntry, AgentProfileSnapshot, ProfileVersion } from "./types";
import { concreteScalarDefinitions, PROFILE_REPEATABLE_ROOTS } from "./schemaRegistry";

function scalarAt(profile: CandidateProfile, path: string): string | undefined {
  if (path === "derived.age") return ageFromBirthDate(profile.basic.birthDate);
  if (path.startsWith("basics.")) throw new ProfileServiceError("unknown_profile_path", "non-canonical profile path");
  const segments = path.split(".");
  let current: unknown = profile;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else if (current !== null && typeof current === "object" && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}

function meaningfulRecord(record: unknown): boolean {
  return record !== null && typeof record === "object" && !Array.isArray(record)
    && Object.entries(record).some(([key, value]) => key !== "id" && typeof value === "string" && value.trim().length > 0);
}

function recordsAt(profile: CandidateProfile, root: string): readonly unknown[] {
  const value = (profile as unknown as Record<string, unknown>)[root];
  return Array.isArray(value) ? value : [];
}

export function createAgentProfileSnapshot(profile: CandidateProfile, profileVersion: ProfileVersion): Readonly<AgentProfileSnapshot> {
  const scalarEntries: AgentProfileCatalogEntry[] = concreteScalarDefinitions(profile).map(({ path, kind, sensitive }) => ({
    path,
    kind,
    safetyClass: sensitive ? "sensitive" : "ordinary",
    hasValue: (scalarAt(profile, path) ?? "").trim().length > 0
  }));
  const repeatableRoots = PROFILE_REPEATABLE_ROOTS.map((path) => {
    const records = recordsAt(profile, path);
    const nonEmptyItemCount = records.filter(meaningfulRecord).length;
    return { path, itemCount: records.length, nonEmptyItemCount, hasValue: nonEmptyItemCount > 0 };
  });
  const catalog: AgentProfileCatalogEntry[] = [
    ...scalarEntries,
    ...repeatableRoots.map(({ path, hasValue }) => ({
      path, kind: "repeatable" as const, safetyClass: path === "familyMembers" ? "sensitive" as const : "ordinary" as const, hasValue
    }))
  ];
  if (new Set(catalog.map((entry) => entry.path)).size !== catalog.length) {
    throw new ProfileServiceError("unknown_profile_path", "catalog contains ambiguous canonical paths");
  }
  return deepFreeze({
    profileVersion,
    profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    catalog,
    completeness: {
      totalScalarPaths: scalarEntries.length,
      populatedScalarPaths: scalarEntries.filter((entry) => entry.hasValue).length,
      repeatableRoots
    }
  });
}

export function resolveCanonicalScalar(profile: CandidateProfile, path: string): string {
  const catalogPaths = new Set(concreteScalarDefinitions(profile).map((entry) => entry.path));
  if (PROFILE_REPEATABLE_ROOTS.includes(path as (typeof PROFILE_REPEATABLE_ROOTS)[number])) {
    throw new ProfileServiceError("non_scalar_profile_path", "repeatable root is not a scalar value");
  }
  if (!catalogPaths.has(path)) throw new ProfileServiceError("unknown_profile_path", "unknown canonical profile path");
  return scalarAt(profile, path) ?? "";
}
