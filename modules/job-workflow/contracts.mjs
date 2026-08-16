import { WORKFLOW_STAGES, requireEnum, requireExactKeys, requireIdentifier } from '../job-contracts/index.mjs';
import { parseZhilianInventoryRequest } from '../job-discovery/contracts.mjs';
import { parseRankingRunRequest, parseSemanticRankingDecision } from '../job-ranking/contracts.mjs';

export const WORKFLOW_OUTCOMES = Object.freeze(['queued', 'running', 'blocked', 'completed', 'cancelled', 'failed']);
export const WORKFLOW_CHECKPOINTS = Object.freeze([
  'discovery_pending', 'ranking_required', 'review_required', 'authorization_required'
]);
export const WORKFLOW_REVIEW_DECISIONS = Object.freeze(['approve', 'reject', 'manual']);

export function parseWorkflowCommand(input) {
  requireExactKeys(input, ['jobId', 'requestId', 'stage'], 'workflowCommand');
  return Object.freeze({
    jobId: requireIdentifier(input.jobId, 'workflowCommand.jobId'),
    requestId: requireIdentifier(input.requestId, 'workflowCommand.requestId'),
    stage: requireEnum(input.stage, WORKFLOW_STAGES, 'workflowCommand.stage')
  });
}

export function parseWorkflowStart(input) {
  requireExactKeys(input, ['requestId', 'discovery'], 'workflowStart');
  return Object.freeze({
    requestId: requireIdentifier(input.requestId, 'workflowStart.requestId'),
    discovery: parseZhilianInventoryRequest(input.discovery)
  });
}

export function parseWorkflowRanking(input) {
  requireExactKeys(input, [
    'workflowId', 'requestId', 'policy', 'items', 'capabilityCatalog',
    'maxSemanticCalls', 'perItemTimeoutMs', 'deadlineMs'
  ], 'workflowRanking');
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 20) {
    throw new Error('workflowRanking.items must contain 1 to 20 items');
  }
  const itemDecisions = input.items.map((item) => {
    requireExactKeys(item, ['jobId', 'facts', 'decision'], 'workflowRanking.items[]');
    return Object.freeze({
      jobId: requireIdentifier(item.jobId, 'workflowRanking.items[].jobId'),
      decision: parseSemanticRankingDecision(item.decision)
    });
  });
  const ranking = parseRankingRunRequest({
    requestId: input.requestId,
    policy: input.policy,
    items: input.items.map((item) => ({ jobId: item.jobId, facts: item.facts })),
    capabilityCatalog: input.capabilityCatalog,
    maxSemanticCalls: input.maxSemanticCalls,
    perItemTimeoutMs: input.perItemTimeoutMs,
    deadlineMs: input.deadlineMs
  });
  return Object.freeze({
    workflowId: requireIdentifier(input.workflowId, 'workflowRanking.workflowId'),
    requestId: ranking.requestId,
    ranking,
    decisions: Object.freeze(itemDecisions)
  });
}

export function parseWorkflowQuery(input) {
  requireExactKeys(input, ['workflowId'], 'workflowQuery');
  return Object.freeze({ workflowId: requireIdentifier(input.workflowId, 'workflowQuery.workflowId') });
}

export function parseWorkflowReview(input) {
  requireExactKeys(input, ['workflowId', 'requestId', 'jobId', 'decision'], 'workflowReview');
  return Object.freeze({
    workflowId: requireIdentifier(input.workflowId, 'workflowReview.workflowId'),
    requestId: requireIdentifier(input.requestId, 'workflowReview.requestId'),
    jobId: requireIdentifier(input.jobId, 'workflowReview.jobId'),
    decision: requireEnum(input.decision, WORKFLOW_REVIEW_DECISIONS, 'workflowReview.decision')
  });
}

export function parseWorkflowApplicationPreparation(input) {
  requireExactKeys(input, ['workflowId', 'requestId', 'jobId'], 'workflowApplicationPreparation');
  return Object.freeze({
    workflowId: requireIdentifier(input.workflowId, 'workflowApplicationPreparation.workflowId'),
    requestId: requireIdentifier(input.requestId, 'workflowApplicationPreparation.requestId'),
    jobId: requireIdentifier(input.jobId, 'workflowApplicationPreparation.jobId')
  });
}

export function parseWorkflowCancellation(input) {
  requireExactKeys(input, ['workflowId', 'requestId'], 'workflowCancellation');
  return Object.freeze({
    workflowId: requireIdentifier(input.workflowId, 'workflowCancellation.workflowId'),
    requestId: requireIdentifier(input.requestId, 'workflowCancellation.requestId')
  });
}
