import { describe, expect, it } from "vitest";
import {
  AtsAdapterRegistry,
  validateAtsAdapterManifest,
  type AtsAdapterPageSummary
} from "../../../adapter-sdk";
import { isLenovoTalentResumeUrl, lenovoTalentManifest } from "./manifest";

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

function summary(
  origin = "https://talent.lenovo.com.cn",
  pathTemplate = "/account/resume"
): AtsAdapterPageSummary {
  return {
    snapshotKey: "state_lenovo_contract",
    origin,
    pathTemplate,
    controls: [
      control("ref_resume_1234", "resumeAttachment", "简历附件", {
        inputType: "file",
        safety: "file"
      }),
      control("ref_email_12345", "email", "电子邮箱"),
      control("ref_phone_12345", "phone", "手机号"),
      control("ref_degree_1234", "educationExperiences[0].degree", "学历", {
        role: "combobox",
        tag: "custom"
      }),
      control("ref_major_12345", "educationExperiences[0].major", "专业"),
      control("ref_company_123", "internExperiences[0].company", "工作单位"),
      control("ref_project_123", "projectExperiences[0].projectName", "项目名称"),
      control("ref_identity_12", "certificateNo", "证件号码", { safety: "identity" }),
      control("ref_birthday_12", "birthday", "出生日期"),
      control("ref_school_1234", "educationExperiences[0].universityName", "学校名称", {
        role: "combobox",
        tag: "custom"
      }),
      control("ref_custom_1234", "enterprise.question", "企业自定义题"),
      control("ref_save_123456", "resume.save", "保存", {
        role: "button",
        tag: "button",
        inputType: "button"
      }),
      control("ref_submit_1234", "application.submit", "提交申请", {
        role: "button",
        tag: "button",
        inputType: "submit",
        safety: "final-submit"
      })
    ]
  };
}

describe("Lenovo Talent K5 manifest", () => {
  it("covers the exact 55-field public contract but automates only 15 conservative fields", () => {
    expect(validateAtsAdapterManifest(lenovoTalentManifest)).toEqual({
      ok: true,
      manifest: lenovoTalentManifest
    });
    expect(lenovoTalentManifest.fields).toHaveLength(55);
    expect(lenovoTalentManifest.fields.filter((item) => item.decision !== "exclude")).toHaveLength(15);
    expect(lenovoTalentManifest.fields.filter((item) => item.decision === "exclude")).toHaveLength(40);
    expect(lenovoTalentManifest.repeatables).toEqual([]);
    expect(JSON.stringify(lenovoTalentManifest)).not.toMatch(
      /selector|querySelector|\.click\(|chrome\.|debugger|nodeId|candidateValue/i
    );
  });

  it.each([
    "https://talent.lenovo.com.cn/account/resume",
    "https://talent.lenovo.com.cn/account/resume?locale=zh-CN",
    "https://talent.lenovo.com.cn/account/resume/"
  ])("routes the reviewed Lenovo PC resume URL: %s", (url) => {
    expect(isLenovoTalentResumeUrl(url)).toBe(true);
  });

  it.each([
    "http://talent.lenovo.com.cn/account/resume",
    "https://talent.lenovo.com.cn.evil.test/account/resume",
    "https://user@talent.lenovo.com.cn/account/resume",
    "https://talent.lenovo.com.cn:444/account/resume",
    "https://talent.lenovo.com.cn/account/login",
    "https://talent.lenovo.com.cn/account/resume#/mobile"
  ])("rejects an unrelated or untrusted Lenovo URL: %s", (url) => {
    expect(isLenovoTalentResumeUrl(url)).toBe(false);
  });

  it("plans only evidence-backed and profile-compatible intent", () => {
    const result = new AtsAdapterRegistry([lenovoTalentManifest]).detect(summary());
    expect(result.status).toBe("matched");
    if (result.status !== "matched") throw new Error("Expected Lenovo manifest match.");
    expect(result.plan.familyId).toBe("lenovo-talent");
    expect(result.plan.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        controlKey: "ref_resume_1234",
        decision: "confirm",
        intent: { kind: "saved-resume" }
      }),
      expect.objectContaining({
        controlKey: "ref_email_12345",
        intent: { kind: "profile-field", pathPattern: "basic.email" }
      }),
      expect.objectContaining({
        controlKey: "ref_degree_1234",
        capability: "searchable-combobox",
        intent: { kind: "profile-field", pathPattern: "education.0.degree" }
      }),
      expect.objectContaining({
        controlKey: "ref_company_123",
        intent: { kind: "profile-field", pathPattern: "workExperiences.0.company" }
      }),
      expect.objectContaining({
        controlKey: "ref_project_123",
        intent: { kind: "profile-field", pathPattern: "projects.0.name" }
      })
    ]));
    expect(result.plan.repeatables).toEqual([]);
    expect(result.plan.skipped).toEqual(expect.arrayContaining([
      { controlKey: "ref_identity_12", reason: "adapter-excluded" },
      { controlKey: "ref_birthday_12", reason: "adapter-excluded" },
      { controlKey: "ref_school_1234", reason: "adapter-excluded" },
      { controlKey: "ref_custom_1234", reason: "unknown-field" },
      { controlKey: "ref_save_123456", reason: "unknown-field" },
      { controlKey: "ref_submit_1234", reason: "final-submit" }
    ]));
  });

  it.each([
    ["https://talent.lenovo.com.cn", "/account/login"],
    ["https://jobs.lenovo.com.cn", "/account/resume"],
    ["http://talent.lenovo.com.cn", "/account/resume"]
  ])("fails closed for an unsupported page summary: %s%s", (origin, pathTemplate) => {
    expect(new AtsAdapterRegistry([lenovoTalentManifest]).detect(summary(origin, pathTemplate)).status)
      .toBe("unmatched");
  });
});
