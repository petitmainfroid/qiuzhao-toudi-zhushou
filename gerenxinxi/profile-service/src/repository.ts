import { constants } from "node:fs";
import { access, mkdir, open, readFile, readdir, rename, stat, unlink, utimes } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { PROFILE_SCHEMA_VERSION, createEmptyProfile, migrateProfile, type CandidateProfile } from "../../../shared/domain/profile";
import { sha256, stableSerialize } from "./canonical";
import { ProfileServiceError } from "./errors";
import type { AtRestProtector, ClearProfileInput, ProfileSnapshot, ProfileVersion, SaveProfileInput, StoredProfileEnvelope } from "./types";
import { PROFILE_ENVELOPE_VERSION } from "./types";

export interface FileProfileRepositoryOptions {
  filePath: string;
  protector: AtRestProtector;
  now?: () => Date;
  randomId?: () => string;
  lockRetries?: number;
  lockRetryDelayMs?: number;
  lockLeaseMs?: number;
  /** Test seam for honest cleanup-failure coverage; production uses an exact-path unlink. */
  removeRetiredArtifact?: (path: string) => Promise<void>;
  /** Test seam for deterministic atomic-rename fault injection. */
  renameFile?: (source: string, destination: string) => Promise<void>;
  inspectProcess?: (pid: number) => Promise<{ alive: boolean; startedAtMs: number | null }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validEnvelope(value: unknown): value is StoredProfileEnvelope {
  return isRecord(value)
    && Object.keys(value).sort().join(",") === "envelopeVersion,integritySha256,profileSchemaVersion,profileVersion,protectedPayload,updatedAt"
    && value.envelopeVersion === PROFILE_ENVELOPE_VERSION
    && value.profileSchemaVersion === PROFILE_SCHEMA_VERSION
    && typeof value.profileVersion === "string" && /^pv_[a-f0-9]{64}$/.test(value.profileVersion)
    && typeof value.updatedAt === "string" && !Number.isNaN(Date.parse(value.updatedAt))
    && typeof value.protectedPayload === "string" && value.protectedPayload.length > 0
    && typeof value.integritySha256 === "string" && /^[a-f0-9]{64}$/.test(value.integritySha256);
}

function integrityInput(envelope: Omit<StoredProfileEnvelope, "integritySha256">): string {
  return stableSerialize(envelope);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export class FileProfileRepository {
  private readonly backupPath: string;
  private readonly lockPath: string;
  private readonly now: () => Date;
  private readonly randomId: () => string;
  private readonly lockRetries: number;
  private readonly lockRetryDelayMs: number;
  private readonly lockLeaseMs: number;
  private readonly removeRetiredArtifact: (path: string) => Promise<void>;
  private readonly renameFile: (source: string, destination: string) => Promise<void>;
  private readonly inspectProcess: (pid: number) => Promise<{ alive: boolean; startedAtMs: number | null }>;
  private readonly processStartedAtMs = Math.floor(Date.now() - process.uptime() * 1_000);

  constructor(private readonly options: FileProfileRepositoryOptions) {
    if (!options.protector?.providerId) throw new ProfileServiceError("protection_failed", "an at-rest protector is required");
    this.backupPath = `${options.filePath}.backup`;
    this.lockPath = `${options.filePath}.lock`;
    this.now = options.now ?? (() => new Date());
    this.randomId = options.randomId ?? (() => crypto.randomUUID());
    this.lockRetries = options.lockRetries ?? 20;
    this.lockRetryDelayMs = options.lockRetryDelayMs ?? 25;
    this.lockLeaseMs = options.lockLeaseMs ?? 30_000;
    this.removeRetiredArtifact = options.removeRetiredArtifact ?? unlink;
    this.renameFile = options.renameFile ?? rename;
    this.inspectProcess = options.inspectProcess ?? (async (pid) => {
      if (pid === process.pid) return { alive: true, startedAtMs: this.processStartedAtMs };
      try {
        process.kill(pid, 0);
        return { alive: true, startedAtMs: null };
      } catch (error) {
        return { alive: (error as NodeJS.ErrnoException).code !== "ESRCH", startedAtMs: null };
      }
    });
    if (!Number.isSafeInteger(this.lockRetries) || this.lockRetries < 0 || this.lockRetries > 200
      || !Number.isSafeInteger(this.lockRetryDelayMs) || this.lockRetryDelayMs < 1 || this.lockRetryDelayMs > 1_000
      || !Number.isSafeInteger(this.lockLeaseMs) || this.lockLeaseMs < 1_000 || this.lockLeaseMs > 5 * 60_000) {
      throw new ProfileServiceError("repository_busy", "profile repository lock settings are invalid");
    }
  }

  async load(): Promise<Readonly<ProfileSnapshot>> {
    const primary = await this.readEnvelope(this.options.filePath);
    if (primary) return { ...primary, recoveredFromBackup: false };
    const backup = await this.readEnvelope(this.backupPath);
    if (backup) return { ...backup, recoveredFromBackup: true };
    if (await exists(this.options.filePath) || await exists(this.backupPath)) {
      throw new ProfileServiceError("corrupt_storage", "stored profile failed integrity or decryption checks");
    }
    throw new ProfileServiceError("not_initialized", "profile repository is empty");
  }

  async initialize(profile: CandidateProfile = createEmptyProfile()): Promise<Readonly<ProfileSnapshot>> {
    try {
      return await this.load();
    } catch (error) {
      if (!(error instanceof ProfileServiceError) || error.code !== "not_initialized") throw error;
    }
    return this.save({ profile, expectedProfileVersion: null });
  }

  async save(input: SaveProfileInput): Promise<Readonly<ProfileSnapshot>> {
    return this.withLock(() => this.saveUnlocked(input));
  }

  async clear(input: ClearProfileInput): Promise<Readonly<ProfileSnapshot>> {
    return this.withLock(async () => {
      const cleared = await this.saveUnlocked({
        profile: createEmptyProfile(),
        expectedProfileVersion: input.expectedProfileVersion
      });
      try {
        await this.removeRetiredArtifacts();
      } catch {
        throw new ProfileServiceError(
          "cleanup_incomplete",
          "empty profile version was committed but retired artifact cleanup did not complete"
        );
      }
      return cleared;
    });
  }

  private async saveUnlocked(input: SaveProfileInput): Promise<Readonly<ProfileSnapshot>> {
    let current: Readonly<ProfileSnapshot> | null = null;
    try {
      current = await this.load();
    } catch (error) {
      if (!(error instanceof ProfileServiceError) || error.code !== "not_initialized") throw error;
    }
    if (current ? current.profileVersion !== input.expectedProfileVersion : input.expectedProfileVersion !== null) {
      throw new ProfileServiceError("conflict", "profile version changed before save");
    }
    const updatedAt = this.now().toISOString();
    const profile = { ...migrateProfile(input.profile), updatedAt };
    const profileVersion = `pv_${sha256(stableSerialize({ profile, nonce: this.randomId() }))}` as ProfileVersion;
    const protectedPayload = await this.protect(stableSerialize({
      profileVersion,
      profileSchemaVersion: PROFILE_SCHEMA_VERSION,
      updatedAt,
      profile
    }));
    const unsigned = {
      envelopeVersion: PROFILE_ENVELOPE_VERSION,
      profileSchemaVersion: PROFILE_SCHEMA_VERSION,
      profileVersion,
      updatedAt,
      protectedPayload
    } as const;
    const envelope: StoredProfileEnvelope = { ...unsigned, integritySha256: sha256(integrityInput(unsigned)) };
    await this.atomicWrite(envelope, current?.recoveredFromBackup === true);
    return { profileVersion, updatedAt, profile, recoveredFromBackup: false };
  }

  private async removeRetiredArtifacts(): Promise<void> {
    const directory = dirname(this.options.filePath);
    const fileName = basename(this.options.filePath);
    const names = await readdir(directory);
    const paths = names
      .filter((name) => name.startsWith(`${fileName}.`) && name.endsWith(".tmp"))
      .map((name) => join(directory, name));
    paths.unshift(this.backupPath);
    for (const path of paths) {
      try {
        await this.removeRetiredArtifact(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  private async readEnvelope(path: string): Promise<Omit<ProfileSnapshot, "recoveredFromBackup"> | null> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    } catch {
      return null;
    }
    if (!validEnvelope(parsed)) return null;
    const { integritySha256, ...unsigned } = parsed;
    if (sha256(integrityInput(unsigned)) !== integritySha256) return null;
    try {
      const protectedRecord = JSON.parse(await this.options.protector.unprotect(parsed.protectedPayload)) as unknown;
      if (!isRecord(protectedRecord)
        || Object.keys(protectedRecord).sort().join(",") !== "profile,profileSchemaVersion,profileVersion,updatedAt"
        || protectedRecord.profileVersion !== parsed.profileVersion
        || protectedRecord.profileSchemaVersion !== parsed.profileSchemaVersion
        || protectedRecord.updatedAt !== parsed.updatedAt) return null;
      const profile = migrateProfile(protectedRecord.profile);
      if (profile.schemaVersion !== parsed.profileSchemaVersion || profile.updatedAt !== parsed.updatedAt) return null;
      return { profileVersion: parsed.profileVersion, updatedAt: parsed.updatedAt, profile };
    } catch {
      return null;
    }
  }

  private async protect(plaintext: string): Promise<string> {
    try {
      const protectedPayload = await this.options.protector.protect(plaintext);
      if (!protectedPayload || protectedPayload === plaintext) {
        throw new Error("protector returned plaintext or empty payload");
      }
      return protectedPayload;
    } catch {
      throw new ProfileServiceError("protection_failed", "at-rest protection failed");
    }
  }

  private async atomicWrite(envelope: StoredProfileEnvelope, primaryWasInvalid: boolean): Promise<void> {
    await mkdir(dirname(this.options.filePath), { recursive: true });
    const tempPath = `${this.options.filePath}.${this.randomId()}.tmp`;
    const retiredPath = `${this.options.filePath}.${this.randomId()}.tmp`;
    const tempHandle = await open(tempPath, "wx");
    try {
      await tempHandle.writeFile(`${JSON.stringify(envelope)}\n`, "utf8");
      await tempHandle.sync();
    } catch (error) {
      await tempHandle.close().catch(() => undefined);
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
    await tempHandle.close();

    let retiredExists = false;
    try {
      if (await exists(this.options.filePath)) {
        if (primaryWasInvalid) {
          await this.renameFile(this.options.filePath, retiredPath);
          retiredExists = true;
        } else {
          if (await exists(this.backupPath)) {
            await this.renameFile(this.backupPath, retiredPath);
            retiredExists = true;
          }
          await this.renameFile(this.options.filePath, this.backupPath);
        }
      }
      await this.renameFile(tempPath, this.options.filePath);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      // A failed final promotion still leaves the verified backup readable. If the
      // primary was never rotated, it remains the verified current version.
      if (!(await exists(this.options.filePath)) && !(await exists(this.backupPath)) && retiredExists) {
        await this.renameFile(retiredPath, this.options.filePath).catch(() => undefined);
        retiredExists = await exists(retiredPath);
      }
      throw error;
    }
    if (retiredExists) await unlink(retiredPath).catch(() => undefined);
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.lockPath), { recursive: true });
    let handle;
    const ownerId = this.randomId();
    const writeLock = async () => {
      const metadata = JSON.stringify({
        pid: process.pid,
        processStartedAtMs: this.processStartedAtMs,
        ownerId,
        acquiredAtMs: Date.now(),
        leaseUntilMs: Date.now() + this.lockLeaseMs
      });
      await handle!.truncate(0);
      await handle!.write(metadata, 0, "utf8");
      await handle!.sync();
    };
    for (let attempt = 0; attempt <= this.lockRetries; attempt += 1) {
      try {
        handle = await open(this.lockPath, "wx");
        await writeLock();
        await new Promise((resolve) => setTimeout(resolve, this.lockRetryDelayMs));
        const verified = JSON.parse(await readFile(this.lockPath, "utf8")) as { ownerId?: unknown };
        if (verified.ownerId !== ownerId) {
          await handle.close().catch(() => undefined);
          handle = undefined;
          continue;
        }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await this.recoverStaleLock(ownerId);
        if (attempt < this.lockRetries) await new Promise((resolve) => setTimeout(resolve, this.lockRetryDelayMs));
      }
    }
    if (!handle) throw new ProfileServiceError("repository_busy", "profile repository is locked");
    const heartbeat = setInterval(() => {
      const now = new Date();
      void utimes(this.lockPath, now, now).catch(() => undefined);
    }, Math.max(250, Math.floor(this.lockLeaseMs / 3)));
    heartbeat.unref();
    let result: T | undefined;
    let operationFailed = false;
    let operationError: unknown;
    try {
      result = await operation();
    } catch (error) {
      operationFailed = true;
      operationError = error;
    }
    let cleanupFailed = false;
    try {
      clearInterval(heartbeat);
      await handle.close();
      const lock = JSON.parse(await readFile(this.lockPath, "utf8")) as { ownerId?: unknown };
      if (lock.ownerId !== ownerId) throw new Error("lock ownership changed");
      await unlink(this.lockPath);
    } catch {
      cleanupFailed = true;
    }
    if (operationFailed) throw operationError;
    if (cleanupFailed) {
      throw new ProfileServiceError("cleanup_incomplete", "repository operation committed but lock cleanup did not complete");
    }
    return result as T;
  }

  private async recoverStaleLock(claimId: string): Promise<void> {
    let value: unknown;
    let modifiedAtMs = Date.now();
    try {
      [value, modifiedAtMs] = await Promise.all([
        readFile(this.lockPath, "utf8").then((text) => JSON.parse(text) as unknown),
        stat(this.lockPath).then((entry) => entry.mtimeMs)
      ]);
    } catch {
      return;
    }
    const lock = isRecord(value) ? value : null;
    const pid = lock && typeof lock.pid === "number" && Number.isSafeInteger(lock.pid) ? lock.pid : null;
    const processStartedAtMs = lock && typeof lock.processStartedAtMs === "number" ? lock.processStartedAtMs : null;
    const originalOwnerId = lock && typeof lock.ownerId === "string" ? lock.ownerId : null;
    const recordedLeaseUntilMs = lock && typeof lock.leaseUntilMs === "number" ? lock.leaseUntilMs : 0;
    const leaseUntilMs = Math.max(recordedLeaseUntilMs, modifiedAtMs + this.lockLeaseMs);
    if (Date.now() <= leaseUntilMs) return;
    if (pid !== null) {
      const processState = await this.inspectProcess(pid);
      if (processState.alive && (processState.startedAtMs === null || processState.startedAtMs === processStartedAtMs)) return;
    }
    const claimedPath = `${this.lockPath}.${claimId}.tmp`;
    try {
      await this.renameFile(this.lockPath, claimedPath);
      const claimed = JSON.parse(await readFile(claimedPath, "utf8")) as { ownerId?: unknown };
      if (!originalOwnerId || claimed.ownerId !== originalOwnerId) {
        // The observed owner released and a new owner acquired before the claim.
        // Never enter the operation; on Windows an active owner's open handle
        // prevents this rename. The fallback restoration is exclusive.
        const restore = await open(this.lockPath, "wx").catch(() => null);
        if (restore) {
          await restore.writeFile(JSON.stringify(claimed), "utf8").catch(() => undefined);
          await restore.close().catch(() => undefined);
        }
        await unlink(claimedPath).catch(() => undefined);
        return;
      }
      await unlink(claimedPath).catch(() => undefined);
    } catch {
      // Another process won the stale-lock claim; retry remains bounded.
    }
  }

}
