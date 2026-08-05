import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const projectRoot = resolve(import.meta.dirname, "..");
const artifactsRoot = resolve(projectRoot, "artifacts");
const observationPath = resolve(artifactsRoot, "fill-quality-observation.json");
const reportPath = resolve(artifactsRoot, "fill-quality-report.json");
const judgePath = resolve(artifactsRoot, "fill-quality-judge.json");
const judgeRequested = process.argv.includes("--judge");
const offlineRequested = process.argv.includes("--offline") || !judgeRequested;
const skipBrowser = process.argv.includes("--skip-browser");

if (judgeRequested && process.argv.includes("--offline")) {
  throw new Error("Choose either --offline or --judge, not both.");
}

function parseEnvironment(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function loadJudgePolicy() {
  const bundled = await build({
    entryPoints: [resolve(projectRoot, "src", "evaluation", "judgePolicy.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    write: false,
    logLevel: "silent"
  });
  const source = bundled.outputFiles[0].contents;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

async function loadLocalEnvironment() {
  try {
    return parseEnvironment(await readFile(resolve(projectRoot, ".env"), "utf8"));
  }
  catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function runBrowserObservation() {
  const playwrightCli = resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js");
  const run = spawnSync(process.execPath, [
    playwrightCli,
    "test",
    "tests/e2e/fill-quality-eval.spec.ts",
    "--reporter=line"
  ], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true
  });
  if (run.status !== 0) throw new Error(`Browser observation failed with exit code ${run.status ?? "unknown"}.`);
}

async function main() {
  const policy = await loadJudgePolicy();
  let judgeConfig;
  if (judgeRequested) {
    const localEnvironment = await loadLocalEnvironment();
    judgeConfig = policy.resolveJudgeConfig({ ...localEnvironment, ...process.env });
  }
  if (!skipBrowser) runBrowserObservation();

  const artifact = JSON.parse(await readFile(observationPath, "utf8"));
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  policy.assertSyntheticFillQualityArtifact(artifact);
  if (report.syntheticOnly !== true || report.suiteVersion !== artifact.suiteVersion) {
    throw new Error("Deterministic report is missing or does not match the observation suite.");
  }

  console.log(JSON.stringify({
    mode: offlineRequested ? "offline" : "judge",
    suiteVersion: report.suiteVersion,
    matching: report.matching,
    filling: report.filling,
    exclusions: report.exclusions,
    repeatableCoverage: report.repeatableCoverage,
    attachmentTargeting: report.attachmentTargeting,
    duplicateProposalCount: report.duplicateProposalCount,
    safety: report.safety,
    gate: report.gate
  }, null, 2));

  if (offlineRequested) {
    if (!report.gate.pass) process.exitCode = 1;
  }
  else {
    const requestBody = policy.buildJudgeRequest(artifact, report, judgeConfig.model);
    const startedAt = performance.now();
    const response = await fetch(judgeConfig.endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(45_000),
      headers: {
        "Authorization": `Bearer ${judgeConfig.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    if (!response.ok) throw new Error(`Judge request failed with HTTP ${response.status}; response body was not logged.`);
    const sanitized = policy.parseJudgeApiResponse(await response.json(), judgeConfig.model);
    const persisted = {
      schemaVersion: 1,
      suiteVersion: report.suiteVersion,
      generatedAt: new Date().toISOString(),
      syntheticOnly: true,
      latencyMs,
      ...sanitized
    };
    await writeFile(judgePath, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      judge: {
        verdict: sanitized.verdict,
        findingCount: sanitized.findings.length,
        calibration: sanitized.calibration,
        returnedModel: sanitized.returnedModel,
        modelMatchesConfiguration: sanitized.modelMatchesConfiguration,
        latencyMs,
        usage: sanitized.usage
      }
    }, null, 2));
    if (sanitized.calibration.accuracy < 1 || !sanitized.modelMatchesConfiguration) process.exitCode = 2;
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown evaluation failure.";
  console.error(`Fill-quality evaluation stopped: ${message}`);
  process.exitCode = 1;
});
