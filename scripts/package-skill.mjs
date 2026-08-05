import { spawnSync } from "node:child_process";
import { access, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const skillName = "qiuzhao-toudi-assistant";
const skillRoot = resolve(projectRoot, "skills", skillName);
const archivePath = resolve(projectRoot, `${skillName}-skill.zip`);

for (const scriptName of ["verify-skill.mjs", "test-skill-install.mjs"]) {
  const result = spawnSync(process.execPath, [resolve(projectRoot, "scripts", scriptName)], {
    cwd: projectRoot,
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await rm(archivePath, { force: true });
const escapedSource = skillRoot.replaceAll("'", "''");
const escapedArchive = archivePath.replaceAll("'", "''");
const packaging = spawnSync("powershell.exe", [
  "-NoProfile",
  "-Command",
  `Compress-Archive -LiteralPath '${escapedSource}' -DestinationPath '${escapedArchive}' -CompressionLevel Optimal`
], { cwd: projectRoot, stdio: "inherit" });
if (packaging.status !== 0) process.exit(packaging.status ?? 1);
await access(archivePath);

const listCommand = [
  "Add-Type -AssemblyName System.IO.Compression.FileSystem",
  `$archive = [System.IO.Compression.ZipFile]::OpenRead('${escapedArchive}')`,
  "$archive.Entries | ForEach-Object { $_.FullName }",
  "$archive.Dispose()"
].join("; ");
const listing = spawnSync("powershell.exe", ["-NoProfile", "-Command", listCommand], {
  cwd: projectRoot,
  encoding: "utf8"
});
if (listing.status !== 0) process.exit(listing.status ?? 1);
const entries = listing.stdout.split(/\r?\n/).map((entry) => entry.trim().replaceAll("\\", "/")).filter(Boolean);
for (const required of [
  `${skillName}/SKILL.md`,
  `${skillName}/agents/openai.yaml`,
  `${skillName}/scripts/prepare-extension.ps1`
]) {
  if (!entries.includes(required)) throw new Error(`Skill archive is missing ${required}.`);
}
const forbidden = entries.filter((entry) => /(^|\/)(?:node_modules|\.env|tests?|artifacts)(\/|$)|\.(?:pdf|docx?|map)$/i.test(entry));
if (forbidden.length > 0) throw new Error(`Forbidden Skill archive entries: ${forbidden.join(", ")}`);
console.log(`Created and verified ${archivePath} with ${entries.length} entries.`);
