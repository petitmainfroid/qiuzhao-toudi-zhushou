import { access, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../../shared/domain/profile";
import { FileProfileRepository, type AtRestProtector } from "../src/index";

const protector: AtRestProtector = {
  providerId: "clear-test",
  protect: async (value) => `encrypted:${Buffer.from(value).toString("base64")}`,
  unprotect: async (value) => Buffer.from(value.slice("encrypted:".length), "base64").toString()
};

describe("version-bound profile clear", () => {
  let directory: string;
  let filePath: string;
  let repository: FileProfileRepository;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "qiuzhao-clear-"));
    filePath = join(directory, "profile.json");
    repository = new FileProfileRepository({ filePath, protector });
  });

  afterEach(async () => rm(directory, { recursive: true, force: true }));

  async function privateSnapshot() {
    const profile = createEmptyProfile();
    profile.basic.fullName = "PRIVATE OLD VALUE";
    return repository.initialize(profile);
  }

  it("commits a fresh empty version and removes only exact retired artifacts", async () => {
    const initial = await privateSnapshot();
    const changed = structuredClone(initial.profile);
    changed.basic.email = "private@example.test";
    const current = await repository.save({ profile: changed, expectedProfileVersion: initial.profileVersion });
    const oldPrimary = await readFile(filePath, "utf8");
    const oldPayload = JSON.parse(oldPrimary).protectedPayload as string;
    await writeFile(`${filePath}.orphan.tmp`, `PRIVATE OLD VALUE ${oldPayload}`);
    await writeFile(join(directory, "other-profile.json.orphan.tmp"), "do not remove");

    const cleared = await repository.clear({ expectedProfileVersion: current.profileVersion });
    expect(cleared.profileVersion).not.toBe(current.profileVersion);
    expect(cleared.profile.basic.fullName).toBe("");
    expect(cleared.profile.basic.email).toBe("");
    const loaded = await repository.load();
    expect(loaded.profileVersion).toBe(cleared.profileVersion);
    const primary = await readFile(filePath, "utf8");
    expect(primary).not.toContain("PRIVATE OLD VALUE");
    expect(primary).not.toContain("private@example.test");
    expect(primary).not.toContain(oldPayload);
    expect(await readdir(directory)).toEqual(["other-profile.json.orphan.tmp", "profile.json"]);
  });

  it("rejects stale and concurrent clears without treating old versions as current", async () => {
    const initial = await privateSnapshot();
    const current = await repository.save({ profile: initial.profile, expectedProfileVersion: initial.profileVersion });
    await expect(repository.clear({ expectedProfileVersion: initial.profileVersion }))
      .rejects.toEqual(expect.objectContaining({ code: "conflict" }));
    expect((await repository.load()).profileVersion).toBe(current.profileVersion);

    const other = new FileProfileRepository({ filePath, protector });
    const results = await Promise.allSettled([
      repository.clear({ expectedProfileVersion: current.profileVersion }),
      other.clear({ expectedProfileVersion: current.profileVersion })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejection = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(["conflict", "repository_busy"]).toContain(rejection?.reason.code);
    expect((await repository.load()).profile.basic.fullName).toBe("");
  });

  it("preserves the old current version when protection fails before commit", async () => {
    const current = await privateSnapshot();
    const failing = new FileProfileRepository({
      filePath,
      protector: { ...protector, protect: async () => { throw new Error("secret failure"); } }
    });
    await expect(failing.clear({ expectedProfileVersion: current.profileVersion }))
      .rejects.toEqual(expect.objectContaining({ code: "protection_failed" }));
    const loaded = await repository.load();
    expect(loaded.profileVersion).toBe(current.profileVersion);
    expect(loaded.profile.basic.fullName).toBe("PRIVATE OLD VALUE");
  });

  it("reports cleanup_incomplete after commit while the new empty version remains current", async () => {
    const current = await privateSnapshot();
    const failingCleanup = new FileProfileRepository({
      filePath,
      protector,
      removeRetiredArtifact: async () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); }
    });
    await expect(failingCleanup.clear({ expectedProfileVersion: current.profileVersion }))
      .rejects.toEqual(expect.objectContaining({
        code: "cleanup_incomplete",
        message: "empty profile version was committed but retired artifact cleanup did not complete"
      }));
    const loaded = await repository.load();
    expect(loaded.profileVersion).not.toBe(current.profileVersion);
    expect(loaded.profile.basic.fullName).toBe("");
    await expect(access(`${filePath}.backup`)).resolves.toBeUndefined();
    await unlink(`${filePath}.backup`);
  });
});
