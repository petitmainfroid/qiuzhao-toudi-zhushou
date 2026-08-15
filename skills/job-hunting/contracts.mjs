import { requireExactKeys, requireIdentifier } from '../../modules/job-contracts/index.mjs';

export const JOB_AGENT_INTENTS = Object.freeze(['workspace_status', 'discover_jobs', 'rank_jobs', 'review_queue', 'workflow_status', 'workflow_cancel']);

export function parseJobAgentIntent(input) {
  requireExactKeys(input, ['intent', 'requestId'], 'jobAgentIntent');
  if (!JOB_AGENT_INTENTS.includes(input.intent)) throw new Error('jobAgentIntent.intent is not supported');
  return Object.freeze({ intent: input.intent, requestId: requireIdentifier(input.requestId, 'jobAgentIntent.requestId') });
}
