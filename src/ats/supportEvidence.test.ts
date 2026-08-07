import { describe, expect, it } from "vitest";
import {
  bundledAtsSupportAssessments,
  bundledAtsSupportEvidence,
  TARGET_ATS_FAMILIES
} from "./supportEvidence";
import { assertValidAtsSupportEvidence } from "./supportPolicy";

describe("bundled ATS support evidence", () => {
  it("keeps every bundled record privacy-safe and policy-valid", () => {
    expect(() => bundledAtsSupportEvidence.forEach(assertValidAtsSupportEvidence)).not.toThrow();
    expect(new Set(bundledAtsSupportEvidence.map((evidence) => evidence.id)).size)
      .toBe(bundledAtsSupportEvidence.length);
  });

  it("reports current evidence honestly without family-wide write claims", () => {
    const assessments = bundledAtsSupportAssessments();
    expect(assessments.map((assessment) => assessment.familyId)).toEqual(TARGET_ATS_FAMILIES);
    expect(assessments.find((assessment) => assessment.familyId === "feishu")).toMatchObject({
      level: "observed",
      observedSiteCount: 2,
      fixtureSiteCount: 0,
      realPageSiteCount: 0
    });
    expect(assessments.filter((assessment) => assessment.familyId !== "feishu"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ familyId: "zhiye", level: "planned" }),
        expect.objectContaining({ familyId: "moka", level: "planned" }),
        expect.objectContaining({ familyId: "hotjob", level: "planned" })
      ]));
  });
});
