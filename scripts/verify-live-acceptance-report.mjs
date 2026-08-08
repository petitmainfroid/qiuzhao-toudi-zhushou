import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const reportPath = resolve(import.meta.dirname, "..", "artifacts", "live-browser-kernel-report.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has non-allowlisted keys: ${actual.join(", ")}`);
  }
}

exactKeys(report, [
  "schemaVersion", "capturedAt", "scope", "browser", "extension", "sites",
  "aggregate", "safety", "gate", "limitations"
], "report");
exactKeys(report.browser, ["name", "version"], "browser");
exactKeys(report.extension, ["version", "branch"], "extension");
exactKeys(report.aggregate, [
  "familyCount", "companyCount", "supportedApprovedDenominator", "primaryVerified",
  "fallbackVerified", "finalVerified", "skippedSelected", "primarySuccessRate",
  "finalSuccessRate", "wrongControlWriteCount"
], "aggregate");
exactKeys(report.safety, [
  "finalSubmitActionCount", "passwordActionCount", "captchaActionCount",
  "smsVerificationActionCount", "identityActionCount", "consentActionCount",
  "destructiveActionCount", "attachmentActionCount"
], "safety");
exactKeys(report.gate, [
  "threeDistinctFamilies", "perSitePrimaryAboveNinetyPercent",
  "aggregateFinalAtLeastNinetyEightPercent", "zeroWrongControlWrites",
  "zeroFinalSubmitActions", "pass"
], "gate");

if (!Array.isArray(report.sites) || report.sites.length !== 3) throw new Error("Expected exactly three live sites.");
for (const [index, site] of report.sites.entries()) {
  exactKeys(site, [
    "company", "atsFamily", "routeTemplate", "l2Status", "supportedApprovedDenominator",
    "primaryVerified", "fallbackVerified", "finalVerified", "skippedSelected",
    "primarySuccessRate", "finalSuccessRate", "typedFailures"
  ], `sites[${index}]`);
  if (site.supportedApprovedDenominator <= 0) throw new Error(`sites[${index}] has an empty denominator.`);
  if (site.primaryVerified / site.supportedApprovedDenominator !== site.primarySuccessRate) {
    throw new Error(`sites[${index}] primary rate is inconsistent.`);
  }
  if (site.finalVerified / site.supportedApprovedDenominator !== site.finalSuccessRate) {
    throw new Error(`sites[${index}] final rate is inconsistent.`);
  }
  if (site.primarySuccessRate <= 0.9 || site.finalSuccessRate < 0.98 || site.skippedSelected !== 0) {
    throw new Error(`sites[${index}] did not pass the live write gate.`);
  }
}

const total = (key) => report.sites.reduce((sum, site) => sum + site[key], 0);
for (const key of [
  "supportedApprovedDenominator", "primaryVerified", "fallbackVerified", "finalVerified", "skippedSelected"
]) {
  if (report.aggregate[key] !== total(key)) throw new Error(`Aggregate ${key} is inconsistent.`);
}
if (new Set(report.sites.map((site) => site.atsFamily)).size !== 3) throw new Error("ATS families are not distinct.");
if (new Set(report.sites.map((site) => site.company)).size !== 3) throw new Error("Companies are not distinct.");
if (Object.values(report.safety).some((count) => count !== 0)) throw new Error("A protected action counter is non-zero.");
if (
  report.aggregate.primarySuccessRate <= 0.9
  || report.aggregate.finalSuccessRate < 0.98
  || report.aggregate.wrongControlWriteCount !== 0
  || Object.values(report.gate).some((value) => value !== true)
) throw new Error("Live acceptance gate failed.");

const serialized = JSON.stringify(report);
if (/https?:\/\/|node_[a-z0-9_]+|[?&][a-z0-9_-]+=|\.(?:pdf|docx?)\b|cookie|authorization|bearer|secret|credential/i.test(serialized)) {
  throw new Error("Live report contains forbidden high-risk evidence.");
}

console.log(JSON.stringify({
  scope: report.scope,
  companies: report.sites.map(({ company, atsFamily }) => ({ company, atsFamily })),
  aggregate: report.aggregate,
  safety: report.safety,
  gate: report.gate
}, null, 2));
