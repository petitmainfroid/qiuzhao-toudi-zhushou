import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const playwrightCli = resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js");
const run = spawnSync(process.execPath, [
  playwrightCli,
  "test",
  "tests/e2e/kernel-adapters.spec.ts",
  "--workers=1",
  "--reporter=line"
], {
  cwd: projectRoot,
  stdio: "inherit",
  windowsHide: true
});
if (run.status !== 0) throw new Error(`Kernel adapter browser evaluation failed with exit code ${run.status ?? "unknown"}.`);

const report = JSON.parse(await readFile(resolve(projectRoot, "artifacts", "kernel-adapters-report.json"), "utf8"));
if (
  report.syntheticOnly !== true
  || report.familyCount !== 3
  || report.gate?.pass !== true
  || report.aggregate?.wrongControlWriteCount !== 0
  || report.aggregate?.finalSubmitActionCount !== 0
) throw new Error("Kernel adapter report did not satisfy the allowlisted acceptance contract.");

console.log(JSON.stringify({
  suiteVersion: report.suiteVersion,
  familyCount: report.familyCount,
  aggregate: report.aggregate,
  safety: report.safety,
  gate: report.gate
}, null, 2));
