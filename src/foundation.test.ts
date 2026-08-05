import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("extension foundation", () => {
  it("keeps the Manifest V3 permission surface minimal", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(process.cwd(), "public/manifest.json"), "utf8")
    );

    expect(manifest.manifest_version).toBe(3);
    expect([...manifest.permissions].sort()).toEqual([
      "activeTab",
      "scripting",
      "sidePanel",
      "storage"
    ]);
    expect(manifest.host_permissions).toBeUndefined();
  });
});
