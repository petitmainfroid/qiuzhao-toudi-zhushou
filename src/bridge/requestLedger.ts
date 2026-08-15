const REQUEST_LEDGER_STORAGE_KEY = "qiuzhao.requestLedger.v1";
const REQUEST_LEDGER_TTL_MS = 20 * 60 * 1000;
const REQUEST_LEDGER_MAX_ENTRIES = 100;

export interface StoredRequestEntry {
  requestId: string;
  sessionId: string;
  digest: string;
  status: "in-flight" | "completed";
  startedAt: number;
  expiresAt: number;
  response?: unknown;
}

export interface StoredRequestLedger {
  entries: StoredRequestEntry[];
}

export interface RequestLedgerStore {
  load(): Promise<StoredRequestLedger>;
  save(ledger: StoredRequestLedger): Promise<void>;
}

export interface RequestLedgerDependencies {
  store: RequestLedgerStore;
  now(): number;
  digest(value: string): Promise<string>;
}

export type RequestLedgerOutcome<T> =
  | { kind: "executed"; value: T }
  | { kind: "replayed"; value: T }
  | { kind: "conflict" }
  | { kind: "uncertain" };

export interface RequestLedgerOperation {
  requestId: string;
  sessionId: string;
  fingerprint: string;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  const primitive = JSON.stringify(value);
  return primitive === undefined ? "null" : primitive;
}

export function requestFingerprint(value: unknown): string {
  return canonicalJson(value);
}

export class PersistentRequestLedger {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: RequestLedgerDependencies) {}

  async run<T>(operation: RequestLedgerOperation, execute: () => Promise<T>): Promise<RequestLedgerOutcome<T>> {
    const digest = await this.dependencies.digest(operation.fingerprint);
    const decision = await this.exclusive(async () => {
      const now = this.dependencies.now();
      const ledger = await this.dependencies.store.load();
      ledger.entries = ledger.entries.filter((entry) => entry.expiresAt > now);
      const existing = ledger.entries.find((entry) => entry.requestId === operation.requestId);
      if (existing) {
        if (existing.sessionId !== operation.sessionId || existing.digest !== digest) return { kind: "conflict" as const };
        if (existing.status === "completed") return { kind: "replayed" as const, value: existing.response as T };
        return { kind: "uncertain" as const };
      }

      if (ledger.entries.length >= REQUEST_LEDGER_MAX_ENTRIES) {
        const oldestCompleted = ledger.entries
          .filter((entry) => entry.status === "completed")
          .sort((left, right) => left.startedAt - right.startedAt)[0];
        if (!oldestCompleted) return { kind: "uncertain" as const };
        ledger.entries = ledger.entries.filter((entry) => entry !== oldestCompleted);
      }
      ledger.entries.push({
        requestId: operation.requestId,
        sessionId: operation.sessionId,
        digest,
        status: "in-flight",
        startedAt: now,
        expiresAt: now + REQUEST_LEDGER_TTL_MS
      });
      await this.dependencies.store.save(ledger);
      return { kind: "execute" as const };
    });

    if (decision.kind !== "execute") return decision;
    const value = await execute();
    await this.exclusive(async () => {
      const ledger = await this.dependencies.store.load();
      const entry = ledger.entries.find((candidate) =>
        candidate.requestId === operation.requestId
        && candidate.sessionId === operation.sessionId
        && candidate.digest === digest
      );
      if (!entry || entry.status !== "in-flight") return;
      entry.status = "completed";
      entry.response = value;
      entry.expiresAt = this.dependencies.now() + REQUEST_LEDGER_TTL_MS;
      await this.dependencies.store.save(ledger);
    });
    return { kind: "executed", value };
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

class ChromeRequestLedgerStore implements RequestLedgerStore {
  async load(): Promise<StoredRequestLedger> {
    const stored = await chrome.storage.session.get(REQUEST_LEDGER_STORAGE_KEY);
    const ledger = stored[REQUEST_LEDGER_STORAGE_KEY] as StoredRequestLedger | undefined;
    return ledger?.entries ? structuredClone(ledger) : { entries: [] };
  }

  async save(ledger: StoredRequestLedger): Promise<void> {
    await chrome.storage.session.set({ [REQUEST_LEDGER_STORAGE_KEY]: ledger });
  }
}

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createChromeRequestLedger(): PersistentRequestLedger {
  return new PersistentRequestLedger({
    store: new ChromeRequestLedgerStore(),
    now: () => Date.now(),
    digest: sha256
  });
}
