import { describe, expect, it } from "vitest";
import {
  ATS_ADAPTER_SCHEMA_VERSION,
  assertAtsAdapterManifest,
  type AtsAdapterManifest,
  validateAtsAdapterManifest
} from ".";

function anonymousManifest(): AtsAdapterManifest {
  return {
    schemaVersion: ATS_ADAPTER_SCHEMA_VERSION,
    family: { id: "anonymous-campus-ats", version: "1" },
    detection: {
      httpsOnly: true,
      exactHosts: [],
      hostSuffixes: ["careers.example.test"],
      pathPrefixes: ["/apply"],
      semanticMarkers: ["candidate.name", "education_list[].school"],
      minimumSemanticMarkers: 1
    },
    fields: [
      {
        id: "candidate-name",
        semanticKeys: ["candidate.name"],
        roles: ["textbox"],
        capability: "text",
        decision: "fill",
        intent: { kind: "profile-field", pathPattern: "basic.fullName" },
        verification: "normalized-equality"
      },
      {
        id: "candidate-gender",
        semanticKeys: ["candidate.gender"],
        roles: ["combobox", "radio"],
        capability: "single-select",
        decision: "confirm",
        intent: { kind: "profile-field", pathPattern: "basic.gender" },
        verification: "selected-option"
      },
      {
        id: "education-period",
        semanticKeys: ["education_list[].period"],
        roles: ["textbox"],
        capability: "date-range",
        decision: "fill",
        intent: {
          kind: "profile-range",
          startPathPattern: "education.{index}.startDate",
          endPathPattern: "education.{index}.endDate"
        },
        verification: "normalized-equality"
      },
      {
        id: "saved-resume",
        semanticKeys: ["resume.attachment"],
        roles: ["button"],
        capability: "file-upload",
        decision: "confirm",
        intent: { kind: "saved-resume" },
        verification: "attachment-gate"
      },
      {
        id: "unknown-custom-question",
        semanticKeys: ["custom.question"],
        roles: ["textbox"],
        capability: "text",
        decision: "exclude",
        intent: { kind: "manual" },
        verification: "none"
      }
    ],
    repeatables: [
      {
        collection: "education",
        sectionSemanticKeys: ["education_list"],
        recordSemanticPrefixes: ["education_list[]"],
        addControlLabels: ["添加教育经历"],
        saveControlLabels: ["保存", "完成"],
        maximumCreatesPerRun: 5
      }
    ],
    exclusions: {
      finalSubmitLabels: ["提交申请", "最终投递"]
    }
  };
}

describe("ATS adapter manifest validation", () => {
  it("accepts a selector-free manifest covering canonical fields, repeatables, and saved resume", () => {
    const manifest = anonymousManifest();
    expect(validateAtsAdapterManifest(manifest)).toEqual({ ok: true, manifest });
    expect(() => assertAtsAdapterManifest(manifest)).not.toThrow();
    const serialized = JSON.stringify(manifest);
    for (const forbidden of ["selector", "xpath", "javascript", "backendNodeId", "querySelector"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it.each([
    ["raw selector", (manifest: Record<string, unknown>) => {
      const fields = manifest.fields as Array<Record<string, unknown>>;
      fields[0]!.selector = "#candidate-name";
    }, "unknown-property:manifest.fields[0].selector"],
    ["arbitrary value", (manifest: Record<string, unknown>) => {
      const fields = manifest.fields as Array<Record<string, unknown>>;
      fields[0]!.value = "private candidate value";
    }, "unknown-property:manifest.fields[0].value"],
    ["script callback", (manifest: Record<string, unknown>) => {
      manifest.detect = () => true;
    }, "unknown-property:manifest.detect"],
    ["invalid profile path", (manifest: Record<string, unknown>) => {
      const fields = manifest.fields as Array<{ intent: Record<string, unknown> }>;
      fields[0]!.intent.pathPattern = "basic.password";
    }, "invalid-profile-path:manifest.fields[0].intent.pathPattern"],
    ["sensitive automatic fill", (manifest: Record<string, unknown>) => {
      const fields = manifest.fields as Array<Record<string, unknown>>;
      fields[1]!.decision = "fill";
    }, "unsafe-decision:manifest.fields[1]"],
    ["unconfirmed upload", (manifest: Record<string, unknown>) => {
      const fields = manifest.fields as Array<Record<string, unknown>>;
      fields[3]!.decision = "fill";
    }, "unsafe-decision:manifest.fields[3]"],
    ["wildcard host", (manifest: Record<string, unknown>) => {
      const detection = manifest.detection as Record<string, unknown>;
      detection.hostSuffixes = ["*.example.test"];
    }, "invalid-value:manifest.detection.hostSuffixes"]
  ])("rejects %s", (_name, mutate, expected) => {
    const manifest = structuredClone(anonymousManifest()) as unknown as Record<string, unknown>;
    mutate(manifest);
    const result = validateAtsAdapterManifest(manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => `${issue.code}:${issue.path}`)).toContain(expected);
    }
  });

  it("rejects duplicate field and repeatable identifiers", () => {
    const manifest = anonymousManifest();
    manifest.fields.push({ ...manifest.fields[0]! });
    manifest.repeatables.push({ ...manifest.repeatables[0]! });
    const result = validateAtsAdapterManifest(manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === "duplicate-id" && issue.path.includes("fields"))).toBe(true);
      expect(result.issues.some((issue) => issue.code === "duplicate-id" && issue.path.includes("repeatables"))).toBe(true);
    }
  });
});
