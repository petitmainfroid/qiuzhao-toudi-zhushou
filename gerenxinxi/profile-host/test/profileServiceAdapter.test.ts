import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../../shared/domain/profile";
import { FileProfileRepository, type AtRestProtector } from "../../profile-service/src";
import { FileProfileHostStore, ProfileHostConflictError } from "../src";

const testProtector: AtRestProtector = {
  providerId: "synthetic-test-protector",
  async protect(plaintext) {
    return `protected:${Buffer.from(plaintext).toString("base64")}`;
  },
  async unprotect(payload) {
    return Buffer.from(payload.slice("protected:".length), "base64").toString("utf8");
  }
};

describe("FileProfileHostStore", () => {
  it("uses the encrypted file repository and maps its version conflicts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "qiuzhao-profile-host-"));
    const filePath = join(directory, "profile.json");
    const repository = new FileProfileRepository({ filePath, protector: testProtector });
    const clearSpy = vi.spyOn(repository, "clear");
    const store = new FileProfileHostStore(repository);
    const initial = await store.initialize();
    expect(initial.revision).toMatch(/^pv_[a-f0-9]{64}$/);

    const profile = createEmptyProfile();
    profile.basic.fullName = "Synthetic Candidate";
    const saved = await store.save({ profile, expectedRevision: initial.revision });
    expect(saved.profile.basic.fullName).toBe("Synthetic Candidate");
    await expect(store.save({ profile, expectedRevision: initial.revision })).rejects.toBeInstanceOf(ProfileHostConflictError);

    const cleared = await store.clear({ expectedRevision: saved.revision });
    expect(clearSpy).toHaveBeenCalledOnce();
    expect(cleared.profile.basic.fullName).toBe("");
    const disk = await readFile(filePath, "utf8");
    expect(disk).not.toContain("Synthetic Candidate");
    expect(disk).toContain("protectedPayload");
  });
});
