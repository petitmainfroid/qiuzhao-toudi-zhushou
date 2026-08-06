import { describe, expect, it } from "vitest";
import { buildFillQualityReport, type FillQualityObservationArtifact } from "./fillQuality";
import { buildJudgeRequest, parseJudgeApiResponse, resolveJudgeConfig } from "./judgePolicy";

const artifact: FillQualityObservationArtifact = {
  schemaVersion: 1,
  suiteVersion: "judge-test.1",
  generatedAt: "2026-08-05T00:00:00.000Z",
  syntheticOnly: true,
  cases: [],
  repeatable: {
    expectedMissingBefore: 0,
    actualMissingBefore: 0,
    expectedMissingAfter: 0,
    actualMissingAfter: 0,
    expectedCreated: 0,
    actualCreated: 0
  },
  attachment: {
    expectedStatus: "ready",
    actualStatus: "ready",
    expectedCandidateCount: 1,
    actualCandidateCount: 1,
    expectedOtherAttachmentMutations: 0,
    actualOtherAttachmentMutations: 0
  }
};

describe("DeepSeek fill-quality judge policy", () => {
  it("refuses plain HTTP before a key can be used", () => {
    expect(() => resolveJudgeConfig({
      OPENAI_API_KEY: "secret-never-logged",
      OPENAI_MODEL: "bailian/deepseek-v4-flash",
      OPENAI_CHAT_COMPLETIONS_URL: "http://gateway.example/v1/chat/completions"
    })).toThrow(/non-HTTPS/);
  });

  it("builds a bounded JSON request from a synthetic artifact", () => {
    const config = resolveJudgeConfig({
      OPENAI_API_KEY: "secret-never-logged",
      OPENAI_MODEL: "deepseek-v4-flash",
      OPENAI_BASE_URL: "https://api.deepseek.com/v1"
    });
    expect(config.endpoint).toBe("https://api.deepseek.com/v1/chat/completions");
    const request = buildJudgeRequest(artifact, buildFillQualityReport(artifact), config.model);
    const serialized = JSON.stringify(request);
    expect(serialized).toContain("json");
    expect(serialized).toContain("calibration-unsafe-submit");
    expect(serialized).not.toContain(config.apiKey);
  });

  it("sanitizes structured findings and scores calibration independently", () => {
    const result = parseJudgeApiResponse({
      model: "provider/deepseek-v4-flash",
      choices: [{ message: { content: JSON.stringify({
        verdict: "needs-fix",
        findings: [{
          evidenceId: "generic:field-1",
          severity: "high",
          category: "matching",
          summary: "Wrong path",
          recommendedTest: "Add a synthetic alias regression"
        }],
        calibration: [
          { evidenceId: "calibration-good", predicted: "pass" },
          { evidenceId: "calibration-wrong-match", predicted: "fail" },
          { evidenceId: "calibration-missed-fill", predicted: "fail" },
          { evidenceId: "calibration-unsafe-submit", predicted: "fail" }
        ]
      }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
    }, "deepseek-v4-flash");
    expect(result).toMatchObject({
      verdict: "needs-fix",
      modelMatchesConfiguration: true,
      calibration: { correct: 4, total: 4, accuracy: 1 },
      usage: { totalTokens: 150 }
    });
    expect(result.findings).toHaveLength(1);
  });
});
