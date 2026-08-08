import type { EvidenceCommandLogEntry } from "./protocol";

const EVIDENCE_LOG_STORAGE_KEY = "qiuzhao.evidenceLog.v1";
const MAX_EVIDENCE_LOG_ENTRIES = 100;

export interface EvidenceLogStore {
  load(): Promise<unknown[]>;
  save(entries: EvidenceCommandLogEntry[]): Promise<void>;
}

const COMMANDS = ["page-action", "upload-saved-resume", "capture-screenshot"] as const;
const STATUSES = ["performed", "verified", "captured", "failed", "blocked", "cancelled"] as const;
const DURATIONS = ["lt-100ms", "100-500ms", "gt-500ms"] as const;
const FAILURE_CATEGORIES = [
  "invalid-authorization", "session-inactive", "origin-changed", "stale-reference",
  "invalid-profile-path", "invalid-profile-range", "empty-profile-value", "unsafe-control", "incompatible-action",
  "disabled-or-readonly", "hidden-control", "option-not-found", "option-ambiguous",
  "unsupported-control", "framework-rejected", "verification-failed", "duplicate-request-conflict",
  "duplicate-request-uncertain", "debugger-conflict", "timeout", "blocked-control", "page-changed",
  "user-cancelled", "invalid-resume", "bridge-failed"
] as const;

function hasExactKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

export function sanitizeEvidenceLogEntry(value: unknown): EvidenceCommandLogEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<EvidenceCommandLogEntry>;
  const allowed = [
    "command", "status", "attempts", "durationBucket",
    ...(entry.ref === undefined ? [] : ["ref"]),
    ...(entry.failureCategory === undefined ? [] : ["failureCategory"])
  ];
  if (!hasExactKeys(entry, allowed)) return null;
  if (!(COMMANDS as readonly unknown[]).includes(entry.command)) return null;
  if (!(STATUSES as readonly unknown[]).includes(entry.status)) return null;
  if (!(DURATIONS as readonly unknown[]).includes(entry.durationBucket)) return null;
  if (![0, 1, 2].includes(entry.attempts ?? -1)) return null;
  if (entry.ref !== undefined && !/^node_[a-zA-Z0-9_-]{8,128}$/.test(entry.ref)) return null;
  if (
    entry.failureCategory !== undefined
    && !(FAILURE_CATEGORIES as readonly unknown[]).includes(entry.failureCategory)
  ) return null;
  return {
    command: entry.command!,
    ...(entry.ref ? { ref: entry.ref } : {}),
    status: entry.status!,
    attempts: entry.attempts as 0 | 1 | 2,
    durationBucket: entry.durationBucket!,
    ...(entry.failureCategory ? { failureCategory: entry.failureCategory } : {})
  };
}

export class PrivacySafeEvidenceLog {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly store: EvidenceLogStore) {}

  async append(entry: EvidenceCommandLogEntry): Promise<void> {
    const safe = sanitizeEvidenceLogEntry(entry);
    if (!safe) throw new Error("invalid-evidence-log-entry");
    const operation = this.queue.then(async () => {
      const existing = (await this.store.load())
        .map(sanitizeEvidenceLogEntry)
        .filter((candidate): candidate is EvidenceCommandLogEntry => candidate !== null);
      await this.store.save([...existing, safe].slice(-MAX_EVIDENCE_LOG_ENTRIES));
    });
    this.queue = operation.then(() => undefined, () => undefined);
    await operation;
  }

  async list(): Promise<EvidenceCommandLogEntry[]> {
    return (await this.store.load())
      .map(sanitizeEvidenceLogEntry)
      .filter((entry): entry is EvidenceCommandLogEntry => entry !== null)
      .slice(-MAX_EVIDENCE_LOG_ENTRIES);
  }
}

class ChromeEvidenceLogStore implements EvidenceLogStore {
  async load(): Promise<unknown[]> {
    const stored = await chrome.storage.session.get(EVIDENCE_LOG_STORAGE_KEY);
    const value = stored[EVIDENCE_LOG_STORAGE_KEY] as { entries?: unknown[] } | undefined;
    return Array.isArray(value?.entries) ? structuredClone(value.entries) : [];
  }

  async save(entries: EvidenceCommandLogEntry[]): Promise<void> {
    await chrome.storage.session.set({ [EVIDENCE_LOG_STORAGE_KEY]: { entries } });
  }
}

export function createChromeEvidenceLog(): PrivacySafeEvidenceLog {
  return new PrivacySafeEvidenceLog(new ChromeEvidenceLogStore());
}
