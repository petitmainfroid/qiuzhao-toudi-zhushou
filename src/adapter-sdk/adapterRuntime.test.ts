import { describe, expect, it } from "vitest";
import type { PrivacySafeControl, PrivacySafePageState } from "../bridge/protocol";
import {
  ATS_ADAPTER_SCHEMA_VERSION,
  AtsAdapterRegistry,
  toAtsAdapterPageSummary,
  type AtsAdapterManifest
} from ".";

function manifest(id: string, hostSuffix: string, marker: string): AtsAdapterManifest {
  return {
    schemaVersion: ATS_ADAPTER_SCHEMA_VERSION,
    family: { id, version: "1" },
    detection: {
      httpsOnly: true,
      exactHosts: [],
      hostSuffixes: [hostSuffix],
      pathPrefixes: ["/apply"],
      semanticMarkers: [marker],
      minimumSemanticMarkers: 1
    },
    fields: [
      {
        id: "candidate-name",
        semanticKeys: [marker],
        roles: ["textbox"],
        capability: "text",
        decision: "fill",
        intent: { kind: "profile-field", pathPattern: "basic.fullName" },
        verification: "normalized-equality"
      },
      {
        id: "education-school",
        semanticKeys: ["education_list[].school"],
        roles: ["textbox"],
        capability: "text",
        decision: "fill",
        intent: { kind: "profile-field", pathPattern: "education.{index}.school" },
        verification: "normalized-equality"
      },
      {
        id: "candidate-gender",
        semanticKeys: ["candidate.gender"],
        roles: ["combobox"],
        capability: "single-select",
        decision: "confirm",
        intent: { kind: "profile-field", pathPattern: "basic.gender" },
        verification: "selected-option"
      },
      {
        id: "saved-resume",
        semanticKeys: ["resume.attachment"],
        roles: ["textbox"],
        capability: "file-upload",
        decision: "confirm",
        intent: { kind: "saved-resume" },
        verification: "attachment-gate"
      }
    ],
    repeatables: [{
      collection: "education",
      sectionSemanticKeys: ["education_list"],
      recordSemanticPrefixes: ["education_list[]"],
      addControlLabels: ["Add education"],
      saveControlLabels: ["Save"],
      maximumCreatesPerRun: 5
    }],
    exclusions: { finalSubmitLabels: ["Submit application"] }
  };
}

function control(
  ref: string,
  name: string,
  overrides: Partial<PrivacySafeControl> = {}
): PrivacySafeControl {
  return {
    ref,
    role: "textbox",
    tag: "input",
    semantics: { name, label: name },
    disabled: false,
    readOnly: false,
    required: false,
    multiple: false,
    boundary: "main",
    safety: "ordinary",
    ...overrides
  };
}

function state(origin: string, controls: PrivacySafeControl[]): PrivacySafePageState {
  return {
    snapshotId: "state_snapshot_123",
    origin,
    path: "/apply/123456789",
    controls,
    summary: {
      controlCount: controls.length,
      frameCount: 0,
      openShadowRootCount: 0,
      blockedControlCount: controls.filter((item) => item.safety !== "ordinary").length
    }
  };
}

describe("ATS adapter runtime", () => {
  it("detects three distinct anonymous families and rejects suffix lookalikes", () => {
    const manifests = [
      manifest("anonymous-family-a", "a.example.test", "candidate.name"),
      manifest("anonymous-family-b", "b.example.test", "applicant.name"),
      manifest("anonymous-family-c", "c.example.test", "profile.name")
    ];
    const registry = new AtsAdapterRegistry(manifests);
    for (const [index, item] of manifests.entries()) {
      const marker = item.detection.semanticMarkers[0]!;
      const summary = toAtsAdapterPageSummary(state(`https://${String.fromCharCode(97 + index)}.example.test`, [
        control(`ref_${index}_12345678`, marker)
      ]));
      const result = registry.detect(summary);
      expect(result.status).toBe("matched");
      if (result.status === "matched") expect(result.detection.familyId).toBe(item.family.id);
    }

    const lookalike = registry.detect(toAtsAdapterPageSummary(state(
      "https://a.example.test.attacker.test",
      [control("ref_lookalike_123", "candidate.name")]
    )));
    expect(lookalike).toEqual({ status: "unmatched", candidates: [] });
  });

  it("plans canonical intents while protecting unknown, unsafe, and final-submit controls", () => {
    const registry = new AtsAdapterRegistry([
      manifest("anonymous-family-a", "a.example.test", "candidate.name")
    ]);
    const summary = toAtsAdapterPageSummary(state("https://a.example.test", [
      control("ref_name_12345678", "candidate.name"),
      control("ref_school_123456", "education_list[2].school"),
      control("ref_gender_123456", "candidate.gender", { role: "combobox", tag: "custom" }),
      control("ref_resume_123456", "resume.attachment", { inputType: "file", safety: "file" }),
      control("ref_add_education_12", "education_list.add", {
        role: "button",
        tag: "button",
        semantics: { name: "education_list.add", label: "Add education" }
      }),
      control("ref_save_education_1", "education_list[2].save", {
        role: "button",
        tag: "button",
        semantics: { name: "education_list[2].save", label: "Save" }
      }),
      control("ref_custom_123456", "custom.favorite_color"),
      control("ref_identity_1234", "candidate.name", { safety: "identity" }),
      control("ref_submit_123456", "candidate.name", {
        role: "button",
        tag: "button",
        safety: "final-submit",
        semantics: { name: "candidate.name", label: "Submit application" }
      })
    ]));
    expect(summary.pathTemplate).toBe("/apply/:id");
    const result = registry.detect(summary);
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;

    expect(result.plan).toMatchObject({
      origin: "https://a.example.test",
      pathTemplate: "/apply/:id"
    });
    expect(result.plan.fields).toEqual([
      expect.objectContaining({
        controlKey: "ref_name_12345678",
        label: "candidate.name",
        role: "textbox",
        tag: "input",
        boundary: "main",
        intent: { kind: "profile-field", pathPattern: "basic.fullName" }
      }),
      expect.objectContaining({
        controlKey: "ref_school_123456",
        intent: { kind: "profile-field", pathPattern: "education.2.school" }
      }),
      expect.objectContaining({ controlKey: "ref_gender_123456", decision: "confirm" }),
      expect.objectContaining({ controlKey: "ref_resume_123456", intent: { kind: "saved-resume" } })
    ]);
    expect(result.plan.skipped).toEqual(expect.arrayContaining([
      { controlKey: "ref_custom_123456", reason: "unknown-field" },
      { controlKey: "ref_identity_1234", reason: "unsafe-control" },
      { controlKey: "ref_submit_123456", reason: "final-submit" }
    ]));
    expect(result.plan.repeatables[0]).toMatchObject({
      collection: "education",
      recordIndexes: [2],
      addControlKeys: ["ref_add_education_12"],
      saveControls: [{ controlKey: "ref_save_education_1", recordIndex: 2 }],
      maximumCreatesPerRun: 5
    });
  });

  it("fails closed when two manifests tie for the same page", () => {
    const first = manifest("anonymous-family-a", "shared.example.test", "candidate.name");
    const second = manifest("anonymous-family-b", "shared.example.test", "candidate.name");
    const result = new AtsAdapterRegistry([first, second]).detect(toAtsAdapterPageSummary(state(
      "https://shared.example.test",
      [control("ref_shared_123456", "candidate.name")]
    )));
    expect(result).toEqual({
      status: "ambiguous",
      candidates: ["anonymous-family-a", "anonymous-family-b"]
    });
  });
});
