import { createHash } from 'node:crypto';
import { JobDomainError, requireEnum, requireExactKeys, requireIdentifier } from '../job-contracts/index.mjs';

export function evaluateRankingEvidence(groundTruthInput, rankingResult) {
  if (!Array.isArray(groundTruthInput) || groundTruthInput.length < 1 || groundTruthInput.length > 100) {
    throw new JobDomainError('invalid_input', 'rankingGroundTruth must contain 1 to 100 items');
  }
  const groundTruth = groundTruthInput.map(parseGroundTruthItem);
  requireUnique(groundTruth.map((item) => item.jobId), 'rankingGroundTruth.jobId');
  if (!rankingResult || !Array.isArray(rankingResult.terminals)) {
    throw new JobDomainError('invalid_input', 'rankingResult.terminals is required');
  }
  const byJob = new Map();
  let duplicates = 0;
  for (const value of rankingResult.terminals) {
    const item = parseTerminal(value);
    if (byJob.has(item.jobId)) duplicates += 1;
    else byJob.set(item.jobId, item);
  }

  let missing = 0;
  let exactMatches = 0;
  let deterministicFalsePasses = 0;
  let knownWrong = 0;
  let failedOrBudgetExhausted = 0;
  for (const expected of groundTruth) {
    const actual = byJob.get(expected.jobId);
    if (!actual) {
      missing += 1;
      continue;
    }
    if (actual.outcome === expected.expectedOutcome) exactMatches += 1;
    if (expected.hardReject && actual.outcome === 'pass') deterministicFalsePasses += 1;
    const semanticDecision = actual.phase === 'semantic'
      || (actual.phase === 'reused' && actual.reasonCode.startsWith('semantic_'));
    if (semanticDecision && ((expected.expectedOutcome === 'pass' && actual.outcome === 'reject')
      || (expected.expectedOutcome === 'reject' && actual.outcome === 'pass'))) {
      knownWrong += 1;
    }
    if (['failed', 'budget_exhausted'].includes(actual.outcome)) failedOrBudgetExhausted += 1;
  }

  return Object.freeze({
    groundTruthHash: createHash('sha256').update(JSON.stringify(
      [...groundTruth].sort((left, right) => left.jobId.localeCompare(right.jobId))
    )).digest('hex'),
    annotated: groundTruth.length,
    terminalCount: groundTruth.length - missing,
    missing,
    duplicates,
    exactMatches,
    deterministicFalsePasses,
    knownWrong,
    failedOrBudgetExhausted,
    retentionRate: Math.round(((groundTruth.length - missing) / groundTruth.length) * 100)
  });
}

function parseGroundTruthItem(input) {
  requireExactKeys(input, ['jobId', 'expectedOutcome', 'hardReject'], 'rankingGroundTruthItem');
  if (typeof input.hardReject !== 'boolean') {
    throw new JobDomainError('invalid_input', 'rankingGroundTruthItem.hardReject must be boolean');
  }
  return Object.freeze({
    jobId: requireIdentifier(input.jobId, 'rankingGroundTruthItem.jobId'),
    expectedOutcome: requireEnum(
      input.expectedOutcome, ['pass', 'reject', 'review'], 'rankingGroundTruthItem.expectedOutcome'
    ),
    hardReject: input.hardReject
  });
}

function parseTerminal(input) {
  requireExactKeys(input, ['jobId', 'outcome', 'score', 'reasonCode', 'phase', 'reused'], 'rankingTerminal');
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
    throw new JobDomainError('invalid_input', 'rankingTerminal.score must be between 0 and 100');
  }
  if (typeof input.reused !== 'boolean') {
    throw new JobDomainError('invalid_input', 'rankingTerminal.reused must be boolean');
  }
  return Object.freeze({
    jobId: requireIdentifier(input.jobId, 'rankingTerminal.jobId'),
    outcome: requireEnum(
      input.outcome, ['pass', 'reject', 'review', 'failed', 'budget_exhausted'], 'rankingTerminal.outcome'
    ),
    reasonCode: requireIdentifier(input.reasonCode, 'rankingTerminal.reasonCode'),
    phase: requireEnum(input.phase, ['deterministic', 'semantic', 'system', 'reused'], 'rankingTerminal.phase')
  });
}

function requireUnique(values, name) {
  if (new Set(values).size !== values.length) {
    throw new JobDomainError('invalid_input', `${name} must not contain duplicates`);
  }
}
