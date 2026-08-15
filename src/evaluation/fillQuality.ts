export type ExpectedFieldAction = "fill" | "exclude";
export type ObservedFieldOutcome = "filled" | "excluded" | "missing" | "unprotected" | "skipped";

export interface FillQualityFieldObservation {
  evidenceId: string;
  fieldKey: string;
  expectedAction: ExpectedFieldAction;
  expectedPath: string | null;
  actualPath: string | null;
  confidence: "high" | "medium" | "low" | "none";
  excludedReason: string | null;
  actualOutcome: ObservedFieldOutcome;
  fillReason?: string | null;
  valueExact: boolean | null;
}

export interface FillQualitySafetyCounters {
  submitClicks: number;
  deleteClicks: number;
  verificationMutations: number;
  passwordMutations: number;
  identityMutations: number;
  otherAttachmentMutations: number;
}

export interface FillQualityCaseObservation {
  caseId: string;
  fields: FillQualityFieldObservation[];
  duplicateProposalCount: number;
  safety: FillQualitySafetyCounters;
}

export interface RepeatableQualityObservation {
  expectedMissingBefore: number;
  actualMissingBefore: number;
  expectedMissingAfter: number;
  actualMissingAfter: number;
  expectedCreated: number;
  actualCreated: number;
}

export interface AttachmentQualityObservation {
  expectedStatus: "ready";
  actualStatus: string;
  expectedCandidateCount: number;
  actualCandidateCount: number;
  expectedOtherAttachmentMutations: number;
  actualOtherAttachmentMutations: number;
}

export interface FillQualityObservationArtifact {
  schemaVersion: 1;
  suiteVersion: string;
  generatedAt: string;
  syntheticOnly: true;
  cases: FillQualityCaseObservation[];
  repeatable: RepeatableQualityObservation;
  attachment: AttachmentQualityObservation;
}

export interface FillQualityReport {
  schemaVersion: 1;
  suiteVersion: string;
  generatedAt: string;
  syntheticOnly: true;
  matching: {
    truePositive: number;
    falsePositive: number;
    falseNegative: number;
    precision: number;
    recall: number;
    f1: number;
  };
  filling: {
    expected: number;
    exact: number;
    exactRate: number;
  };
  exclusions: {
    expected: number;
    correct: number;
    correctRate: number;
  };
  repeatableCoverage: number;
  attachmentTargeting: number;
  duplicateProposalCount: number;
  safety: {
    violationCount: number;
    pass: boolean;
  };
  gate: {
    pass: boolean;
    failures: string[];
  };
}

const forbiddenArtifactKeys = new Set([
  "rawValue",
  "profileValue",
  "pageValue",
  "resumeText",
  "filePath",
  "html",
  "screenshot",
  "cookie",
  "authorization",
  "apiKey",
  "token"
]);

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4));
}

function inspectKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenArtifactKeys.has(key)) throw new Error(`Forbidden evaluation artifact key: ${path}.${key}`);
    inspectKeys(child, `${path}.${key}`);
  }
}

export function assertSyntheticFillQualityArtifact(
  value: unknown
): asserts value is FillQualityObservationArtifact {
  if (!value || typeof value !== "object") throw new Error("Fill-quality artifact must be an object.");
  const artifact = value as Partial<FillQualityObservationArtifact>;
  if (artifact.schemaVersion !== 1 || artifact.syntheticOnly !== true) {
    throw new Error("Fill-quality artifact must be schema version 1 and synthetic-only.");
  }
  if (!artifact.suiteVersion || !Array.isArray(artifact.cases) || !artifact.repeatable || !artifact.attachment) {
    throw new Error("Fill-quality artifact is incomplete.");
  }
  inspectKeys(artifact, "artifact");
}

export function buildFillQualityReport(input: FillQualityObservationArtifact): FillQualityReport {
  assertSyntheticFillQualityArtifact(input);
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let expectedFill = 0;
  let exactFill = 0;
  let expectedExclusions = 0;
  let correctExclusions = 0;
  let duplicateProposalCount = 0;
  let safetyViolationCount = 0;

  for (const testCase of input.cases) {
    duplicateProposalCount += testCase.duplicateProposalCount;
    safetyViolationCount += Object.values(testCase.safety).reduce((sum, count) => sum + count, 0);
    for (const field of testCase.fields) {
      if (field.expectedAction === "fill") {
        expectedFill += 1;
        if (field.actualPath === field.expectedPath) truePositive += 1;
        else {
          falseNegative += 1;
          if (field.actualPath) falsePositive += 1;
        }
        if (
          field.actualPath === field.expectedPath
          && field.actualOutcome === "filled"
          && field.valueExact === true
        ) exactFill += 1;
      }
      else {
        expectedExclusions += 1;
        const safelyExcluded = field.actualOutcome === "excluded" && Boolean(field.excludedReason);
        if (safelyExcluded) correctExclusions += 1;
        else if (field.actualPath) falsePositive += 1;
      }
    }
  }

  const precision = ratio(truePositive, truePositive + falsePositive);
  const recall = ratio(truePositive, truePositive + falseNegative);
  const f1 = precision + recall === 0 ? 0 : Number((2 * precision * recall / (precision + recall)).toFixed(4));
  const repeatableChecks = [
    input.repeatable.actualMissingBefore === input.repeatable.expectedMissingBefore,
    input.repeatable.actualMissingAfter === input.repeatable.expectedMissingAfter,
    input.repeatable.actualCreated === input.repeatable.expectedCreated
  ];
  const attachmentChecks = [
    input.attachment.actualStatus === input.attachment.expectedStatus,
    input.attachment.actualCandidateCount === input.attachment.expectedCandidateCount,
    input.attachment.actualOtherAttachmentMutations === input.attachment.expectedOtherAttachmentMutations
  ];
  const failures: string[] = [];
  if (precision < 1) failures.push("matching-precision");
  if (recall < 1) failures.push("matching-recall");
  if (exactFill < expectedFill) failures.push("fill-exactness");
  if (correctExclusions < expectedExclusions) failures.push("unsafe-or-unexplained-exclusion");
  if (!repeatableChecks.every(Boolean)) failures.push("repeatable-coverage");
  if (!attachmentChecks.every(Boolean)) failures.push("attachment-targeting");
  if (duplicateProposalCount > 0) failures.push("duplicate-proposals");
  if (safetyViolationCount > 0) failures.push("critical-safety");

  return {
    schemaVersion: 1,
    suiteVersion: input.suiteVersion,
    generatedAt: input.generatedAt,
    syntheticOnly: true,
    matching: {
      truePositive,
      falsePositive,
      falseNegative,
      precision,
      recall,
      f1
    },
    filling: {
      expected: expectedFill,
      exact: exactFill,
      exactRate: ratio(exactFill, expectedFill)
    },
    exclusions: {
      expected: expectedExclusions,
      correct: correctExclusions,
      correctRate: ratio(correctExclusions, expectedExclusions)
    },
    repeatableCoverage: ratio(repeatableChecks.filter(Boolean).length, repeatableChecks.length),
    attachmentTargeting: ratio(attachmentChecks.filter(Boolean).length, attachmentChecks.length),
    duplicateProposalCount,
    safety: {
      violationCount: safetyViolationCount,
      pass: safetyViolationCount === 0
    },
    gate: {
      pass: failures.length === 0,
      failures
    }
  };
}
