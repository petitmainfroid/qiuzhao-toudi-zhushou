import { describe, expect, it } from "vitest";
import {
  AtsAdapterRegistry,
  validateAtsAdapterManifest,
  type AtsAdapterPageSummary
} from "../../../adapter-sdk";
import { isMokaCandidateResumeUrl, mokaManifest } from "./manifest";

function control(
  controlKey: string,
  name: string,
  label: string,
  overrides: Partial<AtsAdapterPageSummary["controls"][number]> = {}
): AtsAdapterPageSummary["controls"][number] {
  return {
    controlKey,
    role: "textbox",
    tag: "input",
    semantics: { name, label },
    disabled: false,
    readOnly: false,
    required: false,
    multiple: false,
    boundary: "main",
    safety: "ordinary",
    ...overrides
  };
}

function summary(origin = "https://app.mokahr.com", pathTemplate = "/campus_apply/huya/:id"): AtsAdapterPageSummary {
  return {
    snapshotKey: "state_moka_contract",
    origin,
    pathTemplate,
    controls: [
      control("ref_name_123456", "basicInfo.name", "姓名"),
      control("ref_phone_12345", "basicInfo.phone", "手机号码"),
      control("ref_gender_1234", "basicInfo.gender", "性别", {
        role: "combobox",
        tag: "custom",
        optionLabels: ["男", "女"]
      }),
      control("ref_school_1234", "educationInfo[0].school", "学校名称"),
      control("ref_degree_1234", "educationInfo[0].academicDegree", "学历", {
        role: "combobox",
        tag: "custom",
        optionLabels: ["本科", "硕士", "博士"]
      }),
      control("ref_company_123", "practiceInfo[0].company", "公司名称"),
      control("ref_project_123", "projectInfo[0].projectName", "项目名称"),
      control("ref_work_123456", "experienceInfo[0].company", "工作公司"),
      control("ref_identity_12", "basicInfo.citizenId", "证件号码", { safety: "identity" }),
      control("ref_custom_1234", "customInfo.question", "企业自定义题"),
      control("ref_submit_1234", "candidate.submit", "提交申请", {
        role: "button",
        tag: "button",
        inputType: "submit",
        safety: "final-submit"
      })
    ]
  };
}

function labelOnlyHuyaSummary(): AtsAdapterPageSummary {
  return {
    snapshotKey: "state_moka_huya_label_only",
    origin: "https://app.mokahr.com",
    pathTemplate: "/campus_apply/huya/:id",
    controls: [
      control("name", "", "姓名"),
      control("phone", "", "请输入手机号"),
      control("email", "", "邮箱"),
      control("school-0", "", "请输入就读学校"),
      control("school-1", "", "请输入就读学校"),
      control("major-0", "", "请输入专业名称"),
      control("major-1", "", "请输入专业名称"),
      control("company", "", "公司名称"),
      control("title", "", "职位名称"),
      control("project", "", "项目名称")
    ]
  };
}

describe("Moka K5 manifest", () => {
  it("is selector-free, field-only, and passes the exact manifest contract", () => {
    expect(validateAtsAdapterManifest(mokaManifest)).toEqual({ ok: true, manifest: mokaManifest });
    expect(mokaManifest.repeatables).toEqual([]);
    expect(JSON.stringify(mokaManifest)).not.toMatch(/selector|querySelector|\.click\(|chrome\.|debugger|nodeId|value/i);
  });

  it.each([
    "https://app.mokahr.com/campus_apply/huya/4112#/candidateHome/resume",
    "https://app.mokahr.com/campus_apply/anonymous-tenant/site_123#/candidateHome/resume?locale=zh-CN"
  ])("routes a reviewed Moka candidate-resume URL: %s", (url) => {
    expect(isMokaCandidateResumeUrl(url)).toBe(true);
  });

  it.each([
    "http://app.mokahr.com/campus_apply/huya/4112#/candidateHome/resume",
    "https://app.mokahr.com.evil.test/campus_apply/huya/4112#/candidateHome/resume",
    "https://user@app.mokahr.com/campus_apply/huya/4112#/candidateHome/resume",
    "https://app.mokahr.com/campus_apply/huya/4112#/candidateHome/jobs",
    "https://app.mokahr.com/social_apply/huya/4112#/candidateHome/resume",
    "https://app.mokahr.com/campus_apply/huya/4112"
  ])("rejects an unrelated or untrusted Moka URL: %s", (url) => {
    expect(isMokaCandidateResumeUrl(url)).toBe(false);
  });

  it("detects the Moka family and maps only evidence-backed profile intent", () => {
    const result = new AtsAdapterRegistry([mokaManifest]).detect(summary());
    expect(result.status).toBe("matched");
    if (result.status !== "matched") throw new Error("Expected Moka manifest match.");
    expect(result.plan.familyId).toBe("moka");
    expect(result.plan.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ controlKey: "ref_name_123456", intent: { kind: "profile-field", pathPattern: "basic.fullName" } }),
      expect.objectContaining({ controlKey: "ref_gender_1234", decision: "confirm", capability: "searchable-combobox" }),
      expect.objectContaining({ controlKey: "ref_school_1234", intent: { kind: "profile-field", pathPattern: "education.0.school" } }),
      expect.objectContaining({ controlKey: "ref_company_123", intent: { kind: "profile-field", pathPattern: "workExperiences.0.company" } }),
      expect.objectContaining({ controlKey: "ref_project_123", intent: { kind: "profile-field", pathPattern: "projects.0.name" } })
    ]));
    expect(result.plan.fields.some((item) => item.controlKey === "ref_work_123456")).toBe(false);
    expect(result.plan.skipped).toEqual(expect.arrayContaining([
      { controlKey: "ref_work_123456", reason: "adapter-excluded" },
      { controlKey: "ref_identity_12", reason: "adapter-excluded" },
      { controlKey: "ref_custom_1234", reason: "unknown-field" },
      { controlKey: "ref_submit_1234", reason: "final-submit" }
    ]));
  });

  it("maps the reviewed Huya label-only controls and refuses cross-section company guesses", () => {
    const result = new AtsAdapterRegistry([mokaManifest]).detect(labelOnlyHuyaSummary());
    expect(result.status).toBe("matched");
    if (result.status !== "matched") throw new Error("Expected label-only Huya variant to match.");
    expect(result.plan.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ controlKey: "name", intent: { kind: "profile-field", pathPattern: "basic.fullName" } }),
      expect.objectContaining({ controlKey: "phone", intent: { kind: "profile-field", pathPattern: "basic.phone" } }),
      expect.objectContaining({ controlKey: "email", intent: { kind: "profile-field", pathPattern: "basic.email" } }),
      expect.objectContaining({ controlKey: "school-0", intent: { kind: "profile-field", pathPattern: "education.0.school" } }),
      expect.objectContaining({ controlKey: "school-1", intent: { kind: "profile-field", pathPattern: "education.1.school" } }),
      expect.objectContaining({ controlKey: "major-0", intent: { kind: "profile-field", pathPattern: "education.0.major" } }),
      expect.objectContaining({ controlKey: "major-1", intent: { kind: "profile-field", pathPattern: "education.1.major" } }),
      expect.objectContaining({ controlKey: "project", intent: { kind: "profile-field", pathPattern: "projects.0.name" } })
    ]));
    expect(result.plan.skipped).toEqual(expect.arrayContaining([
      { controlKey: "company", reason: "ambiguous-rule" },
      { controlKey: "title", reason: "ambiguous-rule" }
    ]));
  });

  it.each([
    ["https://app.mokahr.com", "/social_apply/huya/:id"],
    ["https://jobs.mokahr.com", "/campus_apply/huya/:id"],
    ["http://app.mokahr.com", "/campus_apply/huya/:id"]
  ])("fails closed for an unsupported page summary: %s%s", (origin, pathTemplate) => {
    expect(new AtsAdapterRegistry([mokaManifest]).detect(summary(origin, pathTemplate)).status).toBe("unmatched");
  });
});
