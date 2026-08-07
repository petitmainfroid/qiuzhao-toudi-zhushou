import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeCorpusInput, validateCorpusSample } from "./core.mjs";

const MAX_INPUT_BYTES = 1_000_000;

function normalized(value) {
  return (value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[\d+\]/g, "[]")
    .replace(/[\s_（）()：:·\-]/g, "");
}

function technicalName(value) {
  return (value || "").toLowerCase().replace(/\[\d+\]/g, "[]");
}

function sectionMatches(control, group) {
  if (normalized(control.semantics.section) === normalized(group.label)) return true;
  const name = technicalName(control.semantics.name);
  return name === group.fieldName || name.startsWith(`${group.fieldName}.`) || name.startsWith(`${group.fieldName}[]`);
}

function fieldMatches(control, group, field) {
  if (!sectionMatches(control, group)) return false;
  if (field.type === "attachment" && control.inputType === "file") return true;
  const semanticLabels = [
    control.semantics.label,
    control.semantics.ariaLabel,
    control.semantics.placeholder
  ].map(normalized).filter(Boolean);
  if (semanticLabels.includes(normalized(field.label))) return true;
  const name = technicalName(control.semantics.name);
  const expectedName = technicalName(field.fieldName);
  if (!name || !expectedName) return false;
  return name === expectedName
    || name.endsWith(`.${expectedName}`)
    || name.includes(`.${expectedName}.`)
    || name.includes(`.${expectedName}[]`);
}

function sourceMatches(observation, groundTruth) {
  try {
    return observation.source.origin === groundTruth.source.originPattern
      && observation.source.pathTemplate === groundTruth.source.pathTemplate
      && observation.source.pageType === groundTruth.source.pageType;
  }
  catch {
    return false;
  }
}

export function assessXiaomiObservation(observation, groundTruth, options = {}) {
  const expectedGroups = groundTruth.groups;
  const expectedFieldCount = expectedGroups.reduce((total, group) => total + group.fields.length, 0);
  const missingSections = expectedGroups
    .filter((group) => !observation.sections.some((section) => normalized(section) === normalized(group.label)))
    .map((group) => group.label);
  const missingFields = [];
  let observedFieldCount = 0;
  for (const group of expectedGroups) {
    for (const field of group.fields) {
      if (observation.controls.some((control) => fieldMatches(control, group, field))) observedFieldCount += 1;
      else missingFields.push(`${group.label} / ${field.label}`);
    }
  }

  const semanticControlCount = observation.controls.filter((control) => Boolean(
    control.semantics.label
    || control.semantics.ariaLabel
    || control.semantics.placeholder
    || control.semantics.name
  )).length;
  const semanticCoverage = observation.controls.length > 0
    ? semanticControlCount / observation.controls.length
    : 0;
  const finalSubmitControls = observation.controls.filter((control) => {
    const corpus = normalized([
      control.semantics.label,
      control.semantics.ariaLabel,
      control.semantics.placeholder,
      control.semantics.name
    ].filter(Boolean).join(" "));
    return control.safety === "final-submit" || /提交简历|投递简历|提交申请|立即申请|submitapplication/.test(corpus);
  });
  const rawCountConsistent = observation.summary.controlCount === observation.controls.length;
  const k1ControlCount = Number.isInteger(options.k1ControlCount) ? options.k1ControlCount : null;
  const k1CountConsistent = k1ControlCount === null || k1ControlCount === observation.controls.length;
  const finalSubmitProtected = finalSubmitControls.length > 0
    && finalSubmitControls.every((control) => control.safety === "final-submit");
  const passed = sourceMatches(observation, groundTruth)
    && rawCountConsistent
    && k1CountConsistent
    && missingSections.length === 0
    && semanticCoverage >= 0.75
    && finalSubmitProtected;

  return {
    passed,
    sourceMatched: sourceMatches(observation, groundTruth),
    rawControls: {
      k1: k1ControlCount,
      exported: observation.controls.length,
      summary: observation.summary.controlCount,
      consistent: rawCountConsistent && k1CountConsistent
    },
    sections: {
      observed: expectedGroups.length - missingSections.length,
      expected: expectedGroups.length,
      missing: missingSections
    },
    logicalFields: {
      observed: observedFieldCount,
      expected: expectedFieldCount,
      missing: missingFields
    },
    semantics: {
      namedControls: semanticControlCount,
      totalControls: observation.controls.length,
      coverage: Number(semanticCoverage.toFixed(4))
    },
    safety: {
      finalSubmitControls: finalSubmitControls.length,
      finalSubmitProtected,
      blockedControls: observation.summary.blockedControlCount
    },
    privacyAudit: "passed"
  };
}

export async function auditXiaomiObservationFile(inputPath, options = {}) {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const input = resolve(inputPath);
  const inputStat = await stat(input);
  if (!inputStat.isFile() || inputStat.size > MAX_INPUT_BYTES) {
    const error = new Error("The observation file is missing or exceeds the 1 MB audit limit.");
    error.code = "input-invalid";
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(input, "utf8"));
  }
  catch {
    const error = new Error("The observation file is not valid JSON.");
    error.code = "input-invalid";
    throw error;
  }
  const sample = normalizeCorpusInput(parsed);
  await validateCorpusSample(sample, { projectRoot });
  const groundTruth = JSON.parse(await readFile(
    resolve(
      projectRoot,
      "ats-corpus/ground-truth/feishu-recruiting/xiaomi/xiaomi__internship-application__v1.json"
    ),
    "utf8"
  ));
  return assessXiaomiObservation(sample.observation, groundTruth, options);
}
