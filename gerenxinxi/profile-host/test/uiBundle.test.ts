import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "../../../shared/domain/profile";
import { loadProfileHostUiBundle } from "../src/assets";
import { startProfileHost } from "../src/host";

describe("built ProfileEditor UI", () => {
  it("loads the real build directory with every referenced local resource and no inline CSP exceptions", async () => {
    const buildDirectory = resolve(__dirname, "../dist-ui");
    const bundle = await loadProfileHostUiBundle(buildDirectory);
    expect(bundle.indexHtml).toContain('<div id="root"></div>');
    expect(bundle.indexHtml).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(bundle.indexHtml).not.toContain("<style");

    const references = [...bundle.indexHtml.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((match) => match[1]!);
    for (const reference of references) expect(bundle.assets[reference], reference).toBeDefined();
    expect(bundle.assets["/noise.svg"]).toBeDefined();

    const scripts = (await readdir(resolve(buildDirectory, "assets")))
      .filter((name) => name.endsWith(".js"));
    const source = (await Promise.all(scripts.map((name) => readFile(resolve(buildDirectory, "assets", name), "utf8")))).join("\n");
    expect(source).not.toMatch(/chrome\.(?:runtime|storage)/);
    expect(source).not.toContain("ChromeLocalStorage");
    expect(source).not.toContain("window.localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).toContain("/api/resume");

    const host = await startProfileHost({
      ui: bundle,
      store: {
        async load() { return { profile: createEmptyProfile(), revision: "synthetic-revision" }; },
        async save({ profile }) { return { profile, revision: "synthetic-saved" }; },
        async clear() { return { profile: createEmptyProfile(), revision: "synthetic-cleared" }; }
      }
    });
    try {
      for (const reference of references) {
        expect((await fetch(`${host.origin}${reference}`)).status, reference).toBe(401);
      }
      expect((await fetch(`${host.origin}/noise.svg`)).status).toBe(401);
    } finally {
      await host.stop();
    }
  });
});
