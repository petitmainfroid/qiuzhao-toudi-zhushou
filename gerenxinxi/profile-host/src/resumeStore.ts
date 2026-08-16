import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { SavedResumeMetadata } from "../../../shared/storage/savedResumeRepository";
import type { BinaryAtRestProtector } from "../../profile-service/src";

export const MAX_SAVED_RESUME_BYTES = 10 * 1024 * 1024;
const ENVELOPE_VERSION = 1 as const;

interface SavedResumeEnvelope {
  envelopeVersion: typeof ENVELOPE_VERSION;
  protectedMetadata: string;
  protectedPayload: string;
}

export interface SavedResumeBytes extends SavedResumeMetadata {
  bytes: Uint8Array;
}

export interface ProfileHostResumeStore {
  loadMetadata(): Promise<SavedResumeMetadata | null>;
  load(): Promise<SavedResumeBytes | null>;
  save(input: { name: string; mimeType: string; bytes: Uint8Array }): Promise<SavedResumeMetadata>;
  clear(): Promise<void>;
}

export class ResumeStoreError extends Error {
  constructor(readonly code: "invalid_resume" | "resume_storage_failed") {
    super(code);
    this.name = "ResumeStoreError";
  }
}

function fail(code: ResumeStoreError["code"]): never {
  throw new ResumeStoreError(code);
}

function validName(value: string): boolean {
  return value.length > 0 && value.length <= 180 && value.toLowerCase().endsWith(".pdf") && !/[\\/\0]/.test(value);
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseEnvelope(value: unknown): SavedResumeEnvelope {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("resume_storage_failed");
  const envelope = value as Partial<SavedResumeEnvelope>;
  if (envelope.envelopeVersion !== ENVELOPE_VERSION
    || typeof envelope.protectedMetadata !== "string" || envelope.protectedMetadata.length === 0
    || typeof envelope.protectedPayload !== "string" || envelope.protectedPayload.length === 0) {
    fail("resume_storage_failed");
  }
  return envelope as SavedResumeEnvelope;
}

export class FileResumeStore implements ProfileHostResumeStore {
  private readonly filePath: string;

  constructor(input: { filePath: string; protector: BinaryAtRestProtector }) {
    if (!isAbsolute(input.filePath) || !input.protector?.protectBytes || !input.protector?.unprotectBytes) {
      fail("resume_storage_failed");
    }
    this.filePath = resolve(input.filePath);
    this.protector = input.protector;
  }

  private readonly protector: BinaryAtRestProtector;

  async loadMetadata(): Promise<SavedResumeMetadata | null> {
    const saved = await this.load();
    if (!saved) return null;
    const { bytes, ...metadata } = saved;
    bytes.fill(0);
    return metadata;
  }

  async load(): Promise<SavedResumeBytes | null> {
    const envelope = await this.readEnvelope();
    if (!envelope) return null;
    const resumeMetadata = await this.decryptMetadata(envelope.protectedMetadata);
    let bytes: Uint8Array;
    try {
      bytes = await this.protector.unprotectBytes(envelope.protectedPayload);
    } catch {
      fail("resume_storage_failed");
    }
    if (bytes.byteLength !== resumeMetadata.size || !isPdf(bytes) || digest(bytes) !== resumeMetadata.sha256) {
      bytes.fill(0);
      fail("resume_storage_failed");
    }
    return { ...resumeMetadata, bytes };
  }

  async save(input: { name: string; mimeType: string; bytes: Uint8Array }): Promise<SavedResumeMetadata> {
    if (!validName(input.name) || input.mimeType.toLowerCase() !== "application/pdf"
      || input.bytes.byteLength <= 0 || input.bytes.byteLength > MAX_SAVED_RESUME_BYTES || !isPdf(input.bytes)) {
      fail("invalid_resume");
    }
    const savedAt = new Date().toISOString();
    const resumeMetadata: SavedResumeMetadata = {
      name: input.name,
      mimeType: "application/pdf",
      size: input.bytes.byteLength,
      sha256: digest(input.bytes),
      savedAt
    };
    let protectedMetadata: string;
    let protectedPayload: string;
    try {
      protectedMetadata = await this.protector.protect(JSON.stringify(resumeMetadata));
      protectedPayload = await this.protector.protectBytes(input.bytes);
    } catch {
      fail("resume_storage_failed");
    }
    const envelope: SavedResumeEnvelope = {
      envelopeVersion: ENVELOPE_VERSION,
      protectedMetadata,
      protectedPayload
    };
    const directory = dirname(this.filePath);
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await rejectLinks(directory);
      await rejectFileLink(this.filePath);
      await writeFile(temporary, `${JSON.stringify(envelope)}\n`, { flag: "wx", mode: 0o600 });
      await rename(temporary, this.filePath);
      return resumeMetadata;
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (error instanceof ResumeStoreError) throw error;
      fail("resume_storage_failed");
    }
  }

  async clear(): Promise<void> {
    try {
      await rejectLinks(dirname(this.filePath));
      await rejectFileLink(this.filePath);
      await rm(this.filePath, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
      if (error instanceof ResumeStoreError) throw error;
      fail("resume_storage_failed");
    }
  }

  private async readEnvelope(): Promise<SavedResumeEnvelope | null> {
    try {
      await rejectLinks(dirname(this.filePath));
      await rejectFileLink(this.filePath);
      return parseEnvelope(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      if (error instanceof ResumeStoreError) throw error;
      fail("resume_storage_failed");
    }
  }

  private async decryptMetadata(protectedMetadata: string): Promise<SavedResumeMetadata> {
    let value: unknown;
    try {
      value = JSON.parse(await this.protector.unprotect(protectedMetadata));
    } catch {
      fail("resume_storage_failed");
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) fail("resume_storage_failed");
    const item = value as Partial<SavedResumeMetadata>;
    if (!validName(item.name ?? "") || item.mimeType !== "application/pdf"
      || !Number.isSafeInteger(item.size) || (item.size ?? 0) <= 0 || (item.size ?? 0) > MAX_SAVED_RESUME_BYTES
      || typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)
      || typeof item.savedAt !== "string" || !Number.isFinite(Date.parse(item.savedAt))) {
      fail("resume_storage_failed");
    }
    return item as SavedResumeMetadata;
  }
}

async function rejectLinks(directory: string): Promise<void> {
  const directoryEntry = await lstat(directory);
  if (!directoryEntry.isDirectory() || directoryEntry.isSymbolicLink()) fail("resume_storage_failed");
}

async function rejectFileLink(filePath: string): Promise<void> {
  try {
    const entry = await lstat(filePath);
    if (!entry.isFile() || entry.isSymbolicLink()) fail("resume_storage_failed");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
    if (error instanceof ResumeStoreError) throw error;
    fail("resume_storage_failed");
  }
}
