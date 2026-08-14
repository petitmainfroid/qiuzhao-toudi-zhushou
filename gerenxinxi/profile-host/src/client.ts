import type { CandidateProfile } from "../../../shared/domain/profile";
import type {
  LocalProfileImportPreview,
  ProfileLocalDataRepositoryLike,
  ProfileRepositoryLike
} from "../../../shared/options/App";

interface SessionResponse {
  csrfToken: string;
  expiresAt: number;
}

interface ProfileResponse {
  profile: CandidateProfile;
}

export class ProfileHostClientError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ProfileHostClientError";
  }
}

export class HttpProfileRepository implements ProfileRepositoryLike, ProfileLocalDataRepositoryLike {
  private csrfToken: string | undefined;
  private revision: string | undefined;

  constructor(
    private readonly baseUrl = "",
    private readonly request: typeof fetch = (...args) => globalThis.fetch(...args)
  ) {}

  async load(): Promise<CandidateProfile> {
    await this.ensureSession();
    const response = await this.request(`${this.baseUrl}/api/profile`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    await this.requireOk(response, "Unable to load the local profile.");
    this.revision = this.requireRevision(response);
    return ((await response.json()) as ProfileResponse).profile;
  }

  async save(profile: CandidateProfile): Promise<CandidateProfile> {
    const csrfToken = await this.ensureSession();
    const revision = this.requireLoadedRevision();
    const response = await this.request(`${this.baseUrl}/api/profile`, {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": revision,
        "X-Profile-CSRF": csrfToken
      },
      body: JSON.stringify({ profile })
    });
    await this.requireOk(response, "Unable to save the local profile.");
    this.revision = this.requireRevision(response);
    return ((await response.json()) as ProfileResponse).profile;
  }

  async clear(): Promise<CandidateProfile> {
    const csrfToken = await this.ensureSession();
    const revision = this.requireLoadedRevision();
    const response = await this.request(`${this.baseUrl}/api/profile`, {
      method: "DELETE",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "If-Match": revision,
        "X-Profile-CSRF": csrfToken
      }
    });
    await this.requireOk(response, "Unable to clear the local profile.");
    this.revision = this.requireRevision(response);
    return ((await response.json()) as ProfileResponse).profile;
  }

  async exportData(): Promise<{ serialized: string; suggestedFileName: string }> {
    await this.ensureSession();
    const response = await this.request(`${this.baseUrl}/api/profile/export`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    await this.requireOk(response, "Unable to export the local profile.");
    return response.json() as Promise<{ serialized: string; suggestedFileName: string }>;
  }

  async previewImport(serialized: string): Promise<LocalProfileImportPreview> {
    const response = await this.importRequest("/api/profile/import/preview", { serialized }, false);
    return response.json() as Promise<LocalProfileImportPreview>;
  }

  async confirmImport(input: {
    confirmationToken: string;
    expectedCurrentProfileVersion: string;
    serialized: string;
  }): Promise<{
    profile: CandidateProfile;
    rollback: { rollbackToken: string; expiresAt: string; expectedImportedProfileVersion: string };
  }> {
    const response = await this.importRequest("/api/profile/import/confirm", input, true);
    this.revision = this.requireRevision(response);
    return response.json() as Promise<{
      profile: CandidateProfile;
      rollback: { rollbackToken: string; expiresAt: string; expectedImportedProfileVersion: string };
    }>;
  }

  async rollbackImport(input: {
    rollbackToken: string;
    expectedImportedProfileVersion: string;
  }): Promise<{ profile: CandidateProfile }> {
    const response = await this.importRequest("/api/profile/import/rollback", input, true);
    this.revision = this.requireRevision(response);
    return response.json() as Promise<{ profile: CandidateProfile }>;
  }

  private async ensureSession(): Promise<string> {
    if (this.csrfToken !== undefined) {
      return this.csrfToken;
    }
    const response = await this.request(`${this.baseUrl}/api/session`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    await this.requireOk(response, "The local profile session is unavailable.");
    const session = (await response.json()) as SessionResponse;
    if (typeof session.csrfToken !== "string" || session.csrfToken.length < 20) {
      throw new ProfileHostClientError("The local profile session is invalid.", 500);
    }
    this.csrfToken = session.csrfToken;
    return session.csrfToken;
  }

  private requireLoadedRevision(): string {
    if (this.revision === undefined) {
      throw new ProfileHostClientError("Load the profile before changing it.", 428);
    }
    return this.revision;
  }

  private async importRequest(path: string, body: unknown, includeRevision: boolean): Promise<Response> {
    const csrfToken = await this.ensureSession();
    const headers = new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Profile-CSRF": csrfToken
    });
    if (includeRevision) headers.set("If-Match", this.requireLoadedRevision());
    const response = await this.request(`${this.baseUrl}${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify(body)
    });
    await this.requireOk(response, "The local profile import could not be completed.");
    return response;
  }

  private requireRevision(response: Response): string {
    const revision = response.headers.get("etag");
    if (revision === null || revision.length < 3) {
      throw new ProfileHostClientError("The local profile revision is missing.", 500);
    }
    return revision;
  }

  private async requireOk(response: Response, message: string): Promise<void> {
    if (!response.ok) {
      throw new ProfileHostClientError(message, response.status);
    }
  }
}
