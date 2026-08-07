import { describe, expect, it } from "vitest";
import metaappGroundTruth from "../../../ats-corpus/ground-truth/feishu-recruiting/metaapp/metaapp__campus-application__v1.json";
import type { AtsObservation, AtsObservedControl } from "../../ats/contracts";
import { assessObservationQuality } from "./xiaomiQuality";

function metaappObservation(): AtsObservation {
  let index = 0;
  const controls: AtsObservedControl[] = metaappGroundTruth.groups.flatMap((group) =>
    group.fields.map((field) => {
      index += 1;
      return {
        controlKey: `control_${index.toString().padStart(4, "0")}`,
        role: field.type === "select" ? "combobox" : "textbox",
        tag: field.type === "long_text" ? "textarea" : "input",
        ...(field.type === "attachment" ? { inputType: "file" } : { inputType: "text" }),
        semantics: { label: field.label, name: field.fieldName, section: group.label },
        disabled: false,
        readOnly: false,
        required: field.required,
        multiple: false,
        boundary: "main",
        safety: field.type === "attachment" ? "file" : "ordinary"
      } satisfies AtsObservedControl;
    })
  );
  for (const label of ["本科", "硕士", "中国"]) {
    index += 1;
    controls.push({
      controlKey: `control_${index.toString().padStart(4, "0")}`,
      role: "option",
      tag: "custom",
      semantics: { label },
      disabled: false,
      readOnly: false,
      required: false,
      multiple: false,
      boundary: "main",
      safety: "ordinary"
    });
  }
  index += 1;
  controls.push({
    controlKey: `control_${index.toString().padStart(4, "0")}`,
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
    capturedAt: "2026-08-07T10:00:00.000Z",
    source: {
      origin: "https://meta.jobs.feishu.cn",
      pathTemplate: "/:id/resume/:id/apply",
      language: "zh-CN",
      pageType: "application",
      captureToolVersion: "0.2.0"
    },
    family: { id: "generic-html", version: "1", confidence: 0, evidence: [] },
    sections: ["简历", "基本信息", "教育经历", "实习经历"],
    controls,
    summary: {
      controlCount: controls.length,
      blockedControlCount: 2,
      frameControlCount: 0,
      openShadowControlCount: 0,
      sectionCount: 4
    },
    privacy: {
      currentValuesIncluded: false,
      sessionReferencesIncluded: false,
      queryValuesIncluded: false,
      fileMetadataIncluded: false
    }
  };
}

describe("ATS collector independent quality", () => {
  it("accepts complete MetaApp logical coverage while separating option nodes", () => {
    const quality = assessObservationQuality(metaappObservation());

    expect(quality).toMatchObject({
      applicable: true,
      baselineId: "metaapp-campus-application-v1",
      baselineLabel: "MetaApp",
      observedSectionCount: 4,
      expectedSectionCount: 4,
      observedFieldCount: 13,
      expectedFieldCount: 13,
      optionControlCount: 3,
      requiredMismatches: [],
      finalSubmitProtected: true,
      downloadAllowed: true,
      blockingReasons: []
    });
    expect(quality.semanticControlTotal).toBe(14);
    expect(quality.semanticCoverage).toBe(1);
  });

  it("blocks MetaApp when a logical field or required marker is missing", () => {
    const observation = metaappObservation();
    observation.controls = observation.controls.filter((control) => control.semantics.label !== "手机号码");
    const name = observation.controls.find((control) => control.semantics.label === "姓名");
    if (name) name.required = false;
    observation.summary.controlCount = observation.controls.length;

    const quality = assessObservationQuality(observation);
    expect(quality.downloadAllowed).toBe(false);
    expect(quality.missingFields).toContain("基本信息 / 手机号码");
    expect(quality.requiredMismatches).toContain("基本信息 / 姓名");
    expect(quality.blockingReasons).toEqual(expect.arrayContaining([
      "缺少 1 个逻辑字段",
      "1 个必填字段未识别"
    ]));
  });
});
