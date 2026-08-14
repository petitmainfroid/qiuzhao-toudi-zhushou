import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyProfile, migrateProfile } from "../../../shared/domain/profile";
import {
  FileProfileRepository,
  ProfileImportCoordinator,
  createExplicitProfileExport,
  compareProfilesForPreview,
  PROFILE_SCALAR_REGISTRY,
  type AtRestProtector
} from "../src/index";

const protector: AtRestProtector = {
  providerId: "test",
  protect: async (value) => `x:${Buffer.from(value).toString("base64")}`,
  unprotect: async (value) => Buffer.from(value.slice(2), "base64").toString()
};

describe("explicit migration preview and confirmation", () => {
  let directory: string;
  let repository: FileProfileRepository;
  let nowMs: number;
  let tokenByte: number;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "qiuzhao-import-"));
    repository = new FileProfileRepository({ filePath: join(directory, "profile.json"), protector });
    nowMs = Date.parse("2026-08-13T02:00:00.000Z");
    tokenByte = 7;
  });

  afterEach(async () => rm(directory, { recursive: true, force: true }));

  function coordinator() {
    return new ProfileImportCoordinator(repository, {
      now: () => new Date(nowMs),
      tokenBytes: () => Buffer.alloc(32, tokenByte++)
    });
  }

  it("previews redacted canonical conflicts without writing, then imports once after explicit confirm", async () => {
    const currentProfile = createEmptyProfile();
    currentProfile.basic.fullName = "Current private name";
    const current = await repository.initialize(currentProfile);
    const sourceProfile = structuredClone(current.profile);
    sourceProfile.basic.fullName = "Imported private name";
    sourceProfile.basic.email = "private@example.test";
    sourceProfile.education[0].school = "Private school";
    const serialized = createExplicitProfileExport({ ...current, profile: sourceProfile });
    const imports = coordinator();
    const preview = await imports.preview(serialized);

    expect((await repository.load()).profileVersion).toBe(current.profileVersion);
    expect(preview.changedPaths).toEqual(["basic.email", "basic.fullName", "education.0.school"]);
    expect(preview.conflictPaths).toEqual(["basic.fullName"]);
    expect(JSON.stringify(preview)).not.toMatch(/Current private|Imported private|private@example|Private school/);
    expect(preview.changedPaths.every((path) => !/\.\d+\./.test(path) || path.includes(".0."))).toBe(true);

    const imported = await imports.confirm({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: preview.expectedCurrentProfileVersion,
      serializedExport: serialized
    });
    expect(imported.snapshot.profile.basic.fullName).toBe("Imported private name");
    await expect(imports.confirm({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: preview.expectedCurrentProfileVersion,
      serializedExport: serialized
    })).rejects.toEqual(expect.objectContaining({ code: "import_confirmation_required" }));
  });

  it("accepts the real legacy extension export shape only through preview/confirm and ignores mappings", async () => {
    const current = await repository.initialize();
    const legacyProfile = structuredClone(current.profile);
    legacyProfile.basic.fullName = "Legacy imported name";
    legacyProfile.projects = [
      { id: "private-record-id", name: "One", role: "", startDate: "", endDate: "", description: "", outcome: "", link: "", responsibilities: "" },
      { id: "private-record-id-2", name: "Two", role: "", startDate: "", endDate: "", description: "", outcome: "", link: "", responsibilities: "" }
    ];
    const legacy = JSON.stringify({
      format: "qiuzhao-profile-assistant",
      version: 1,
      exportedAt: "2026-08-13T02:00:00.000Z",
      profile: legacyProfile,
      mappings: [{ site: "ignored.example", fingerprint: "ignored", profilePath: "basic.fullName", canonicalLabel: "ignored" }]
    });
    const imports = coordinator();
    const preview = await imports.preview(legacy);
    expect(preview).toEqual(expect.objectContaining({
      sourceFormat: "legacy-extension-v1",
      authenticityVerified: false,
      expectedCurrentProfileVersion: current.profileVersion
    }));
    expect(preview.changedPaths).toEqual(expect.arrayContaining(["basic.fullName", "projects", "projects.0.name"]));
    expect(JSON.stringify(preview)).not.toMatch(/private-record-id|ignored\.example|Legacy imported|\bOne\b|\bTwo\b/);
    const imported = await imports.confirm({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: preview.expectedCurrentProfileVersion,
      serializedExport: legacy
    });
    expect(imported.snapshot.profile.projects).toHaveLength(2);
    expect(imported.snapshot.profile.basic.fullName).toBe("Legacy imported name");
  });

  it("fails closed on oversized, unknown, extra-property, and unsupported legacy inputs", async () => {
    await repository.initialize();
    const imports = coordinator();
    await expect(imports.preview("x".repeat(4 * 1024 * 1024 + 1)))
      .rejects.toEqual(expect.objectContaining({ code: "invalid_export" }));
    await expect(imports.preview(JSON.stringify({ format: "unknown", version: 1, profile: {}, exportedAt: new Date().toISOString(), mappings: [] })))
      .rejects.toEqual(expect.objectContaining({ code: "invalid_export" }));
    await expect(imports.preview(JSON.stringify({
      format: "qiuzhao-profile-assistant", version: 1, exportedAt: new Date().toISOString(), profile: {}, mappings: [], extra: true
    }))).rejects.toEqual(expect.objectContaining({ code: "invalid_export" }));
    await expect(imports.preview(JSON.stringify({
      format: "qiuzhao-profile-assistant", version: 1, exportedAt: new Date().toISOString(), profile: { schemaVersion: 999 }, mappings: []
    }))).rejects.toEqual(expect.objectContaining({ code: "invalid_export" }));
  });

  it("detects every schema scalar change and conflict at the canonical redacted path with equal record counts", () => {
    const populated = () => migrateProfile({
      ...createEmptyProfile(),
      education: [{}], workExperiences: [{}], projects: [{}], workSamples: [{}], awards: [{}], languages: [{}],
      campusLeadership: [{}], campusActivities: [{}], familyMembers: [{}], certificates: [{}], publications: [{}], patents: [{}]
    });
    const setPath = (profile: ReturnType<typeof populated>, path: string, value: string) => {
      let current: unknown = profile;
      for (const segment of path.split(".").slice(0, -1)) {
        current = Array.isArray(current) ? current[Number(segment)] : (current as Record<string, unknown>)[segment];
      }
      (current as Record<string, unknown>)[path.split(".").at(-1)!] = value;
    };
    for (const field of PROFILE_SCALAR_REGISTRY.filter((entry) => entry.path !== "derived.age")) {
      const current = populated();
      const source = populated();
      setPath(current, field.path, field.kind === "date" ? "2025-01-01" : "current");
      setPath(source, field.path, field.kind === "date" ? "2026-01-01" : "source");
      const comparison = compareProfilesForPreview(current, source);
      expect(comparison.changedPaths, field.path).toContain(field.path);
      expect(comparison.conflictPaths, field.path).toContain(field.path);
    }
  });

  it("rejects expired, restarted, mismatched-version, and changed-source confirmations", async () => {
    const current = await repository.initialize();
    const profile = structuredClone(current.profile);
    profile.basic.fullName = "Source";
    const serialized = createExplicitProfileExport({ ...current, profile });

    const expiring = coordinator();
    const expired = await expiring.preview(serialized);
    nowMs += 6 * 60_000;
    await expect(expiring.confirm({
      confirmationToken: expired.confirmationToken,
      expectedCurrentProfileVersion: expired.expectedCurrentProfileVersion,
      serializedExport: serialized
    })).rejects.toEqual(expect.objectContaining({ code: "expired_import_confirmation" }));

    nowMs = Date.parse("2026-08-13T02:00:00.000Z");
    const original = coordinator();
    const preview = await original.preview(serialized);
    await expect(coordinator().confirm({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: preview.expectedCurrentProfileVersion,
      serializedExport: serialized
    })).rejects.toEqual(expect.objectContaining({ code: "import_confirmation_required" }));

    const mismatch = await original.preview(serialized);
    await expect(original.confirm({
      confirmationToken: mismatch.confirmationToken,
      expectedCurrentProfileVersion: `pv_${"f".repeat(64)}`,
      serializedExport: serialized
    })).rejects.toEqual(expect.objectContaining({ code: "invalid_import_confirmation" }));

    const changed = await original.preview(serialized);
    const otherProfile = structuredClone(profile);
    otherProfile.basic.fullName = "Other";
    const otherSerialized = createExplicitProfileExport({ ...current, profile: otherProfile });
    await expect(original.confirm({
      confirmationToken: changed.confirmationToken,
      expectedCurrentProfileVersion: changed.expectedCurrentProfileVersion,
      serializedExport: otherSerialized
    })).rejects.toEqual(expect.objectContaining({ code: "invalid_import_confirmation" }));
  });

  it("issues a one-time version-bound rollback that restores the prior profile as a new version", async () => {
    const priorProfile = createEmptyProfile();
    priorProfile.basic.fullName = "Prior private value";
    const prior = await repository.initialize(priorProfile);
    const source = structuredClone(prior.profile);
    source.basic.fullName = "Imported private value";
    const serialized = createExplicitProfileExport({ ...prior, profile: source });
    const imports = coordinator();
    const preview = await imports.preview(serialized);
    const confirmed = await imports.confirm({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: preview.expectedCurrentProfileVersion,
      serializedExport: serialized
    });
    expect(JSON.stringify(confirmed.rollback)).not.toMatch(/Prior private|Imported private/);
    const rolledBack = await imports.rollbackImport({
      rollbackToken: confirmed.rollback.rollbackToken,
      expectedImportedProfileVersion: confirmed.snapshot.profileVersion
    });
    expect(rolledBack.snapshot.profile.basic.fullName).toBe("Prior private value");
    expect(rolledBack.snapshot.profileVersion).not.toBe(prior.profileVersion);
    expect(rolledBack.snapshot.profileVersion).not.toBe(confirmed.snapshot.profileVersion);
    await expect(imports.rollbackImport({
      rollbackToken: confirmed.rollback.rollbackToken,
      expectedImportedProfileVersion: confirmed.snapshot.profileVersion
    })).rejects.toEqual(expect.objectContaining({ code: "rollback_confirmation_required" }));
  });

  it("fails rollback closed after an intervening save, expiry, or coordinator restart", async () => {
    const prior = await repository.initialize();
    const source = structuredClone(prior.profile);
    source.basic.fullName = "Imported";
    const serialized = createExplicitProfileExport({ ...prior, profile: source });
    const imports = coordinator();
    const preview = await imports.preview(serialized);
    const confirmed = await imports.confirm({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: prior.profileVersion,
      serializedExport: serialized
    });
    const later = structuredClone(confirmed.snapshot.profile);
    later.basic.fullName = "Later edit";
    const laterSaved = await repository.save({ profile: later, expectedProfileVersion: confirmed.snapshot.profileVersion });
    await expect(imports.rollbackImport({
      rollbackToken: confirmed.rollback.rollbackToken,
      expectedImportedProfileVersion: confirmed.snapshot.profileVersion
    })).rejects.toEqual(expect.objectContaining({ code: "conflict" }));
    expect((await repository.load()).profileVersion).toBe(laterSaved.profileVersion);

    const nextSerialized = createExplicitProfileExport(laterSaved);
    const nextPreview = await imports.preview(nextSerialized);
    const nextConfirmed = await imports.confirm({
      confirmationToken: nextPreview.confirmationToken,
      expectedCurrentProfileVersion: laterSaved.profileVersion,
      serializedExport: nextSerialized
    });
    nowMs += 6 * 60_000;
    await expect(imports.rollbackImport({
      rollbackToken: nextConfirmed.rollback.rollbackToken,
      expectedImportedProfileVersion: nextConfirmed.snapshot.profileVersion
    })).rejects.toEqual(expect.objectContaining({ code: "expired_rollback_confirmation" }));
    await expect(coordinator().rollbackImport({
      rollbackToken: nextConfirmed.rollback.rollbackToken,
      expectedImportedProfileVersion: nextConfirmed.snapshot.profileVersion
    })).rejects.toEqual(expect.objectContaining({ code: "rollback_confirmation_required" }));
  });
});
