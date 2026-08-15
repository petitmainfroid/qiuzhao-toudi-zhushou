import { JOB_SOURCES, requireBoundedText, requireEnum, requireExactKeys } from '../job-contracts/index.mjs';

export const DISCOVERY_BLOCKERS = Object.freeze(['browser_disconnected', 'login_required', 'verification_required', 'page_drift', 'rate_limited']);

export function parseDiscoveryRequest(input) {
  requireExactKeys(input, ['source', 'keywords', 'city', 'limit'], 'discoveryRequest');
  const source = requireEnum(input.source, JOB_SOURCES, 'discoveryRequest.source');
  const limit = input.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error('discoveryRequest.limit must be an integer from 1 to 20');
  return Object.freeze({
    source,
    keywords: requireBoundedText(input.keywords, 'discoveryRequest.keywords', { max: 120 }),
    city: requireBoundedText(input.city, 'discoveryRequest.city', { max: 80 }),
    limit
  });
}
