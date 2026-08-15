import { requireBoundedText, requireExactKeys, requireIdentifier } from '../job-contracts/index.mjs';

export const RANKING_OUTCOMES = Object.freeze(['pass', 'reject', 'review', 'failed']);

export function parseRankingRequest(input) {
  requireExactKeys(input, ['jobId', 'capabilitySummary'], 'rankingRequest');
  return Object.freeze({
    jobId: requireIdentifier(input.jobId, 'rankingRequest.jobId'),
    capabilitySummary: requireBoundedText(input.capabilitySummary, 'rankingRequest.capabilitySummary', { max: 4_000 })
  });
}
