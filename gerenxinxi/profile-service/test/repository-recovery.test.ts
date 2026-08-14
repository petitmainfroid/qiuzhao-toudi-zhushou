import { mkdtemp, readFile, rename, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../../shared/domain/profile";
import { FileProfileRepository, type AtRestProtector } from "../src/index";

const protector: AtRestProtector = {
  providerId: "recovery-test",
  protect: async (value) => `e:${Buffer.from(value).toString("base64")}`,
  unprotect: async (value) => Buffer.from(value.slice(2), "base64").toString()
};

describe("repository crash recovery and lease locks", () => {
  let directory: string;
  let filePath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "qiuzhao-recovery-"));
    filePath = join(directory, "profile.json");
  });
  afterEach(async () => rm(directory, { recursive: true, force: true }));

  async function twoVersions() {
    const repository = new FileProfileRepository({ filePath, protector });
    const first = await repository.initialize();
    const profile = structuredClone(first.profile);
    profile.basic.fullName = "verified current";
    const second = await repository.save({ profile, expectedProfileVersion: first.profileVersion });
    return { repository, first, second };
  }

  it("never rotates a corrupt primary over the last verified backup at any rename boundary", async () => {
    for (let failCall = 1; failCall <= 2; failCall += 1) {
      const { first, second } = await twoVersions();
      await writeFile(filePath, "{corrupt");
      let calls = 0;
      const faulted = new FileProfileRepository({
        filePath,
        protector,
        renameFile: async (source, destination) => {
          calls += 1;
          if (calls === failCall) throw new Error("injected rename failure");
          await rename(source, destination);
        }
      });
      const next = createEmptyProfile();
      next.basic.fullName = "attempted new";
      await expect(faulted.save({ profile: next, expectedProfileVersion: first.profileVersion })).rejects.toThrow();
      const recovered = await new FileProfileRepository({ filePath, protector }).load();
      expect([first.profileVersion, second.profileVersion]).toContain(recovered.profileVersion);
      expect(recovered.profile.basic.fullName).not.toBe("attempted new");
      await rm(directory, { recursive: true, force: true });
      directory = await mkdtemp(join(tmpdir(), "qiuzhao-recovery-"));
      filePath = join(directory, "profile.json");
    }
  });

  it("preserves a verified version across every normal rotation rename boundary", async () => {
    for (let failCall = 1; failCall <= 3; failCall += 1) {
      const { first, second } = await twoVersions();
      let calls = 0;
      const faulted = new FileProfileRepository({
        filePath, protector,
        renameFile: async (source, destination) => {
          calls += 1;
          if (calls === failCall) throw new Error("injected rename failure");
          await rename(source, destination);
        }
      });
      const next = structuredClone(second.profile);
      next.basic.fullName = "attempted third";
      await expect(faulted.save({ profile: next, expectedProfileVersion: second.profileVersion })).rejects.toThrow();
      const recovered = await new FileProfileRepository({ filePath, protector }).load();
      expect([first.profileVersion, second.profileVersion]).toContain(recovered.profileVersion);
      await rm(directory, { recursive: true, force: true });
      directory = await mkdtemp(join(tmpdir(), "qiuzhao-recovery-"));
      filePath = join(directory, "profile.json");
    }
  });

  it("recovers an expired PID-reused lock only when the process start marker mismatches", async () => {
    await writeFile(`${filePath}.lock`, JSON.stringify({
      pid: process.pid,
      processStartedAtMs: 1,
      ownerId: "dead-owner",
      acquiredAtMs: 1,
      leaseUntilMs: 1
    }));
    await utimes(`${filePath}.lock`, new Date(0), new Date(0));
    const repository = new FileProfileRepository({
      filePath, protector, lockRetries: 2, lockRetryDelayMs: 5, lockLeaseMs: 1_000,
      inspectProcess: async () => ({ alive: true, startedAtMs: 2 })
    });
    await expect(repository.initialize()).resolves.toEqual(expect.objectContaining({ profileVersion: expect.any(String) }));
  });

  it("does not steal a new active owner when ownership changes during stale claim", async () => {
    const lockPath = `${filePath}.lock`;
    await writeFile(lockPath, JSON.stringify({ pid: 999_999, processStartedAtMs: 1, ownerId: "old", acquiredAtMs: 1, leaseUntilMs: 1 }));
    await utimes(lockPath, new Date(0), new Date(0));
    let swapped = false;
    const repository = new FileProfileRepository({
      filePath, protector, lockRetries: 1, lockRetryDelayMs: 5, lockLeaseMs: 60_000,
      inspectProcess: async () => ({ alive: false, startedAtMs: null }),
      renameFile: async (source, destination) => {
        if (!swapped && source === lockPath) {
          swapped = true;
          await writeFile(source, JSON.stringify({ pid: process.pid, processStartedAtMs: Date.now(), ownerId: "new-live", acquiredAtMs: Date.now(), leaseUntilMs: Date.now() + 60_000 }));
        }
        await rename(source, destination);
      }
    });
    await expect(repository.initialize()).rejects.toEqual(expect.objectContaining({ code: "repository_busy" }));
    expect(JSON.parse(await readFile(lockPath, "utf8"))).toEqual(expect.objectContaining({ ownerId: "new-live" }));
  });

  it("renews the lease during a long operation so a live writer is not stolen", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slowProtector: AtRestProtector = { ...protector, protect: async (value) => { await gate; return protector.protect(value); } };
    const first = new FileProfileRepository({ filePath, protector: slowProtector, lockLeaseMs: 1_000, lockRetryDelayMs: 10 });
    const pending = first.initialize();
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const contender = new FileProfileRepository({ filePath, protector, lockLeaseMs: 1_000, lockRetryDelayMs: 5, lockRetries: 1 });
    await expect(contender.initialize()).rejects.toEqual(expect.objectContaining({ code: "repository_busy" }));
    release();
    await expect(pending).resolves.toEqual(expect.objectContaining({ profileVersion: expect.any(String) }));
  });
});
