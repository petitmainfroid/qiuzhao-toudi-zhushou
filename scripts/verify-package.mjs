import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const archivePath = resolve(projectRoot, "qiuzhao-profile-assistant.zip");
await access(archivePath);

const escapedPath = archivePath.replaceAll("'", "''");
const listCommand = [
  "Add-Type -AssemblyName System.IO.Compression.FileSystem",
  `$archive = [System.IO.Compression.ZipFile]::OpenRead('${escapedPath}')`,
  "$archive.Entries | ForEach-Object { $_.FullName }",
  "$archive.Dispose()"
].join("; ");
const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", listCommand], {
  cwd: projectRoot,
  encoding: "utf8"
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || "Unable to inspect package archive.\n");
  process.exit(result.status ?? 1);
}

const entries = result.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
const normalizedEntries = entries.map((entry) => entry.replaceAll("\\", "/"));
const required = ["manifest.json", "options.html", "sidepanel.html", "background.js", "content.js"];
for (const file of required) {
  if (!normalizedEntries.includes(file)) throw new Error(`Package is missing ${file}.`);
}

const forbiddenPatterns = [
  /(^|\/)fixture(?:\.|\/)/i,
  /(^|\/)(tests?|test-results|playwright-report)(\/|$)/i,
  /\.map$/i,
  /candidateprofile/i,
  /fieldmappings/i
];
const forbidden = normalizedEntries.filter((entry) =>
  forbiddenPatterns.some((pattern) => pattern.test(entry))
);
if (forbidden.length > 0) {
  throw new Error(`Forbidden package entries: ${forbidden.join(", ")}`);
}

console.log(`Verified package archive with ${normalizedEntries.length} entries.`);
console.log("Verified no test fixture, source map, or persisted personal-data file is included.");
