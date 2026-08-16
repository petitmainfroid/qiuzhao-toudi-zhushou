import { JOB_SOURCES, requireBoundedText, requireEnum, requireExactKeys } from '../job-contracts/index.mjs';

export const DISCOVERY_BLOCKERS = Object.freeze(['browser_disconnected', 'login_required', 'verification_required', 'page_drift', 'rate_limited']);

const MAX_ZHILIAN_PAGES = 3;
const MAX_ZHILIAN_CARDS = 30;
const MAX_ZHILIAN_DETAILS = 10;
const MAX_ZHILIAN_SCROLLS = 12;
const MAX_ZHILIAN_DEADLINE_MS = 120_000;

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

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

// This request deliberately contains no URL, target ID, selector, script or page text.
// Browser identity is bound privately by the caller before a fixed observer is invoked.
export function parseZhilianInventoryRequest(input) {
  requireExactKeys(input, [
    'keywords', 'city', 'maxPages', 'maxCards', 'maxDetails', 'maxScrolls', 'deadlineMs'
  ], 'zhilianInventoryRequest');
  return Object.freeze({
    source: 'zhilian',
    keywords: requireBoundedText(input.keywords, 'zhilianInventoryRequest.keywords', { max: 120 }),
    city: requireBoundedText(input.city, 'zhilianInventoryRequest.city', { max: 80 }),
    maxPages: boundedInteger(input.maxPages, 'zhilianInventoryRequest.maxPages', 1, MAX_ZHILIAN_PAGES),
    maxCards: boundedInteger(input.maxCards, 'zhilianInventoryRequest.maxCards', 1, MAX_ZHILIAN_CARDS),
    maxDetails: boundedInteger(input.maxDetails, 'zhilianInventoryRequest.maxDetails', 0, MAX_ZHILIAN_DETAILS),
    maxScrolls: boundedInteger(input.maxScrolls, 'zhilianInventoryRequest.maxScrolls', 0, MAX_ZHILIAN_SCROLLS),
    deadlineMs: boundedInteger(input.deadlineMs, 'zhilianInventoryRequest.deadlineMs', 1_000, MAX_ZHILIAN_DEADLINE_MS)
  });
}

// Stored manifests carry only aggregate visual evidence, never screenshots or OCR/page values.
export function parseVisualComparisonOutcome(input) {
  requireExactKeys(input, ['annotated', 'eligible', 'attempted', 'booleanVerified', 'screenshotVerified', 'manualRequired'], 'visualComparisonOutcome');
  const annotated = boundedInteger(input.annotated, 'visualComparisonOutcome.annotated', 0, 10_000);
  const eligible = boundedInteger(input.eligible, 'visualComparisonOutcome.eligible', 0, annotated);
  const attempted = boundedInteger(input.attempted, 'visualComparisonOutcome.attempted', 0, eligible);
  const booleanVerified = boundedInteger(input.booleanVerified, 'visualComparisonOutcome.booleanVerified', 0, attempted);
  const screenshotVerified = boundedInteger(input.screenshotVerified, 'visualComparisonOutcome.screenshotVerified', 0, attempted);
  const manualRequired = boundedInteger(input.manualRequired, 'visualComparisonOutcome.manualRequired', 0, annotated);
  return Object.freeze({
    annotated, eligible, attempted, booleanVerified, screenshotVerified, manualRequired,
    verified: Math.min(booleanVerified, screenshotVerified)
  });
}
