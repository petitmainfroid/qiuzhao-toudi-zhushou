import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyValueStorage } from "../storage/profileRepository";
import { MappingRepository } from "./mappingRepository";

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, unknown>();
  async get(key: string) { return this.values.get(key); }
  async set(key: string, value: unknown) { this.values.set(key, value); }
  async remove(key: string) { this.values.delete(key); }
}

describe("MappingRepository", () => {
  let repository: MappingRepository;

  beforeEach(() => {
    repository = new MappingRepository(new MemoryStorage());
  });

  it("reuses one mapping per site and fingerprint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T11:00:00.000Z"));
    await repository.save({ site: "https://jobs.example", fingerprint: "text|field", profilePath: "basic.fullName", canonicalLabel: "姓名" });
    const mappings = await repository.save({ site: "https://jobs.example", fingerprint: "text|field", profilePath: "basic.email", canonicalLabel: "邮箱" });

    expect(mappings).toEqual([expect.objectContaining({
      site: "https://jobs.example",
      fingerprint: "text|field",
      profilePath: "basic.email",
      updatedAt: "2026-08-03T11:00:00.000Z"
    })]);
    vi.useRealTimers();
  });

  it("keeps mappings for different sites separate", async () => {
    await repository.save({ site: "https://a.example", fingerprint: "same", profilePath: "basic.fullName", canonicalLabel: "姓名" });
    await repository.save({ site: "https://b.example", fingerprint: "same", profilePath: "basic.email", canonicalLabel: "邮箱" });
    expect(await repository.load()).toHaveLength(2);
  });

  it("clears all mapping memory", async () => {
    await repository.save({ site: "https://jobs.example", fingerprint: "field", profilePath: "basic.fullName", canonicalLabel: "姓名" });
    await repository.clear();
    expect(await repository.load()).toEqual([]);
  });
});
