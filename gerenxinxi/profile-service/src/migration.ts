import { randomBytes } from "node:crypto";
import { PROFILE_SCHEMA_VERSION, migrateProfile, type CandidateProfile } from "../../../shared/domain/profile";
import { sha256, stableSerialize } from "./canonical";
import { ProfileServiceError } from "./errors";
import type { FileProfileRepository } from "./repository";
import type {
  ConfirmProfileImportInput,
  ConfirmedProfileImport,
  ProfileExportBundle,
  ProfileImportPreview,
  ProfileSnapshot,
  ProfileVersion,
  RollbackProfileImportInput,
  RolledBackProfileImport
} from "./types";
import { PROFILE_EXPORT_FORMAT, PROFILE_EXPORT_VERSION } from "./types";
import { PROFILE_REPEATABLE_ROOTS, PROFILE_SCALAR_REGISTRY } from "./schemaRegistry";

function exportIntegrity(bundle: Omit<ProfileExportBundle, "integritySha256">): string {
  return sha256(stableSerialize(bundle));
}

export function createExplicitProfileExport(snapshot: Readonly<ProfileSnapshot>, exportedAt = new Date().toISOString()): string {
  const unsigned = {
    format: PROFILE_EXPORT_FORMAT,
    version: PROFILE_EXPORT_VERSION,
    exportedAt,
    sourceProfileVersion: snapshot.profileVersion,
    profile: migrateProfile(snapshot.profile)
  } as const;
  return JSON.stringify({ ...unsigned, integritySha256: exportIntegrity(unsigned) }, null, 2);
}

export function parseExplicitProfileExport(serialized: string): Readonly<ProfileExportBundle> {
  if (Buffer.byteLength(serialized, "utf8") > MAX_IMPORT_BYTES) {
    throw new ProfileServiceError("invalid_export", "profile export exceeds the maximum size");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new ProfileServiceError("invalid_export", "profile export is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProfileServiceError("invalid_export", "profile export must be an object");
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "exportedAt,format,integritySha256,profile,sourceProfileVersion,version"
    || record.format !== PROFILE_EXPORT_FORMAT || record.version !== PROFILE_EXPORT_VERSION
    || typeof record.exportedAt !== "string" || Number.isNaN(Date.parse(record.exportedAt))
    || typeof record.sourceProfileVersion !== "string" || !/^pv_[a-f0-9]{64}$/.test(record.sourceProfileVersion)
    || typeof record.integritySha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.integritySha256)) {
    throw new ProfileServiceError("invalid_export", "profile export metadata is invalid");
  }
  const profile = migrateProfile(record.profile);
  if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new ProfileServiceError("invalid_export", "profile schema version is unsupported");
  }
  const unsigned = {
    format: PROFILE_EXPORT_FORMAT,
    version: PROFILE_EXPORT_VERSION,
    exportedAt: record.exportedAt,
    sourceProfileVersion: record.sourceProfileVersion as ProfileVersion,
    profile
  } as const;
  if (exportIntegrity(unsigned) !== record.integritySha256) {
    throw new ProfileServiceError("invalid_export", "profile export integrity check failed");
  }
  return { ...unsigned, integritySha256: record.integritySha256 };
}

const MAX_PREVIEW_PATHS = 50;
const DEFAULT_CONFIRMATION_TTL_MS = 5 * 60_000;
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
const LEGACY_EXPORT_FORMAT = "qiuzhao-profile-assistant";

interface ParsedProfileImport {
  sourceFormat: "profile-service-v1" | "legacy-extension-v1";
  authenticityVerified: false;
  sourceProfileVersion: ProfileVersion;
  sourceDigest: string;
  profile: CandidateProfile;
}

interface PendingConfirmation {
  expiresAtMs: number;
  expectedCurrentProfileVersion: ProfileVersion;
  sourceDigest: string;
  summaryDigest: string;
}

interface PendingRollback {
  expiresAtMs: number;
  importedProfileVersion: ProfileVersion;
  previousProfileVersion: ProfileVersion;
  previousProfileDigest: string;
  previousProfile: CandidateProfile;
}

function valueAt(profile: CandidateProfile, path: string): string {
  if (path === "derived.age") return profile.basic.birthDate.trim() ? "[derived]" : "";
  const segments = path.split(".");
  let current: unknown = profile;
  for (const segment of segments) {
    if (Array.isArray(current)) current = current[Number(segment)];
    else if (current && typeof current === "object") current = (current as Record<string, unknown>)[segment];
    else return "";
  }
  return typeof current === "string" ? current.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function supportedProfileInput(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.schemaVersion === undefined || [1, 2, 3, PROFILE_SCHEMA_VERSION].includes(Number(value.schemaVersion));
}

function parseProfileImport(serialized: string): ParsedProfileImport {
  if (Buffer.byteLength(serialized, "utf8") > MAX_IMPORT_BYTES) {
    throw new ProfileServiceError("invalid_export", "profile export exceeds the maximum size");
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new ProfileServiceError("invalid_export", "profile export is not valid JSON");
  }
  if (!isRecord(value) || !supportedProfileInput(value.profile)) {
    throw new ProfileServiceError("invalid_export", "profile export contains an unsupported profile schema");
  }
  const sourceDigest = sha256(serialized);
  if (value.format === PROFILE_EXPORT_FORMAT) {
    const bundle = parseExplicitProfileExport(serialized);
    return {
      sourceFormat: "profile-service-v1",
      authenticityVerified: false,
      sourceProfileVersion: bundle.sourceProfileVersion,
      sourceDigest,
      profile: bundle.profile
    };
  }
  if (Object.keys(value).sort().join(",") !== "exportedAt,format,mappings,profile,version"
    || value.format !== LEGACY_EXPORT_FORMAT || value.version !== 1
    || typeof value.exportedAt !== "string" || Number.isNaN(Date.parse(value.exportedAt))
    || !Array.isArray(value.mappings)) {
    throw new ProfileServiceError("invalid_export", "legacy profile export metadata is invalid");
  }
  const profile = migrateProfile(value.profile);
  const sourceProfileVersion = `pv_${sha256(stableSerialize({
    format: LEGACY_EXPORT_FORMAT,
    version: 1,
    profile
  }))}` as ProfileVersion;
  return {
    sourceFormat: "legacy-extension-v1",
    authenticityVerified: false,
    sourceProfileVersion,
    sourceDigest,
    profile
  };
}

function repeatableValues(profile: CandidateProfile, root: string, suffix: string): string[] {
  const records = (profile as unknown as Record<string, unknown>)[root];
  if (!Array.isArray(records)) return [];
  return records.map((_, index) => valueAt(profile, `${root}.${index}.${suffix}`));
}

/** Trusted local-UI helper; returns canonical paths only and never profile values. */
export function compareProfilesForPreview(current: CandidateProfile, source: CandidateProfile): {
  changedPaths: string[];
  conflictPaths: string[];
} {
  const changed = new Set<string>();
  const conflicts = new Set<string>();
  for (const field of PROFILE_SCALAR_REGISTRY) {
    const repeatable = /^([A-Za-z][A-Za-z0-9_]*)\.0\.(.+)$/.exec(field.path);
    const currentValues = repeatable
      ? repeatableValues(current, repeatable[1], repeatable[2])
      : [valueAt(current, field.path)];
    const sourceValues = repeatable
      ? repeatableValues(source, repeatable[1], repeatable[2])
      : [valueAt(source, field.path)];
    if (stableSerialize(currentValues) !== stableSerialize(sourceValues)) changed.add(field.path);
    if (currentValues.some(Boolean) && sourceValues.some(Boolean)
      && stableSerialize(currentValues) !== stableSerialize(sourceValues)) conflicts.add(field.path);
  }
  for (const root of PROFILE_REPEATABLE_ROOTS) {
    const currentCount = Array.isArray((current as unknown as Record<string, unknown>)[root])
      ? ((current as unknown as Record<string, unknown>)[root] as unknown[]).length : 0;
    const sourceCount = Array.isArray((source as unknown as Record<string, unknown>)[root])
      ? ((source as unknown as Record<string, unknown>)[root] as unknown[]).length : 0;
    if (currentCount !== sourceCount) changed.add(root);
    if (currentCount > 0 && sourceCount > 0 && currentCount !== sourceCount) conflicts.add(root);
  }
  return { changedPaths: [...changed].sort(), conflictPaths: [...conflicts].sort() };
}

export interface ProfileImportCoordinatorOptions {
  now?: () => Date;
  tokenBytes?: () => Buffer;
  confirmationTtlMs?: number;
  rollbackTtlMs?: number;
}

export class ProfileImportCoordinator {
  private readonly pending = new Map<string, PendingConfirmation>();
  private readonly pendingRollbacks = new Map<string, PendingRollback>();
  private readonly now: () => Date;
  private readonly tokenBytes: () => Buffer;
  private readonly confirmationTtlMs: number;
  private readonly rollbackTtlMs: number;

  constructor(
    private readonly repository: FileProfileRepository,
    options: ProfileImportCoordinatorOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.tokenBytes = options.tokenBytes ?? (() => randomBytes(32));
    this.confirmationTtlMs = options.confirmationTtlMs ?? DEFAULT_CONFIRMATION_TTL_MS;
    this.rollbackTtlMs = options.rollbackTtlMs ?? DEFAULT_CONFIRMATION_TTL_MS;
    if (!Number.isSafeInteger(this.confirmationTtlMs) || this.confirmationTtlMs < 1_000 || this.confirmationTtlMs > 15 * 60_000) {
      throw new ProfileServiceError("invalid_import_confirmation", "import confirmation TTL is invalid");
    }
    if (!Number.isSafeInteger(this.rollbackTtlMs) || this.rollbackTtlMs < 1_000 || this.rollbackTtlMs > 15 * 60_000) {
      throw new ProfileServiceError("invalid_rollback_confirmation", "import rollback TTL is invalid");
    }
  }

  async preview(serialized: string): Promise<Readonly<ProfileImportPreview>> {
    this.pruneExpired();
    if (this.pending.size >= 100) {
      throw new ProfileServiceError("invalid_import_confirmation", "too many pending import confirmations");
    }
    const bundle = parseProfileImport(serialized);
    const current = await this.repository.load();
    const comparison = compareProfilesForPreview(current.profile, bundle.profile);
    const summaryDigest = sha256(stableSerialize({
      currentProfileVersion: current.profileVersion,
      sourceDigest: bundle.sourceDigest,
      changedPaths: comparison.changedPaths,
      conflictPaths: comparison.conflictPaths
    }));
    const token = `import_${this.tokenBytes().toString("base64url")}`;
    if (!/^import_[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new ProfileServiceError("invalid_import_confirmation", "import confirmation token generation failed");
    }
    const nowMs = this.now().getTime();
    const expiresAtMs = nowMs + this.confirmationTtlMs;
    this.pending.set(token, {
      expiresAtMs,
      expectedCurrentProfileVersion: current.profileVersion,
      sourceDigest: bundle.sourceDigest,
      summaryDigest
    });
    return Object.freeze({
      confirmationToken: token,
      expiresAt: new Date(expiresAtMs).toISOString(),
      expectedCurrentProfileVersion: current.profileVersion,
      sourceProfileVersion: bundle.sourceProfileVersion,
      sourceFormat: bundle.sourceFormat,
      authenticityVerified: false,
      sourceDigest: bundle.sourceDigest,
      summaryDigest,
      changedPathCount: comparison.changedPaths.length,
      conflictPathCount: comparison.conflictPaths.length,
      changedPaths: Object.freeze(comparison.changedPaths.slice(0, MAX_PREVIEW_PATHS)),
      conflictPaths: Object.freeze(comparison.conflictPaths.slice(0, MAX_PREVIEW_PATHS)),
      pathsTruncated: comparison.changedPaths.length > MAX_PREVIEW_PATHS || comparison.conflictPaths.length > MAX_PREVIEW_PATHS
    });
  }

  async confirm(input: Readonly<ConfirmProfileImportInput>): Promise<Readonly<ConfirmedProfileImport>> {
    const pending = this.pending.get(input.confirmationToken);
    this.pending.delete(input.confirmationToken);
    if (!pending) throw new ProfileServiceError("import_confirmation_required", "a fresh import preview is required");
    if (this.now().getTime() > pending.expiresAtMs) {
      throw new ProfileServiceError("expired_import_confirmation", "import confirmation expired");
    }
    if (input.expectedCurrentProfileVersion !== pending.expectedCurrentProfileVersion) {
      throw new ProfileServiceError("invalid_import_confirmation", "import confirmation version mismatch");
    }
    const bundle = parseProfileImport(input.serializedExport);
    if (bundle.sourceDigest !== pending.sourceDigest) {
      throw new ProfileServiceError("invalid_import_confirmation", "import source changed after preview");
    }
    const current = await this.repository.load();
    if (current.profileVersion !== pending.expectedCurrentProfileVersion) {
      throw new ProfileServiceError("conflict", "profile changed after import preview");
    }
    const comparison = compareProfilesForPreview(current.profile, bundle.profile);
    const summaryDigest = sha256(stableSerialize({
      currentProfileVersion: current.profileVersion,
      sourceDigest: bundle.sourceDigest,
      changedPaths: comparison.changedPaths,
      conflictPaths: comparison.conflictPaths
    }));
    if (summaryDigest !== pending.summaryDigest) {
      throw new ProfileServiceError("invalid_import_confirmation", "import preview no longer matches the source");
    }
    const imported = await this.repository.save({ profile: bundle.profile, expectedProfileVersion: current.profileVersion });
    const rollbackToken = `rollback_${this.tokenBytes().toString("base64url")}`;
    if (!/^rollback_[A-Za-z0-9_-]{43}$/.test(rollbackToken) || this.pendingRollbacks.has(rollbackToken)) {
      throw new ProfileServiceError("invalid_rollback_confirmation", "import rollback token generation failed");
    }
    const expiresAtMs = this.now().getTime() + this.rollbackTtlMs;
    const previousProfile = structuredClone(current.profile);
    this.pendingRollbacks.set(rollbackToken, {
      expiresAtMs,
      importedProfileVersion: imported.profileVersion,
      previousProfileVersion: current.profileVersion,
      previousProfileDigest: sha256(stableSerialize(previousProfile)),
      previousProfile
    });
    return Object.freeze({
      snapshot: imported,
      rollback: Object.freeze({
        rollbackToken,
        expiresAt: new Date(expiresAtMs).toISOString(),
        importedProfileVersion: imported.profileVersion,
        previousProfileVersion: current.profileVersion
      })
    });
  }

  async rollbackImport(input: Readonly<RollbackProfileImportInput>): Promise<Readonly<RolledBackProfileImport>> {
    const pending = this.pendingRollbacks.get(input.rollbackToken);
    this.pendingRollbacks.delete(input.rollbackToken);
    if (!pending) {
      throw new ProfileServiceError("rollback_confirmation_required", "a fresh import rollback confirmation is required");
    }
    if (this.now().getTime() > pending.expiresAtMs) {
      throw new ProfileServiceError("expired_rollback_confirmation", "import rollback confirmation expired");
    }
    if (input.expectedImportedProfileVersion !== pending.importedProfileVersion
      || sha256(stableSerialize(pending.previousProfile)) !== pending.previousProfileDigest) {
      throw new ProfileServiceError("invalid_rollback_confirmation", "import rollback confirmation mismatch");
    }
    const current = await this.repository.load();
    if (current.profileVersion !== pending.importedProfileVersion) {
      throw new ProfileServiceError("conflict", "profile changed after import and cannot be rolled back");
    }
    const restored = await this.repository.save({
      profile: pending.previousProfile,
      expectedProfileVersion: current.profileVersion
    });
    return Object.freeze({
      snapshot: restored,
      rolledBackImportedProfileVersion: pending.importedProfileVersion,
      previousProfileVersion: pending.previousProfileVersion
    });
  }

  private pruneExpired(): void {
    const nowMs = this.now().getTime();
    for (const [token, pending] of this.pending) if (nowMs > pending.expiresAtMs) this.pending.delete(token);
    for (const [token, pending] of this.pendingRollbacks) if (nowMs > pending.expiresAtMs) this.pendingRollbacks.delete(token);
  }
}
