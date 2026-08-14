import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../../shared/domain/profile";
import { compilePlan, PolicyCompilationError } from "../../../modules/policy-compiler/src";
import {
  FileProfileRepository,
  ProfileService,
  type AtRestProtector
} from "../src";

const protector: AtRestProtector = {
  providerId: "synthetic-policy-integration",
  async protect(value) { return `protected:${Buffer.from(value).toString("base64")}`; },
  async unprotect(value) { return Buffer.from(value.slice("protected:".length), "base64").toString("utf8"); }
};

describe("profile version policy integration", () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("compiles a canonical ordinary field and rejects the same plan binding after a profile save", async () => {
    const directory = await mkdtemp(join(tmpdir(), "qiuzhao-profile-policy-"));
    directories.push(directory);
    const repository = new FileProfileRepository({ filePath: join(directory, "profile.json"), protector });
    const profile = createEmptyProfile();
    profile.basic.fullName = "Synthetic Candidate";
    const initial = await repository.initialize(profile);
    const service = new ProfileService(repository);
    const firstCatalog = await service.getAgentSnapshot();
    const plannerRequest = {
      schemaVersion: 1 as const,
      runFlags: {
        plannerSource: "ai" as const,
        legacyFieldTemplateEnabled: false as const,
        companyFieldOverrideRequired: false as const
      },
      fields: [{
        ref: "field_name",
        section: "basic",
        label: "姓名",
        role: "textbox",
        required: true,
        hasValue: false,
        capability: "fill_text" as const,
        safetyClass: "ordinary" as const,
        options: [],
        conditional: false
      }],
      profilePathCatalog: firstCatalog.catalog
    };
    const binding = {
      origin: "https://xiaomi.jobs.f.mioffice.cn",
      leaseId: "lease_profile_test",
      profileVersion: firstCatalog.profileVersion,
      pageEpoch: 1
    };
    const proposal = {
      schemaVersion: 1 as const,
      decisions: [{ kind: "map" as const, ref: "field_name", profilePath: "basic.fullName" }]
    };

    const plan = compilePlan({
      plannerRequest,
      proposal,
      binding,
      authority: {
        origin: binding.origin,
        activeLeaseId: binding.leaseId,
        profileVersion: binding.profileVersion,
        pageEpoch: binding.pageEpoch,
        leaseActive: true
      },
      attemptBudget: 2
    });
    expect(plan.decisions[0]).toEqual(expect.objectContaining({
      disposition: "fill_from_profile",
      profilePath: "basic.fullName"
    }));

    const changed = structuredClone(initial.profile);
    changed.basic.fullName = "Synthetic Candidate Updated";
    await repository.save({ profile: changed, expectedProfileVersion: initial.profileVersion });
    const latestCatalog = await service.getAgentSnapshot();
    expect(latestCatalog.profileVersion).not.toBe(binding.profileVersion);
    expect(() => compilePlan({
      plannerRequest,
      proposal,
      binding,
      authority: {
        origin: binding.origin,
        activeLeaseId: binding.leaseId,
        profileVersion: latestCatalog.profileVersion,
        pageEpoch: binding.pageEpoch,
        leaseActive: true
      },
      attemptBudget: 2
    })).toThrow(expect.objectContaining<Partial<PolicyCompilationError>>({ code: "profile_version_mismatch" }));
  });
});
