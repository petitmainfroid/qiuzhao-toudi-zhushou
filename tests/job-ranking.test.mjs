import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JobDomainError } from '../modules/job-contracts/index.mjs';
import {
  parseRankingRunRequest, parseSemanticRankingDecision
} from '../modules/job-ranking/contracts.mjs';
import { evaluateRankingEvidence } from '../modules/job-ranking/evaluation.mjs';
import { evaluateDeterministicPrefilter } from '../modules/job-ranking/prefilter.mjs';
import { getRankingReviewQueue, runJobRanking } from '../modules/job-ranking/service.mjs';
import { LocalJobRepository } from '../modules/job-repository/repository.mjs';

const nowDate = () => new Date('2026-08-16T00:00:00.000Z');
const defaultFacts = Object.freeze({ city: 'Shanghai', jobType: 'full_time', monthlySalaryMinK: 20 });
const defaultPolicy = Object.freeze({
  policyId: 'product-policy-v1',
  targetRoleTerms: ['Product Manager'],
  excludedTerms: ['Sales'],
  acceptedCities: ['Shanghai'],
  acceptedJobTypes: ['full_time'],
  minimumMonthlySalaryK: 15
});

function candidate(number, overrides = {}) {
  return {
    source: 'zhilian',
    jobUrl: `https://www.zhaopin.com/jobdetail/ranking-${number}.htm`,
    title: `Product Manager ${number}`,
    company: `Ranking Company ${number}`,
    description: `Own product discovery and delivery for product ${number}.`,
    ...overrides
  };
}

async function repository() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qiuzhao-ranking-'));
  const filePath = path.join(directory, 'jobs.json');
  return { filePath, repo: new LocalJobRepository({ filePath, now: nowDate }) };
}

async function addJobs(repo, values) {
  const jobs = [];
  for (const value of values) jobs.push((await repo.upsert(value)).job);
  return jobs;
}

function request(items, overrides = {}) {
  return {
    requestId: 'ranking-request-001',
    policy: { ...defaultPolicy },
    items,
    capabilityCatalog: [{ capabilityId: 'product_strategy', hasValue: true }],
    maxSemanticCalls: 20,
    perItemTimeoutMs: 100,
    deadlineMs: 2_000,
    ...overrides
  };
}

test('ranking contracts are closed, bounded and reject inconsistent semantic output', () => {
  const value = request([{ jobId: 'job-001', facts: defaultFacts }]);
  const parsed = parseRankingRunRequest(value);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.capabilityCatalog[0].hasValue, true);
  assert.throws(() => parseRankingRunRequest({ ...value, selector: '.job' }), /not supported/);
  assert.throws(() => parseRankingRunRequest({ ...value, capabilitySummary: 'private profile text' }), /not supported/);
  assert.throws(() => parseRankingRunRequest({
    ...value,
    items: [value.items[0], value.items[0]]
  }), /must not contain duplicates/);
  assert.throws(() => parseRankingRunRequest({
    ...value,
    capabilityCatalog: [{ capabilityId: 'product_strategy', hasValue: true, profileValue: 'synthetic-marker' }]
  }), /not supported/);
  assert.deepEqual(parseSemanticRankingDecision({
    outcome: 'pass', score: 88, reasonCode: 'semantic_strong_match'
  }), { outcome: 'pass', score: 88, reasonCode: 'semantic_strong_match' });
  assert.throws(() => parseSemanticRankingDecision({
    outcome: 'pass', score: 20, reasonCode: 'semantic_strong_match'
  }), (error) => error instanceof JobDomainError && error.code === 'invalid_semantic_decision');
});

test('deterministic prefilter covers exclusion, role, city, type, salary and unknown facts', () => {
  const job = candidate(1);
  assert.equal(evaluateDeterministicPrefilter(
    { ...job, description: 'This is a Sales position.' }, defaultPolicy, defaultFacts
  ).reasonCode, 'excluded_term');
  assert.equal(evaluateDeterministicPrefilter(
    { ...job, title: 'Software Engineer' }, defaultPolicy, defaultFacts
  ).reasonCode, 'role_mismatch');
  assert.equal(evaluateDeterministicPrefilter(job, defaultPolicy, { ...defaultFacts, city: 'Beijing' }).reasonCode, 'city_mismatch');
  assert.equal(evaluateDeterministicPrefilter(
    job, defaultPolicy, { ...defaultFacts, city: null, jobType: 'internship' }
  ).reasonCode, 'job_type_mismatch');
  assert.equal(evaluateDeterministicPrefilter(
    job, defaultPolicy, { ...defaultFacts, monthlySalaryMinK: 10 }
  ).reasonCode, 'salary_below_minimum');
  assert.equal(evaluateDeterministicPrefilter(job, defaultPolicy, { ...defaultFacts, city: null }).reasonCode, 'city_unknown');
  assert.equal(evaluateDeterministicPrefilter(job, defaultPolicy, defaultFacts).outcome, 'pass');
});

test('hard rejects cannot be overridden by AI and every frozen job gets one terminal', async () => {
  const { repo } = await repository();
  const jobs = await addJobs(repo, [
    candidate(1, { title: 'Sales Product Manager' }),
    candidate(2, { title: 'Software Engineer' }),
    candidate(3), candidate(4), candidate(5), candidate(6)
  ]);
  const items = [
    { jobId: jobs[0].id, facts: defaultFacts },
    { jobId: jobs[1].id, facts: defaultFacts },
    { jobId: jobs[2].id, facts: { ...defaultFacts, city: 'Beijing' } },
    { jobId: jobs[3].id, facts: { ...defaultFacts, jobType: 'internship' } },
    { jobId: jobs[4].id, facts: { ...defaultFacts, monthlySalaryMinK: 10 } },
    { jobId: jobs[5].id, facts: defaultFacts }
  ];
  let semanticCalls = 0;
  let capturedEnvelope;
  const result = await runJobRanking(request(items), {
    repository: repo,
    scoreJob: async (envelope) => {
      semanticCalls += 1;
      capturedEnvelope = envelope;
      return { outcome: 'pass', score: 90, reasonCode: 'semantic_strong_match' };
    }
  });

  assert.equal(result.annotated, 6);
  assert.equal(result.terminalCount, 6);
  assert.equal(new Set(result.terminals.map((item) => item.jobId)).size, 6);
  assert.equal(result.counts.reject, 5);
  assert.equal(result.counts.pass, 1);
  assert.equal(semanticCalls, 1);
  assert.deepEqual(Object.keys(capturedEnvelope).sort(), ['capabilityCatalog', 'job']);
  assert.deepEqual(Object.keys(capturedEnvelope.job).sort(), ['company', 'description', 'jobId', 'title']);
  assert.equal(JSON.stringify(capturedEnvelope).includes('profileValue'), false);
  const evidence = evaluateRankingEvidence(items.map((item, index) => ({
    jobId: item.jobId,
    expectedOutcome: index === 5 ? 'pass' : 'reject',
    hardReject: index !== 5
  })), result);
  assert.deepEqual(
    { missing: evidence.missing, duplicates: evidence.duplicates, falsePasses: evidence.deterministicFalsePasses, knownWrong: evidence.knownWrong, retention: evidence.retentionRate },
    { missing: 0, duplicates: 0, falsePasses: 0, knownWrong: 0, retention: 100 }
  );
  const queue = await getRankingReviewQueue({ repository: repo });
  assert.equal(queue.count, 1);
  assert.equal(JSON.stringify(queue).includes('description'), false);
});

test('unknown hard facts and missing capability evidence stay review-only', async () => {
  const { repo } = await repository();
  const [unknownFact, noEvidence] = await addJobs(repo, [candidate(1), candidate(2)]);
  let calls = 0;
  const first = await runJobRanking(request([
    { jobId: unknownFact.id, facts: { ...defaultFacts, city: null } }
  ]), { repository: repo, scoreJob: async () => { calls += 1; return { outcome: 'pass', score: 90, reasonCode: 'semantic_strong_match' }; } });
  const second = await runJobRanking(request([
    { jobId: noEvidence.id, facts: defaultFacts }
  ], {
    requestId: 'ranking-request-002',
    capabilityCatalog: [{ capabilityId: 'product_strategy', hasValue: false }]
  }), { repository: repo, scoreJob: async () => { calls += 1; return { outcome: 'pass', score: 90, reasonCode: 'semantic_strong_match' }; } });

  assert.equal(first.terminals[0].outcome, 'review');
  assert.equal(first.terminals[0].reasonCode, 'city_unknown');
  assert.equal(second.terminals[0].outcome, 'review');
  assert.equal(second.terminals[0].reasonCode, 'semantic_insufficient_evidence');
  assert.equal(calls, 0);
});

test('invalid output, timeout, quota, scorer failure and local budget all remain terminals', async () => {
  const { repo } = await repository();
  const jobs = await addJobs(repo, Array.from({ length: 5 }, (_, index) => candidate(index + 1)));
  const items = jobs.map((job) => ({ jobId: job.id, facts: defaultFacts }));
  let calls = 0;
  const result = await runJobRanking(request(items, {
    maxSemanticCalls: 4,
    perItemTimeoutMs: 20,
    deadlineMs: 1_000
  }), {
    repository: repo,
    scoreJob: async () => {
      calls += 1;
      if (calls === 1) return { outcome: 'pass', score: 10, reasonCode: 'semantic_strong_match' };
      if (calls === 2) throw Object.assign(new Error('quota'), { code: 'quota_exhausted' });
      if (calls === 3) return new Promise(() => {});
      throw new Error('provider_failed');
    }
  });

  assert.equal(result.terminalCount, 5);
  assert.equal(result.repositoryWrites, 5);
  assert.equal(result.semanticCalls, 4);
  assert.equal(result.counts.failed, 3);
  assert.equal(result.counts.budget_exhausted, 2);
  assert.equal((await repo.list()).filter((job) => job.scoreSummary).length, 5);
  const evidence = evaluateRankingEvidence(items.map((item) => ({
    jobId: item.jobId, expectedOutcome: 'review', hardReject: false
  })), result);
  assert.equal(evidence.retentionRate, 100);
  assert.equal(evidence.failedOrBudgetExhausted, 5);
});

test('restart reuses completed terminals and scores only remaining jobs', async () => {
  const { filePath, repo } = await repository();
  const jobs = await addJobs(repo, Array.from({ length: 4 }, (_, index) => candidate(index + 1)));
  const input = request(jobs.map((job) => ({ jobId: job.id, facts: defaultFacts })));
  let reads = 0;
  let scoreCalls = 0;
  const interruptedView = {
    async get(jobId) {
      reads += 1;
      if (reads === 3) throw new Error('simulated_process_interruption');
      return repo.get(jobId);
    },
    finalizeRanking: (value) => repo.finalizeRanking(value)
  };
  const scorer = async () => {
    scoreCalls += 1;
    return { outcome: 'pass', score: 85, reasonCode: 'semantic_strong_match' };
  };

  await assert.rejects(() => runJobRanking(input, { repository: interruptedView, scoreJob: scorer }), /simulated_process_interruption/);
  assert.equal(scoreCalls, 2);
  const restarted = new LocalJobRepository({ filePath, now: nowDate });
  const recovered = await runJobRanking(input, { repository: restarted, scoreJob: scorer });
  assert.equal(recovered.terminals.filter((item) => item.reused).length, 2);
  assert.equal(recovered.repositoryWrites, 2);
  assert.equal(scoreCalls, 4);

  const replay = await runJobRanking(input, { repository: new LocalJobRepository({ filePath, now: nowDate }), scoreJob: scorer });
  assert.equal(replay.terminals.filter((item) => item.reused).length, 4);
  assert.equal(replay.repositoryWrites, 0);
  assert.equal(scoreCalls, 4);
  assert.equal((await getRankingReviewQueue({ repository: restarted })).count, 4);
});

test('ranking finalization is atomic and cannot be overwritten', async () => {
  const { filePath, repo } = await repository();
  const [job] = await addJobs(repo, [candidate(1)]);
  const ranked = await repo.finalizeRanking({
    jobId: job.id, expectedVersion: job.version, outcome: 'review', score: 60,
    reasonCode: 'semantic_partial_match'
  });
  const before = await readFile(filePath, 'utf8');
  await assert.rejects(() => repo.recordScore({
    jobId: ranked.id, expectedVersion: ranked.version, outcome: 'pass', score: 90,
    reasonCode: 'semantic_strong_match'
  }), (error) => error instanceof JobDomainError && error.code === 'ranking_already_finalized');
  assert.equal(await readFile(filePath, 'utf8'), before);
  assert.deepEqual((await repo.events(job.id)).map((event) => event.type), ['job_created', 'ranking_finalized']);
});

test('concurrent ranking processes retain one durable terminal and one ranking event', async () => {
  const { filePath, repo } = await repository();
  const [job] = await addJobs(repo, [candidate(1)]);
  const input = request([{ jobId: job.id, facts: defaultFacts }]);
  const otherProcessView = new LocalJobRepository({ filePath, now: nowDate });
  const scorer = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { outcome: 'pass', score: 85, reasonCode: 'semantic_strong_match' };
  };
  const [left, right] = await Promise.all([
    runJobRanking(input, { repository: repo, scoreJob: scorer }),
    runJobRanking(input, { repository: otherProcessView, scoreJob: scorer })
  ]);

  assert.equal(left.repositoryWrites + right.repositoryWrites, 1);
  assert.equal(left.terminals[0].outcome, 'pass');
  assert.equal(right.terminals[0].outcome, 'pass');
  assert.equal([left, right].filter((result) => result.terminals[0].reused).length, 1);
  assert.deepEqual((await repo.events(job.id)).map((event) => event.type), ['job_created', 'ranking_finalized']);
});

test('ranking evaluator positive control detects known-wrong, false pass and duplicate terminals', () => {
  const terminal = (jobId, outcome) => ({
    jobId, outcome, score: outcome === 'pass' ? 90 : 10,
    reasonCode: outcome === 'pass' ? 'semantic_strong_match' : 'semantic_mismatch',
    phase: 'semantic', reused: false
  });
  const result = { terminals: [terminal('job-001', 'reject'), terminal('job-002', 'pass'), terminal('job-002', 'pass')] };
  const evidence = evaluateRankingEvidence([
    { jobId: 'job-001', expectedOutcome: 'pass', hardReject: false },
    { jobId: 'job-002', expectedOutcome: 'reject', hardReject: true }
  ], result);
  assert.equal(evidence.knownWrong, 2);
  assert.equal(evidence.deterministicFalsePasses, 1);
  assert.equal(evidence.duplicates, 1);
  assert.throws(() => evaluateRankingEvidence([
    { jobId: 'job-001', expectedOutcome: 'pass', hardReject: false }
  ], { terminals: [{ ...terminal('job-001', 'pass'), score: 'not-a-score' }] }), /score must be between/);
});
