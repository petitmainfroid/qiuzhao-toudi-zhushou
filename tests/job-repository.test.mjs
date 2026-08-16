import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JobDomainError } from '../modules/job-contracts/index.mjs';
import { LocalJobRepository, JobRepositoryConflictError, normalizedJobIdentity } from '../modules/job-repository/repository.mjs';

const candidate = Object.freeze({ source: 'campus', jobUrl: 'https://jobs.example.com/campus/123?tracking=discard', title: '后端工程师', company: '示例公司', description: '负责服务端研发。' });
async function repository() { return new LocalJobRepository({ filePath: path.join(await mkdtemp(path.join(os.tmpdir(), 'qiuzhao-job-repo-')), 'jobs.json'), now: () => new Date('2026-08-15T00:00:00.000Z') }); }

test('normalizes identity and deduplicates a reobserved job into one record', async () => {
  const repo = await repository();
  const first = await repo.upsert(candidate);
  const second = await repo.upsert({ ...candidate, jobUrl: 'https://jobs.example.com/campus/123?other=discard#section', title: '后端工程师（更新）' });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal((await repo.list()).length, 1);
  assert.equal(second.job.title, '后端工程师（更新）');
  assert.equal(normalizedJobIdentity(candidate), normalizedJobIdentity({ ...candidate, jobUrl: 'https://jobs.example.com/campus/123#ignored' }));
});

test('uses expectedVersion, status transitions, scoring and a redacted event timeline', async () => {
  const repo = await repository();
  const created = (await repo.upsert(candidate)).job;
  await assert.rejects(() => repo.transition({ jobId: created.id, expectedVersion: 4, nextStatus: 'scored', reasonCode: 'ranking_ready' }), JobRepositoryConflictError);
  const scored = await repo.transition({ jobId: created.id, expectedVersion: created.version, nextStatus: 'scored', reasonCode: 'ranking_ready' });
  const withScore = await repo.recordScore({ jobId: scored.id, expectedVersion: scored.version, outcome: 'review', score: 72.4, reasonCode: 'semantic_match' });
  assert.deepEqual(withScore.scoreSummary, { outcome: 'review', score: 72, reasonCode: 'semantic_match' });
  const events = await repo.events(created.id);
  assert.deepEqual(events.map((event) => event.type), ['job_created', 'status_changed', 'score_recorded']);
  assert.equal(JSON.stringify(events).includes('服务端研发'), false);
});

test('serializes concurrent duplicate observations and preserves soft-delete/restore history after restart', async () => {
  const filePath = path.join(await mkdtemp(path.join(os.tmpdir(), 'qiuzhao-job-repo-')), 'jobs.json');
  const repo = new LocalJobRepository({ filePath, now: () => new Date('2026-08-15T00:00:00.000Z') });
  const secondProcessView = new LocalJobRepository({ filePath, now: () => new Date('2026-08-15T00:00:00.000Z') });
  const duplicateResults = await Promise.all([
    repo.upsert(candidate),
    secondProcessView.upsert({ ...candidate, jobUrl: 'https://jobs.example.com/campus/123?from=concurrent' })
  ]);
  assert.equal(duplicateResults.filter((result) => result.created).length, 1);
  assert.equal((await repo.list()).length, 1);
  const created = (await repo.upsert(candidate)).job;
  const protectedJob = await repo.setProtected({ jobId: created.id, expectedVersion: created.version, protected: true });
  await assert.rejects(() => repo.softDelete({ jobId: created.id, expectedVersion: protectedJob.version, reasonCode: 'user_request' }), (error) => error instanceof JobDomainError && error.code === 'protected_record');
  const unprotected = await repo.setProtected({ jobId: created.id, expectedVersion: protectedJob.version, protected: false });
  const deleted = await repo.softDelete({ jobId: created.id, expectedVersion: unprotected.version, reasonCode: 'user_request' });
  assert.equal((await repo.list()).length, 0);
  const restarted = new LocalJobRepository({ filePath, now: () => new Date('2026-08-15T00:00:00.000Z') });
  const restored = await restarted.restore({ jobId: created.id, expectedVersion: deleted.version, reasonCode: 'undo' });
  assert.equal(restored.deletedAt, undefined);
  assert.equal((await repo.list()).length, 1);
});
