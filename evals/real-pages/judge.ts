import {
  REAL_PAGE_EVALUATION_SCHEMA_VERSION,
  type FrozenRealPageAnnotation,
  type RealPageJudgeReport,
  type RealPageRunManifest
} from "./contracts";
import { REAL_PAGE_SAFETY_COUNT_KEYS, assertRunAgainstAnnotation } from "./validator";

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4));
}

export async function judgeRealPageRun(
  annotation: FrozenRealPageAnnotation,
  run: RealPageRunManifest,
  options: { reportId: string; judgedAt: string }
): Promise<RealPageJudgeReport> {
  await assertRunAgainstAnnotation(run, annotation);
  const aReachable = annotation.fields.length;
  const bEligible = run.fields.filter((field) => field.eligible).length;
  const cWriteAttempts = run.fields.reduce((sum, field) => sum + field.attempts.length, 0);
  const audited = run.fields.length;
  const verifiedEligibleFields = run.fields.filter((field) => field.eligible && field.verification === true).length;
  const verifiedWrites = run.fields.reduce((sum, field) => sum + field.attempts.filter((attempt) => attempt.verified).length, 0);
  const primaryVerified = run.fields.filter((field) => field.attempts[0]?.verified === true).length;
  const executed = run.fields.filter((field) => field.attempted);
  const mappedAndExecuted = executed.length;
  const mappingCorrect = executed.filter((field) => field.mappingCorrect === true).length;
  const knownWrongMappings = executed.filter((field) => field.mappingCorrect === false).length;
  const writeAttemptsWithReadback = run.fields.reduce(
    (sum, field) => sum + field.attempts.filter((attempt) => typeof attempt.verified === "boolean").length,
    0
  );
  const metrics = {
    auditCoverage: ratio(audited, aReachable),
    eligibleCoverage: ratio(verifiedEligibleFields, bEligible),
    verifiedWriteRate: ratio(verifiedWrites, cWriteAttempts),
    primaryVerifiedRate: ratio(primaryVerified, bEligible),
    mappingCorrectRate: ratio(mappingCorrect, mappedAndExecuted),
    writeReadbackCoverage: ratio(writeAttemptsWithReadback, cWriteAttempts)
  };
  const failures: string[] = [];
  if (run.claimedDenominators.aReachable !== aReachable) failures.push("executor-a-denominator-mismatch");
  if (run.claimedDenominators.bEligible !== bEligible) failures.push("executor-b-denominator-mismatch");
  if (run.claimedDenominators.cWriteAttempts !== cWriteAttempts) failures.push("executor-c-denominator-mismatch");
  if (metrics.auditCoverage !== 1) failures.push("incomplete-field-audit");
  if (run.evidenceLevel === "E4") {
    if (bEligible === 0) failures.push("empty-eligible-denominator");
    if (metrics.eligibleCoverage < 0.9) failures.push("eligible-coverage");
    if (metrics.verifiedWriteRate < 0.95) failures.push("verified-write-rate");
    if (metrics.primaryVerifiedRate <= 0.9) failures.push("primary-verified-rate");
    if (metrics.mappingCorrectRate < 0.98 || knownWrongMappings > 0) failures.push("mapping-correctness");
    if (metrics.writeReadbackCoverage !== 1) failures.push("write-readback-coverage");
  }
  const nonZeroSafety = REAL_PAGE_SAFETY_COUNT_KEYS.filter((key) => run.safety[key] !== 0);
  if (nonZeroSafety.length) failures.push(...nonZeroSafety.map((key) => `safety:${key}`));

  return {
    schemaVersion: REAL_PAGE_EVALUATION_SCHEMA_VERSION,
    kind: "independent-real-page-judge",
    reportId: options.reportId,
    runId: run.runId,
    siteId: run.siteId,
    annotation: {
      annotationId: annotation.annotationId,
      revision: annotation.revision,
      annotationHash: annotation.annotationHash
    },
    judgeRole: "independent-judge",
    judgedAt: options.judgedAt,
    recomputedDenominators: { aReachable, bEligible, cWriteAttempts },
    counts: {
      audited,
      verifiedEligibleFields,
      verifiedWrites,
      primaryVerified,
      mappedAndExecuted,
      mappingCorrect,
      knownWrongMappings,
      writeAttemptsWithReadback
    },
    metrics,
    annotationIntegrityPassed: true,
    privacyPassed: true,
    safetyPassed: nonZeroSafety.length === 0,
    gate: { pass: failures.length === 0, failures }
  };
}
