import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import type { ProfileHostUiAsset, ProfileHostUiBundle } from "./contracts";

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

async function collectAssets(root: string, directory: string, assets: Record<string, ProfileHostUiAsset>): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectAssets(root, absolute, assets);
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = extname(entry.name).toLowerCase();
    const contentType = MIME_TYPES[extension];
    if (contentType === undefined) continue;
    const assetPath = `/${relative(root, absolute).split(sep).join("/")}`;
    assets[assetPath] = { body: await readFile(absolute), contentType };
  }
}

export async function loadProfileHostUiBundle(directory: string): Promise<ProfileHostUiBundle> {
  const root = resolve(directory);
  const indexHtml = await readFile(join(root, "index.html"), "utf8");
  const assets: Record<string, ProfileHostUiAsset> = {};
  await collectAssets(root, join(root, "assets"), assets);
  for (const name of ["noise.svg"] as const) {
    const contentType = MIME_TYPES[extname(name)];
    try {
      assets[`/${name}`] = { body: await readFile(join(root, name)), contentType };
    } catch {
      // The UI remains usable when an optional texture is absent.
    }
  }
  return { indexHtml, assets };
}
