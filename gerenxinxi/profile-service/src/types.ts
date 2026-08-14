import type { CandidateProfile } from "../../../shared/domain/profile";

export const PROFILE_ENVELOPE_VERSION = 1 as const;
export const PROFILE_EXPORT_FORMAT = "qiuzhao-profile-service-export" as const;
export const PROFILE_EXPORT_VERSION = 1 as const;

export type ProfileVersion = `pv_${string}`;

export interface StoredProfileEnvelope {
  envelopeVersion: typeof PROFILE_ENVELOPE_VERSION;
  profileSchemaVersion: number;
  profileVersion: ProfileVersion;
  updatedAt: string;
  protectedPayload: string;
  integritySha256: string;
}

export interface ProfileSnapshot {
  profileVersion: ProfileVersion;
  updatedAt: string;
  profile: CandidateProfile;
  recoveredFromBackup: boolean;
}

export interface AtRestProtector {
  readonly providerId: string;
  protect(plaintext: string): Promise<string>;
  unprotect(protectedPayload: string): Promise<string>;
}

export interface SaveProfileInput {
  profile: CandidateProfile;
  expectedProfileVersion: ProfileVersion | null;
}

export interface ClearProfileInput {
  expectedProfileVersion: ProfileVersion;
}

export interface ProfileExportBundle {
  format: typeof PROFILE_EXPORT_FORMAT;
  version: typeof PROFILE_EXPORT_VERSION;
  exportedAt: string;
  sourceProfileVersion: ProfileVersion;
  profile: CandidateProfile;
  integritySha256: string;
}

export type CatalogValueKind = "text" | "date" | "choice" | "boolean" | "repeatable";

export interface AgentProfileCatalogEntry {
  path: string;
  kind: CatalogValueKind;
  safetyClass: "ordinary" | "sensitive";
  hasValue: boolean;
}

export interface AgentProfileSnapshot {
  profileVersion: ProfileVersion;
  profileSchemaVersion: number;
  catalog: readonly Readonly<AgentProfileCatalogEntry>[];
  completeness: Readonly<{
    totalScalarPaths: number;
    populatedScalarPaths: number;
    repeatableRoots: readonly Readonly<{
      path: string;
      itemCount: number;
      nonEmptyItemCount: number;
      hasValue: boolean;
    }>[];
  }>;
}

export interface ResolveScalarRequest {
  profileVersion: ProfileVersion;
  profilePath: string;
}

export interface ProfileImportPreview {
  confirmationToken: string;
  expiresAt: string;
  expectedCurrentProfileVersion: ProfileVersion;
  sourceProfileVersion: ProfileVersion;
  sourceFormat: "profile-service-v1" | "legacy-extension-v1";
  authenticityVerified: false;
  sourceDigest: string;
  summaryDigest: string;
  changedPathCount: number;
  conflictPathCount: number;
  changedPaths: readonly string[];
  conflictPaths: readonly string[];
  pathsTruncated: boolean;
}

export interface ConfirmProfileImportInput {
  confirmationToken: string;
  expectedCurrentProfileVersion: ProfileVersion;
  serializedExport: string;
}

export interface ProfileImportRollbackConfirmation {
  rollbackToken: string;
  expiresAt: string;
  importedProfileVersion: ProfileVersion;
  previousProfileVersion: ProfileVersion;
}

export interface ConfirmedProfileImport {
  snapshot: Readonly<ProfileSnapshot>;
  rollback: Readonly<ProfileImportRollbackConfirmation>;
}

export interface RollbackProfileImportInput {
  rollbackToken: string;
  expectedImportedProfileVersion: ProfileVersion;
}

export interface RolledBackProfileImport {
  snapshot: Readonly<ProfileSnapshot>;
  rolledBackImportedProfileVersion: ProfileVersion;
  previousProfileVersion: ProfileVersion;
}
