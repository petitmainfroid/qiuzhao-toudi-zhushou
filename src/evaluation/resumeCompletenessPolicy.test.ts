import { createEmptyProfile } from "../domain/profile";
import { describe, expect, it } from "vitest";
import {
  assertResumeCompletenessObservation,
  buildRedactedResumeSample,
  buildResumeCompletenessJudgeRequest,
  parseResumeJudgeApiResponse,
  type ResumeCompletenessObservation
} from "./resumeCompletenessPolicy";

function syntheticSample() {
  const profile = createEmptyProfile();
  profile.basic.fullName = "测试姓名";
  profile.basic.phone = "13800138000";
  profile.basic.email = "person@example.com";
  profile.basic.politicalStatus = "中共预备党员";
  profile.education[0].school = "Example University";
  profile.education[0].gpa = "3.8/4.0";
  profile.projects.push({
    id: "project-1",
    name: "Evidence Project",
    role: "Lead",
    startDate: "2024-01",
    endDate: "2024-06",
    description: "Built a deterministic evaluator.",
    outcome: "Reduced review time by 30%.",
    link: "https://example.test/private"
  });
  return buildRedactedResumeSample({
    sampleId: "A1B2C3D4",
    format: "pdf",
    pageCount: 1,
    sourceText: [
      "测试姓名",
      "手机：13800138000 | person@example.com",
      "身份证号：110101200001011234",
      "地址：北京市示例路 1 号",
      "生源地 | 2003-03 | 中共预备党员 | 汉族",
      "Education",
      "Example University",
      "GPA: 3.8/4.0",
      "Project: Evidence Project https://example.test/private"
    ].join("\n"),
    profile,
    parserWarningCount: 0
  });
}

describe("resume completeness judge policy", () => {
  it("redacts direct identifiers while preserving numbered source evidence and canonical facts", () => {
    const sample = syntheticSample();
    const serialized = JSON.stringify(sample);
    expect(serialized).not.toContain("测试姓名");
    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain("110101200001011234");
    expect(serialized).not.toContain("中共预备党员");
    expect(serialized).not.toContain("https://example.test/private");
    expect(sample.redactedLines.some(({ text }) => text.includes("GPA: 3.8/4.0"))).toBe(true);
    expect(sample.parsedFacts.some(({ path, value }) => path === "education.0.gpa" && value === "3.8/4.0")).toBe(true);
    expect(sample.parsedFacts.find(({ path }) => path === "basic.fullName")?.value).toBe("[REDACTED_NAME]");
  });

  it("rejects observations that retain direct identifiers or forbidden persistence keys", () => {
    const sample = syntheticSample();
    const artifact: ResumeCompletenessObservation = {
      schemaVersion: 1,
      suiteVersion: "test.1",
      generatedAt: new Date(0).toISOString(),
      corpusScope: "historical-digest-allowlist",
      directIdentifiersRemoved: true,
      samples: [sample]
    };
    expect(() => assertResumeCompletenessObservation(artifact)).not.toThrow();
    const withEmail = structuredClone(artifact);
    withEmail.samples[0].redactedLines.push({ lineId: "L999", text: "person@example.com" });
    expect(() => assertResumeCompletenessObservation(withEmail)).toThrow(/Direct identifier/);
    const withPath = { ...artifact, filePath: "C:/private/resume.pdf" };
    expect(() => assertResumeCompletenessObservation(withPath)).toThrow(/Forbidden resume audit key/);
  });

  it("builds a bounded JSON request and sanitizes path-and-line-only findings", () => {
    const sample = syntheticSample();
    const request = buildResumeCompletenessJudgeRequest(sample, "bailian/deepseek-v4-flash");
    expect(request).toMatchObject({
      model: "bailian/deepseek-v4-flash",
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0,
      stream: false
    });
    const content = JSON.stringify({
      sampleId: sample.sampleId,
      verdict: "needs-fix",
      findings: [{
        findingId: "missing-major",
        status: "missing",
        section: "education",
        path: "education.0.major",
        lineIds: ["L006"],
        severity: "high",
        confidence: "high",
        reasonCode: "missing-supported-field",
        layoutHint: "split-header-value",
        sourceExcerpt: "must be discarded"
      }],
      calibration: [
        { evidenceId: "resume-calibration-complete", predicted: "correct" },
        { evidenceId: "resume-calibration-missing", predicted: "missing" },
        { evidenceId: "resume-calibration-incorrect", predicted: "incorrect" },
        { evidenceId: "resume-calibration-unsupported", predicted: "unsupported" }
      ]
    });
    const result = parseResumeJudgeApiResponse({
      model: "deepseek-v4-flash",
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      choices: [{ message: { content } }]
    }, "bailian/deepseek-v4-flash", sample);
    expect(result.calibration.accuracy).toBe(1);
    expect(result.modelMatchesConfiguration).toBe(true);
    expect(result.findings).toEqual([{
      findingId: "missing-major",
      status: "missing",
      section: "education",
      path: "education.0.major",
      lineIds: ["L006"],
      severity: "high",
      confidence: "high",
      reasonCode: "missing-supported-field",
      layoutHint: "split-header-value"
    }]);
    expect(JSON.stringify(result)).not.toContain("sourceExcerpt");
  });
});
