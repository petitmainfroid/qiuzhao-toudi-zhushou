import { spawnSync } from "node:child_process";
import { access, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const archive = resolve(projectRoot, "qiuzhao-profile-assistant.zip");
if (!process.env.npm_execpath) {
  throw new Error("npm_execpath is unavailable. Run packaging through `npm run package`.");
}

const validation = spawnSync(process.execPath, [process.env.npm_execpath, "run", "validate"], {
  cwd: projectRoot,
  stdio: "inherit"
});
if (validation.status !== 0) process.exit(validation.status ?? 1);

await rm(archive, { force: true });
const command = `Compress-Archive -Path '${resolve(projectRoot, "dist", "*")}' -DestinationPath '${archive}' -CompressionLevel Optimal`;
const packaging = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
  cwd: projectRoot,
  stdio: "inherit"
});
if (packaging.status !== 0) process.exit(packaging.status ?? 1);
await access(archive);
console.log(`Created ${archive}`);

const packageAudit = spawnSync(process.execPath, [
  resolve(projectRoot, "scripts/verify-package.mjs")
], {
  cwd: projectRoot,
  stdio: "inherit"
});
if (packageAudit.status !== 0) process.exit(packageAudit.status ?? 1);
