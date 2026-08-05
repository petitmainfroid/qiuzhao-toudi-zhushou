import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const skillName = "qiuzhao-toudi-assistant";
const projectRoot = resolve(import.meta.dirname, "..");
const source = resolve(projectRoot, "skills", skillName);
const temporaryRoot = await mkdtemp(join(tmpdir(), "qiuzhao-skill-install-"));
const destination = resolve(temporaryRoot, "skills");

try {
  const result = spawnSync(process.execPath, [
    resolve(projectRoot, "scripts", "install-skill.mjs"),
    "--destination",
    destination
  ], { cwd: projectRoot, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "Skill installation test failed.\n");
    process.exit(result.status ?? 1);
  }

  for (const relativePath of ["SKILL.md", "agents/openai.yaml", "scripts/prepare-extension.ps1"]) {
    const original = await readFile(resolve(source, relativePath), "utf8");
    const installed = await readFile(resolve(destination, skillName, relativePath), "utf8");
    if (installed !== original) throw new Error(`Installed Skill differs at ${relativePath}.`);
  }
  console.log("Verified isolated Skill installation and byte-identical required files.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
