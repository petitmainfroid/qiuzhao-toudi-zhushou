import { JobDomainError } from '../job-contracts/index.mjs';
import { parseRankingRunRequest, parseSemanticRankingDecision, RANKING_OUTCOMES } from './contracts.mjs';
import { evaluateDeterministicPrefilter } from './prefilter.mjs';

export async function runJobRanking(input, {
  repository,
  scoreJob,
  now = () => Date.now()
} = {}) {
  const request = parseRankingRunRequest(input);
  assertRepository(repository);
  const startedAt = now();
  let semanticCalls = 0;
  let repositoryWrites = 0;
  const terminals = [];

  for (const item of request.items) {
    const job = await repository.get(item.jobId);
    if (!job) {
      terminals.push(terminal(item.jobId, 'failed', 0, 'job_not_found', 'system', false));
      continue;
    }
    if (job.scoreSummary) {
      terminals.push(terminalFromJob(job, true));
      continue;
    }

    const gate = evaluateDeterministicPrefilter(job, request.policy, item.facts);
    let decision;
    let phase;
    if (gate.outcome === 'reject') {
      decision = { outcome: 'reject', score: 0, reasonCode: gate.reasonCode };
      phase = 'deterministic';
    } else if (gate.outcome === 'review') {
      decision = { outcome: 'review', score: 50, reasonCode: gate.reasonCode };
      phase = 'deterministic';
    } else if (!request.capabilityCatalog.some((capability) => capability.hasValue)) {
      decision = { outcome: 'review', score: 50, reasonCode: 'semantic_insufficient_evidence' };
      phase = 'semantic';
    } else if (semanticCalls >= request.maxSemanticCalls) {
      decision = { outcome: 'budget_exhausted', score: 0, reasonCode: 'semantic_budget_exhausted' };
      phase = 'system';
    } else {
      const remainingMs = request.deadlineMs - (now() - startedAt);
      if (remainingMs <= 0) {
        decision = { outcome: 'budget_exhausted', score: 0, reasonCode: 'ranking_deadline_exhausted' };
        phase = 'system';
      } else if (typeof scoreJob !== 'function') {
        decision = { outcome: 'failed', score: 0, reasonCode: 'semantic_scorer_unavailable' };
        phase = 'system';
      } else {
        semanticCalls += 1;
        try {
          const rawDecision = await withTimeout(
            Promise.resolve().then(() => scoreJob(semanticEnvelope(job, request.capabilityCatalog))),
            Math.min(request.perItemTimeoutMs, remainingMs)
          );
          decision = parseSemanticRankingDecision(rawDecision);
          phase = 'semantic';
        } catch (error) {
          if (error?.code === 'semantic_timeout') {
            decision = { outcome: 'failed', score: 0, reasonCode: 'semantic_timeout' };
          } else if (['quota_exhausted', 'rate_limited'].includes(error?.code)) {
            decision = { outcome: 'budget_exhausted', score: 0, reasonCode: 'semantic_quota_exhausted' };
          } else if (error instanceof JobDomainError) {
            decision = { outcome: 'failed', score: 0, reasonCode: 'semantic_invalid' };
          } else {
            decision = { outcome: 'failed', score: 0, reasonCode: 'semantic_failed' };
          }
          phase = 'system';
        }
      }
    }

    const persisted = await persistTerminal(repository, job, decision, phase);
    repositoryWrites += persisted.wrote ? 1 : 0;
    terminals.push(persisted.terminal);
  }

  const counts = Object.fromEntries(RANKING_OUTCOMES.map((outcome) => [
    outcome, terminals.filter((item) => item.outcome === outcome).length
  ]));
  return Object.freeze({
    requestId: request.requestId,
    annotated: request.items.length,
    terminalCount: terminals.length,
    terminals: Object.freeze(terminals),
    counts: Object.freeze(counts),
    semanticCalls,
    repositoryWrites,
    pageWrites: 0,
    submissions: 0,
    credentialReads: 0
  });
}

export async function getRankingReviewQueue({ repository } = {}) {
  assertRepository(repository, { needsList: true });
  const jobs = await repository.list();
  const items = jobs
    .filter((job) => job.status === 'review_required'
      && ['pass', 'review'].includes(job.scoreSummary?.outcome))
    .map((job) => Object.freeze({
      jobId: job.id,
      title: job.title,
      company: job.company,
      outcome: job.scoreSummary.outcome,
      score: job.scoreSummary.score,
      reasonCode: job.scoreSummary.reasonCode,
      version: job.version
    }))
    .sort((left, right) => right.score - left.score || left.jobId.localeCompare(right.jobId));
  return Object.freeze({ count: items.length, items: Object.freeze(items) });
}

async function persistTerminal(repository, job, decision, phase) {
  try {
    const persisted = await repository.finalizeRanking({
      jobId: job.id,
      expectedVersion: job.version,
      outcome: decision.outcome,
      score: decision.score,
      reasonCode: decision.reasonCode
    });
    return { terminal: terminalFromJob(persisted, false, phase), wrote: true };
  } catch (error) {
    if (!['version_conflict', 'ranking_already_finalized'].includes(error?.code)) {
      return {
        terminal: terminal(job.id, 'failed', 0, 'repository_write_failed', 'system', false),
        wrote: false
      };
    }
    const current = await repository.get(job.id);
    if (current?.scoreSummary) return { terminal: terminalFromJob(current, true), wrote: false };
    if (!current) {
      return { terminal: terminal(job.id, 'failed', 0, 'job_not_found', 'system', false), wrote: false };
    }
    try {
      const failed = await repository.finalizeRanking({
        jobId: current.id,
        expectedVersion: current.version,
        outcome: 'failed',
        score: 0,
        reasonCode: 'job_changed_during_ranking'
      });
      return { terminal: terminalFromJob(failed, false, 'system'), wrote: true };
    } catch {
      return {
        terminal: terminal(job.id, 'failed', 0, 'repository_write_failed', 'system', false),
        wrote: false
      };
    }
  }
}

function semanticEnvelope(job, capabilityCatalog) {
  return Object.freeze({
    job: Object.freeze({
      jobId: job.id,
      title: job.title,
      company: job.company,
      description: job.description
    }),
    capabilityCatalog: Object.freeze(capabilityCatalog.map((item) => Object.freeze({ ...item })))
  });
}

function terminalFromJob(job, reused, phase = reused ? 'reused' : 'semantic') {
  return terminal(
    job.id,
    job.scoreSummary.outcome,
    job.scoreSummary.score,
    job.scoreSummary.reasonCode,
    phase,
    reused
  );
}

function terminal(jobId, outcome, score, reasonCode, phase, reused) {
  return Object.freeze({ jobId, outcome, score, reasonCode, phase, reused });
}

function assertRepository(repository, { needsList = false } = {}) {
  if (!repository || typeof repository.get !== 'function'
    || typeof repository.finalizeRanking !== 'function'
    || (needsList && typeof repository.list !== 'function')) {
    throw new JobDomainError('repository_unavailable', 'The local job repository is unavailable');
  }
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('semantic_timeout');
          error.code = 'semantic_timeout';
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
