import type { CandidateProfile } from "../domain/profile";
import type {
  FillProposal,
  FillResult,
  FillSelection,
  ScanResult
} from "../content/engine";
import type {
  RepeatableCreateResult,
  RepeatableGroupKey
} from "../content/repeatableRecords";
import type { SavedFieldMapping } from "../mapping/types";

export type AutoFillStage =
  | "analyzing"
  | "preparing-records"
  | "awaiting-confirmation"
  | "filling"
  | "complete";

export interface AutoFillGateway {
  scan(profile: CandidateProfile, mappings?: SavedFieldMapping[]): Promise<ScanResult>;
  fill(
    profile: CandidateProfile,
    selections: FillSelection[],
    mappings?: SavedFieldMapping[]
  ): Promise<FillResult>;
  createRepeatableRecords?(
    profile: CandidateProfile,
    group: RepeatableGroupKey
  ): Promise<RepeatableCreateResult>;
}

export interface RepeatablePreparation {
  group: RepeatableGroupKey;
  createdCount: number;
  remainingCount: number;
  status: RepeatableCreateResult["status"] | "failed";
  reason?: string;
}

export interface AutoFillPlan {
  scan: ScanResult;
  safeSelections: FillSelection[];
  confirmationProposals: FillProposal[];
  alreadyEqualCount: number;
  excludedCount: number;
  repeatablePreparations: RepeatablePreparation[];
  repeatableCreatedCount: number;
}

export interface PreparedAutoFill {
  status: "awaiting-confirmation" | "complete";
  plan: AutoFillPlan;
  fillResult?: FillResult;
}

export interface AutoFillWorkflowOptions {
  gateway: AutoFillGateway;
  profile: CandidateProfile;
  mappings?: SavedFieldMapping[];
  onStage?: (stage: AutoFillStage) => void;
}

function isFillable(proposal: FillProposal): proposal is FillProposal & { profilePath: string } {
  return Boolean(
    proposal.profilePath
    && proposal.hasValue
    && !proposal.excludedReason
    && proposal.comparisonStatus !== "equal"
  );
}

function isSafe(proposal: FillProposal & { profilePath: string }): boolean {
  return proposal.comparisonStatus === "empty"
    && proposal.confidence === "high"
    && !proposal.requiresConfirmation;
}

export function proposalSelection(proposal: FillProposal): FillSelection | null {
  if (!proposal.profilePath) return null;
  return {
    elementId: proposal.elementId,
    profilePath: proposal.profilePath,
    ...(proposal.comparisonStatus === "conflict" && proposal.comparisonToken
      ? { conflictApprovalToken: proposal.comparisonToken }
      : {})
  };
}

export function buildAutoFillPlan(
  scan: ScanResult,
  repeatablePreparations: RepeatablePreparation[] = []
): AutoFillPlan {
  const fillable = scan.fields.filter(isFillable);
  const safeSelections = fillable
    .filter(isSafe)
    .map(proposalSelection)
    .filter((selection): selection is FillSelection => Boolean(selection));
  const confirmationProposals = fillable.filter((proposal) => !isSafe(proposal));

  return {
    scan,
    safeSelections,
    confirmationProposals,
    alreadyEqualCount: scan.fields.filter((proposal) => proposal.comparisonStatus === "equal").length,
    excludedCount: scan.fields.filter(
      (proposal) => Boolean(proposal.excludedReason || !proposal.profilePath || !proposal.hasValue)
    ).length,
    repeatablePreparations,
    repeatableCreatedCount: repeatablePreparations.reduce(
      (total, preparation) => total + preparation.createdCount,
      0
    )
  };
}

async function prepareRepeatableRecords(
  options: AutoFillWorkflowOptions,
  initialScan: ScanResult
): Promise<{ scan: ScanResult; preparations: RepeatablePreparation[] }> {
  const create = options.gateway.createRepeatableRecords;
  if (!create || !initialScan.repeatableRecords?.adapterId) {
    return { scan: initialScan, preparations: [] };
  }

  let scan = initialScan;
  const preparations: RepeatablePreparation[] = [];
  const attempted = new Set<RepeatableGroupKey>();

  while (true) {
    const next = scan.repeatableRecords?.groups.find(
      (group) => group.missingCount > 0 && group.canCreate && !attempted.has(group.key)
    );
    if (!next) break;
    attempted.add(next.key);
    options.onStage?.("preparing-records");

    try {
      const result = await create(options.profile, next.key);
      preparations.push({
        group: next.key,
        createdCount: result.createdCount,
        remainingCount: result.remainingCount,
        status: result.status,
        ...(result.reason ? { reason: result.reason } : {})
      });
    }
    catch (error) {
      preparations.push({
        group: next.key,
        createdCount: 0,
        remainingCount: next.missingCount,
        status: "failed",
        reason: error instanceof Error ? error.message : "repeatable-preparation-failed"
      });
    }

    // The page may have changed even when the adapter stopped part-way through.
    // Rebuilding the plan from a fresh scan prevents stale element references.
    scan = await options.gateway.scan(options.profile, options.mappings ?? []);
  }

  return { scan, preparations };
}

function emptyFillResult(): FillResult {
  return { outcomes: [], filledCount: 0, skippedCount: 0 };
}

export async function executePreparedAutoFill(
  options: AutoFillWorkflowOptions,
  plan: AutoFillPlan,
  confirmedElementIds: ReadonlySet<string> = new Set()
): Promise<FillResult> {
  const confirmedSelections = plan.confirmationProposals
    .filter((proposal) => confirmedElementIds.has(proposal.elementId))
    .map(proposalSelection)
    .filter((selection): selection is FillSelection => Boolean(selection));
  const selections = [...plan.safeSelections, ...confirmedSelections];

  if (selections.length === 0) {
    options.onStage?.("complete");
    return emptyFillResult();
  }

  options.onStage?.("filling");
  const result = await options.gateway.fill(
    options.profile,
    selections,
    options.mappings ?? []
  );
  options.onStage?.("complete");
  return result;
}

export async function startAutoFillWorkflow(
  options: AutoFillWorkflowOptions
): Promise<PreparedAutoFill> {
  options.onStage?.("analyzing");
  const initialScan = await options.gateway.scan(options.profile, options.mappings ?? []);
  const prepared = await prepareRepeatableRecords(options, initialScan);
  const plan = buildAutoFillPlan(prepared.scan, prepared.preparations);

  if (plan.confirmationProposals.length > 0) {
    options.onStage?.("awaiting-confirmation");
    return { status: "awaiting-confirmation", plan };
  }

  const fillResult = await executePreparedAutoFill(options, plan);
  return { status: "complete", plan, fillResult };
}
