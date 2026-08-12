export interface XiaomiObservationAuditOptions {
  projectRoot?: string;
  k1ControlCount?: number | null;
}

export interface XiaomiObservationAuditResult {
  passed: boolean;
  sourceMatched: boolean;
  rawControls: { k1: number | null; exported: number; summary: number; consistent: boolean };
  sections: { observed: number; expected: number; missing: string[] };
  logicalFields: { observed: number; expected: number; missing: string[] };
  semantics: { namedControls: number; totalControls: number; coverage: number };
  safety: { finalSubmitControls: number; finalSubmitProtected: boolean; blockedControls: number };
  privacyAudit: "passed";
}

export function assessXiaomiObservation(
  observation: unknown,
  groundTruth: unknown,
  options?: XiaomiObservationAuditOptions
): XiaomiObservationAuditResult;

export function auditXiaomiObservationFile(
  inputPath: string,
  options?: XiaomiObservationAuditOptions
): Promise<XiaomiObservationAuditResult>;
