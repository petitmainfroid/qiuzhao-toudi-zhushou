import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../../shared/domain/profile";
import {
  FileProfileRepository,
  ProfileServiceError,
  createExplicitProfileExport,
  type AtRestProtector
} from "../../profile-service/src";
import { ProfileServiceImportAdapter } from "../src";

const protector: AtRestProtector = {
  providerId: "synthetic-import-test",
  async protect(value) { return `protected:${Buffer.from(value).toString("base64")}`; },
  async unprotect(value) { return Buffer.from(value.slice("protected:".length), "base64").toString("utf8"); }
};

async function fixture(now: () => Date = () => new Date("2026-08-13T00:00:00.000Z")) {
  const directory = await mkdtemp(join(tmpdir(), "qiuzhao-import-adapter-"));
  let id = 0;
  const repository = new FileProfileRepository({
    filePath: join(directory, "profile.json"),
    protector,
    now,
    randomId: () => `synthetic-${++id}`
  });
  const initialProfile = createEmptyProfile();
  initialProfile.basic.fullName = "Before Import";
  const initial = await repository.initialize(initialProfile);
  return { repository, initial, adapter: new ProfileServiceImportAdapter(repository, { now }) };
}

describe("ProfileServiceImportAdapter", () => {
  it("exports explicitly and previews without writing or exposing internal digests", async () => {
    const { repository, initial, adapter } = await fixture();
    const exported = await adapter.exportData();
    expect(exported.serialized).toContain("qiuzhao-profile-service-export");
    expect(exported.suggestedFileName).toMatch(/^qiuzhao-profile-\d{4}-\d{2}-\d{2}\.json$/);

    const source = createEmptyProfile();
    source.basic.fullName = "After Import";
    const preview = await adapter.previewImport(createExplicitProfileExport({ ...initial, profile: source }));
    expect(preview.changedPathCount).toBeGreaterThan(0);
    expect(preview).not.toHaveProperty("sourceDigest");
    expect(preview).not.toHaveProperty("summaryDigest");
    expect(preview).not.toHaveProperty("sourceProfileVersion");
    expect((await repository.load()).profileVersion).toBe(initial.profileVersion);
    expect((await repository.load()).profile.basic.fullName).toBe("Before Import");
  });

  it("confirms once, rolls back once, and rejects expired/stale confirmations", async () => {
    let time = new Date("2026-08-13T00:00:00.000Z");
    const now = () => time;
    const { repository, initial, adapter } = await fixture(now);
    const source = createEmptyProfile();
    source.basic.fullName = "After Import";
    const serialized = createExplicitProfileExport({ ...initial, profile: source });
    const preview = await adapter.previewImport(serialized);
    const imported = await adapter.confirmImport({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: preview.expectedCurrentProfileVersion,
      serialized
    });
    expect(imported.snapshot.profile.basic.fullName).toBe("After Import");
    await expect(adapter.confirmImport({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: preview.expectedCurrentProfileVersion,
      serialized
    })).rejects.toBeInstanceOf(ProfileServiceError);
    const restored = await adapter.rollbackImport(imported.rollback);
    expect(restored.snapshot.profile.basic.fullName).toBe("Before Import");
    await expect(adapter.rollbackImport(imported.rollback)).rejects.toBeInstanceOf(ProfileServiceError);

    const expiring = await adapter.previewImport(serialized);
    time = new Date(time.getTime() + 5 * 60_000 + 1);
    await expect(adapter.confirmImport({
      confirmationToken: expiring.confirmationToken,
      expectedCurrentProfileVersion: expiring.expectedCurrentProfileVersion,
      serialized
    })).rejects.toMatchObject({ code: "expired_import_confirmation" });
    expect((await repository.load()).profile.basic.fullName).toBe("Before Import");
  });

  it("previews the legacy extension export through the same coordinator", async () => {
    const { adapter } = await fixture();
    const profile = createEmptyProfile();
    profile.basic.fullName = "Legacy Candidate";
    const preview = await adapter.previewImport(JSON.stringify({
      format: "qiuzhao-profile-assistant",
      version: 1,
      exportedAt: "2026-08-13T00:00:00.000Z",
      profile,
      mappings: []
    }));
    expect(preview.sourceFormat).toBe("legacy-extension-v1");
    expect(preview.authenticityVerified).toBe(false);
  });

  it("rejects confirmation after the current profile revision changes", async () => {
    const { repository, initial, adapter } = await fixture();
    const source = createEmptyProfile();
    source.basic.fullName = "Import Candidate";
    const serialized = createExplicitProfileExport({ ...initial, profile: source });
    const preview = await adapter.previewImport(serialized);
    const concurrent = createEmptyProfile();
    concurrent.basic.fullName = "Concurrent Edit";
    await repository.save({ profile: concurrent, expectedProfileVersion: initial.profileVersion });
    await expect(adapter.confirmImport({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: preview.expectedCurrentProfileVersion,
      serialized
    })).rejects.toMatchObject({ code: "conflict" });
    expect((await repository.load()).profile.basic.fullName).toBe("Concurrent Edit");
  });
});
