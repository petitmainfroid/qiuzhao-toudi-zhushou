import { spawnSync } from "node:child_process";
import { access, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { zipSync } from "fflate";

if (!process.env.npm_execpath) {
  throw new Error("npm_execpath is unavailable. Run packaging through `npm run package:release`.");
}

const projectRoot = resolve(import.meta.dirname, "..");
const skillName = "qiuzhao-toudi-assistant";
const bundlePath = resolve(projectRoot, `${skillName}-bundle.zip`);
const extensionArchive = resolve(projectRoot, "qiuzhao-profile-assistant.zip");
const skillArchive = resolve(projectRoot, `${skillName}-skill.zip`);

const extensionPackaging = spawnSync(process.execPath, [process.env.npm_execpath, "run", "package"], {
  cwd: projectRoot,
  stdio: "inherit"
});
if (extensionPackaging.status !== 0) process.exit(extensionPackaging.status ?? 1);

const skillPackaging = spawnSync(process.execPath, [resolve(projectRoot, "scripts", "package-skill.mjs")], {
  cwd: projectRoot,
  stdio: "inherit"
});
if (skillPackaging.status !== 0) process.exit(skillPackaging.status ?? 1);

await Promise.all([access(extensionArchive), access(skillArchive)]);
const archiveEntries = {};
async function addDirectory(directory, archivePrefix) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await addDirectory(absolutePath, `${archivePrefix}/${entry.name}`);
    } else if (entry.isFile()) {
      archiveEntries[`${archivePrefix}/${entry.name}`] = new Uint8Array(await readFile(absolutePath));
    }
  }
}

await addDirectory(resolve(projectRoot, "dist"), `${skillName}/extension`);
await addDirectory(resolve(projectRoot, "skills", skillName), `${skillName}/skill/${skillName}`);
for (const filename of ["README.md", "PRIVACY.md", "LICENSE"]) {
  archiveEntries[`${skillName}/${filename}`] = new Uint8Array(await readFile(resolve(projectRoot, filename)));
}

const entryNames = Object.keys(archiveEntries);
for (const required of [
  `${skillName}/extension/manifest.json`,
  `${skillName}/skill/${skillName}/SKILL.md`,
  `${skillName}/README.md`,
  `${skillName}/PRIVACY.md`,
  `${skillName}/LICENSE`
]) {
  if (!entryNames.includes(required)) throw new Error(`Release bundle is missing ${required}.`);
}
const forbidden = entryNames.filter((entry) => /(^|\/)(?:node_modules|\.env|tests?|test-results|artifacts)(\/|$)|\.map$/i.test(entry));
if (forbidden.length > 0) throw new Error(`Forbidden release entries: ${forbidden.join(", ")}`);

await rm(bundlePath, { force: true });
await writeFile(bundlePath, zipSync(archiveEntries, { level: 9 }));
await access(bundlePath);
console.log(`Created and verified ${bundlePath} with ${entryNames.length} entries.`);
console.log(`Release assets: ${extensionArchive}, ${skillArchive}, ${bundlePath}`);
