import { describe, expect, it } from "vitest";
import {
  assessAtsFamilySupport,
  assertValidAtsSupportEvidence,
  AtsSupportPolicyError,
  type AtsAcceptanceControlKind,
  type AtsSupportEvidence
} from "./supportPolicy";

const privacy = {
  currentValuesIncluded: false,
  profileDataIncluded: false,
  rawHtmlIncluded: false,
  authenticationIncluded: false,
  queryValuesIncluded: false,
  fileMetadataIncluded: false
} as const;

function observed(
  id: string,
  siteKey: string,
  kind: "public-ground-truth" | "private-observation" = "public-ground-truth"
): AtsSupportEvidence {
  return {
    id,
    familyId: "feishu",
    siteKey,
    kind,
    verifiedAt: "2026-08-07",
    privacy,
    artifactRef: `ats-corpus/ground-truth/${siteKey}-v1.json`
  };
}

function acceptance(
  id: string,
  siteKey: string,
  kind: "synthetic-fixture" | "real-page-run",
  overrides: Partial<AtsSupportEvidence["metrics"]> = {},
  controlKinds: AtsAcceptanceControlKind[] = ["text", "choice", "date", "repeatable"]
): AtsSupportEvidence {
  return {
    id,
    familyId: "feishu",
    siteKey,
    kind,
    verifiedAt: "2026-08-07",
    privacy,
    artifactRef: kind === "synthetic-fixture"
      ? `tests/fixtures/${siteKey}.html`
      : `private:${siteKey}`,
    metrics: {
      eligibleFieldCount: 20,
      correctlyMappedFieldCount: 19,
      attemptedWriteCount: 20,
      verifiedWriteCount: 19,
      incorrectWriteCount: 0,
      unsafeActionCount: 0,
      finalSubmitActivationCount: 0,
      unexpectedNavigationCount: 0,
      duplicateRepeatableRecordCount: 0,
      standardModeNetworkRequestCount: 0,
      controlKinds,
      ...overrides
    }
  };
}

describe("ATS support policy", () => {
  it("keeps catalog or implementation plans at planned and observations at observed", () => {
    expect(assessAtsFamilySupport("feishu", [])).toMatchObject({
      level: "planned",
      evidenceCount: 0,
      realPageSiteCount: 0
    });

    expect(assessAtsFamilySupport("feishu", [
      observed("xiaomi-ground-truth", "xiaomi-campus"),
      observed("metaapp-observation", "metaapp-campus", "private-observation")
    ])).toMatchObject({
      level: "observed",
      evidenceCount: 2,
      observedSiteCount: 2
    });
  });

  it("promotes a passing synthetic fixture without claiming real-page verification", () => {
    expect(assessAtsFamilySupport("feishu", [
      observed("xiaomi-ground-truth", "xiaomi-campus"),
      acceptance("xiaomi-fixture", "xiaomi-campus", "synthetic-fixture")
    ])).toMatchObject({
      level: "fixture-verified",
      fixtureSiteCount: 1,
      realPageSiteCount: 0,
      blockingReasons: []
    });
  });

  it("requires three passing real sites and all required control kinds", () => {
    const assessment = assessAtsFamilySupport("feishu", [
      observed("xiaomi-ground-truth", "xiaomi-campus"),
      observed("metaapp-ground-truth", "metaapp-campus"),
      observed("third-ground-truth", "third-campus"),
      acceptance("xiaomi-real", "xiaomi-campus", "real-page-run", {}, ["text", "choice"]),
      acceptance("metaapp-real", "metaapp-campus", "real-page-run", {}, ["date"]),
      acceptance("third-real", "third-campus", "real-page-run", {}, ["repeatable"])
    ]);

    expect(assessment).toMatchObject({
      level: "real-page-verified",
      realPageSiteCount: 3,
      coveredControlKinds: ["text", "choice", "date", "repeatable"],
      blockingReasons: []
    });

    expect(assessAtsFamilySupport("feishu", [
      observed("xiaomi-ground-truth", "xiaomi-campus"),
      observed("metaapp-ground-truth", "metaapp-campus"),
      acceptance("xiaomi-real", "xiaomi-campus", "real-page-run"),
      acceptance("metaapp-real", "metaapp-campus", "real-page-run")
    ]).level).toBe("observed");
  });

  it("blocks promotion on low metrics, unsafe behavior, or standard-mode network use", () => {
    const assessment = assessAtsFamilySupport("feishu", [
      observed("xiaomi-ground-truth", "xiaomi-campus"),
      observed("metaapp-ground-truth", "metaapp-campus"),
      observed("third-ground-truth", "third-campus"),
      acceptance("xiaomi-fixture", "xiaomi-campus", "synthetic-fixture"),
      acceptance("xiaomi-real", "xiaomi-campus", "real-page-run"),
      acceptance("metaapp-real", "metaapp-campus", "real-page-run", {
        correctlyMappedFieldCount: 17,
        verifiedWriteCount: 18
      }),
      acceptance("third-real", "third-campus", "real-page-run", {
        incorrectWriteCount: 1,
        finalSubmitActivationCount: 1,
        standardModeNetworkRequestCount: 1
      })
    ]);

    expect(assessment.level).toBe("observed");
    expect(assessment.blockingReasons).toEqual(expect.arrayContaining([
      "metaapp-real: eligible-field coverage below 90%",
      "metaapp-real: verified-write success below 95%",
      "third-real: incorrect write recorded",
      "third-real: final submit activated",
      "third-real: standard mode used the network"
    ]));
  });

  it("does not promote metrics that have no independent denominator", () => {
    const assessment = assessAtsFamilySupport("feishu", [
      acceptance("orphan-fixture", "orphan-campus", "synthetic-fixture")
    ]);
    expect(assessment.level).toBe("planned");
    expect(assessment.blockingReasons).toContain(
      "orphan-fixture: missing independent ground truth or observation"
    );
  });

  it("rejects non-aggregate or privacy-unsafe evidence", () => {
    expect(() => assertValidAtsSupportEvidence({
      ...observed("unsafe-observation", "unsafe-campus"),
      privacy: { ...privacy, rawHtmlIncluded: true } as never
    })).toThrow(AtsSupportPolicyError);

    expect(() => assertValidAtsSupportEvidence({
      ...observed("unsafe-reference", "unsafe-campus"),
      artifactRef: "C:\\Users\\candidate\\resume.pdf"
    })).toThrow(/artifact reference/);

    expect(() => assertValidAtsSupportEvidence({
      ...observed("traversal-reference", "unsafe-campus"),
      artifactRef: "artifacts/../private.json"
    })).toThrow(/artifact reference/);

    expect(() => assertValidAtsSupportEvidence({
      ...observed("wrong-metrics", "unsafe-campus"),
      metrics: acceptance("fixture", "unsafe-campus", "synthetic-fixture").metrics
    })).toThrow(/cannot carry write metrics/);
  });
});
