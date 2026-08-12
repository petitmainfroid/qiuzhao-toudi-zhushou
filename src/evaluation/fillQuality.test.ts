import { describe, expect, it } from "vitest";
import {
  assertSyntheticFillQualityArtifact,
  buildFillQualityReport,
  type FillQualityObservationArtifact
} from "./fillQuality";

function artifact(): FillQualityObservationArtifact {
  return {
    schemaVersion: 1,
    suiteVersion: "test.1",
    generatedAt: "2026-08-05T00:00:00.000Z",
    syntheticOnly: true,
    cases: [{
      caseId: "synthetic-case",
      duplicateProposalCount: 0,
      fields: [
        {
          evidenceId: "field-1",
          fieldKey: "name",
          expectedAction: "fill",
          expectedPath: "basic.fullName",
          actualPath: "basic.fullName",
          confidence: "high",
          excludedReason: null,
          actualOutcome: "filled",
          valueExact: true
        },
        {
          evidenceId: "field-2",
          fieldKey: "password",
          expectedAction: "exclude",
          expectedPath: null,
          actualPath: null,
          confidence: "none",
          excludedReason: "sensitive-unsupported",
          actualOutcome: "excluded",
          valueExact: null
        },
        {
          evidenceId: "field-3",
          fieldKey: "identity",
          expectedAction: "confirm",
          expectedPath: "basic.identityDocumentNumber",
          actualPath: "basic.identityDocumentNumber",
          confidence: "high",
          excludedReason: null,
          actualOutcome: "confirmation-required",
          valueExact: null
        }
      ],
      safety: {
        submitClicks: 0,
        deleteClicks: 0,
        verificationMutations: 0,
        passwordMutations: 0,
        identityMutations: 0,
        otherAttachmentMutations: 0
      }
    }],
    repeatable: {
      expectedMissingBefore: 2,
      actualMissingBefore: 2,
      expectedMissingAfter: 0,
      actualMissingAfter: 0,
      expectedCreated: 2,
      actualCreated: 2
    },
    attachment: {
      expectedStatus: "ready",
      actualStatus: "ready",
      expectedCandidateCount: 1,
      actualCandidateCount: 1,
      expectedOtherAttachmentMutations: 0,
      actualOtherAttachmentMutations: 0
    }
  };
}

describe("fill quality evaluation", () => {
  it("passes only an exact, safe synthetic observation", () => {
    const report = buildFillQualityReport(artifact());
    expect(report).toMatchObject({
      matching: { precision: 1, recall: 1, f1: 1 },
      filling: { exactRate: 1 },
      exclusions: { correctRate: 1 },
      confirmations: { correctRate: 1 },
      repeatableCoverage: 1,
      attachmentTargeting: 1,
      safety: { pass: true },
      gate: { pass: true, failures: [] }
    });
  });

  it("keeps critical safety and wrong mappings visible instead of averaging them away", () => {
    const failing = artifact();
    failing.cases[0].fields[0].actualPath = "basic.email";
    failing.cases[0].fields[0].actualOutcome = "filled";
    failing.cases[0].safety.submitClicks = 1;
    const report = buildFillQualityReport(failing);
    expect(report.matching).toMatchObject({ truePositive: 1, falsePositive: 1, falseNegative: 1 });
    expect(report.safety).toEqual({ violationCount: 1, pass: false });
    expect(report.gate.failures).toEqual(expect.arrayContaining([
      "matching-precision",
      "matching-recall",
      "fill-exactness",
      "critical-safety"
    ]));
  });

  it("rejects artifacts that could carry private values", () => {
    expect(() => assertSyntheticFillQualityArtifact({
      ...artifact(),
      rawValue: "must-not-enter-eval"
    })).toThrow(/Forbidden evaluation artifact key/);
  });
});
