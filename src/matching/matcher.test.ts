import { describe, expect, it } from "vitest";
import { matchField } from "./matcher";
import type { ControlKind, FieldDescriptor } from "./types";

function descriptor(label: string, kind: ControlKind = "text", extra: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    elementId: `field-${label}`,
    tagName: kind === "textarea" ? "textarea" : kind === "select" ? "select" : "input",
    inputType: kind,
    kind,
    label,
    ariaLabel: "",
    placeholder: "",
    name: "",
    domId: "",
    autocomplete: "",
    contextText: "",
    options: [],
    disabled: false,
    readOnly: false,
    ...extra
  };
}

describe("field matcher catalog", () => {
  const cases: Array<[string, ControlKind, string]> = [
    ["姓名", "text", "basic.fullName"],
    ["中文姓名", "text", "basic.fullName"],
    ["Full Name", "text", "basic.fullName"],
    ["English Name", "text", "basic.preferredName"],
    ["性别", "radio", "basic.gender"],
    ["出生日期", "date", "basic.birthDate"],
    ["年龄", "number", "derived.age"],
    ["手机号码", "tel", "basic.phone"],
    ["Mobile Phone", "tel", "basic.phone"],
    ["Email Address", "email", "basic.email"],
    ["国籍（地区）", "select", "basic.nationality"],
    ["当前居住城市", "select", "basic.currentCity"],
    ["籍贯", "select", "basic.hometown"],
    ["政治面貌", "select", "basic.politicalStatus"],
    ["证件类型", "select", "basic.identityDocumentType"],
    ["身份证号码", "text", "basic.identityDocumentNumber"],
    ["毕业院校", "text", "education.0.school"],
    ["University Name", "text", "education.0.school"],
    ["最高学历", "select", "education.0.degree"],
    ["Academic Degree", "select", "education.0.academicDegree"],
    ["学历类型", "select", "education.0.educationType"],
    ["所学专业", "text", "education.0.major"],
    ["Field of Study", "text", "education.0.major"],
    ["入学时间", "month", "education.0.startDate"],
    ["Graduation Date", "month", "education.0.endDate"],
    ["GPA", "number", "education.0.gpa"],
    ["专业排名", "text", "education.0.ranking"],
    ["实习公司", "text", "workExperiences.0.company"],
    ["Company Name", "text", "workExperiences.0.company"],
    ["实习部门", "text", "workExperiences.0.department"],
    ["Job Title", "text", "workExperiences.0.role"],
    ["Work Start Date", "month", "workExperiences.0.startDate"],
    ["Work End Date", "month", "workExperiences.0.endDate"],
    ["Work Description", "textarea", "workExperiences.0.description"],
    ["项目名称", "text", "projects.0.name"],
    ["Project Role", "text", "projects.0.role"],
    ["Project Start Date", "month", "projects.0.startDate"],
    ["项目结束时间", "month", "projects.0.endDate"],
    ["项目描述", "textarea", "projects.0.description"],
    ["Project Outcome", "textarea", "projects.0.outcome"],
    ["项目链接", "text", "projects.0.link"],
    ["作品链接", "text", "workSamples.0.link"],
    ["作品描述", "textarea", "workSamples.0.description"],
    ["获奖名称", "text", "awards.0.name"],
    ["获奖时间", "month", "awards.0.date"],
    ["语言", "select", "languages.0.language"],
    ["精通程度", "select", "languages.0.proficiency"],
    ["意向岗位", "text", "jobPreference.targetRoles"],
    ["Target Position", "text", "jobPreference.targetRoles"],
    ["期望工作地点", "select", "jobPreference.preferredCities"],
    ["Earliest Start Date", "date", "jobPreference.availableDate"],
    ["Award Description", "textarea", "awards.0.description"],
    ["Self Introduction", "textarea", "answers.selfIntroduction"],
    ["自我评价", "textarea", "answers.selfEvaluation"],
    ["个人优势", "textarea", "answers.strengths"],
    ["Career Plan", "textarea", "answers.careerPlan"]
  ];

  it.each(cases)("maps %s to %s", (label, kind, path) => {
    const result = matchField(descriptor(label, kind));
    expect(result.profilePath).toBe(path);
    expect(result.confidence).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(0.86);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("uses autocomplete as supporting evidence", () => {
    const result = matchField(descriptor("联系邮箱", "email", { autocomplete: "email" }));
    expect(result.profilePath).toBe("basic.email");
    expect(result.reasons).toContain("浏览器自动填充标记为 email");
  });

  it("requires confirmation for sensitive profile fields", () => {
    const result = matchField(descriptor("出生日期", "date"));
    expect(result.profilePath).toBe("basic.birthDate");
    expect(result.requiresConfirmation).toBe(true);
  });

  it("uses the structural field name to select the correct repeatable record", () => {
    const result = matchField(descriptor("学校名称", "text", {
      name: "education_list[1].school",
      contextText: "教育经历"
    }));
    expect(result.profilePath).toBe("education.1.school");
    expect(result.reasons).toContain("识别为第 2 条重复经历");
  });

  it("separates start and end controls inside a Xiaomi date-range field", () => {
    const start = matchField(descriptor("起止时间", "month", {
      name: "education_list[0].start_end_time.start",
      placeholder: "开始时间",
      contextText: "教育经历"
    }));
    const end = matchField(descriptor("起止时间", "month", {
      name: "education_list[0].start_end_time.end",
      placeholder: "结束时间",
      contextText: "教育经历"
    }));
    expect(start.profilePath).toBe("education.0.startDate");
    expect(end.profilePath).toBe("education.0.endDate");
  });

  it("uses Xiaomi repeatable DOM ids to disambiguate a generic project description", () => {
    const result = matchField(descriptor("描述", "textarea", {
      domId: "project[1].desc",
      contextText: "项目经历"
    }));

    expect(result.profilePath).toBe("projects.1.description");
    expect(result.confidence).toBe("high");
  });

  it.each([
    ["账户密码", "password", "unsupported-control"],
    ["上传简历", "file", "unsupported-control"],
    ["短信验证码", "text", "verification-control"],
    ["个人证件", "text", "sensitive-unsupported"],
    ["银行卡号", "text", "sensitive-unsupported"]
  ] as const)("excludes %s", (label, kind, reason) => {
    const result = matchField(descriptor(label, kind));
    expect(result.profilePath).toBeNull();
    expect(result.excludedReason).toBe(reason);
    expect(result.requiresConfirmation).toBe(true);
  });

  it("does not promote an unknown field", () => {
    const result = matchField(descriptor("推荐人与你的关系"));
    expect(result.profilePath).toBeNull();
    expect(result.confidence).toBe("none");
  });
});
