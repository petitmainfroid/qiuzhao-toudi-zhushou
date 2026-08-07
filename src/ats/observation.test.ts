import { describe, expect, it } from "vitest";
import type { PrivacySafePageState } from "../bridge/protocol";
import { auditAtsObservation } from "./audit";
import { AtsFamilyRegistry } from "./familyRegistry";
import { createShareableAtsObservation } from "./observation";

function pageState(): PrivacySafePageState {
  return {
    snapshotId: "state_private_0001",
    origin: "https://careers.example.test",
    path: "/internship/resume/123456/apply/550e8400-e29b-41d4-a716-446655440000",
    sections: ["教育经历", "作品"],
    controls: [
      {
        ref: "node_private_0001",
        role: "textbox",
        tag: "input",
        inputType: "text",
        semantics: {
          label: "联系 candidate@example.com 13800138000 https://private.example/path?token=secret",
          name: "education[123].school?token=secret",
          nearbyText: "C:\\Users\\candidate\\resume.pdf"
        },
        disabled: false,
        readOnly: false,
        required: true,
        multiple: false,
        boundary: "same-origin-frame",
        safety: "ordinary"
      },
      {
        ref: "node_private_0002",
        role: "textbox",
        tag: "input",
        inputType: "file",
        semantics: { label: "上传简历" },
        options: ["PDF", "PDF", "candidate@example.com"],
        disabled: false,
        readOnly: false,
        required: false,
        multiple: false,
        boundary: "open-shadow",
        safety: "file"
      }
    ],
    summary: { controlCount: 2, frameCount: 2, openShadowRootCount: 1, blockedControlCount: 1, sectionCount: 2 }
  };
}

describe("createShareableAtsObservation", () => {
  it("builds an audited report without session references or personal values", () => {
    const familyRegistry = new AtsFamilyRegistry([{
      id: "anonymous-family",
      version: "1.2",
      detect: ({ source, controls }) => source.pathTemplate.includes(":id") && controls.length === 2
        ? { confidence: 0.94, evidence: [{ kind: "control-structure", detail: "two-control application shell" }] }
        : null
    }]);
    const observation = createShareableAtsObservation(pageState(), {
      captureToolVersion: "0.2.0",
      capturedAt: "2026-08-06T12:00:00.000Z",
      language: "zh-CN",
      pageType: "application",
      familyRegistry,
      familyMarkers: ["candidate@example.com", "anonymous-wrapper"]
    });

    expect(observation.source).toEqual({
      origin: "https://careers.example.test",
      pathTemplate: "/internship/resume/:id/apply/:uuid",
      language: "zh-CN",
      pageType: "application",
      captureToolVersion: "0.2.0"
    });
    expect(observation.family.id).toBe("anonymous-family");
    expect(observation.controls.map((control) => control.controlKey)).toEqual(["control_0001", "control_0002"]);
    expect(observation.sections).toEqual(["教育经历", "作品"]);
    expect(observation.controls[0]?.semantics).toEqual({
      label: "联系 [邮箱] [电话] [链接]",
      name: "education[].school"
    });
    expect(observation.controls[1]?.options).toEqual(["PDF", "[邮箱]"]);
    expect(observation.summary).toEqual({
      controlCount: 2,
      blockedControlCount: 1,
      frameControlCount: 1,
      openShadowControlCount: 1,
      sectionCount: 2
    });
    const serialized = JSON.stringify(observation);
    expect(serialized).not.toContain("state_private");
    expect(serialized).not.toContain("node_private");
    expect(serialized).not.toContain("candidate@example.com");
    expect(serialized).not.toContain("13800138000");
    expect(serialized).not.toContain("token=secret");
    expect(auditAtsObservation(observation)).toEqual({ passed: true, issues: [] });
  });

  it("rejects credential-bearing origins and query-bearing paths", () => {
    expect(() => createShareableAtsObservation(
      { ...pageState(), origin: "https://user:secret@careers.example.test" },
      { captureToolVersion: "0.2.0" }
    )).toThrow(/credential-free HTTPS Origin/);
    expect(() => createShareableAtsObservation(
      { ...pageState(), path: "/apply/123?candidate=secret" },
      { captureToolVersion: "0.2.0" }
    )).toThrow(/query-free pathname/);
  });
});
