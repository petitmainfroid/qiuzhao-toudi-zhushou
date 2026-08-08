import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("extension foundation", () => {
  it("keeps the embedded browser-kernel permission surface exact", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(process.cwd(), "public/manifest.json"), "utf8")
    );

    expect(manifest.manifest_version).toBe(3);
    expect([...manifest.permissions].sort()).toEqual([
      "activeTab",
      "alarms",
      "debugger",
      "sidePanel",
      "storage",
      "tabs",
      "webNavigation"
    ]);
    expect(manifest.host_permissions).toEqual(["<all_urls>"]);
    expect(manifest.optional_host_permissions).toBeUndefined();
    for (const forbidden of ["cookies", "downloads", "nativeMessaging", "tabGroups", "webRequest", "webRequestBlocking"]) {
      expect(manifest.permissions).not.toContain(forbidden);
    }
  });
});
