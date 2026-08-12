import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import {
  normalizeCorpusInput,
  structuralDigest,
  validateCorpusSample
} from "./ats-corpus/core.mjs";

const root = process.cwd();
const compareStaged = process.argv.includes("--compare-staged");
const largeFileLimit = 1024 * 1024;
const allowedBinaryExtensions = new Set([".woff2"]);
const forbiddenExtensions = new Set([
  ".env",
  ".jks",
  ".key",
  ".keystore",
  ".p12",
  ".pfx",
  ".pem",
  ".sqlite",
  ".sqlite3"
]);
const allowedIgnoredRoots = [
  "node_modules/",
  "dist/",
  "dist-collector/",
  "artifacts/",
  "playwright-report/",
  "test-results/",
  "tmp/",
  ".chrome-autofill-profile/",
  ".chromium-autofill-profile/"
];

const secretPatterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["openai-style-token", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~-]{24,}\b/i]
];
const localPathPatterns = [
  /[A-Za-z]:\\Users\\[^\\\s]+\\/i,
  /\/Users\/[^/\s]+\//,
  /\/home\/[^/\s]+\//
];
const forbiddenObservationKeys = new Set([
  "authorization",
  "backendnodeid",
  "checked",
  "cookie",
  "cookies",
  "currentvalue",
  "defaultvalue",
  "domid",
  "file",
  "filename",
  "files",
  "headers",
  "innerhtml",
  "nodeid",
  "objectid",
  "outerhtml",
  "password",
  "request",
  "requestbody",
  "response",
  "responsebody",
  "selected",
  "selector",
  "sessionid",
  "token",
  "value"
]);
const personalObservationPatterns = [
  ["email address", /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i],
  ["phone number", /(?:\+?86[-\s]?)?1[3-9]\d{9}|\b\d{3,4}[-\s]\d{7,8}\b/],
  ["identity number", /\b\d{17}[\dXx]\b/],
  ["authorization credential", /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/._~-]+/i],
  ["local path", /\b[A-Za-z]:\\[^\s]+|\/(?:Users|home)\/[^\s]+/],
  ["query value", /[?&][A-Za-z0-9_.~-]+=[^\s&]+/]
];
const expectedLegacyObservation = "ats-corpus/observations/feishu-recruiting/xiaomi/xiaomi__feishu-recruiting__internship-application__2026-08-07T03-06-38-397Z.json";

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function nulList(args) {
  return git(args).split("\0").filter(Boolean).map((path) => path.replaceAll("\\", "/"));
}

function sortedUnique(paths) {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right, "en"));
}

function roleFor(path) {
  if (path.startsWith("ats-corpus/")) return "ATS corpus and anonymous evidence";
  if (path.startsWith("design-prototypes/")) return "developer-only design prototype";
  if (path.startsWith("docs/")) return "acceptance and architecture documentation";
  if (path.startsWith("evals/")) return "evaluation data";
  if (path === "feature_list.json" || path === "progress.md") return "long-running harness ledger";
  if (path.startsWith("scripts/")) return "build, audit, and corpus tooling";
  if (path.startsWith("src/")) return "extension source and unit tests";
  if (path.startsWith("tests/")) return "end-to-end tests and reviewed fixtures";
  if (path === "repeatable-fixture.html") return "local end-to-end fixture";
  if (["package.json", "package-lock.json", "playwright.config.ts", "tsconfig.json", "vite.config.ts"].includes(path)) {
    return "dependency, build, and test configuration";
  }
  if ([".gitignore", "PRIVACY.md", "README.md"].includes(path)) return "repository policy and entry documentation";
  return "other repository material";
}

function topLevel(path) {
  const slash = path.indexOf("/");
  return slash === -1 ? path : path.slice(0, slash);
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function displayMap(title, map) {
  console.log(`\n${title}`);
  for (const [key, value] of [...map.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    console.log(`- ${key}: ${value}`);
  }
}

function isAllowedIgnored(path) {
  if (allowedIgnoredRoots.some((prefix) => path.startsWith(prefix))) return true;
  if (path === ".env" || path.startsWith(".env.")) return true;
  return /(?:^|\/)(?:[^/]+\.log|[^/]+\.zip|\.DS_Store|Thumbs\.db)$/.test(path);
}

function isProbablyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

function inspectObservationPayload(value, path, filePath) {
  if (typeof value === "string") {
    for (const [kind, pattern] of personalObservationPatterns) {
      if (pattern.test(value)) issues.push(`${filePath}: observation contains ${kind} at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => inspectObservationPayload(child, `${path}[${index}]`, filePath));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (forbiddenObservationKeys.has(normalizedKey)) {
      issues.push(`${filePath}: forbidden observation key class at ${path}.${key}`);
    }
    inspectObservationPayload(child, `${path}.${key}`, filePath);
  }
}

const trackedChanged = nulList(["diff", "--name-only", "--diff-filter=ACMRTUXB", "-z", "HEAD", "--"]);
const trackedDeleted = nulList(["diff", "--name-only", "--diff-filter=D", "-z", "HEAD", "--"]);
const untracked = nulList(["ls-files", "--others", "--exclude-standard", "-z"]);
const candidates = sortedUnique([...trackedChanged, ...trackedDeleted, ...untracked]);
const staged = nulList(["diff", "--cached", "--name-only", "-z", "HEAD", "--"]);
const ignored = git(["status", "--ignored", "--short"])
  .split(/\r?\n/)
  .filter((line) => line.startsWith("!! "))
  .map((line) => line.slice(3).replaceAll("\\", "/"));

const issues = [];
const topLevelCounts = new Map();
const roleCounts = new Map();
const extensionCounts = new Map();
let totalBytes = 0;
let existingFiles = 0;
const largeFiles = [];
const binaryFiles = [];
const symlinks = [];
const observationFiles = sortedUnique([
  ...nulList(["ls-files", "-z", "--", "ats-corpus/observations/**/*.json"]),
  ...untracked.filter((path) => path.startsWith("ats-corpus/observations/") && path.endsWith(".json"))
]);
const activeObservationDigests = new Set();
const duplicateObservationDigests = [];
let currentSchemaObservations = 0;
let expectedLegacyObservations = 0;

for (const path of candidates) {
  increment(topLevelCounts, topLevel(path));
  increment(roleCounts, roleFor(path));
  const extension = extname(path).toLowerCase() || "[no extension]";
  increment(extensionCounts, extension);

  if (trackedDeleted.includes(path)) continue;
  const info = lstatSync(path);
  if (info.isSymbolicLink()) {
    symlinks.push(path);
    issues.push(`${path}: symbolic link or reparse point`);
    continue;
  }
  if (!info.isFile()) {
    issues.push(`${path}: candidate is not a regular file`);
    continue;
  }

  existingFiles += 1;
  const size = statSync(path).size;
  totalBytes += size;
  if (size > largeFileLimit) {
    largeFiles.push(path);
    issues.push(`${path}: exceeds ${largeFileLimit} bytes`);
  }
  if (forbiddenExtensions.has(extension) || path === ".env" || path.startsWith(".env.")) {
    issues.push(`${path}: forbidden credential/database extension`);
  }

  const buffer = readFileSync(path);
  if (isProbablyBinary(buffer)) {
    binaryFiles.push(path);
    if (!allowedBinaryExtensions.has(extension)) issues.push(`${path}: unexpected binary file`);
    continue;
  }

  const text = buffer.toString("utf8");
  for (const [kind, pattern] of secretPatterns) {
    if (pattern.test(text)) issues.push(`${path}: ${kind} pattern`);
  }
  if (localPathPatterns.some((pattern) => pattern.test(text))) {
    issues.push(`${path}: local absolute user path`);
  }
}

for (const path of observationFiles) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  }
  catch {
    issues.push(`${path}: observation is not valid JSON`);
    continue;
  }
  const observation = parsed?.corpusSchemaVersion === undefined ? parsed : parsed.observation;
  const privacy = observation?.privacy;
  const expectedPrivacyKeys = [
    "currentValuesIncluded",
    "sessionReferencesIncluded",
    "queryValuesIncluded",
    "fileMetadataIncluded"
  ];
  if (!privacy || expectedPrivacyKeys.some((key) => privacy[key] !== false)) {
    issues.push(`${path}: observation privacy attestations are missing or non-false`);
  }
  inspectObservationPayload(observation, "$", path);

  const sample = normalizeCorpusInput(parsed);
  const digest = structuralDigest(sample);
  if (path.startsWith("ats-corpus/observations/_duplicate-downloads/")) {
    duplicateObservationDigests.push([path, digest]);
  }
  else {
    activeObservationDigests.add(digest);
  }
  try {
    await validateCorpusSample(sample, { projectRoot: root });
    currentSchemaObservations += 1;
  }
  catch (error) {
    if (path === expectedLegacyObservation && error?.code === "schema-invalid") {
      expectedLegacyObservations += 1;
    }
    else {
      issues.push(`${path}: observation schema/privacy audit failed (${error?.code ?? "unknown"})`);
    }
  }
}

for (const [path, digest] of duplicateObservationDigests) {
  if (!activeObservationDigests.has(digest)) {
    issues.push(`${path}: duplicate observation has no matching active representative`);
  }
}
if (expectedLegacyObservations !== 1) {
  issues.push(`${expectedLegacyObservation}: expected exactly one fail-closed legacy schema observation`);
}

const unexpectedIgnored = ignored.filter((path) => !isAllowedIgnored(path));
for (const path of unexpectedIgnored) issues.push(`${path}: ignored path is outside the allowlist`);
for (const path of candidates) {
  if (isAllowedIgnored(path)) issues.push(`${path}: ignored/local output entered the checkpoint candidate set`);
}

const manifestDigest = createHash("sha256").update(`${candidates.join("\n")}\n`).digest("hex");

console.log("Pre-K5 root checkpoint audit");
console.log(`- branch: ${git(["branch", "--show-current"]).trim()}`);
console.log(`- head: ${git(["rev-parse", "HEAD"]).trim()}`);
console.log(`- tracked changed: ${trackedChanged.length}`);
console.log(`- tracked deleted: ${trackedDeleted.length}`);
console.log(`- untracked: ${untracked.length}`);
console.log(`- candidate paths: ${candidates.length}`);
console.log(`- existing regular files: ${existingFiles}`);
console.log(`- candidate bytes: ${totalBytes}`);
console.log(`- candidate manifest sha256: ${manifestDigest}`);
console.log(`- ignored entries summarized by git: ${ignored.length}`);
console.log(`- staged paths: ${staged.length}`);
console.log(`- active observation files: ${observationFiles.length - duplicateObservationDigests.length}`);
console.log(`- excluded duplicate observations: ${duplicateObservationDigests.length}`);
console.log(`- current-schema observation files: ${currentSchemaObservations}`);
console.log(`- expected fail-closed legacy observations: ${expectedLegacyObservations}`);

displayMap("Candidate paths by top-level entry", topLevelCounts);
displayMap("Candidate paths by intended role", roleCounts);
displayMap("Candidate paths by extension", extensionCounts);

console.log("\nBinary allowlist");
console.log(`- allowed .woff2 files: ${binaryFiles.filter((path) => extname(path).toLowerCase() === ".woff2").length}`);
console.log(`- unexpected binary files: ${binaryFiles.filter((path) => !allowedBinaryExtensions.has(extname(path).toLowerCase())).length}`);
console.log(`- files over 1 MiB: ${largeFiles.length}`);
console.log(`- symbolic links/reparse points: ${symlinks.length}`);

console.log("\nIgnored local/build outputs");
for (const path of ignored) console.log(`- ${path}`);

if (compareStaged) {
  const candidateSet = new Set(candidates);
  const stagedSet = new Set(staged);
  const missingFromStage = candidates.filter((path) => !stagedSet.has(path));
  const extraInStage = staged.filter((path) => !candidateSet.has(path));
  if (missingFromStage.length > 0) issues.push(`${missingFromStage.length} audited candidate path(s) are not staged`);
  if (extraInStage.length > 0) issues.push(`${extraInStage.length} staged path(s) are outside the audited candidates`);
  console.log("\nStaged manifest comparison");
  console.log(`- missing from stage: ${missingFromStage.length}`);
  console.log(`- extra in stage: ${extraInStage.length}`);
}

if (issues.length > 0) {
  console.error("\nAudit failed (paths and rule classes only; matched values are never printed):");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("\nAudit passed: no high-confidence secret, local absolute user path, unexpected large/binary file, symlink, or ignored output entered the candidate set.");
