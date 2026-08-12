import type { AiDecisionProposal, AiPlannerInvoker, AiPlannerRequest } from "./types";
import { PlannerValidationError, createAiPlannerRequest, parseAiDecisionProposal } from "./validation";

function assertCompleteProposal(
  request: Readonly<AiPlannerRequest>,
  proposal: Readonly<AiDecisionProposal>
): void {
  const expectedRefs = new Set(request.fields.map((field) => field.ref));
  const seenRefs = new Set<string>();
  for (const decision of proposal.decisions) {
    if (!expectedRefs.has(decision.ref)) {
      throw new PlannerValidationError("invalid_model_output", `model returned an unknown ref: ${decision.ref}`);
    }
    if (seenRefs.has(decision.ref)) {
      throw new PlannerValidationError("invalid_model_output", `model returned duplicate decisions for: ${decision.ref}`);
    }
    seenRefs.add(decision.ref);
  }
  const missingRefs = request.fields.filter((field) => !seenRefs.has(field.ref)).map((field) => field.ref);
  if (missingRefs.length > 0) {
    throw new PlannerValidationError("invalid_model_output", `model omitted decisions for: ${missingRefs.join(",")}`);
  }
}

export async function planWithAi(
  input: unknown,
  invoke: AiPlannerInvoker
): Promise<{
  request: Readonly<AiPlannerRequest>;
  proposal: Readonly<AiDecisionProposal>;
}> {
  const request = createAiPlannerRequest(input);
  const modelOutput = await invoke(request);
  const proposal = parseAiDecisionProposal(modelOutput);
  assertCompleteProposal(request, proposal);
  return Object.freeze({ request, proposal });
}
