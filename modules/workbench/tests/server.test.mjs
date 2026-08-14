import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbenchServer } from '../cli.mjs';

test('local workbench requires one-time bootstrap and renders escaped cards', async () => {
  const host = await createWorkbenchServer({ loadCards: async () => [{ jobId: 'job_1', title: '<Engineer>', company: 'Example', location: 'Shanghai', link: 'https://www.zhipin.com/c1-p2/', jd: 'JD', state: 'discovered', requiresReview: false }] });
  try {
    const bootstrap = await fetch(host.url, { redirect: 'manual' }); assert.equal(bootstrap.status, 303); const cookie = bootstrap.headers.get('set-cookie'); assert.ok(cookie);
    const root = await fetch(new URL('/', host.url), { headers: { Cookie: cookie } }); assert.equal(root.status, 200); const html = await root.text(); assert.match(html, /&lt;Engineer&gt;/); assert.match(html, /岗位工作台/);
    assert.equal((await fetch(host.url, { redirect: 'manual' })).status, 404);
  } finally { await host.close(); }
});
