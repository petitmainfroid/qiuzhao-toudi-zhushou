import { requireExactKeys, requireIdentifier } from '../job-contracts/index.mjs';

export const CONVERSATION_OUTCOMES = Object.freeze(['draft_ready', 'authorization_required', 'sent_verified', 'no_new_reply', 'manual_required', 'failed']);

export function parseConversationAction(input) {
  requireExactKeys(input, ['jobId', 'planId', 'requestId'], 'conversationAction');
  return Object.freeze({
    jobId: requireIdentifier(input.jobId, 'conversationAction.jobId'),
    planId: requireIdentifier(input.planId, 'conversationAction.planId'),
    requestId: requireIdentifier(input.requestId, 'conversationAction.requestId')
  });
}
