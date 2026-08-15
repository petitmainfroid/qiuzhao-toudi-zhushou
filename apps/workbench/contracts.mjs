import { requireExactKeys, requireIdentifier } from '../../modules/job-contracts/index.mjs';

export function parseWorkbenchCommand(input) {
  requireExactKeys(input, ['jobId', 'requestId', 'intent'], 'workbenchCommand');
  if (!['open_review', 'start_fill', 'cancel_workflow'].includes(input.intent)) throw new Error('workbenchCommand.intent is not supported');
  return Object.freeze({
    jobId: requireIdentifier(input.jobId, 'workbenchCommand.jobId'),
    requestId: requireIdentifier(input.requestId, 'workbenchCommand.requestId'),
    intent: input.intent
  });
}
