import { requireExactKeys, requireIdentifier } from '../../modules/job-contracts/index.mjs';

export const JOB_AGENT_INTENTS = Object.freeze([
  'workspace_status', 'search_start', 'ranking_submit', 'review_queue',
  'review_decide', 'application_prepare', 'workflow_status', 'workflow_cancel'
]);

export function parseJobAgentIntent(input) {
  requireExactKeys(input, ['intent', 'requestId'], 'jobAgentIntent');
  if (!JOB_AGENT_INTENTS.includes(input.intent)) throw new Error('jobAgentIntent.intent is not supported');
  return Object.freeze({ intent: input.intent, requestId: requireIdentifier(input.requestId, 'jobAgentIntent.requestId') });
}
