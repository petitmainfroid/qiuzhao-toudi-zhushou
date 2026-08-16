import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LocalJobRepository } from '../modules/job-repository/repository.mjs';
import { JobWorkflowService } from '../modules/job-workflow/service.mjs';
import { LocalJobWorkflowStore } from '../modules/job-workflow/store.mjs';

const fixedNow = () => new Date('2026-08-16T00:00:00.000Z');

function startRequest(overrides = {}) {
  return {
    requestId: 'workflow-request-001',
    discovery: {
      keywords: 'Product Manager', city: 'Shanghai', maxPages: 1, maxCards: 3,
      maxDetails: 3, maxScrolls: 0, deadlineMs: 10_000
    },
    ...overrides
  };
}

function candidate(number) {
  return {
    source: 'zhilian',
    jobUrl: `https://www.zhaopin.com/jobdetail/workflow-${number}.htm`,
    title: `Product Manager ${number}`,
    company: `Workflow Company ${number}`,
    description: `Own product discovery and delivery for workflow ${number}.`
  };
}

function discoveryResult(count = 3) {
  return Object.freeze({
    candidates: Object.freeze(Array.from({ length: count }, (_, index) => candidate(index + 1))),
    blocker: undefined, writes: 0, submissions: 0, credentialReads: 0
  });
}

function rankingCommand(workflow, overrides = {}) {
  return {
    workflowId: workflow.workflowId,
    requestId: 'ranking-request-001',
    policy: {
      policyId: 'workflow-policy-001', targetRoleTerms: ['product'], excludedTerms: ['sales'],
      acceptedCities: ['Shanghai'], acceptedJobTypes: ['full_time'], minimumMonthlySalaryK: 15
    },
    items: workflow.jobIds.map((jobId) => ({
      jobId,
      facts: { city: 'Shanghai', jobType: 'full_time', monthlySalaryMinK: 20 },
      decision: { outcome: 'pass', score: 90, reasonCode: 'semantic_strong_match' }
    })),
    capabilityCatalog: [{ capabilityId: 'product_strategy', hasValue: true }],
    maxSemanticCalls: 10,
    perItemTimeoutMs: 100,
    deadlineMs: 2_000,
    ...overrides
  };
}

async function harness({ discover, faultInjector } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qiuzhao-workflow-'));
  const repositoryPath = path.join(directory, 'jobs.json');
  const workflowPath = path.join(directory, 'workflows.json');
  const repository = new LocalJobRepository({ filePath: repositoryPath, now: fixedNow });
  const store = new LocalJobWorkflowStore({ filePath: workflowPath, now: fixedNow });
  const service = new JobWorkflowService({
    repository, store,
    discover: discover ?? (async () => discoveryResult()),
    ...(faultInjector ? { faultInjector } : {})
  });
  return { directory, repositoryPath, workflowPath, repository, store, service };
}

function oneShotFault(point) {
  let armed = true;
  return async (current) => {
    if (armed && current === point) {
      armed = false;
      throw Object.assign(new Error('simulated interruption'), { code: 'simulated_interruption' });
    }
  };
}

test('discovery interruption resumes without duplicate jobs, events, or replay work', async () => {
  let discoveryCalls = 0;
  const context = await harness({
    discover: async () => { discoveryCalls += 1; return discoveryResult(); },
    faultInjector: oneShotFault('after_discovery_effect')
  });
  await assert.rejects(() => context.service.start(startRequest()), /simulated interruption/);
  assert.equal((await context.repository.list()).length, 3);
  assert.deepEqual(await Promise.all((await context.repository.list()).map(async (job) =>
    (await context.repository.events(job.id)).map((event) => event.type))), [
    ['job_created'], ['job_created'], ['job_created']
  ]);

  const restarted = new JobWorkflowService({
    repository: new LocalJobRepository({ filePath: context.repositoryPath, now: fixedNow }),
    store: new LocalJobWorkflowStore({ filePath: context.workflowPath, now: fixedNow }),
    discover: async () => { discoveryCalls += 1; return discoveryResult(); }
  });
  const recovered = await restarted.start(startRequest());
  assert.equal(recovered.checkpoint, 'ranking_required');
  assert.equal(recovered.jobIds.length, 3);
  assert.equal(recovered.attempts.discovery, 2);
  assert.equal(discoveryCalls, 2);
  const replay = await restarted.start(startRequest());
  assert.deepEqual(replay, recovered);
  assert.equal(discoveryCalls, 2);
  assert.equal((await context.repository.list()).length, 3);
  for (const job of await context.repository.list()) assert.equal((await context.repository.events(job.id)).length, 1);
  await assert.rejects(() => restarted.start(startRequest({
    discovery: { ...startRequest().discovery, city: 'Beijing' }
  })), (error) => error?.code === 'request_conflict');
});

test('ranking interruption reuses every durable terminal and preserves one event per job', async () => {
  const context = await harness();
  const discovered = await context.service.start(startRequest());
  const command = rankingCommand(discovered);
  const interrupted = new JobWorkflowService({
    repository: context.repository,
    store: context.store,
    discover: async () => discoveryResult(),
    faultInjector: oneShotFault('after_ranking_effect')
  });
  await assert.rejects(() => interrupted.submitRanking(command), /simulated interruption/);
  for (const job of await context.repository.list()) {
    assert.equal(job.scoreSummary.outcome, 'pass');
    assert.deepEqual((await context.repository.events(job.id)).map((event) => event.type), ['job_created', 'ranking_finalized']);
  }

  const restarted = new JobWorkflowService({
    repository: new LocalJobRepository({ filePath: context.repositoryPath, now: fixedNow }),
    store: new LocalJobWorkflowStore({ filePath: context.workflowPath, now: fixedNow }),
    discover: async () => discoveryResult()
  });
  const recovered = await restarted.submitRanking(command);
  assert.equal(recovered.checkpoint, 'review_required');
  assert.equal(recovered.rankingSummary.terminalCount, 3);
  assert.equal(recovered.rankingSummary.semanticCalls, 0);
  assert.equal(recovered.rankingSummary.repositoryWrites, 0);
  const replay = await restarted.submitRanking(command);
  assert.deepEqual(replay, recovered);
  for (const job of await context.repository.list()) assert.equal((await context.repository.events(job.id)).length, 2);
});

test('concurrent workflow owners execute discovery once and return one durable result', async () => {
  let calls = 0;
  const context = await harness({
    discover: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 60));
      return discoveryResult(2);
    }
  });
  const other = new JobWorkflowService({
    repository: new LocalJobRepository({ filePath: context.repositoryPath, now: fixedNow }),
    store: new LocalJobWorkflowStore({ filePath: context.workflowPath, now: fixedNow }),
    discover: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 60));
      return discoveryResult(2);
    }
  });
  const [left, right] = await Promise.all([context.service.start(startRequest()), other.start(startRequest())]);
  assert.deepEqual(left, right);
  assert.equal(calls, 1);
  assert.equal((await context.repository.list()).length, 2);
});

test('review and application preparation recover at the authorization gate with zero external action', async () => {
  const context = await harness();
  const discovered = await context.service.start(startRequest());
  const ranked = await context.service.submitRanking(rankingCommand(discovered));
  const jobId = ranked.jobIds[0];
  const reviewCommand = {
    workflowId: ranked.workflowId, requestId: 'review-request-001', jobId, decision: 'approve'
  };
  const interruptedReview = new JobWorkflowService({
    repository: context.repository, store: context.store, discover: async () => discoveryResult(),
    faultInjector: oneShotFault('after_review_effect')
  });
  await assert.rejects(() => interruptedReview.recordReview(reviewCommand), /simulated interruption/);
  assert.equal((await context.repository.get(jobId)).status, 'approved');

  const restarted = new JobWorkflowService({
    repository: new LocalJobRepository({ filePath: context.repositoryPath, now: fixedNow }),
    store: new LocalJobWorkflowStore({ filePath: context.workflowPath, now: fixedNow }),
    discover: async () => discoveryResult(), faultInjector: oneShotFault('before_authorization_checkpoint')
  });
  const reviewed = await restarted.recordReview(reviewCommand);
  assert.deepEqual(reviewed.reviews, [{ jobId, decision: 'approve' }]);
  const prepare = { workflowId: ranked.workflowId, requestId: 'prepare-request-001', jobId };
  await assert.rejects(() => restarted.prepareApplication(prepare), /simulated interruption/);

  const recoveredService = new JobWorkflowService({
    repository: new LocalJobRepository({ filePath: context.repositoryPath, now: fixedNow }),
    store: new LocalJobWorkflowStore({ filePath: context.workflowPath, now: fixedNow }),
    discover: async () => discoveryResult()
  });
  const gated = await recoveredService.prepareApplication(prepare);
  assert.equal(gated.checkpoint, 'authorization_required');
  assert.deepEqual(gated.applicationGates, [{ jobId, state: 'authorization_required' }]);
  assert.deepEqual(gated.safety, {
    externalActions: 0, pageWrites: 0, submissions: 0, credentialReads: 0,
    authorizationCanBeGrantedByAgent: false, finalSubmission: 'unreachable'
  });
  assert.deepEqual(await recoveredService.prepareApplication(prepare), gated);
  assert.deepEqual((await context.repository.events(jobId)).map((event) => event.type), [
    'job_created', 'ranking_finalized', 'status_changed'
  ]);
  assert.equal((await context.store.safetyAudit()).hitCount, 0);
});

test('cancellation is irreversible and all later workflow/repository writes stay zero', async () => {
  const context = await harness();
  const discovered = await context.service.start(startRequest());
  const ranked = await context.service.submitRanking(rankingCommand(discovered));
  const cancel = { workflowId: ranked.workflowId, requestId: 'cancel-request-001' };
  const cancelled = await context.service.cancel(cancel);
  assert.equal(cancelled.state, 'cancelled');
  const repositoryBytes = await readFile(context.repositoryPath, 'utf8');
  const workflowBytes = await readFile(context.workflowPath, 'utf8');
  assert.deepEqual(await context.service.cancel(cancel), cancelled);
  assert.deepEqual(await context.service.start(startRequest()), cancelled);
  await assert.rejects(() => context.service.submitRanking(rankingCommand(discovered)), (error) => error?.code === 'workflow_cancelled');
  await assert.rejects(() => context.service.recordReview({
    workflowId: ranked.workflowId, requestId: 'review-after-cancel', jobId: ranked.jobIds[0], decision: 'approve'
  }), (error) => error?.code === 'workflow_cancelled');
  assert.equal(await readFile(context.repositoryPath, 'utf8'), repositoryBytes);
  assert.equal(await readFile(context.workflowPath, 'utf8'), workflowBytes);
});

test('distinct Node processes recover dead-owner locks at discovery, ranking, review, and pre-authorization', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qiuzhao-workflow-process-'));
  const fixture = fileURLToPath(new URL('./fixtures/job-workflow-process.mjs', import.meta.url));
  const run = (operation) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fixture, operation, directory], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });

  assert.equal((await run('discovery-crash')).code, 23);
  assert.equal((await run('discovery-resume')).code, 0);
  assert.equal((await run('ranking-crash')).code, 24);
  assert.equal((await run('ranking-resume')).code, 0);
  assert.equal((await run('review-crash')).code, 25);
  assert.equal((await run('review-resume')).code, 0);
  assert.equal((await run('prepare-crash')).code, 26);
  assert.equal((await run('prepare-resume')).code, 0);
  const auditedProcess = await run('audit');
  assert.equal(auditedProcess.code, 0, auditedProcess.stderr);
  const audited = JSON.parse(auditedProcess.stdout);
  assert.equal(audited.workflow.checkpoint, 'authorization_required');
  assert.equal(audited.jobs.length, 2);
  assert.equal(new Set(audited.jobs.map((job) => job.id)).size, 2);
  assert.deepEqual(audited.workflow.attempts, { discovery: 2, ranking: 2, applicationPreparation: 2 });
  assert.deepEqual(audited.workflow.safety, {
    externalActions: 0, pageWrites: 0, submissions: 0, credentialReads: 0,
    authorizationCanBeGrantedByAgent: false, finalSubmission: 'unreachable'
  });
  assert.equal(audited.workflowEvents.filter((event) => event.type === 'discovery_completed').length, 1);
  assert.equal(audited.workflowEvents.filter((event) => event.type === 'ranking_completed').length, 1);
  assert.equal(audited.workflowEvents.filter((event) => event.type === 'review_recorded').length, 1);
  assert.equal(audited.workflowEvents.filter((event) => event.type === 'application_gate_reached').length, 1);
  for (const [index, jobId] of audited.workflow.jobIds.entries()) {
    assert.deepEqual(audited.jobEvents[jobId].map((event) => event.type), index === 0
      ? ['job_created', 'ranking_finalized', 'status_changed']
      : ['job_created', 'ranking_finalized']);
  }
  assert.equal(audited.workflowAudit.hitCount, 0);
  assert.equal(audited.repositoryAudit.hitCount, 0);
});

test('workflow storage with an injected private-value key fails closed', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qiuzhao-workflow-corrupt-'));
  const filePath = path.join(directory, 'workflows.json');
  await writeFile(filePath, JSON.stringify({
    schemaVersion: 1,
    revision: 0,
    workflows: [{
      workflowId: 'workflow-request-001', inputHash: 'a'.repeat(64), state: 'queued', checkpoint: 'discovery_pending',
      version: 0, jobIds: [], reviews: [], applicationGates: [], commands: [],
      attempts: { discovery: 0, ranking: 0, applicationPreparation: 0 },
      counters: { repositoryWrites: 0, semanticCalls: 0, externalActions: 0, pageWrites: 0, submissions: 0, credentialReads: 0 },
      createdAt: '2026-08-16T00:00:00.000Z', updatedAt: '2026-08-16T00:00:00.000Z',
      profileValue: 'must-not-load'
    }],
    events: []
  }));
  const store = new LocalJobWorkflowStore({ filePath });
  await assert.rejects(() => store.get('workflow-request-001'), (error) => error?.code === 'storage_corrupt');
});
