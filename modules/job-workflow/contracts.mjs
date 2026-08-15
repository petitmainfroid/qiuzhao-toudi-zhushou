import { WORKFLOW_STAGES, requireEnum, requireExactKeys, requireIdentifier } from '../job-contracts/index.mjs';

export const WORKFLOW_OUTCOMES = Object.freeze(['queued', 'running', 'blocked', 'completed', 'cancelled', 'failed']);

export function parseWorkflowCommand(input) {
  requireExactKeys(input, ['jobId', 'requestId', 'stage'], 'workflowCommand');
  return Object.freeze({
    jobId: requireIdentifier(input.jobId, 'workflowCommand.jobId'),
    requestId: requireIdentifier(input.requestId, 'workflowCommand.requestId'),
    stage: requireEnum(input.stage, WORKFLOW_STAGES, 'workflowCommand.stage')
  });
}
