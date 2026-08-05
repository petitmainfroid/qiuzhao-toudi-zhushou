import { resolveProfileStorage, type KeyValueStorage } from "../storage/profileRepository";
import type { SavedFieldMapping } from "./types";

export const MAPPING_STORAGE_KEY = "qiuzhao.fieldMappings";

function normalizeMapping(value: unknown): SavedFieldMapping | null {
  if (value === null || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (
    typeof source.site !== "string" ||
    typeof source.fingerprint !== "string" ||
    typeof source.profilePath !== "string" ||
    typeof source.canonicalLabel !== "string"
  ) return null;
  return {
    site: source.site,
    fingerprint: source.fingerprint,
    profilePath: source.profilePath,
    canonicalLabel: source.canonicalLabel,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : ""
  };
}

export class MappingRepository {
  constructor(private readonly storage: KeyValueStorage = resolveProfileStorage()) {}

  async load(): Promise<SavedFieldMapping[]> {
    const value = await this.storage.get(MAPPING_STORAGE_KEY);
    if (!Array.isArray(value)) return [];
    return value.map(normalizeMapping).filter((item): item is SavedFieldMapping => item !== null);
  }

  async save(mapping: Omit<SavedFieldMapping, "updatedAt">): Promise<SavedFieldMapping[]> {
    const current = await this.load();
    const saved: SavedFieldMapping = { ...mapping, updatedAt: new Date().toISOString() };
    const next = current.filter(
      (item) => !(item.site === saved.site && item.fingerprint === saved.fingerprint)
    );
    next.push(saved);
    await this.storage.set(MAPPING_STORAGE_KEY, next);
    return next;
  }

  async replace(mappings: SavedFieldMapping[]): Promise<SavedFieldMapping[]> {
    const normalized = mappings.map(normalizeMapping).filter((item): item is SavedFieldMapping => item !== null);
    await this.storage.set(MAPPING_STORAGE_KEY, normalized);
    return normalized;
  }

  async clear(): Promise<void> {
    await this.storage.remove(MAPPING_STORAGE_KEY);
  }
}
