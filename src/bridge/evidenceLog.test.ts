import { describe, expect, it, vi } from "vitest";
import {
  PrivacySafeEvidenceLog,
  sanitizeEvidenceLogEntry,
  type EvidenceLogStore
} from "./evidenceLog";

describe("privacy-safe evidence command log", () => {
  it("accepts only the exact privacy whitelist", () => {
    const safe = {
      command: "upload-saved-resume" as const,
      ref: "node_uploadnonce_0001",
      status: "verified" as const,
      attempts: 1 as const,
      durationBucket: "100-500ms" as const
    };
    expect(sanitizeEvidenceLogEntry(safe)).toEqual(safe);
    expect(sanitizeEvidenceLogEntry({
      command: "page-action",
      ref: "node_repeatablenonce_0001",
      status: "performed",
      attempts: 1,
      durationBucket: "lt-100ms"
    })).toEqual({
      command: "page-action",
      ref: "node_repeatablenonce_0001",
      status: "performed",
      attempts: 1,
      durationBucket: "lt-100ms"
    });
    expect(sanitizeEvidenceLogEntry({
      command: "page-action",
      ref: "node_rangenonce_0001",
      status: "blocked",
      attempts: 0,
      durationBucket: "lt-100ms",
      failureCategory: "invalid-profile-range"
    })).not.toBeNull();
    for (const leaked of [
      { ...safe, filename: "private.pdf" },
      { ...safe, path: "C:\\private\\resume.pdf" },
      { ...safe, sha256: "a".repeat(64) },
      { ...safe, bytes: "JVBERi0=" },
      { ...safe, value: "private profile value" },
      { ...safe, query: "token=private" },
      { ...safe, cookie: "session=private" },
      { ...safe, headers: { authorization: "secret" } }
    ]) expect(sanitizeEvidenceLogEntry(leaked)).toBeNull();
  });

  it("drops malformed persisted entries and stores only sanitized fields", async () => {
    let entries: unknown[] = [{ command: "page-action", value: "private" }];
    const store: EvidenceLogStore = {
      load: vi.fn(async () => entries),
      save: vi.fn(async (next) => { entries = next; })
    };
    const log = new PrivacySafeEvidenceLog(store);
    await log.append({
      command: "upload-saved-resume",
      ref: "node_uploadnonce_0001",
      status: "failed",
      attempts: 0,
      durationBucket: "lt-100ms",
      failureCategory: "stale-reference"
    });
    expect(await log.list()).toHaveLength(1);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toMatch(/filename|path|sha256|bytes|cookie|header|query|profile|private|value/i);
  });
});
