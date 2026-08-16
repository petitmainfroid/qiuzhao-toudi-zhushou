import type { CandidateProfile } from "../../../shared/domain/profile";

export interface ProfileHostSnapshot {
  profile: CandidateProfile;
  revision: string;
}

export interface ProfileHostStore {
  load(): Promise<ProfileHostSnapshot>;
  save(input: {
    profile: CandidateProfile;
    expectedRevision: string;
  }): Promise<ProfileHostSnapshot>;
  clear(input: { expectedRevision: string }): Promise<ProfileHostSnapshot>;
}

export interface ProfileHostImportPreview {
  confirmationToken: string;
  expiresAt: string;
  expectedCurrentProfileVersion: string;
  sourceFormat: "profile-service-v1" | "legacy-extension-v1";
  authenticityVerified: false;
  changedPathCount: number;
  conflictPathCount: number;
  changedPaths: readonly string[];
  conflictPaths: readonly string[];
  pathsTruncated: boolean;
}

export interface ProfileHostImportCoordinator {
  exportData(): Promise<{ serialized: string; suggestedFileName: string }>;
  previewImport(serialized: string): Promise<ProfileHostImportPreview>;
  confirmImport(input: {
    confirmationToken: string;
    expectedCurrentProfileVersion: string;
    serialized: string;
  }): Promise<{
    snapshot: ProfileHostSnapshot;
    rollback: {
      rollbackToken: string;
      expiresAt: string;
      expectedImportedProfileVersion: string;
    };
  }>;
  rollbackImport(input: {
    rollbackToken: string;
    expectedImportedProfileVersion: string;
  }): Promise<{ snapshot: ProfileHostSnapshot }>;
}

export interface ProfileHostUiAsset {
  body: Uint8Array | string;
  contentType: string;
}

export interface ProfileHostUiBundle {
  indexHtml: string;
  assets: Readonly<Record<string, ProfileHostUiAsset>>;
}

export interface ProfileHostOptions {
  store: ProfileHostStore;
  localData?: ProfileHostImportCoordinator;
  resumeStore?: import("./resumeStore").ProfileHostResumeStore;
  resumeParser?: { parse(): Promise<import("../../resume-parser/src").StoredResumeParseResult> };
  ui: ProfileHostUiBundle;
  bootstrapTtlMs?: number;
  sessionTtlMs?: number;
  maxRequestBodyBytes?: number;
  now?: () => number;
}

export interface ProfileHostHandle {
  readonly port: number;
  readonly origin: string;
  readonly bootstrapUrl: string;
  readonly listening: boolean;
  revoke(): void;
  stop(): Promise<void>;
}

export class ProfileHostConflictError extends Error {
  constructor(message = "The profile revision is stale.") {
    super(message);
    this.name = "ProfileHostConflictError";
  }
}

export class ProfilePayloadValidationError extends Error {
  constructor(message = "The profile payload does not match the current schema.") {
    super(message);
    this.name = "ProfilePayloadValidationError";
  }
}
