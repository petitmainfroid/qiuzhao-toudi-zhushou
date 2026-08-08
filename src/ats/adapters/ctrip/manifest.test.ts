import { describe, expect, it } from "vitest";
import {
  AtsAdapterRegistry,
  validateAtsAdapterManifest,
  type AtsAdapterPageSummary
} from "../../../adapter-sdk";
import { ctripCareersManifest, isCtripExperiencedEditCvUrl } from "./manifest";

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

function summary(origin = "https://job.ctrip.com", pathTemplate = "/"): AtsAdapterPageSummary {
  return {
    snapshotKey: "state_ctrip_contract",
    origin,
    pathTemplate,
    controls: [
      control("ref_import_1234", "resumeImportFile", "导入简历", {
        inputType: "file",
        safety: "file"
      }),
      control("ref_name_123456", "name", "姓名"),
      control("ref_mobile_1234", "mobile", "手机号"),
      control("ref_email_12345", "email", "邮箱"),
      control("ref_degree_1234", "recruitEducationList[0].highestDegree", "学历", {
        role: "combobox",
        tag: "custom"
      }),
      control("ref_company_123", "recruitWorkingList[0].companyName", "公司"),
      control("ref_language_12", "recruitLanguageList[0].languageType", "语言"),
      control("ref_portfolio_1", "PPtFileList", "作品集或附件", {
        inputType: "file",
        safety: "file"
      }),
      control("ref_sms_123456", "smsCode", "短信验证码", { safety: "verification" }),
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

describe("Ctrip Careers K5 manifest", () => {
  it("covers the 28-field public bundle contract with 14 conservative mappings", () => {
    expect(validateAtsAdapterManifest(ctripCareersManifest)).toEqual({
      ok: true,
      manifest: ctripCareersManifest
    });
    expect(ctripCareersManifest.fields).toHaveLength(28);
    expect(ctripCareersManifest.fields.filter((item) => item.decision !== "exclude")).toHaveLength(14);
    expect(ctripCareersManifest.fields.filter((item) => item.decision === "exclude")).toHaveLength(14);
    expect(ctripCareersManifest.repeatables).toEqual([]);
    expect(JSON.stringify(ctripCareersManifest)).not.toMatch(
      /selector|querySelector|\.click\(|chrome\.|debugger|nodeId|candidateValue/i
    );
  });

  it.each([
    "https://job.ctrip.com/#/experienced/personal-homepage/editCV",
    "https://job.ctrip.com/#/experienced/personal-homepage/editCV?tabindex=2",
    "https://job.ctrip.com/#/experienced/personal-homepage/editCV?tabindex=10"
  ])("routes the reviewed Ctrip edit-CV hash URL: %s", (url) => {
    expect(isCtripExperiencedEditCvUrl(url)).toBe(true);
  });

  it.each([
    "http://job.ctrip.com/#/experienced/personal-homepage/editCV?tabindex=2",
    "https://job.ctrip.com.evil.test/#/experienced/personal-homepage/editCV?tabindex=2",
    "https://user@job.ctrip.com/#/experienced/personal-homepage/editCV?tabindex=2",
    "https://job.ctrip.com:444/#/experienced/personal-homepage/editCV?tabindex=2",
    "https://job.ctrip.com/campus#/experienced/personal-homepage/editCV?tabindex=2",
    "https://job.ctrip.com/#/experienced/personal-homepage",
    "https://job.ctrip.com/#/experienced/personal-homepage/editCV?tabindex=two"
  ])("rejects an unrelated or untrusted Ctrip URL: %s", (url) => {
    expect(isCtripExperiencedEditCvUrl(url)).toBe(false);
  });

  it("plans only profile-compatible fields and keeps parse, portfolio, SMS, save and submit manual", () => {
    const result = new AtsAdapterRegistry([ctripCareersManifest]).detect(summary());
    expect(result.status).toBe("matched");
    if (result.status !== "matched") throw new Error("Expected Ctrip manifest match.");
    expect(result.plan.familyId).toBe("ctrip-careers-custom");
    expect(result.plan.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        controlKey: "ref_name_123456",
        intent: { kind: "profile-field", pathPattern: "basic.fullName" }
      }),
      expect.objectContaining({
        controlKey: "ref_mobile_1234",
        decision: "confirm",
        intent: { kind: "profile-field", pathPattern: "basic.phone" }
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
        controlKey: "ref_language_12",
        intent: { kind: "profile-field", pathPattern: "languages.0.language" }
      })
    ]));
    expect(result.plan.repeatables).toEqual([]);
    expect(result.plan.skipped).toEqual(expect.arrayContaining([
      { controlKey: "ref_import_1234", reason: "adapter-excluded" },
      { controlKey: "ref_portfolio_1", reason: "adapter-excluded" },
      { controlKey: "ref_sms_123456", reason: "unknown-field" },
      { controlKey: "ref_custom_1234", reason: "unknown-field" },
      { controlKey: "ref_save_123456", reason: "unknown-field" },
      { controlKey: "ref_submit_1234", reason: "final-submit" }
    ]));
  });

  it.each([
    ["https://job.ctrip.com", "/campus"],
    ["https://careers.ctrip.com", "/"],
    ["http://job.ctrip.com", "/"]
  ])("fails closed for an unsupported page summary: %s%s", (origin, pathTemplate) => {
    expect(new AtsAdapterRegistry([ctripCareersManifest]).detect(summary(origin, pathTemplate)).status)
      .toBe("unmatched");
  });
});
