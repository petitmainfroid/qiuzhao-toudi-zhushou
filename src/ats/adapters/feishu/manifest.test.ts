import { describe, expect, it } from "vitest";
import { AtsAdapterRegistry, validateAtsAdapterManifest, type AtsAdapterPageSummary } from "../../../adapter-sdk";
import { feishuRecruitingManifest, isFeishuRecruitingApplicationUrl } from "./manifest";

function summary(origin: string, pathTemplate: string): AtsAdapterPageSummary {
  const controls: AtsAdapterPageSummary["controls"] = [
    {
      controlKey: "name",
      role: "textbox",
      tag: "input",
      inputType: "text",
      semantics: { label: "姓名", name: "basic_info.name" },
      disabled: false,
      readOnly: false,
      required: true,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    {
      controlKey: "email",
      role: "textbox",
      tag: "input",
      inputType: "email",
      semantics: { label: "邮箱", name: "basic_info.email" },
      disabled: false,
      readOnly: false,
      required: true,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    {
      controlKey: "gender",
      role: "combobox",
      tag: "custom",
      semantics: { label: "性别", name: "basic_info.gender" },
      optionLabels: ["男", "女"],
      disabled: false,
      readOnly: false,
      required: true,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    {
      controlKey: "school",
      role: "textbox",
      tag: "input",
      inputType: "text",
      semantics: { label: "学校名称", name: "education_list[1].school" },
      disabled: false,
      readOnly: false,
      required: true,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    {
      controlKey: "period",
      role: "textbox",
      tag: "input",
      inputType: "month",
      semantics: { label: "起止时间", name: "education_list[1].start_end_time" },
      disabled: false,
      readOnly: false,
      required: true,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    {
      controlKey: "resume",
      role: "textbox",
      tag: "input",
      inputType: "file",
      semantics: { label: "简历附件", name: "attachment_resume_list.attachment_resume" },
      disabled: false,
      readOnly: false,
      required: true,
      multiple: false,
      boundary: "main",
      safety: "file"
    },
    {
      controlKey: "custom",
      role: "textbox",
      tag: "input",
      inputType: "text",
      semantics: { label: "企业自定义题", name: "custom_fields[0].answer" },
      disabled: false,
      readOnly: false,
      required: false,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    },
    {
      controlKey: "submit",
      role: "button",
      tag: "button",
      inputType: "submit",
      semantics: { label: "提交简历" },
      disabled: false,
      readOnly: false,
      required: false,
      multiple: false,
      boundary: "main",
      safety: "final-submit"
    }
  ];
  return { snapshotKey: "state_feishu", origin, pathTemplate, controls };
}

function labelOnlyXiaomiSummary(): AtsAdapterPageSummary {
  const control = (
    controlKey: string,
    label: string,
    inputType: string = "text"
  ): AtsAdapterPageSummary["controls"][number] => ({
    controlKey,
    role: "textbox",
    tag: "input",
    inputType,
    semantics: { label },
    disabled: false,
    readOnly: false,
    required: true,
    multiple: false,
    boundary: "main",
    safety: "ordinary"
  });
  return {
    snapshotKey: "state_xiaomi_label_only",
    origin: "https://xiaomi.jobs.f.mioffice.cn",
    pathTemplate: "/internship/resume/:id/apply",
    controls: [
      control("name", "姓名"),
      control("email", "邮箱", "email"),
      control("school-0", "学校名称"),
      control("school-1", "学校名称"),
      control("major-0", "专业"),
      control("major-1", "专业"),
      control("project-0", "项目名称"),
      control("self-evaluation", "自我评价"),
      control("custom-description", "描述")
    ]
  };
}

describe("Feishu recruiting K5 manifest", () => {
  it.each([
    "https://xiaomi.jobs.f.mioffice.cn/internship/resume/123456/apply",
    "https://meta.jobs.feishu.cn/tenant_123/resume/987654/apply?source=campus",
    "https://kwh0jtf778.jobs.feishu.cn/index/resume/7670064234785491242/apply"
  ])("routes only a reviewed Feishu application URL: %s", (url) => {
    expect(isFeishuRecruitingApplicationUrl(url)).toBe(true);
  });

  it.each([
    "http://meta.jobs.feishu.cn/index/resume/123/apply",
    "https://meta.jobs.feishu.cn.evil.test/index/resume/123/apply",
    "https://user@meta.jobs.feishu.cn/index/resume/123/apply",
    "https://meta.jobs.feishu.cn/index/position/123/detail",
    "https://meta.jobs.feishu.cn/index/resume/123/apply/extra",
    "not-a-url"
  ])("does not route an untrusted or unrelated URL: %s", (url) => {
    expect(isFeishuRecruitingApplicationUrl(url)).toBe(false);
  });

  it("is selector-free and passes the exact manifest contract", () => {
    expect(validateAtsAdapterManifest(feishuRecruitingManifest)).toEqual({
      ok: true,
      manifest: feishuRecruitingManifest
    });
    expect(JSON.stringify(feishuRecruitingManifest)).not.toMatch(/selector|querySelector|\.click\(|chrome\.|debugger|nodeId|value/i);
  });

  it.each([
    ["https://xiaomi.jobs.f.mioffice.cn", "/internship/resume/:id/apply"],
    ["https://meta.jobs.feishu.cn", "/:id/resume/:id/apply"],
    ["https://nio.jobs.feishu.cn", "/index/resume/:id/apply"],
    ["https://anker-in.jobs.feishu.cn", "/index/resume/:id/apply"],
    ["https://kwh0jtf778.jobs.feishu.cn", "/index/resume/:id/apply"]
  ])("detects a reviewed Feishu tenant shape without a company branch: %s", (origin, pathTemplate) => {
    const resolution = new AtsAdapterRegistry([feishuRecruitingManifest]).detect(summary(origin, pathTemplate));
    expect(resolution.status).toBe("matched");
  });

  it("maps canonical intent, confirms sensitive controls, gates the PDF, and skips custom/submit controls", () => {
    const resolution = new AtsAdapterRegistry([feishuRecruitingManifest]).detect(
      summary("https://meta.jobs.feishu.cn", "/:id/resume/:id/apply")
    );
    if (resolution.status !== "matched") throw new Error("Expected Feishu manifest match.");
    expect(resolution.plan.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ controlKey: "name", intent: { kind: "profile-field", pathPattern: "basic.fullName" }, decision: "fill" }),
      expect.objectContaining({ controlKey: "gender", intent: { kind: "profile-field", pathPattern: "basic.gender" }, decision: "confirm" }),
      expect.objectContaining({ controlKey: "school", intent: { kind: "profile-field", pathPattern: "education.1.school" } }),
      expect.objectContaining({
        controlKey: "period",
        intent: {
          kind: "profile-range",
          startPathPattern: "education.1.startDate",
          endPathPattern: "education.1.endDate"
        }
      }),
      expect.objectContaining({ controlKey: "resume", intent: { kind: "saved-resume" }, decision: "confirm" })
    ]));
    expect(resolution.plan.skipped).toEqual(expect.arrayContaining([
      { controlKey: "custom", reason: "unknown-field" },
      { controlKey: "submit", reason: "final-submit" }
    ]));
  });

  it("maps the reviewed Xiaomi label-only variant without guessing an ambiguous description", () => {
    const resolution = new AtsAdapterRegistry([feishuRecruitingManifest]).detect(labelOnlyXiaomiSummary());
    expect(resolution.status).toBe("matched");
    if (resolution.status !== "matched") throw new Error("Expected label-only Xiaomi variant to match.");
    expect(resolution.plan.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ controlKey: "name", intent: { kind: "profile-field", pathPattern: "basic.fullName" } }),
      expect.objectContaining({ controlKey: "email", intent: { kind: "profile-field", pathPattern: "basic.email" } }),
      expect.objectContaining({ controlKey: "school-0", intent: { kind: "profile-field", pathPattern: "education.0.school" } }),
      expect.objectContaining({ controlKey: "school-1", intent: { kind: "profile-field", pathPattern: "education.1.school" } }),
      expect.objectContaining({ controlKey: "major-0", intent: { kind: "profile-field", pathPattern: "education.0.major" } }),
      expect.objectContaining({ controlKey: "major-1", intent: { kind: "profile-field", pathPattern: "education.1.major" } }),
      expect.objectContaining({ controlKey: "project-0", intent: { kind: "profile-field", pathPattern: "projects.0.name" } }),
      expect.objectContaining({ controlKey: "self-evaluation", intent: { kind: "profile-field", pathPattern: "answers.selfEvaluation" } })
    ]));
    expect(resolution.plan.skipped).toContainEqual({ controlKey: "custom-description", reason: "ambiguous-rule" });
  });

  it.each([
    ["http://meta.jobs.feishu.cn", "/:id/resume/:id/apply"],
    ["https://jobs.feishu.cn.evil.test", "/index/resume/:id/apply"],
    ["https://meta.jobs.feishu.cn", "/index/position/:id/detail"]
  ])("fails closed for an untrusted location: %s%s", (origin, pathTemplate) => {
    const resolution = new AtsAdapterRegistry([feishuRecruitingManifest]).detect(summary(origin, pathTemplate));
    expect(resolution.status).toBe("unmatched");
  });
});
