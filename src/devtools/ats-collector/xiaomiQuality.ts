import xiaomiGroundTruth from "../../../ats-corpus/ground-truth/feishu-recruiting/xiaomi/xiaomi__internship-application__v1.json";
import metaappGroundTruth from "../../../ats-corpus/ground-truth/feishu-recruiting/metaapp/metaapp__campus-application__v1.json";
import type { AtsObservation, AtsObservedControl } from "../../ats/contracts";

interface ObservationGroundTruthField {
  label: string;
  fieldName: string;
  type: string;
  required: boolean;
}

interface ObservationGroundTruthGroup {
  label: string;
  fieldName: string;
  repeatable: boolean;
  fields: ObservationGroundTruthField[];
}

interface ObservationGroundTruth {
  id: string;
  source: {
    originPattern: string;
    pathTemplate: string;
    pageType: string;
  };
  groups: ObservationGroundTruthGroup[];
}

const XIAOMI_GROUND_TRUTH = xiaomiGroundTruth as ObservationGroundTruth;
const METAAPP_GROUND_TRUTH = metaappGroundTruth as ObservationGroundTruth;

export interface AtsObservationQuality {
  applicable: boolean;
  baselineId: string | null;
  baselineLabel: string;
  expectedSectionCount: number;
  observedSectionCount: number;
  missingSections: string[];
  expectedFieldCount: number;
  observedFieldCount: number;
  missingFields: string[];
  semanticControlCount: number;
  semanticControlTotal: number;
  semanticCoverage: number;
  optionControlCount: number;
  finalSubmitCount: number;
  finalSubmitProtected: boolean;
  rawCountConsistent: boolean;
  requiredMismatches: string[];
  downloadAllowed: boolean;
  blockingReasons: string[];
}

function normalized(value: string | undefined): string {
  return (value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[\d+\]/g, "[]")
    .replace(/[\s_（）()：:·\-]/g, "");
}

function technicalName(value: string | undefined): string {
  return (value || "").toLowerCase().replace(/\[\d+\]/g, "[]");
}

function controlSectionMatches(control: AtsObservedControl, group: ObservationGroundTruthGroup): boolean {
  if (normalized(control.semantics.section) === normalized(group.label)) return true;
  const name = technicalName(control.semantics.name);
  if (!name) return false;
  return name === group.fieldName || name.startsWith(`${group.fieldName}.`) || name.startsWith(`${group.fieldName}[]`);
}

function controlMatchesField(
  control: AtsObservedControl,
  group: ObservationGroundTruthGroup,
  field: ObservationGroundTruthField
): boolean {
  if (!controlSectionMatches(control, group)) return false;
  if (field.type === "attachment" && control.inputType === "file") return true;

  const semanticLabels = [
    control.semantics.label,
    control.semantics.ariaLabel,
    control.semantics.placeholder
  ].map(normalized).filter(Boolean);
  if (semanticLabels.includes(normalized(field.label))) return true;

  const name = technicalName(control.semantics.name);
  if (!name || !field.fieldName) return false;
  const expectedName = technicalName(field.fieldName);
  return name === expectedName
    || name.endsWith(`.${expectedName}`)
    || name.includes(`.${expectedName}.`)
    || name.includes(`.${expectedName}[]`);
}

function sourceBaseline(observation: AtsObservation): {
  groundTruth: ObservationGroundTruth;
  label: string;
  enforceRequired: boolean;
} | null {
  try {
    const hostname = new URL(observation.source.origin).hostname;
    if ((
      hostname === "xiaomi.jobs.f.mioffice.cn"
      || hostname === "xiaomi-fixture.example.test"
    ) && observation.source.pathTemplate === "/internship/resume/:id/apply") {
      return { groundTruth: XIAOMI_GROUND_TRUTH, label: "小米", enforceRequired: false };
    }
    if (
      (hostname === "meta.jobs.feishu.cn" || hostname === "metaapp-fixture.example.test")
      && /^(?:\/140297|\/:id)\/resume\/:id\/apply$/.test(observation.source.pathTemplate)
    ) {
      return { groundTruth: METAAPP_GROUND_TRUTH, label: "MetaApp", enforceRequired: true };
    }
    return null;
  }
  catch {
    return null;
  }
}

export function assessObservationQuality(observation: AtsObservation): AtsObservationQuality {
  const baseline = sourceBaseline(observation);
  const groups = baseline?.groundTruth.groups ?? [];
  const expectedFieldCount = groups.reduce((total, group) => total + group.fields.length, 0);
  const missingSections = groups
    .filter((group) => !observation.sections.some((section) => normalized(section) === normalized(group.label)))
    .map((group) => group.label);
  const missingFields: string[] = [];
  const requiredMismatches: string[] = [];
  let observedFieldCount = 0;
  for (const group of groups) {
    for (const field of group.fields) {
      const matches = observation.controls.filter((control) => controlMatchesField(control, group, field));
      if (matches.length > 0) {
        observedFieldCount += 1;
        if (baseline?.enforceRequired && field.required && !matches.some((control) => control.required)) {
          requiredMismatches.push(`${group.label} / ${field.label}`);
        }
      }
      else {
        missingFields.push(`${group.label} / ${field.label}`);
      }
    }
  }

  const meaningfulControls = observation.controls.filter((control) => !["option", "listbox"].includes(control.role));
  const optionControlCount = observation.controls.filter((control) => control.role === "option").length;
  const semanticControlCount = meaningfulControls.filter((control) => Boolean(
    control.semantics.label
    || control.semantics.ariaLabel
    || control.semantics.placeholder
    || control.semantics.name
  )).length;
  const semanticCoverage = meaningfulControls.length > 0
    ? semanticControlCount / meaningfulControls.length
    : 0;
  const finalSubmitControls = observation.controls.filter((control) => {
    const corpus = normalized([
      control.semantics.label,
      control.semantics.ariaLabel,
      control.semantics.placeholder,
      control.semantics.name
    ].filter(Boolean).join(" "));
    return control.safety === "final-submit" || /提交简历|投递简历|提交申请|立即申请|submitapplication/.test(corpus);
  });
  const finalSubmitProtected = finalSubmitControls.length > 0
    && finalSubmitControls.every((control) => control.safety === "final-submit");
  const rawCountConsistent = observation.summary.controlCount === observation.controls.length;
  const blockingReasons: string[] = [];
  if (baseline) {
    if (missingSections.length > 0) blockingReasons.push(`缺少 ${missingSections.length} 个页面分组`);
    if (missingFields.length > 0) blockingReasons.push(`缺少 ${missingFields.length} 个逻辑字段`);
    if (requiredMismatches.length > 0) blockingReasons.push(`${requiredMismatches.length} 个必填字段未识别`);
    if (!rawCountConsistent) blockingReasons.push("控件摘要与导出数组不一致");
    if (semanticCoverage < 0.75) blockingReasons.push("可识别语义的控件不足 75%");
    if (!finalSubmitProtected) blockingReasons.push("未确认最终投递按钮受到保护");
  }

  return {
    applicable: Boolean(baseline),
    baselineId: baseline?.groundTruth.id ?? null,
    baselineLabel: baseline?.label ?? "通用页面",
    expectedSectionCount: groups.length,
    observedSectionCount: groups.length - missingSections.length,
    missingSections,
    expectedFieldCount,
    observedFieldCount,
    missingFields,
    semanticControlCount,
    semanticControlTotal: meaningfulControls.length,
    semanticCoverage,
    optionControlCount,
    finalSubmitCount: finalSubmitControls.length,
    finalSubmitProtected,
    rawCountConsistent,
    requiredMismatches,
    downloadAllowed: !baseline || blockingReasons.length === 0,
    blockingReasons
  };
}

export const assessXiaomiObservation = assessObservationQuality;
