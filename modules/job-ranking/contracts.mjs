import {
  JobDomainError, requireBoundedText, requireEnum, requireExactKeys, requireIdentifier
} from '../job-contracts/index.mjs';

export const RANKING_OUTCOMES = Object.freeze(['pass', 'reject', 'review', 'failed', 'budget_exhausted']);
export const JOB_TYPES = Object.freeze(['full_time', 'internship', 'part_time', 'contract', 'unknown']);
export const SEMANTIC_REASON_CODES = Object.freeze([
  'semantic_strong_match', 'semantic_partial_match',
  'semantic_mismatch', 'semantic_insufficient_evidence'
]);

const acceptedJobTypes = JOB_TYPES.filter((value) => value !== 'unknown');

export function parseRankingRequest(input) {
  return parseRankingRunRequest(input);
}

export function parseRankingRunRequest(input) {
  requireExactKeys(input, [
    'requestId', 'policy', 'items', 'capabilityCatalog',
    'maxSemanticCalls', 'perItemTimeoutMs', 'deadlineMs'
  ], 'rankingRunRequest');
  const items = boundedArray(input.items, 'rankingRunRequest.items', 1, 20).map(parseRankingItem);
  requireUnique(items.map((item) => item.jobId), 'rankingRunRequest.items.jobId');
  const capabilityCatalog = boundedArray(
    input.capabilityCatalog, 'rankingRunRequest.capabilityCatalog', 0, 50
  ).map(parseCapabilityEntry);
  requireUnique(capabilityCatalog.map((item) => item.capabilityId), 'rankingRunRequest.capabilityCatalog.capabilityId');
  const maxSemanticCalls = boundedInteger(input.maxSemanticCalls, 'rankingRunRequest.maxSemanticCalls', 0, 20);
  const perItemTimeoutMs = boundedInteger(input.perItemTimeoutMs, 'rankingRunRequest.perItemTimeoutMs', 10, 30_000);
  const deadlineMs = boundedInteger(input.deadlineMs, 'rankingRunRequest.deadlineMs', 100, 120_000);
  if (perItemTimeoutMs > deadlineMs) {
    throw new JobDomainError('invalid_input', 'rankingRunRequest.perItemTimeoutMs cannot exceed deadlineMs');
  }
  return Object.freeze({
    requestId: requireIdentifier(input.requestId, 'rankingRunRequest.requestId'),
    policy: parseRankingPolicy(input.policy),
    items: Object.freeze(items),
    capabilityCatalog: Object.freeze(capabilityCatalog),
    maxSemanticCalls,
    perItemTimeoutMs,
    deadlineMs
  });
}

export function parseRankingPolicy(input) {
  requireExactKeys(input, [
    'policyId', 'targetRoleTerms', 'excludedTerms', 'acceptedCities',
    'acceptedJobTypes', 'minimumMonthlySalaryK'
  ], 'rankingPolicy');
  const targetRoleTerms = normalizedTerms(input.targetRoleTerms, 'rankingPolicy.targetRoleTerms', 1, 10);
  const excludedTerms = normalizedTerms(input.excludedTerms, 'rankingPolicy.excludedTerms', 0, 20);
  const cities = normalizedTerms(input.acceptedCities, 'rankingPolicy.acceptedCities', 0, 10);
  const jobTypes = boundedArray(input.acceptedJobTypes, 'rankingPolicy.acceptedJobTypes', 0, 4)
    .map((value) => requireEnum(value, acceptedJobTypes, 'rankingPolicy.acceptedJobTypes[]'));
  requireUnique(jobTypes, 'rankingPolicy.acceptedJobTypes');
  return Object.freeze({
    policyId: requireIdentifier(input.policyId, 'rankingPolicy.policyId'),
    targetRoleTerms,
    excludedTerms,
    acceptedCities: cities,
    acceptedJobTypes: Object.freeze(jobTypes),
    minimumMonthlySalaryK: boundedInteger(
      input.minimumMonthlySalaryK, 'rankingPolicy.minimumMonthlySalaryK', 0, 1_000
    )
  });
}

export function parseSemanticRankingDecision(input) {
  requireExactKeys(input, ['outcome', 'score', 'reasonCode'], 'semanticRankingDecision');
  const outcome = requireEnum(input.outcome, ['pass', 'reject', 'review'], 'semanticRankingDecision.outcome');
  const reasonCode = requireEnum(input.reasonCode, SEMANTIC_REASON_CODES, 'semanticRankingDecision.reasonCode');
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
    throw new JobDomainError('invalid_input', 'semanticRankingDecision.score must be between 0 and 100');
  }
  const score = Math.round(input.score);
  const consistent = (outcome === 'pass' && reasonCode === 'semantic_strong_match' && score >= 75)
    || (outcome === 'reject' && reasonCode === 'semantic_mismatch' && score <= 39)
    || (outcome === 'review' && reasonCode === 'semantic_partial_match' && score >= 40 && score <= 74)
    || (outcome === 'review' && reasonCode === 'semantic_insufficient_evidence' && score >= 40 && score <= 74);
  if (!consistent) {
    throw new JobDomainError('invalid_semantic_decision', 'Semantic score, outcome and reasonCode are inconsistent');
  }
  return Object.freeze({ outcome, score, reasonCode });
}

function parseRankingItem(input) {
  requireExactKeys(input, ['jobId', 'facts'], 'rankingItem');
  return Object.freeze({
    jobId: requireIdentifier(input.jobId, 'rankingItem.jobId'),
    facts: parseRankingFacts(input.facts)
  });
}

function parseRankingFacts(input) {
  requireExactKeys(input, ['city', 'jobType', 'monthlySalaryMinK'], 'rankingFacts');
  const city = input.city === null
    ? null
    : requireBoundedText(input.city, 'rankingFacts.city', { max: 80 });
  const monthlySalaryMinK = input.monthlySalaryMinK;
  if (monthlySalaryMinK !== null
    && (!Number.isFinite(monthlySalaryMinK) || monthlySalaryMinK < 0 || monthlySalaryMinK > 1_000)) {
    throw new JobDomainError('invalid_input', 'rankingFacts.monthlySalaryMinK must be null or between 0 and 1000');
  }
  return Object.freeze({
    city,
    jobType: requireEnum(input.jobType, JOB_TYPES, 'rankingFacts.jobType'),
    monthlySalaryMinK: monthlySalaryMinK === null ? null : Math.round(monthlySalaryMinK)
  });
}

function parseCapabilityEntry(input) {
  requireExactKeys(input, ['capabilityId', 'hasValue'], 'capabilityEntry');
  if (typeof input.hasValue !== 'boolean') {
    throw new JobDomainError('invalid_input', 'capabilityEntry.hasValue must be boolean');
  }
  return Object.freeze({
    capabilityId: requireIdentifier(input.capabilityId, 'capabilityEntry.capabilityId'),
    hasValue: input.hasValue
  });
}

function normalizedTerms(value, name, minimum, maximum) {
  const terms = boundedArray(value, name, minimum, maximum)
    .map((term) => requireBoundedText(term, `${name}[]`, { max: 80 }).normalize('NFKC'));
  requireUnique(terms.map((term) => term.toLowerCase()), name);
  return Object.freeze(terms);
}

function boundedArray(value, name, minimum, maximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new JobDomainError('invalid_input', `${name} must contain ${minimum} to ${maximum} items`);
  }
  return value;
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new JobDomainError('invalid_input', `${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function requireUnique(values, name) {
  if (new Set(values).size !== values.length) {
    throw new JobDomainError('invalid_input', `${name} must not contain duplicates`);
  }
}
