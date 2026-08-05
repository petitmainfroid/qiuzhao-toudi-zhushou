import { resolveProfileStorage, type KeyValueStorage } from "../storage/profileRepository";

export const PRIVACY_CONSENT_KEY = "qiuzhao.privacyAcknowledged";

export class PrivacyConsentRepository {
  constructor(private readonly storage: KeyValueStorage = resolveProfileStorage()) {}

  async hasAcknowledged(): Promise<boolean> {
    return (await this.storage.get(PRIVACY_CONSENT_KEY)) === true;
  }

  async acknowledge(): Promise<void> {
    await this.storage.set(PRIVACY_CONSENT_KEY, true);
  }

  async clear(): Promise<void> {
    await this.storage.remove(PRIVACY_CONSENT_KEY);
  }
}
