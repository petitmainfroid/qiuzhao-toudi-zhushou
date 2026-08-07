import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

export const ATS_CORPUS_SCHEMA_VERSION = 1;
export const ATS_CORPUS_MAX_INPUT_BYTES = 1_000_000;
export const ATS_CORPUS_MAX_FILES = 2_000;
export const ATS_CORPUS_MAX_TOTAL_BYTES = 20_000_000;

const DEFAULT_PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const SCHEMA_RELATIVE_PATH = "ats-corpus/schema/ats-corpus-sample-v1.schema.json";
const FAMILY_ID_PATTERN = /^[a-z][a-z0-9-]{1,47}$/;
const PAGE_TYPE_PATTERN = /^(?:application|profile|screening|assessment|unknown)$/;
const RAW_PATH_IDENTIFIER_PATTERN = /(?:^|\/)(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Za-z0-9_-]{16,})(?:\/|$)/i;
const PERSONAL_PATTERNS = [
  { pattern: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i, description: "email address" },
  { pattern: /(?:\+?86[-\s]?)?1[3-9]\d{9}|\b\d{3,4}[-\s]\d{7,8}\b/, description: "phone number" },
  { pattern: /\b\d{17}[\dXx]\b/, description: "identity number" },
  { pattern: /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/._~-]+/i, description: "authorization credential" },
  { pattern: /\b(?:cookie|set-cookie|password|passwd|pwd)\s*[:=]/i, description: "credential material" },
  { pattern: /\b[A-Za-z]:\\[^\s]+/, description: "local file path" },
  { pattern: /\/(?:Users|home)\/[^\s]+/, description: "local user path" },
  { pattern: /https?:\/\/[^\s]+/i, description: "unexpected URL" },
  { pattern: /[?&][A-Za-z0-9_.~-]+=[^\s&]+/, description: "query value" },
  { pattern: /(?:[A-Za-z0-9+/]{80,}={0,2})/, description: "encoded payload" },
  { pattern: /\b[A-Za-z0-9_-]{48,}\b/, description: "long token" },
  { pattern: /(?:^|[\s\\/])[^\\/\s]{1,80}\.(?:pdf|docx?|pptx?|xlsx?|png|jpe?g|gif|html?|zip|rar)(?=$|[\s,，;；:：)）])/i, description: "file metadata" },
  { pattern: /上次上传|上传时间|更新于|last\s+uploaded|last\s+modified/i, description: "upload status metadata" }
];
const TIMESTAMP_PATTERN = /\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b/;
const DATE_DISPLAY_PATTERN = /^(?:19|20)\d{2}\s*(?:[-/.年])\s*(?:0?[1-9]|1[0-2])(?:\s*月)?(?:\s*(?:[-~至])\s*(?:19|20)?\d{0,4}\s*(?:[-/.年])?\s*(?:0?[1-9]|1[0-2])(?:\s*月)?)?$/;
const FINAL_SUBMIT_PATTERN = /提交申请|提交简历|投递简历|最终提交|确认投递|立即申请|submit\s*application|final\s*submit|apply\s*now/i;

const validatorCache = new Map();

export class AtsCorpusError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AtsCorpusError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new AtsCorpusError(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function prettyCanonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function withoutCaptureTime(sample) {
  const observation = { ...sample.observation };
  delete observation.capturedAt;
  observation.source = { ...observation.source };
  delete observation.source.captureToolVersion;
  return { ...sample, observation };
}

function structuralPayload(sample) {
  const observation = withoutCaptureTime(sample).observation;
  const { family: _family, ...structuralObservation } = observation;
  return structuralObservation;
}

export function structuralDigest(sample) {
  return createHash("sha256").update(canonicalJson(structuralPayload(sample))).digest("hex");
}

function safeBehaviorDefaults(control) {
  const behaviors = [];
  if (control.tag === "input" || control.tag === "textarea") behaviors.push("native-input");
  if (control.tag === "select") behaviors.push("native-select");
  if (control.tag === "contenteditable") behaviors.push("contenteditable");
  if (control.tag === "custom" && ["combobox", "listbox"].includes(control.role)) behaviors.push("custom-select");
  if (control.inputType === "date") behaviors.push("date-input");
  if (control.multiple) behaviors.push("multi-select");
  if (control.boundary === "same-origin-frame") behaviors.push("same-origin-frame");
  if (control.boundary === "open-shadow") behaviors.push("open-shadow");
  if (control.safety === "file") behaviors.push("file-gate");
  return [...new Set(behaviors)];
}

function wrapObservation(observation) {
  const controls = Array.isArray(observation?.controls) ? observation.controls : [];
  return {
    corpusSchemaVersion: ATS_CORPUS_SCHEMA_VERSION,
    observation,
    annotations: {
      reviewStatus: "unreviewed",
      reviewedAt: null,
      reviewedFamilyId: null,
      controls: controls.map((control) => ({
        controlKey: control?.controlKey,
        canonicalField: null,
        section: null,
        behaviors: safeBehaviorDefaults(control ?? {}),
        expectedAction: "unknown",
        expectedDriver: null,
        expectedVerification: "none",
        notes: null
      }))
    }
  };
}

export function normalizeCorpusInput(value) {
  if (isRecord(value) && value.corpusSchemaVersion !== undefined) return structuredClone(value);
  return wrapObservation(structuredClone(value));
}

async function loadValidator(projectRoot) {
  const normalizedRoot = resolve(projectRoot);
  if (validatorCache.has(normalizedRoot)) return validatorCache.get(normalizedRoot);
  const schemaPath = resolve(normalizedRoot, SCHEMA_RELATIVE_PATH);
  let schema;
  try {
    schema = JSON.parse(await readFile(schemaPath, "utf8"));
  }
  catch {
    fail("schema-unavailable", "The ATS corpus schema could not be loaded.");
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  validatorCache.set(normalizedRoot, validate);
  return validate;
}

function schemaFailureMessage(errors) {
  const first = Array.isArray(errors) ? errors[0] : undefined;
  const location = first?.instancePath || "$";
  const keyword = first?.keyword || "schema";
  return `Schema validation failed at ${location} (${keyword}).`;
}

function inspectSensitiveStrings(value, path = "$") {
  if (typeof value === "string") {
    if (path === "$.observation.source.origin") return;
    for (const candidate of PERSONAL_PATTERNS) {
      if (candidate.pattern.test(value)) {
        fail("privacy-failed", `Privacy audit failed at ${path}: ${candidate.description}.`);
      }
    }
    if (path.includes(".semantics.") && (TIMESTAMP_PATTERN.test(value) || DATE_DISPLAY_PATTERN.test(value.trim()))) {
      fail("privacy-failed", `Privacy audit failed at ${path}: current display date metadata.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => inspectSensitiveStrings(child, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    inspectSensitiveStrings(child, `${path}.${key}`);
  }
}

function assertSource(source) {
  try {
    const origin = new URL(source.origin);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.origin !== source.origin
    ) {
      fail("privacy-failed", "Observation Origin must be credential-free HTTPS without a path or query.");
    }
  }
  catch (error) {
    if (error instanceof AtsCorpusError) throw error;
    fail("privacy-failed", "Observation Origin must be credential-free HTTPS without a path or query.");
  }
  if (RAW_PATH_IDENTIFIER_PATTERN.test(source.pathTemplate)) {
    fail("privacy-failed", "Observation path identifiers must be replaced by templates.");
  }
}

function assertSummary(observation) {
  const controls = observation.controls;
  const expected = {
    controlCount: controls.length,
    blockedControlCount: controls.filter((control) => control.safety !== "ordinary").length,
    frameControlCount: controls.filter((control) => control.boundary === "same-origin-frame").length,
    openShadowControlCount: controls.filter((control) => control.boundary === "open-shadow").length,
    sectionCount: observation.sections.length
  };
  for (const [key, count] of Object.entries(expected)) {
    if (observation.summary[key] !== count) {
      fail("invariant-failed", `Observation summary is inconsistent at ${key}.`);
    }
  }
}

function assertSafety(observation) {
  for (let index = 0; index < observation.controls.length; index += 1) {
    const control = observation.controls[index];
    const semanticCorpus = Object.values(control.semantics).filter((value) => typeof value === "string").join(" ");
    if (FINAL_SUBMIT_PATTERN.test(semanticCorpus) && control.safety !== "final-submit") {
      fail("safety-failed", `Final-submit safety classification failed at observation.controls[${index}].`);
    }
  }
}

function assertAnnotationKeys(sample) {
  const controlKeys = sample.observation.controls.map((control) => control.controlKey);
  const annotationKeys = sample.annotations.controls.map((annotation) => annotation.controlKey);
  if (new Set(controlKeys).size !== controlKeys.length) {
    fail("invariant-failed", "Observation control keys must be unique.");
  }
  if (new Set(annotationKeys).size !== annotationKeys.length) {
    fail("invariant-failed", "Annotation control keys must be unique.");
  }
  if (
    controlKeys.length !== annotationKeys.length ||
    controlKeys.some((key, index) => key !== annotationKeys[index])
  ) {
    fail("invariant-failed", "Annotations must correspond one-to-one with observation controls in the same order.");
  }
  if (sample.annotations.reviewStatus === "unreviewed" && sample.annotations.reviewedFamilyId !== null) {
    fail("invariant-failed", "An unreviewed sample cannot declare a reviewed family.");
  }
  if (sample.annotations.reviewStatus === "unreviewed" && sample.annotations.reviewedAt !== null) {
    fail("invariant-failed", "An unreviewed sample cannot declare a review timestamp.");
  }
  if (
    sample.annotations.reviewStatus === "reviewed" &&
    (sample.annotations.reviewedFamilyId === null || !Number.isFinite(Date.parse(sample.annotations.reviewedAt ?? "")))
  ) {
    fail("invariant-failed", "A reviewed sample must declare its family and review timestamp.");
  }
}

export async function validateCorpusSample(sample, options = {}) {
  const projectRoot = resolve(options.projectRoot ?? DEFAULT_PROJECT_ROOT);
  const validate = await loadValidator(projectRoot);
  if (!validate(sample)) fail("schema-invalid", schemaFailureMessage(validate.errors));
  if (!Number.isFinite(Date.parse(sample.observation.capturedAt))) {
    fail("invariant-failed", "Observation capture timestamp is invalid.");
  }
  inspectSensitiveStrings(sample);
  assertSource(sample.observation.source);
  assertSummary(sample.observation);
  assertSafety(sample.observation);
  assertAnnotationKeys(sample);
  return sample;
}

async function readBoundedJson(filePath, code = "input-invalid") {
  let fileStats;
  try {
    fileStats = await stat(filePath);
  }
  catch {
    fail(code, "The selected JSON file could not be read.");
  }
  if (!fileStats.isFile() || fileStats.size < 2 || fileStats.size > ATS_CORPUS_MAX_INPUT_BYTES) {
    fail(code, `JSON files must be between 2 and ${ATS_CORPUS_MAX_INPUT_BYTES} bytes.`);
  }
  try {
    return {
      bytes: fileStats.size,
      value: JSON.parse(await readFile(filePath, "utf8"))
    };
  }
  catch {
    fail(code, "The selected file is not valid JSON.");
  }
}

async function listSampleFiles(corpusRoot) {
  const samplesRoot = resolve(corpusRoot, "samples");
  let familyEntries;
  try {
    familyEntries = await readdir(samplesRoot, { withFileTypes: true });
  }
  catch (error) {
    if (error?.code === "ENOENT") return [];
    fail("corpus-unreadable", "The ATS sample directory could not be read.");
  }
  const files = [];
  for (const familyEntry of familyEntries) {
    if (familyEntry.isSymbolicLink()) fail("corpus-invalid", "Symbolic links are not allowed in the ATS sample directory.");
    if (!familyEntry.isDirectory()) continue;
    if (!FAMILY_ID_PATTERN.test(familyEntry.name)) {
      fail("corpus-invalid", "ATS sample directories must use normalized family ids.");
    }
    const familyRoot = resolve(samplesRoot, familyEntry.name);
    const entries = await readdir(familyRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) fail("corpus-invalid", "Symbolic links are not allowed in ATS family directories.");
      if (entry.isDirectory()) fail("corpus-invalid", "Nested ATS sample directories are not allowed.");
      if (entry.isFile() && entry.name.endsWith(".json")) files.push(resolve(familyRoot, entry.name));
      else if (entry.isFile()) fail("corpus-invalid", "ATS family directories may contain only JSON samples.");
      if (files.length > ATS_CORPUS_MAX_FILES) fail("corpus-too-large", "The ATS corpus exceeds the file-count limit.");
    }
  }
  return files.sort();
}

function resolvedFamily(sample) {
  return sample.annotations.reviewedFamilyId ?? sample.observation.family.id;
}

function expectedRelativePath(sample) {
  const family = resolvedFamily(sample);
  const pageType = sample.observation.source.pageType;
  if (!FAMILY_ID_PATTERN.test(family) || !PAGE_TYPE_PATTERN.test(pageType)) {
    fail("placement-invalid", "The sample does not have a safe family or page type.");
  }
  const digest = structuralDigest(sample);
  return `samples/${family}/${pageType}-${digest.slice(0, 16)}.json`;
}

function assertWithinCorpus(corpusRoot, target) {
  const samplesRoot = resolve(corpusRoot, "samples");
  const normalizedTarget = resolve(target);
  if (!normalizedTarget.startsWith(`${samplesRoot}${sep}`)) {
    fail("placement-invalid", "The generated sample target escaped the corpus directory.");
  }
}

async function readExistingSamples(corpusRoot, projectRoot) {
  const files = await listSampleFiles(corpusRoot);
  const samples = [];
  let totalBytes = 0;
  for (const file of files) {
    const parsed = await readBoundedJson(file, "corpus-invalid");
    totalBytes += parsed.bytes;
    if (totalBytes > ATS_CORPUS_MAX_TOTAL_BYTES) fail("corpus-too-large", "The ATS corpus exceeds the byte limit.");
    const sample = parsed.value;
    await validateCorpusSample(sample, { projectRoot });
    samples.push({ file, sample, digest: structuralDigest(sample), bytes: parsed.bytes });
  }
  return { samples, totalBytes };
}

export async function importAtsCorpusSample(inputPath, options = {}) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    fail("usage", "Exactly one JSON input file is required.");
  }
  const projectRoot = resolve(options.projectRoot ?? DEFAULT_PROJECT_ROOT);
  const corpusRoot = resolve(options.corpusRoot ?? resolve(projectRoot, "ats-corpus"));
  const parsed = await readBoundedJson(resolve(inputPath), "input-invalid");
  const sample = normalizeCorpusInput(parsed.value);
  await validateCorpusSample(sample, { projectRoot });

  const digest = structuralDigest(sample);
  const relativeTarget = expectedRelativePath(sample);
  const target = resolve(corpusRoot, relativeTarget);
  assertWithinCorpus(corpusRoot, target);

  const existing = await readExistingSamples(corpusRoot, projectRoot);
  const sameStructure = existing.samples.find((candidate) => candidate.digest === digest);
  if (sameStructure) {
    if (canonicalJson(withoutCaptureTime(sameStructure.sample)) === canonicalJson(withoutCaptureTime(sample))) {
      return {
        status: "duplicate",
        family: resolvedFamily(sameStructure.sample),
        pageType: sameStructure.sample.observation.source.pageType,
        digest,
        relativePath: relative(corpusRoot, sameStructure.file).replaceAll("\\", "/")
      };
    }
    fail("annotation-conflict", "This structure already exists with different annotations; review the existing sample instead of overwriting it.");
  }

  if (options.dryRun) {
    return {
      status: "validated",
      family: resolvedFamily(sample),
      pageType: sample.observation.source.pageType,
      digest,
      relativePath: relativeTarget
    };
  }

  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(target, prettyCanonicalJson(sample), { encoding: "utf8", flag: "wx" });
  }
  catch (error) {
    if (error?.code === "EEXIST") fail("target-conflict", "The deterministic sample target already exists and was not overwritten.");
    fail("write-failed", "The validated sample could not be written to the corpus.");
  }
  return {
    status: "imported",
    family: resolvedFamily(sample),
    pageType: sample.observation.source.pageType,
    digest,
    relativePath: relativeTarget
  };
}

export async function verifyAtsCorpus(options = {}) {
  const projectRoot = resolve(options.projectRoot ?? DEFAULT_PROJECT_ROOT);
  const corpusRoot = resolve(options.corpusRoot ?? resolve(projectRoot, "ats-corpus"));
  const existing = await readExistingSamples(corpusRoot, projectRoot);
  const digests = new Set();
  const families = new Set();

  for (const candidate of existing.samples) {
    const expected = expectedRelativePath(candidate.sample);
    const actual = relative(corpusRoot, candidate.file).replaceAll("\\", "/");
    if (actual !== expected) fail("placement-invalid", "An ATS sample is not stored at its deterministic path.");
    if (digests.has(candidate.digest)) fail("duplicate-structure", "The ATS corpus contains a duplicate structural digest.");
    digests.add(candidate.digest);
    families.add(resolvedFamily(candidate.sample));
  }

  return {
    sampleCount: existing.samples.length,
    totalBytes: existing.totalBytes,
    families: [...families].sort()
  };
}
