import { describe, expect, it } from "vitest";
import type { PrivacySafePageState } from "../bridge/protocol";
import { auditAtsObservation, assertShareableAtsObservation } from "./audit";
import { createShareableAtsObservation } from "./observation";

const state: PrivacySafePageState = {
  snapshotId: "state_1",
  origin: "https://jobs.example.test",
  path: "/apply/42",
  sections: ["教育经历"],
  controls: [{
    ref: "node_1",
    role: "textbox",
    tag: "input",
    inputType: "email",
    semantics: { label: "联系邮箱", name: "candidate.email" },
    disabled: false,
    readOnly: false,
    required: true,
    multiple: false,
    boundary: "main",
    safety: "ordinary"
  }],
  summary: { controlCount: 1, frameCount: 1, openShadowRootCount: 0, blockedControlCount: 0, sectionCount: 1 }
};

function validObservation() {
  return createShareableAtsObservation(state, {
    captureToolVersion: "0.2.0",
    capturedAt: "2026-08-06T12:00:00.000Z"
  });
}

describe("auditAtsObservation", () => {
  it("fails closed on forbidden keys and personal strings", () => {
    const malicious = structuredClone(validObservation()) as unknown as Record<string, unknown>;
    const controls = malicious.controls as Array<Record<string, unknown>>;
    controls[0]!.value = "candidate@example.com";
    controls[0]!.outerHTML = "<input value='secret'>";

    const audit = auditAtsObservation(malicious);
    expect(audit.passed).toBe(false);
    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "forbidden-key", path: "$.controls[0].value" }),
      expect.objectContaining({ code: "forbidden-string", path: "$.controls[0].value" }),
      expect.objectContaining({ code: "forbidden-key", path: "$.controls[0].outerHTML" })
    ]));
    expect(() => assertShareableAtsObservation(malicious)).toThrow(/privacy audit failed/);
  });

  it("rejects duplicate controls, query values, and inconsistent summaries", () => {
    const inconsistent = structuredClone(validObservation());
    inconsistent.controls.push(structuredClone(inconsistent.controls[0]!));
    inconsistent.source.pathTemplate = "/apply/:id?candidate=secret";
    inconsistent.summary.controlCount = 99;

    const audit = auditAtsObservation(inconsistent);
    expect(audit.passed).toBe(false);
    expect(audit.issues.map((item) => item.code)).toEqual(expect.arrayContaining([
      "forbidden-string",
      "unsafe-source",
      "duplicate-control",
      "summary-mismatch"
    ]));
  });

  it("rejects values outside the versioned contract unions", () => {
    const invalid = structuredClone(validObservation()) as unknown as Record<string, unknown>;
    const controls = invalid.controls as Array<Record<string, unknown>>;
    controls[0]!.role = "arbitrary-widget";
    controls[0]!.boundary = "cross-origin-frame";
    (invalid.source as Record<string, unknown>).pageType = "unknown-custom-page";

    const audit = auditAtsObservation(invalid);
    expect(audit.passed).toBe(false);
    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-shape", path: "$.controls[0].role" }),
      expect.objectContaining({ code: "invalid-shape", path: "$.controls[0].boundary" }),
      expect.objectContaining({ code: "invalid-shape", path: "$.source.pageType" })
    ]));
  });

  it("rejects file metadata, displayed dates, and an unprotected final submit control", () => {
    const fileMetadata = structuredClone(validObservation());
    fileMetadata.controls[0]!.semantics.label = "synthetic-private-resume.pdf";
    expect(auditAtsObservation(fileMetadata).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "forbidden-string", path: "$.controls[0].semantics.label" })
    ]));

    const dateDisplay = structuredClone(validObservation());
    dateDisplay.controls[0]!.semantics.nearbyText = "2024-09 - 2026-06";
    expect(auditAtsObservation(dateDisplay).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "forbidden-string", path: "$.controls[0].semantics.nearbyText" })
    ]));

    const unsafeSubmit = structuredClone(validObservation());
    unsafeSubmit.controls[0]!.role = "button";
    unsafeSubmit.controls[0]!.tag = "button";
    unsafeSubmit.controls[0]!.semantics.label = "提交简历";
    expect(auditAtsObservation(unsafeSubmit).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unsafe-control", path: "$.controls[0].safety" })
    ]));
  });
});
