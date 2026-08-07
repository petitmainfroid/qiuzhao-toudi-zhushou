import type { AtsFamilyTemplate } from "../templateContracts";

export const finalSubmitExclusions = [
  "提交申请",
  "提交简历",
  "投递申请",
  "投递简历",
  "submit application"
];

export const genericHtmlTemplate: AtsFamilyTemplate = {
  familyId: "generic-html",
  version: "1",
  fieldRules: [],
  sections: [{ id: "application", labels: ["申请信息", "application"] }],
  repeatableRules: [],
  finalSubmitExclusions
};
