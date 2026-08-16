import type {
  AiDecisionProposal,
  AiPlannerRequest,
  ControlCapability,
  SafetyClass
} from "../../semantic-planner/src/index";

export interface PlanBinding {
  origin: string;
  leaseId: string;
  profileVersion: string;
  pageEpoch: number;
}

export interface CompilationAuthority {
  origin: string;
  activeLeaseId: string;
  profileVersion: string;
  pageEpoch: number;
  leaseActive: boolean;
}

export interface CompilePlanInput {
  plannerRequest: Readonly<AiPlannerRequest>;
  proposal: Readonly<AiDecisionProposal> | unknown;
  binding: Readonly<PlanBinding>;
  authority: Readonly<CompilationAuthority>;
  attemptBudget: 1 | 2;
}

export type CompiledDisposition =
  | "fill_from_profile"
  | "fill_date_range"
  | "fill_date_range_start"
  | "profile_missing"
  | "manual"
  | "review"
  | "conditional_not_applicable"
  | "upload_default_resume"
  | "ensure_repeatable"
  | "set_boolean_from_collection_empty";

export interface CompiledFieldDecision {
  ref: string;
  disposition: CompiledDisposition;
  capability: ControlCapability;
  safetyClass: SafetyClass;
  profilePath?: string;
  startProfilePath?: string;
  endProfilePath?: string;
  reason?: string;
  maxAttempts: 0 | 1 | 2;
}

export interface CompiledPlan {
  schemaVersion: 1;
  planId: string;
  plannerSource: "ai";
  legacyFieldTemplateEnabled: false;
  binding: Readonly<PlanBinding>;
  decisions: readonly Readonly<CompiledFieldDecision>[];
}
