import {
  assessAtsFamilySupport,
  type AtsFamilySupportAssessment,
  type AtsSupportEvidence
} from "./supportPolicy";

export const TARGET_ATS_FAMILIES = [
  "feishu",
  "zhiye",
  "moka",
  "hotjob"
] as const;

export type TargetAtsFamilyId = typeof TARGET_ATS_FAMILIES[number];

const privacy = {
  currentValuesIncluded: false,
  profileDataIncluded: false,
  rawHtmlIncluded: false,
  authenticationIncluded: false,
  queryValuesIncluded: false,
  fileMetadataIncluded: false
} as const;

export const bundledAtsSupportEvidence: readonly AtsSupportEvidence[] = [
  {
    id: "xiaomi-public-ground-truth",
    familyId: "feishu",
    siteKey: "xiaomi-campus",
    kind: "public-ground-truth",
    verifiedAt: "2026-08-07",
    privacy,
    artifactRef: "ats-corpus/ground-truth/feishu-recruiting/xiaomi/xiaomi__internship-application__v1.json"
  },
  {
    id: "metaapp-public-ground-truth",
    familyId: "feishu",
    siteKey: "metaapp-campus",
    kind: "public-ground-truth",
    verifiedAt: "2026-08-07",
    privacy,
    artifactRef: "ats-corpus/ground-truth/feishu-recruiting/metaapp/metaapp__campus-application__v1.json"
  }
];

export function bundledAtsSupportAssessments(): AtsFamilySupportAssessment[] {
  return TARGET_ATS_FAMILIES.map((familyId) =>
    assessAtsFamilySupport(
      familyId,
      bundledAtsSupportEvidence.filter((evidence) => evidence.familyId === familyId)
    )
  );
}
