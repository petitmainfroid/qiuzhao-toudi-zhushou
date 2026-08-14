import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROFILE_SCHEMA_VERSION, createEmptyProfile, createProjectRecord, migrateProfile } from "../../../shared/domain/profile";
import {
  FileProfileRepository,
  ProfileService,
  ProfileServiceError,
  PROFILE_SCALAR_REGISTRY,
  ProfileImportCoordinator,
  createAgentProfileSnapshot,
  createExplicitProfileExport,
  parseExplicitProfileExport,
  resolveCanonicalScalar,
  type AtRestProtector,
  type ProfileVersion
} from "../src/index";

const protector: AtRestProtector = {
  providerId: "test-only-reversible",
  async protect(plaintext) {
    return `test:${Buffer.from(plaintext, "utf8").toString("base64")}`;
  },
  async unprotect(payload) {
    if (!payload.startsWith("test:")) throw new Error("invalid protected payload");
    return Buffer.from(payload.slice(5), "base64").toString("utf8");
  }
};

describe("F102 local profile service", () => {
  let directory: string;
  let filePath: string;
  let clock = 0;
  let nonce = 0;
  let repository: FileProfileRepository;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "qiuzhao-f102-"));
    filePath = join(directory, "profile.json");
    clock = 0;
    nonce = 0;
    repository = new FileProfileRepository({
      filePath,
      protector,
      now: () => new Date(Date.UTC(2026, 7, 13, 0, 0, clock++)),
      randomId: () => `nonce-${nonce++}`
    });
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("initializes an encrypted envelope and survives a repository restart", async () => {
    const profile = createEmptyProfile();
    profile.basic.fullName = "Local Candidate";
    const saved = await repository.initialize(profile);
    const serialized = await readFile(filePath, "utf8");
    expect(serialized).not.toContain("Local Candidate");
    expect(JSON.parse(serialized)).toEqual(expect.objectContaining({
      envelopeVersion: 1,
      profileSchemaVersion: PROFILE_SCHEMA_VERSION,
      profileVersion: saved.profileVersion,
      protectedPayload: expect.stringMatching(/^test:/),
      integritySha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    const restarted = new FileProfileRepository({ filePath, protector });
    await expect(restarted.load()).resolves.toEqual(expect.objectContaining({
      profileVersion: saved.profileVersion,
      profile: expect.objectContaining({ basic: expect.objectContaining({ fullName: "Local Candidate" }) }),
      recoveredFromBackup: false
    }));
  });

  it("uses optimistic profileVersion concurrency and makes a save invalidate old plans", async () => {
    const initial = await repository.initialize();
    const firstDraft = structuredClone(initial.profile);
    firstDraft.basic.fullName = "First";
    const saved = await repository.save({ profile: firstDraft, expectedProfileVersion: initial.profileVersion });
    expect(saved.profileVersion).not.toBe(initial.profileVersion);
    await expect(repository.save({ profile: initial.profile, expectedProfileVersion: initial.profileVersion }))
      .rejects.toEqual(expect.objectContaining({ code: "conflict" }));
    const resolver = new ProfileService(repository).createResolver();
    await expect(resolver.resolveScalar({ profileVersion: initial.profileVersion, profilePath: "basic.fullName" }))
      .rejects.toEqual(expect.objectContaining({ code: "stale_profile_version" }));
  });

  it("serializes concurrent writers with a lock and one stale writer fails closed", async () => {
    const initial = await repository.initialize();
    const secondRepository = new FileProfileRepository({ filePath, protector });
    const one = structuredClone(initial.profile);
    const two = structuredClone(initial.profile);
    one.basic.fullName = "One";
    two.basic.fullName = "Two";
    const results = await Promise.allSettled([
      repository.save({ profile: one, expectedProfileVersion: initial.profileVersion }),
      secondRepository.save({ profile: two, expectedProfileVersion: initial.profileVersion })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const current = await repository.load();
    expect(["One", "Two"]).toContain(current.profile.basic.fullName);
  });

  it("recovers the previous verified envelope after primary corruption", async () => {
    const initial = await repository.initialize();
    const next = structuredClone(initial.profile);
    next.basic.fullName = "New version";
    await repository.save({ profile: next, expectedProfileVersion: initial.profileVersion });
    await writeFile(filePath, "{corrupt", "utf8");
    const recovered = await repository.load();
    expect(recovered.recoveredFromBackup).toBe(true);
    expect(recovered.profileVersion).toBe(initial.profileVersion);
    expect(recovered.profile.basic.fullName).toBe("");
  });

  it("fails closed when both primary and backup are corrupt", async () => {
    const initial = await repository.initialize();
    await repository.save({ profile: initial.profile, expectedProfileVersion: initial.profileVersion });
    await writeFile(filePath, "{}", "utf8");
    await writeFile(`${filePath}.backup`, "{}", "utf8");
    await expect(repository.load()).rejects.toEqual(expect.objectContaining({ code: "corrupt_storage" }));
  });

  it("rejects rewritten outer version metadata even when the unkeyed integrity hash is recomputed", async () => {
    const saved = await repository.initialize();
    const envelope = JSON.parse(await readFile(filePath, "utf8"));
    envelope.profileVersion = `pv_${"e".repeat(64)}`;
    const { integritySha256: _ignored, ...unsigned } = envelope;
    const { createHash } = await import("node:crypto");
    const stable = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
      if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
      return JSON.stringify(value);
    };
    envelope.integritySha256 = createHash("sha256").update(stable(unsigned)).digest("hex");
    await writeFile(filePath, JSON.stringify(envelope));
    await expect(repository.load()).rejects.toEqual(expect.objectContaining({ code: "corrupt_storage" }));
    expect(saved.profileVersion).not.toBe(envelope.profileVersion);
  });

  it("requires an at-rest protector and rejects plaintext passthrough", async () => {
    const unsafe = new FileProfileRepository({
      filePath,
      protector: { providerId: "unsafe", protect: async (value) => value, unprotect: async (value) => value }
    });
    await expect(unsafe.initialize()).rejects.toEqual(expect.objectContaining({ code: "protection_failed" }));
  });

  it("imports only an explicit integrity-checked export and preserves current data on failure", async () => {
    const initial = await repository.initialize();
    const exportedProfile = structuredClone(initial.profile);
    exportedProfile.basic.fullName = "Explicit migration";
    const source = { ...initial, profile: exportedProfile };
    const serialized = createExplicitProfileExport(source, "2026-08-13T01:00:00.000Z");
    expect(parseExplicitProfileExport(serialized).profile.basic.fullName).toBe("Explicit migration");
    const coordinator = new ProfileImportCoordinator(repository, {
      now: () => new Date("2026-08-13T01:01:00.000Z"),
      tokenBytes: () => Buffer.alloc(32, 1)
    });
    const preview = await coordinator.preview(serialized);
    expect((await repository.load()).profileVersion).toBe(initial.profileVersion);
    const imported = await coordinator.confirm({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: preview.expectedCurrentProfileVersion,
      serializedExport: serialized
    });
    expect(imported.snapshot.profile.basic.fullName).toBe("Explicit migration");

    const tampered = serialized.replace("Explicit migration", "Tampered migration");
    await expect(new ProfileImportCoordinator(repository).preview(tampered))
      .rejects.toEqual(expect.objectContaining({ code: "invalid_export" }));
    await expect(repository.load()).resolves.toEqual(expect.objectContaining({ profileVersion: imported.snapshot.profileVersion }));
  });

  it("rejects an import conflict without overwriting the newer profile", async () => {
    const initial = await repository.initialize();
    const serialized = createExplicitProfileExport(initial);
    const newer = structuredClone(initial.profile);
    newer.basic.fullName = "Newer";
    const saved = await repository.save({ profile: newer, expectedProfileVersion: initial.profileVersion });
    const coordinator = new ProfileImportCoordinator(repository, {
      tokenBytes: () => Buffer.alloc(32, 2)
    });
    const currentExport = createExplicitProfileExport(saved);
    const preview = await coordinator.preview(currentExport);
    const newest = structuredClone(saved.profile);
    newest.basic.fullName = "Newest";
    const newestSaved = await repository.save({ profile: newest, expectedProfileVersion: saved.profileVersion });
    await expect(coordinator.confirm({
      confirmationToken: preview.confirmationToken,
      expectedCurrentProfileVersion: preview.expectedCurrentProfileVersion,
      serializedExport: currentExport
    })).rejects.toEqual(expect.objectContaining({ code: "conflict" }));
    expect((await repository.load()).profileVersion).toBe(newestSaved.profileVersion);
  });

  it("exposes only canonical catalog metadata and no scalar/contact/identity values", () => {
    const profile = createEmptyProfile();
    profile.basic.fullName = "Private Name";
    profile.basic.birthDate = "2000-01-01";
    profile.basic.phone = "+86 13800000000";
    profile.basic.identityDocumentNumber = "PRIVATE-ID";
    const project = createProjectRecord();
    project.name = "Private Project";
    profile.projects = [project, createProjectRecord()];
    const snapshot = createAgentProfileSnapshot(profile, `pv_${"a".repeat(64)}` as ProfileVersion);
    expect(snapshot.catalog.find((entry) => entry.path === "basic.fullName")).toEqual(expect.objectContaining({ hasValue: true }));
    expect(snapshot.catalog.find((entry) => entry.path === "basic.fullName")).toEqual(expect.objectContaining({ safetyClass: "ordinary" }));
    expect(snapshot.catalog.find((entry) => entry.path === "basic.phone")).toEqual(expect.objectContaining({ safetyClass: "ordinary" }));
    expect(snapshot.catalog.find((entry) => entry.path === "basic.email")).toEqual(expect.objectContaining({ safetyClass: "ordinary" }));
    expect(snapshot.catalog.find((entry) => entry.path === "basic.identityDocumentNumber")).toEqual(expect.objectContaining({ safetyClass: "sensitive" }));
    expect(snapshot.catalog.find((entry) => entry.path === "basic.emergencyContactPhone")).toEqual(expect.objectContaining({ safetyClass: "sensitive" }));
    expect(snapshot.catalog.find((entry) => entry.path === "derived.age")).toEqual(expect.objectContaining({ hasValue: true, safetyClass: "sensitive" }));
    expect(snapshot.catalog.some((entry) => entry.path.startsWith("basics."))).toBe(false);
    expect(snapshot.catalog.find((entry) => entry.path === "projects")).toEqual(expect.objectContaining({ kind: "repeatable", hasValue: true }));
    expect(snapshot.completeness.repeatableRoots.find((entry) => entry.path === "projects")).toEqual({
      path: "projects", itemCount: 2, nonEmptyItemCount: 1, hasValue: true
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/Private Name|13800000000|PRIVATE-ID|Private Project/);
    expect(serialized).not.toMatch(/resume|filePath|filename/i);
    expect(Object.isFrozen(snapshot.catalog)).toBe(true);
  });

  it("keeps catalog paths aligned with canonical matching paths and concrete CandidateProfile records", () => {
    const profile = createEmptyProfile();
    profile.education.push(structuredClone(profile.education[0]));
    const snapshot = createAgentProfileSnapshot(profile, `pv_${"b".repeat(64)}` as ProfileVersion);
    for (const field of PROFILE_SCALAR_REGISTRY) {
      expect(snapshot.catalog.some((entry) => entry.path === field.path)).toBe(true);
    }
    expect(snapshot.catalog.some((entry) => entry.path === "education.1.school")).toBe(true);
    expect(snapshot.catalog.some((entry) => entry.path === "education.2.school")).toBe(false);
  });

  it("covers every CandidateProfile scalar leaf exactly once and resolves every concrete scalar", async () => {
    const profile = migrateProfile({
      ...createEmptyProfile(),
      education: [{}], workExperiences: [{}], projects: [{}], workSamples: [{}], awards: [{}], languages: [{}],
      campusLeadership: [{}], campusActivities: [{}], familyMembers: [{}], certificates: [{}], publications: [{}], patents: [{}]
    });
    const templatePaths: string[] = [];
    const visit = (value: unknown, path: string) => {
      if (typeof value === "string") {
        if (!path.endsWith(".id") && path !== "updatedAt") templatePaths.push(path.replace(/\.\d+\./, ".0."));
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${path}.${index}`));
      } else if (value && typeof value === "object") {
        Object.entries(value).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
      }
    };
    visit(profile, "");
    const registryPaths = PROFILE_SCALAR_REGISTRY.map((field) => field.path);
    expect(new Set(registryPaths).size).toBe(registryPaths.length);
    expect([...new Set(templatePaths)].sort()).toEqual(registryPaths.filter((path) => path !== "derived.age").sort());
    const saved = await repository.initialize(profile);
    const resolver = new ProfileService(repository).createResolver();
    for (const entry of createAgentProfileSnapshot(profile, saved.profileVersion).catalog.filter((item) => item.kind !== "repeatable")) {
      await expect(resolver.resolveScalar({ profileVersion: saved.profileVersion, profilePath: entry.path })).resolves.toEqual(expect.any(String));
    }
  });

  it("resolves canonical scalar values locally and rejects prototype, repeatable, unknown, and stale paths", async () => {
    const profile = createEmptyProfile();
    profile.basic.fullName = "Resolver secret";
    const saved = await repository.initialize(profile);
    const resolver = new ProfileService(repository).createResolver();
    await expect(resolver.resolveScalar({ profileVersion: saved.profileVersion, profilePath: "basic.fullName" })).resolves.toBe("Resolver secret");
    await expect(resolver.resolveScalar({ profileVersion: saved.profileVersion, profilePath: "basics.fullName" }))
      .rejects.toEqual(expect.objectContaining({ code: "unknown_profile_path" }));
    await expect(resolver.resolveScalar({ profileVersion: saved.profileVersion, profilePath: "projects" }))
      .rejects.toEqual(expect.objectContaining({ code: "non_scalar_profile_path" }));
    await expect(resolver.resolveScalar({ profileVersion: saved.profileVersion, profilePath: "basic.unknown" }))
      .rejects.toEqual(expect.objectContaining({ code: "unknown_profile_path" }));
    await expect(resolver.resolveScalar({ profileVersion: `pv_${"c".repeat(64)}`, profilePath: "basic.fullName" }))
      .rejects.toEqual(expect.objectContaining({ code: "stale_profile_version" }));
    expect(() => resolveCanonicalScalar(profile, "education.99.school"))
      .toThrow(expect.objectContaining({ code: "unknown_profile_path" }));
  });

  it("represents known empty scalar paths without exposing a value so planners can choose profile_missing", async () => {
    const saved = await repository.initialize();
    const agentView = await new ProfileService(repository).getAgentSnapshot();
    expect(agentView.catalog.find((entry) => entry.path === "basic.fullName"))
      .toEqual(expect.objectContaining({ kind: "text", hasValue: false }));
    await expect(new ProfileService(repository).createResolver().resolveScalar({
      profileVersion: saved.profileVersion,
      profilePath: "basic.fullName"
    })).resolves.toBe("");
  });

  it("Agent snapshot carries profileVersion so application plans can bind and become stale", async () => {
    const initial = await repository.initialize();
    const service = new ProfileService(repository);
    const firstAgentView = await service.getAgentSnapshot();
    const changed = structuredClone(initial.profile);
    changed.basic.fullName = "Changed";
    const saved = await repository.save({ profile: changed, expectedProfileVersion: initial.profileVersion });
    const secondAgentView = await service.getAgentSnapshot();
    expect(firstAgentView.profileVersion).toBe(initial.profileVersion);
    expect(secondAgentView.profileVersion).toBe(saved.profileVersion);
    expect(secondAgentView.profileVersion).not.toBe(firstAgentView.profileVersion);
  });

  it("uses typed fail-closed errors", () => {
    expect(new ProfileServiceError("conflict", "safe")).toEqual(expect.objectContaining({ code: "conflict" }));
  });
});
