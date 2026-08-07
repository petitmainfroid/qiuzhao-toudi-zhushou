import { beforeEach, describe, expect, it } from "vitest";
import {
  FOCUSED_RECOVERY_TTL_MS,
  captureUserFocusedControl,
  fillFocusedRecovery,
  inspectFocusedRecoveryTarget,
  resetFocusedRecoveryState
} from "./focusedRecovery";

function addInput(label: string, attributes = ""): HTMLInputElement {
  document.body.innerHTML = `<label>${label}<input ${attributes}></label>`;
  return document.querySelector("input")!;
}

describe("focused field manual recovery", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetFocusedRecoveryState();
  });

  it("authorizes one empty ordinary field and verifies one selected non-sensitive value", async () => {
    const input = addInput("作品链接", "name='portfolioUrl'");
    captureUserFocusedControl(input, 1_000, "https://jobs.example/apply/1");

    const target = inspectFocusedRecoveryTarget(1_100, "https://jobs.example/apply/1");
    expect(target).toMatchObject({ status: "ready", fieldLabel: "作品链接", controlKind: "text" });
    expect(JSON.stringify(target)).not.toContain("PRIVATE");
    if (target.status !== "ready") throw new Error("target not ready");

    const result = await fillFocusedRecovery({
      token: target.token,
      profilePath: "projects.0.link",
      value: "https://portfolio.example/PRIVATE"
    }, 1_200, "https://jobs.example/apply/1");

    expect(result).toEqual({ status: "filled", fieldLabel: "作品链接", canonicalLabel: "项目链接" });
    expect(input.value).toBe("https://portfolio.example/PRIVATE");
    expect(JSON.stringify(result)).not.toContain("portfolio.example");
    expect(await fillFocusedRecovery({
      token: target.token,
      profilePath: "projects.0.link",
      value: "replay"
    }, 1_300, "https://jobs.example/apply/1")).toEqual({
      status: "rejected",
      reason: "authorization-expired"
    });
  });

  it("refuses existing values, verification controls, unsafe controls, and sensitive targets", () => {
    const existing = addInput("作品链接", "value='PAGE-PRIVATE-VALUE'");
    captureUserFocusedControl(existing, 1_000, "https://jobs.example/apply");
    const existingResult = inspectFocusedRecoveryTarget(1_100, "https://jobs.example/apply");
    expect(existingResult).toEqual({ status: "rejected", reason: "existing-value" });
    expect(JSON.stringify(existingResult)).not.toContain("PAGE-PRIVATE-VALUE");

    const captcha = addInput("短信验证码", "name='otp'");
    captureUserFocusedControl(captcha, 2_000, "https://jobs.example/apply");
    expect(inspectFocusedRecoveryTarget(2_100, "https://jobs.example/apply"))
      .toEqual({ status: "rejected", reason: "verification-control" });

    const password = addInput("登录密码", "type='password'");
    captureUserFocusedControl(password, 3_000, "https://jobs.example/apply");
    expect(inspectFocusedRecoveryTarget(3_100, "https://jobs.example/apply"))
      .toEqual({ status: "rejected", reason: "unsafe-control" });

    const identity = addInput("身份证号码", "name='identityDocumentNumber'");
    captureUserFocusedControl(identity, 4_000, "https://jobs.example/apply");
    expect(inspectFocusedRecoveryTarget(4_100, "https://jobs.example/apply"))
      .toEqual({ status: "rejected", reason: "sensitive-target" });
  });

  it("rejects stale focus, navigation, structure changes, and sensitive profile paths", async () => {
    const input = addInput("补充说明", "name='additionalNote'");
    captureUserFocusedControl(input, 1_000, "https://jobs.example/apply/1");
    expect(inspectFocusedRecoveryTarget(1_000 + FOCUSED_RECOVERY_TTL_MS + 1, "https://jobs.example/apply/1"))
      .toEqual({ status: "rejected", reason: "focus-expired" });

    captureUserFocusedControl(input, 2_000, "https://jobs.example/apply/1");
    expect(inspectFocusedRecoveryTarget(2_100, "https://jobs.example/apply/2"))
      .toEqual({ status: "rejected", reason: "page-changed" });

    captureUserFocusedControl(input, 3_000, "https://jobs.example/apply/1");
    const changedTarget = inspectFocusedRecoveryTarget(3_100, "https://jobs.example/apply/1");
    if (changedTarget.status !== "ready") throw new Error("target not ready");
    input.name = "changedAfterAuthorization";
    expect(await fillFocusedRecovery({
      token: changedTarget.token,
      profilePath: "answers.selfEvaluation",
      value: "ordinary value"
    }, 3_200, "https://jobs.example/apply/1")).toEqual({ status: "rejected", reason: "field-changed" });

    input.name = "additionalNote";
    captureUserFocusedControl(input, 4_000, "https://jobs.example/apply/1");
    const sensitiveTarget = inspectFocusedRecoveryTarget(4_100, "https://jobs.example/apply/1");
    if (sensitiveTarget.status !== "ready") throw new Error("target not ready");
    expect(await fillFocusedRecovery({
      token: sensitiveTarget.token,
      profilePath: "basic.identityDocumentNumber",
      value: "PRIVATE-ID-42"
    }, 4_200, "https://jobs.example/apply/1")).toEqual({
      status: "rejected",
      reason: "sensitive-profile-value"
    });
    expect(input.value).toBe("");
  });
});
