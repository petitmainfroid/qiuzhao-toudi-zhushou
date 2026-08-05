import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const projectRoot = resolve(import.meta.dirname, "..");
const artifactsRoot = resolve(projectRoot, "artifacts");
const observationPath = resolve(artifactsRoot, "resume-completeness-observation.json");
const judgePath = resolve(artifactsRoot, "resume-completeness-judge.json");
const checkpointPath = resolve(artifactsRoot, "resume-completeness-judge-checkpoint.json");
const judgeRequested = process.argv.includes("--judge");
const offlineRequested = process.argv.includes("--offline") || !judgeRequested;
const skipBrowser = process.argv.includes("--skip-browser");
const requestedSample = process.argv.find((argument) => argument.startsWith("--sample="))?.slice("--sample=".length).toUpperCase() ?? null;

if (requestedSample && !/^[A-F0-9]{8}$/.test(requestedSample)) {
  throw new Error("--sample must be an eight-character hexadecimal digest.");
}

if (judgeRequested && process.argv.includes("--offline")) {
  throw new Error("Choose either --offline or --judge, not both.");
}

function parseEnvironment(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

async function loadPolicy() {
  const bundled = await build({
    entryPoints: [resolve(projectRoot, "src", "evaluation", "resumeCompletenessPolicy.ts")],
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
    "tests/e2e/resume-completeness-eval.spec.ts",
    "--reporter=line"
  ], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true
  });
  if (run.status !== 0) throw new Error(`Resume browser observation failed with exit code ${run.status ?? "unknown"}.`);
}

function summarizeObservation(observation) {
  const parsedFacts = observation.samples.reduce((sum, sample) => sum + sample.parsedFacts.length, 0);
  const webFillableFacts = observation.samples.reduce((sum, sample) => sum + sample.parsedFacts.filter((fact) => fact.webFillable).length, 0);
  return {
    mode: offlineRequested ? "offline" : "judge",
    suiteVersion: observation.suiteVersion,
    sampleCount: observation.samples.length,
    formatCounts: Object.fromEntries(["pdf", "docx"].map((format) => [format, observation.samples.filter((sample) => sample.format === format).length])),
    sourceLineCount: observation.samples.reduce((sum, sample) => sum + sample.sourceLineCount, 0),
    redactionCount: observation.samples.reduce((sum, sample) => sum + sample.redactionCount, 0),
    parsedFacts,
    webFillableFacts,
    parserWarningCount: observation.samples.reduce((sum, sample) => sum + sample.parserWarningCount, 0),
    directIdentifiersRemoved: observation.directIdentifiersRemoved
  };
}

async function judgeSample(policy, config, sample, index, total) {
  const requestBody = policy.buildResumeCompletenessJudgeRequest(sample, config.model);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = performance.now();
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(105_000),
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const error = new Error(`Resume judge request ${index + 1}/${total} failed with HTTP ${response.status}; response body was not logged.`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      const result = policy.parseResumeJudgeApiResponse(await response.json(), config.model, sample);
      const latencyMs = Math.round(performance.now() - startedAt);
      console.log(JSON.stringify({
        completed: `${index + 1}/${total}`,
        sampleId: sample.sampleId,
        verdict: result.verdict,
        findingCount: result.findings.length,
        calibrationAccuracy: result.calibration.accuracy,
        modelMatchesConfiguration: result.modelMatchesConfiguration,
        latencyMs,
        attempt
      }));
      return { latencyMs, ...result };
    }
    catch (error) {
      const retryable = error?.retryable === true
        || error?.name === "TimeoutError"
        || error?.name === "AbortError"
        || /malformed|bounded JSON|operation was aborted/i.test(error instanceof Error ? error.message : "");
      if (attempt >= 2 || !retryable) throw error;
      console.log(JSON.stringify({ retrying: `${index + 1}/${total}`, sampleId: sample.sampleId, reason: "retryable-timeout-or-response-error" }));
    }
  }
  throw new Error(`Resume judge request ${index + 1}/${total} exhausted its retry budget.`);
}

async function loadCheckpoint(observation, configuredModel) {
  try {
    const value = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (value?.schemaVersion !== 1 || value?.suiteVersion !== observation.suiteVersion || value?.configuredModel !== configuredModel || !Array.isArray(value.samples)) return [];
    const allowed = new Set(observation.samples.map((sample) => sample.sampleId));
    return value.samples.filter((sample) => allowed.has(sample.sampleId));
  }
  catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function saveCheckpoint(observation, configuredModel, results) {
  await writeFile(checkpointPath, `${JSON.stringify({
    schemaVersion: 1,
    suiteVersion: observation.suiteVersion,
    generatedAt: new Date().toISOString(),
    configuredModel,
    directIdentifiersRemoved: true,
    samples: results.filter(Boolean)
  }, null, 2)}\n`, "utf8");
}

function buildAggregate(results, observation) {
  const findings = results.flatMap((result) => result.findings);
  const statusCounts = Object.fromEntries(["missing", "incorrect", "ambiguous", "unsupported"].map((status) => [status, findings.filter((finding) => finding.status === status).length]));
  const parsedFacts = observation.samples.reduce((sum, sample) => sum + sample.parsedFacts.length, 0);
  const supportedDefects = statusCounts.missing + statusCounts.incorrect;
  return {
    parsedFacts,
    statusCounts,
    estimatedEvidenceBackedAccuracy: parsedFacts + statusCounts.missing === 0
      ? 1
      : Number((Math.max(0, parsedFacts - statusCounts.incorrect) / (parsedFacts + statusCounts.missing)).toFixed(4)),
    highConfidenceActionable: findings.filter((finding) => finding.confidence === "high" && ["missing", "incorrect"].includes(finding.status)).length,
    supportedDefects,
    calibrationPerfect: results.every((result) => result.calibration.accuracy === 1),
    modelMatchedEveryCall: results.every((result) => result.modelMatchesConfiguration),
    promptTokens: results.reduce((sum, result) => sum + (result.usage.promptTokens ?? 0), 0),
    completionTokens: results.reduce((sum, result) => sum + (result.usage.completionTokens ?? 0), 0),
    totalTokens: results.reduce((sum, result) => sum + (result.usage.totalTokens ?? 0), 0),
    latencyMs: results.reduce((sum, result) => sum + result.latencyMs, 0)
  };
}

async function main() {
  const policy = await loadPolicy();
  let judgeConfig;
  if (judgeRequested) {
    const localEnvironment = await loadLocalEnvironment();
    judgeConfig = policy.resolveJudgeConfig({ ...localEnvironment, ...process.env });
  }
  if (!skipBrowser) runBrowserObservation();
  const observation = JSON.parse(await readFile(observationPath, "utf8"));
  policy.assertResumeCompletenessObservation(observation);
  const selectedSamples = requestedSample
    ? observation.samples.filter((sample) => sample.sampleId === requestedSample)
    : observation.samples;
  if (selectedSamples.length === 0) throw new Error(`Requested sample ${requestedSample} is not present in the observation.`);
  const selectedObservation = { ...observation, samples: selectedSamples };
  console.log(JSON.stringify({ ...summarizeObservation(selectedObservation), selection: requestedSample ?? "all" }, null, 2));
  if (offlineRequested) return;

  const cached = await loadCheckpoint(selectedObservation, judgeConfig.model);
  const cachedById = new Map(cached.map((result) => [result.sampleId, result]));
  const results = new Array(selectedSamples.length);
  for (let index = 0; index < selectedSamples.length; index += 1) {
    const sample = selectedSamples[index];
    const existing = cachedById.get(sample.sampleId);
    if (existing) {
      results[index] = existing;
      console.log(JSON.stringify({ resumed: `${index + 1}/${selectedSamples.length}`, sampleId: sample.sampleId }));
      continue;
    }
    results[index] = await judgeSample(policy, judgeConfig, sample, index, selectedSamples.length);
    await saveCheckpoint(selectedObservation, judgeConfig.model, results);
  }
  const aggregate = buildAggregate(results, selectedObservation);
  const persisted = {
    schemaVersion: 1,
    suiteVersion: observation.suiteVersion,
    generatedAt: new Date().toISOString(),
    corpusScope: observation.corpusScope,
    directIdentifiersRemoved: true,
    selection: requestedSample ?? "all",
    aggregate,
    samples: results
  };
  const outputPath = requestedSample
    ? resolve(artifactsRoot, `resume-completeness-judge-${requestedSample}.json`)
    : judgePath;
  await writeFile(outputPath, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ judge: aggregate }, null, 2));
  if (!aggregate.calibrationPerfect || !aggregate.modelMatchedEveryCall) process.exitCode = 2;
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown resume completeness evaluation failure.";
  console.error(`Resume completeness evaluation stopped: ${message}`);
  process.exitCode = 1;
});
