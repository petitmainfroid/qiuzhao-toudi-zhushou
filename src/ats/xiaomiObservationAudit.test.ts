import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import groundTruth from "../../ats-corpus/ground-truth/feishu-recruiting/xiaomi/xiaomi__internship-application__v1.json";
import { auditXiaomiObservationFile } from "../../scripts/ats-corpus/xiaomi-observation-audit.mjs";

function completeObservation() {
  const controls: any[] = [];
  for (const group of groundTruth.groups) {
    for (const field of group.fields) {
      const attachment = field.type === "attachment";
      const select = field.type.includes("select") || field.type === "date_range";
      const longText = field.type === "long_text";
      const technicalName = field.fieldName
        ? group.repeatable
          ? `${group.fieldName}[0].${field.fieldName}`
          : `${group.fieldName}.${field.fieldName}`
        : "";
      controls.push({
        controlKey: `control_${String(controls.length + 1).padStart(4, "0")}`,
        role: select ? "combobox" : "textbox",
        tag: attachment ? "input" : longText ? "textarea" : select ? "custom" : "input",
        ...(attachment ? { inputType: "file" } : {}),
        semantics: {
          label: field.label,
          ...(technicalName ? { name: technicalName } : {}),
          section: group.label
        },
        disabled: false,
        readOnly: false,
        required: field.required,
        multiple: field.type === "multi_select",
        boundary: "main",
        safety: attachment ? "file" : field.fieldName === "identification" ? "identity" : "ordinary"
      });
    }
  }
  controls.push({
    controlKey: `control_${String(controls.length + 1).padStart(4, "0")}`,
    role: "button",
    tag: "button",
    semantics: { label: "提交简历" },
    disabled: false,
    readOnly: false,
    required: false,
    multiple: false,
    boundary: "main",
    safety: "final-submit"
  });
  return {
    schemaVersion: 1,
    capturedAt: "2026-08-07T12:00:00.000Z",
    source: {
      origin: "https://xiaomi.jobs.f.mioffice.cn",
      pathTemplate: "/internship/resume/:id/apply",
      language: "zh-CN",
      pageType: "application",
      captureToolVersion: "0.2.0"
    },
    family: {
      id: "generic-html",
      version: "1",
      confidence: 0,
      evidence: [{ kind: "control-structure", detail: "generic fallback" }]
    },
    sections: groundTruth.groups.map((group) => group.label),
    controls,
    summary: {
      controlCount: controls.length,
      blockedControlCount: controls.filter((control) => control.safety !== "ordinary").length,
      frameControlCount: 0,
      openShadowControlCount: 0,
      sectionCount: groundTruth.groups.length
    },
    privacy: {
      currentValuesIncluded: false,
      sessionReferencesIncluded: false,
      queryValuesIncluded: false,
      fileMetadataIncluded: false
    }
  };
}

describe("independent Xiaomi observation audit", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), "xiaomi-observation-audit-"));
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  async function input(value: unknown): Promise<string> {
    const path = join(testRoot, "observation.json");
    await writeFile(path, JSON.stringify(value), "utf8");
    return path;
  }

  it("reports independent 9-section and 34-field coverage separately from raw controls", async () => {
    const observation = completeObservation();
    const result = await auditXiaomiObservationFile(await input(observation), {
      projectRoot: process.cwd(),
      k1ControlCount: observation.controls.length
    });

    expect(result).toMatchObject({
      passed: true,
      sourceMatched: true,
      rawControls: { consistent: true },
      sections: { observed: 9, expected: 9, missing: [] },
      logicalFields: { observed: 34, expected: 34, missing: [] },
      semantics: { coverage: 1 },
      safety: { finalSubmitControls: 1, finalSubmitProtected: true },
      privacyAudit: "passed"
    });
  });

  it("fails closed before reporting coverage when a captured filename is present", async () => {
    const observation = completeObservation();
    observation.controls[0].semantics.nearbyText = "synthetic-private-resume.pdf";
    await expect(auditXiaomiObservationFile(await input(observation), {
      projectRoot: process.cwd()
    })).rejects.toMatchObject({ code: "privacy-failed" });
  });

  it("fails independent coverage when a section is absent even if raw controls remain intact", async () => {
    const observation = completeObservation();
    observation.sections.pop();
    observation.summary.sectionCount -= 1;
    await expect(auditXiaomiObservationFile(await input(observation), {
      projectRoot: process.cwd()
    })).resolves.toMatchObject({
      passed: false,
      rawControls: { consistent: true },
      sections: { observed: 8, expected: 9, missing: ["自我评价"] }
    });
  });
});
