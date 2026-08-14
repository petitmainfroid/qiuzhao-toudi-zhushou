import { mkdtemp, mkdir, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLocalProfilePath } from "../src/launcher";

describe("local profile path policy", () => {
  it("derives a fixed profile file below an absolute application directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "qiuzhao-appdata-"));
    const resolved = await resolveLocalProfilePath(directory);
    const trustedDirectory = await realpath(directory);
    expect(resolved).toBe(join(trustedDirectory, "profile", "profile.json"));
    expect(dirname(resolved)).toBe(join(trustedDirectory, "profile"));
    await expect(resolveLocalProfilePath("relative-app-data")).rejects.toThrow("absolute");
  });

  it("rejects an existing profile symlink/reparse entry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "qiuzhao-appdata-link-"));
    const target = await mkdtemp(join(tmpdir(), "qiuzhao-profile-target-"));
    await mkdir(join(directory, "profile"));
    await symlink(target, join(directory, "profile", "escape"), "junction");
    await expect(resolveLocalProfilePath(directory)).rejects.toThrow("unsafe reparse");
  });
});
