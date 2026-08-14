import test from 'node:test';
import assert from 'node:assert/strict';
import { collectVisibleBossCards, diagnoseVisibleBossStructure, discoveryManifest } from '../src/browser-collector.mjs';

test('visible collector accepts only fixed current BOSS result-page cards', async () => {
  const cdp = { send: async () => ({ result: { value: { kind: 'ok', cards: [
    { title: 'Engineer', company: 'Example', location: 'Shanghai', description: 'JD', path: '/job_detail/a-1', sourceJobRef: '/job_detail/a-1' },
    { title: 'Duplicate', company: 'Example', location: 'Shanghai', description: 'JD', path: '/job_detail/a-1', sourceJobRef: '/job_detail/a-1' },
    { title: 'New route', company: 'Example', location: 'Shanghai', description: 'JD', path: '/c1234-p5678', sourceJobRef: '/c1234-p5678' },
    { title: 'Bad', company: 'Example', location: 'Shanghai', description: 'JD', path: '/job_detail/a?token=x', sourceJobRef: 'x' }
  ] } } }) };
  const result = await collectVisibleBossCards({ cdp, connection: { origin: 'https://www.zhipin.com', pathPattern: '/web/geek/job' } });
  assert.equal(result.kind, 'ok'); assert.equal(result.cards.length, 2); assert.equal(result.cards[0].path, '/job_detail/a-1'); assert.match(result.cards[0].sourceJobRef, /^boss_[a-f0-9]{32}$/);
  assert.equal(typeof discoveryManifest({ observedCount: 1, recordCount: 1, createdCount: 1, refreshedCount: 0 }).digest, 'string');
});

test('visible collector fails closed outside the approved page identity', async () => {
  const result = await collectVisibleBossCards({ cdp: { send: async () => { throw new Error('must_not_run'); } }, connection: { origin: 'https://www.zhipin.com', pathPattern: '/' } });
  assert.deepEqual(result, { kind: 'blocked', reason: 'page_drift', cards: [] });
});

test('structure diagnosis exposes only bounded route counts', async () => {
  const cdp = { send: async () => ({ result: { value: { kind: 'ok', anchors: 4, prefixes: [{ path: '/job_detail/:id', count: 2 }, { path: '/web/geek', count: 2 }], shapes: ['/c:id-p:id/'] } } }) };
  const result = await diagnoseVisibleBossStructure({ cdp, connection: { origin: 'https://www.zhipin.com', pathPattern: '/web/geek/job' } });
  assert.deepEqual(result, { kind: 'ok', anchors: 4, prefixes: [{ path: '/job_detail/:id', count: 2 }, { path: '/web/geek', count: 2 }], shapes: ['/c:id-p:id/'] });
});
