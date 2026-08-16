import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JobDomainError } from '../modules/job-contracts/index.mjs';
import { JobRepositoryConflictError, LocalJobRepository } from '../modules/job-repository/repository.mjs';
import { ingestZhilianDiscovery } from '../modules/job-repository/zhilian-ingest.mjs';

const now = () => new Date('2026-08-16T00:00:00.000Z');

function candidate(number, overrides = {}) {
  return {
    source: 'zhilian',
    jobUrl: `https://www.zhaopin.com/jobdetail/job-${number}.htm?tracking=discard`,
    title: `Platform Engineer ${number}`,
    company: `Example Company ${number}`,
    description: `Build and operate service platform ${number}.`,
    ...overrides
  };
}

function discovery(candidates, overrides = {}) {
  return {
    candidates,
    blocker: undefined,
    writes: 0,
    submissions: 0,
    credentialReads: 0,
    ...overrides
  };
}

async function repositoryPair() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qiuzhao-zhilian-repo-'));
  const filePath = path.join(directory, 'jobs.json');
  return {
    filePath,
    first: new LocalJobRepository({ filePath, now }),
    second: new LocalJobRepository({ filePath, now })
  };
}

test('identical Zhilian replay is a byte-for-byte no-op across repository restart', async () => {
  const { filePath, first } = await repositoryPair();
  const input = discovery([candidate(1), candidate(2), candidate(3)]);
  const initial = await ingestZhilianDiscovery(input, { repository: first });
  const beforeReplay = await readFile(filePath, 'utf8');

  const restarted = new LocalJobRepository({ filePath, now });
  const replay = await ingestZhilianDiscovery(input, { repository: restarted });
  const afterReplay = await readFile(filePath, 'utf8');

  assert.deepEqual(initial, {
    source: 'zhilian', observed: 3, unique: 3, created: 3, refreshed: 0,
    unchanged: 0, repositoryWrites: 3, jobIds: initial.jobIds
  });
  assert.equal(replay.created, 0);
  assert.equal(replay.refreshed, 0);
  assert.equal(replay.unchanged, 3);
  assert.equal(replay.repositoryWrites, 0);
  assert.equal(afterReplay, beforeReplay);
  assert.equal(JSON.parse(afterReplay).revision, 3);
  assert.deepEqual((await restarted.list()).map((job) => job.version), [0, 0, 0]);
});

test('concurrent identical discovery rounds create one record per normalized identity', async () => {
  const { filePath, first, second } = await repositoryPair();
  const input = discovery([candidate(1), candidate(2), candidate(3)]);
  const [left, right] = await Promise.all([
    ingestZhilianDiscovery(input, { repository: first }),
    ingestZhilianDiscovery(input, { repository: second })
  ]);

  const restarted = new LocalJobRepository({ filePath, now });
  assert.equal(left.created + right.created, 3);
  assert.equal(left.repositoryWrites + right.repositoryWrites, 3);
  assert.equal(left.unchanged + right.unchanged, 3);
  assert.equal((await restarted.list()).length, 3);
  assert.equal(JSON.parse(await readFile(filePath, 'utf8')).revision, 3);
});

test('interrupted batch resumes after restart without rewriting completed jobs', async () => {
  const { filePath, first } = await repositoryPair();
  const input = discovery([candidate(1), candidate(2), candidate(3)]);
  let attempts = 0;
  const interruptedRepository = {
    async upsert(value) {
      attempts += 1;
      if (attempts === 3) throw new Error('simulated_process_interruption');
      return first.upsert(value);
    }
  };

  await assert.rejects(
    () => ingestZhilianDiscovery(input, { repository: interruptedRepository }),
    /simulated_process_interruption/
  );
  assert.equal(JSON.parse(await readFile(filePath, 'utf8')).revision, 2);

  const restarted = new LocalJobRepository({ filePath, now });
  const recovered = await ingestZhilianDiscovery(input, { repository: restarted });
  assert.deepEqual(
    { created: recovered.created, refreshed: recovered.refreshed, unchanged: recovered.unchanged, writes: recovered.repositoryWrites },
    { created: 1, refreshed: 0, unchanged: 2, writes: 1 }
  );
  assert.equal((await restarted.list()).length, 3);
  assert.equal(JSON.parse(await readFile(filePath, 'utf8')).revision, 3);
});

test('validates the complete discovery result before its first repository write', async () => {
  const { first } = await repositoryPair();
  await assert.rejects(
    () => ingestZhilianDiscovery(discovery([
      candidate(1),
      candidate(2, { description: '<html>private page dump</html>' })
    ]), { repository: first }),
    (error) => error instanceof JobDomainError && error.code === 'sensitive_payload'
  );
  await assert.rejects(
    () => ingestZhilianDiscovery(discovery([candidate(1)], { blocker: 'page_drift' }), { repository: first }),
    (error) => error instanceof JobDomainError && error.code === 'discovery_incomplete'
  );
  await assert.rejects(
    () => ingestZhilianDiscovery(discovery([candidate(1)], { credentialReads: 1 }), { repository: first }),
    (error) => error instanceof JobDomainError && error.code === 'unsafe_discovery_result'
  );
  assert.equal((await first.list()).length, 0);
});

test('version conflicts perform zero durable writes', async () => {
  const { filePath, first } = await repositoryPair();
  const created = (await first.upsert(candidate(1))).job;
  const beforeConflict = await readFile(filePath, 'utf8');
  await assert.rejects(
    () => first.transition({ jobId: created.id, expectedVersion: 99, nextStatus: 'scored', reasonCode: 'ranking_ready' }),
    JobRepositoryConflictError
  );
  const afterConflict = await readFile(filePath, 'utf8');
  assert.equal(afterConflict, beforeConflict);
  assert.equal(JSON.parse(afterConflict).revision, 1);
  assert.equal((await first.get(created.id)).version, 0);
});

test('persisted Zhilian repository has zero sensitive-field audit hits', async () => {
  const { first } = await repositoryPair();
  const input = discovery([
    candidate(1),
    candidate(1, { jobUrl: 'https://www.zhaopin.com/jobdetail/job-1.htm#from-replay' }),
    candidate(2)
  ]);
  const result = await ingestZhilianDiscovery(input, { repository: first });
  const audit = await first.safetyAudit();

  assert.equal(result.observed, 3);
  assert.equal(result.unique, 2);
  assert.equal(result.created, 2);
  assert.deepEqual(audit, { scannedJobs: 2, scannedEvents: 2, hitCount: 0, categories: [] });
});

test('sensitive-field audit has a structural positive control without storing a secret value', async () => {
  const { filePath, first } = await repositoryPair();
  await first.upsert(candidate(1));
  const state = JSON.parse(await readFile(filePath, 'utf8'));
  state.jobs[0].rawHtml = 'synthetic-marker-only';
  await writeFile(filePath, `${JSON.stringify(state)}\n`, 'utf8');

  const audit = await first.safetyAudit();
  assert.equal(audit.hitCount, 1);
  assert.deepEqual(audit.categories, ['page_dump_key']);
});
