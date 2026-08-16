import { JobDomainError, requireExactKeys } from '../job-contracts/index.mjs';
import { parseJobCandidate } from './contracts.mjs';
import { normalizedJobIdentity } from './repository.mjs';

const resultKeys = Object.freeze(['candidates', 'blocker', 'writes', 'submissions', 'credentialReads']);
const maximumCandidates = 30;

// This is an internal product boundary between the fixed Zhilian discovery
// adapter and the local repository. It is not a CLI/MCP schema and does not
// accept browser targets, selectors, scripts, URLs, credentials or page actions.
export async function ingestZhilianDiscovery(discoveryInput, { repository } = {}) {
  const candidates = validateDiscoveryResult(discoveryInput);
  if (!repository || typeof repository.upsert !== 'function') {
    throw new JobDomainError('repository_unavailable', 'The local job repository is unavailable');
  }

  const results = [];
  for (const candidate of candidates) results.push(await repository.upsert(candidate));

  const created = results.filter((result) => result.created).length;
  const refreshed = results.filter((result) => !result.created && result.changed).length;
  const unchanged = results.length - created - refreshed;
  return Object.freeze({
    source: 'zhilian',
    observed: discoveryInput.candidates.length,
    unique: candidates.length,
    created,
    refreshed,
    unchanged,
    repositoryWrites: created + refreshed,
    jobIds: Object.freeze(results.map((result) => result.job.id))
  });
}

function validateDiscoveryResult(input) {
  requireExactKeys(input, resultKeys, 'zhilianDiscoveryResult');
  if (!Array.isArray(input.candidates) || input.candidates.length > maximumCandidates) {
    throw new JobDomainError('invalid_input', `zhilianDiscoveryResult.candidates must contain at most ${maximumCandidates} jobs`);
  }
  if (input.blocker !== undefined) {
    throw new JobDomainError('discovery_incomplete', 'Blocked discovery results are not persisted');
  }
  if (input.writes !== 0 || input.submissions !== 0 || input.credentialReads !== 0) {
    throw new JobDomainError('unsafe_discovery_result', 'Discovery must have zero page writes, submissions and credential reads');
  }

  const byIdentity = new Map();
  for (const rawCandidate of input.candidates) {
    const candidate = parseJobCandidate(rawCandidate);
    const url = new URL(candidate.jobUrl);
    if (candidate.source !== 'zhilian' || url.hostname !== 'www.zhaopin.com') {
      throw new JobDomainError('invalid_source', 'Only normalized Zhilian candidates can enter this ingest boundary');
    }
    const identity = normalizedJobIdentity(candidate);
    const existing = byIdentity.get(identity);
    if (existing && !sameCandidate(existing, candidate)) {
      throw new JobDomainError('candidate_identity_conflict', 'One discovery result contains conflicting data for the same job');
    }
    if (!existing) byIdentity.set(identity, candidate);
  }
  return Object.freeze([...byIdentity.values()]);
}

function sameCandidate(left, right) {
  return left.source === right.source
    && left.jobUrl === right.jobUrl
    && left.title === right.title
    && left.company === right.company
    && left.description === right.description;
}
