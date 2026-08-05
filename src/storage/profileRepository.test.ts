import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../domain/profile";
import {
  PROFILE_STORAGE_KEY,
  ProfileRepository,
  type KeyValueStorage
} from "./profileRepository";

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.values.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe("ProfileRepository", () => {
  let storage: MemoryStorage;
  let repository: ProfileRepository;

  beforeEach(() => {
    storage = new MemoryStorage();
    repository = new ProfileRepository(storage);
  });

  it("loads a blank profile when storage is empty", async () => {
    await expect(repository.load()).resolves.toMatchObject({
      schemaVersion: 2,
      basic: { fullName: "" }
    });
  });

  it("normalizes and timestamps a saved profile", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T10:00:00.000Z"));
    const profile = createEmptyProfile();
    profile.basic.fullName = "存储验证";

    const saved = await repository.save(profile);

    expect(saved.updatedAt).toBe("2026-08-03T10:00:00.000Z");
    expect(storage.values.get(PROFILE_STORAGE_KEY)).toEqual(saved);
    await expect(repository.load()).resolves.toEqual(saved);
    vi.useRealTimers();
  });

  it("migrates legacy data during load", async () => {
    storage.values.set(PROFILE_STORAGE_KEY, {
      name: "旧档案",
      school: "旧院校"
    });

    await expect(repository.load()).resolves.toMatchObject({
      schemaVersion: 2,
      basic: { fullName: "旧档案" },
      education: [{ school: "旧院校" }]
    });
  });

  it("clears the stored profile", async () => {
    await repository.save(createEmptyProfile());
    const cleared = await repository.clear();

    expect(storage.values.has(PROFILE_STORAGE_KEY)).toBe(false);
    expect(cleared.basic.fullName).toBe("");
  });
});
