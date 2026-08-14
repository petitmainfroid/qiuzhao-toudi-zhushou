import { MAX_RESUME_ATTACHMENT_BYTES } from "../content/resumeAttachment";

const DATABASE_NAME = "qiuzhao-resume-vault";
const DATABASE_VERSION = 1;
const STORE_NAME = "saved-resumes";
const PRIMARY_RESUME_KEY = "primary";

export interface SavedResumeMetadata {
  name: string;
  mimeType: "application/pdf";
  size: number;
  sha256: string;
  savedAt: string;
}

export interface SavedResume extends SavedResumeMetadata {
  file: File;
}

interface StoredResumeRecord extends SavedResumeMetadata {
  key: typeof PRIMARY_RESUME_KEY;
  bytes: ArrayBuffer;
}

export interface SavedResumeRepositoryLike {
  load(): Promise<SavedResume | null>;
  save(file: File): Promise<SavedResume>;
  clear(): Promise<void>;
}

export class SavedResumeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SavedResumeValidationError";
  }
}

function isPdfSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

function hexDigest(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, "0")).join("");
}

function validFilename(name: string): boolean {
  return name.length > 0
    && name.length <= 180
    && !/[\\/\0]/.test(name)
    && name.toLowerCase().endsWith(".pdf");
}

async function digestBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return hexDigest(digest);
}

export async function prepareSavedResume(file: File, savedAt = new Date().toISOString()): Promise<{
  metadata: SavedResumeMetadata;
  bytes: ArrayBuffer;
}> {
  if (!validFilename(file.name) || file.type.toLowerCase() !== "application/pdf") {
    throw new SavedResumeValidationError("只支持文件名有效的 PDF 简历。");
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_RESUME_ATTACHMENT_BYTES) {
    throw new SavedResumeValidationError("只支持 10 MiB 以内的单个 PDF 简历。");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || !isPdfSignature(bytes)) {
    bytes.fill(0);
    throw new SavedResumeValidationError("文件扩展名是 PDF，但内容不是有效的 PDF 文件。");
  }
  const sha256 = await digestBytes(bytes);
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  bytes.fill(0);
  return {
    metadata: {
      name: file.name,
      mimeType: "application/pdf",
      size: file.size,
      sha256,
      savedAt
    },
    bytes: copy
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本地简历数据库操作失败。"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("本地简历数据库事务失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("本地简历数据库事务已取消。"));
  });
}

function isStoredRecord(value: unknown): value is StoredResumeRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<StoredResumeRecord>;
  return record.key === PRIMARY_RESUME_KEY
    && validFilename(record.name ?? "")
    && record.mimeType === "application/pdf"
    && Number.isSafeInteger(record.size)
    && (record.size ?? 0) > 0
    && (record.size ?? 0) <= MAX_RESUME_ATTACHMENT_BYTES
    && typeof record.sha256 === "string"
    && /^[a-f0-9]{64}$/.test(record.sha256)
    && typeof record.savedAt === "string"
    && record.bytes instanceof ArrayBuffer;
}

export class SavedResumeRepository implements SavedResumeRepositoryLike {
  constructor(private readonly indexedDb: IDBFactory | undefined = globalThis.indexedDB) {}

  private async open(): Promise<IDBDatabase> {
    if (!this.indexedDb) throw new Error("当前浏览器不支持本地 PDF 保存。");
    const request = this.indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    return requestResult(request);
  }

  async load(): Promise<SavedResume | null> {
    const database = await this.open();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const value = await requestResult(transaction.objectStore(STORE_NAME).get(PRIMARY_RESUME_KEY)) as unknown;
      await transactionDone(transaction);
      if (value === undefined) return null;
      if (!isStoredRecord(value)) {
        await this.clear();
        return null;
      }
      const bytes = new Uint8Array(value.bytes.slice(0));
      const valid = bytes.byteLength === value.size
        && isPdfSignature(bytes)
        && await digestBytes(bytes) === value.sha256;
      if (!valid) {
        bytes.fill(0);
        await this.clear();
        return null;
      }
      const file = new File([bytes], value.name, { type: value.mimeType, lastModified: 0 });
      bytes.fill(0);
      return {
        name: value.name,
        mimeType: value.mimeType,
        size: value.size,
        sha256: value.sha256,
        savedAt: value.savedAt,
        file
      };
    }
    finally {
      database.close();
    }
  }

  async save(file: File): Promise<SavedResume> {
    const prepared = await prepareSavedResume(file);
    const database = await this.open();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({
        key: PRIMARY_RESUME_KEY,
        ...prepared.metadata,
        bytes: prepared.bytes
      } satisfies StoredResumeRecord);
      await transactionDone(transaction);
    }
    finally {
      database.close();
    }
    return {
      ...prepared.metadata,
      file: new File([prepared.bytes], prepared.metadata.name, {
        type: prepared.metadata.mimeType,
        lastModified: 0
      })
    };
  }

  async clear(): Promise<void> {
    const database = await this.open();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(PRIMARY_RESUME_KEY);
      await transactionDone(transaction);
    }
    finally {
      database.close();
    }
  }
}
