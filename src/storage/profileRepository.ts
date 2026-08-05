import {
  createEmptyProfile,
  migrateProfile,
  setProfileUpdatedNow,
  type CandidateProfile
} from "../domain/profile";

export const PROFILE_STORAGE_KEY = "qiuzhao.candidateProfile";

export interface KeyValueStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export class ChromeLocalStorage implements KeyValueStorage {
  async get(key: string): Promise<unknown> {
    const result = await chrome.storage.local.get(key);
    return result[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }
}

export class BrowserPreviewStorage implements KeyValueStorage {
  async get(key: string): Promise<unknown> {
    const serialized = window.localStorage.getItem(key);
    if (!serialized) return undefined;
    try {
      return JSON.parse(serialized) as unknown;
    }
    catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    window.localStorage.removeItem(key);
  }
}

export function resolveProfileStorage(): KeyValueStorage {
  if (
    typeof chrome !== "undefined" &&
    chrome.storage?.local &&
    typeof chrome.storage.local.get === "function"
  ) {
    return new ChromeLocalStorage();
  }
  return new BrowserPreviewStorage();
}

export class ProfileRepository {
  constructor(private readonly storage: KeyValueStorage = resolveProfileStorage()) {}

  async load(): Promise<CandidateProfile> {
    const stored = await this.storage.get(PROFILE_STORAGE_KEY);
    return stored === undefined ? createEmptyProfile() : migrateProfile(stored);
  }

  async save(profile: CandidateProfile): Promise<CandidateProfile> {
    const nextProfile = setProfileUpdatedNow(profile);
    await this.storage.set(PROFILE_STORAGE_KEY, nextProfile);
    return nextProfile;
  }

  async clear(): Promise<CandidateProfile> {
    await this.storage.remove(PROFILE_STORAGE_KEY);
    return createEmptyProfile();
  }
}
