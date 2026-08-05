import { migrateProfile, type CandidateProfile } from "../domain/profile";
import type { SavedFieldMapping } from "../mapping/types";

export const LOCAL_DATA_FORMAT = "qiuzhao-profile-assistant";
export const LOCAL_DATA_VERSION = 1;

export interface LocalDataBundle {
  format: typeof LOCAL_DATA_FORMAT;
  version: typeof LOCAL_DATA_VERSION;
  exportedAt: string;
  profile: CandidateProfile;
  mappings: SavedFieldMapping[];
}

export function createLocalDataBundle(
  profile: CandidateProfile,
  mappings: SavedFieldMapping[],
  exportedAt = new Date().toISOString()
): LocalDataBundle {
  return {
    format: LOCAL_DATA_FORMAT,
    version: LOCAL_DATA_VERSION,
    exportedAt,
    profile: migrateProfile(profile),
    mappings
  };
}

export function serializeLocalData(profile: CandidateProfile, mappings: SavedFieldMapping[]): string {
  return JSON.stringify(createLocalDataBundle(profile, mappings), null, 2);
}

export function parseLocalData(serialized: string): LocalDataBundle {
  const value = JSON.parse(serialized) as unknown;
  if (value === null || typeof value !== "object") throw new Error("导入文件不是有效的数据对象。");
  const source = value as Record<string, unknown>;
  if (source.format !== LOCAL_DATA_FORMAT || source.version !== LOCAL_DATA_VERSION) {
    throw new Error("导入文件的格式或版本不受支持。");
  }
  const mappings = Array.isArray(source.mappings)
    ? source.mappings.filter((mapping): mapping is SavedFieldMapping => {
        if (mapping === null || typeof mapping !== "object") return false;
        const item = mapping as Record<string, unknown>;
        return typeof item.site === "string" &&
          typeof item.fingerprint === "string" &&
          typeof item.profilePath === "string" &&
          typeof item.canonicalLabel === "string";
      })
    : [];
  return {
    format: LOCAL_DATA_FORMAT,
    version: LOCAL_DATA_VERSION,
    exportedAt: typeof source.exportedAt === "string" ? source.exportedAt : "",
    profile: migrateProfile(source.profile),
    mappings
  };
}
