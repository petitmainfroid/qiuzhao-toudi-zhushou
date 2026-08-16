import assert from 'node:assert/strict';
import test from 'node:test';
import { JobDomainError, requireHttpsJobUrl } from '../modules/job-contracts/index.mjs';
import { parseJobCandidate } from '../modules/job-repository/contracts.mjs';
import { parseDiscoveryRequest, parseVisualComparisonOutcome, parseZhilianInventoryRequest } from '../modules/job-discovery/contracts.mjs';
import { freezeZhilianInventory } from '../modules/job-discovery/inventory.mjs';
import { observeZhilianInventory } from '../modules/job-discovery/observer.mjs';
import { discoverZhilianCandidates } from '../modules/job-discovery/zhilian-adapter.mjs';
import { parseRankingRequest } from '../modules/job-ranking/contracts.mjs';
import { parseConversationAction } from '../modules/conversation-service/contracts.mjs';
import { parseWorkflowCommand } from '../modules/job-workflow/contracts.mjs';
import { parseWorkbenchCommand } from '../apps/workbench/contracts.mjs';
import { parseJobAgentIntent } from '../skills/job-hunting/contracts.mjs';

test('job contracts accept only their closed, intent-level inputs', () => {
  assert.deepEqual(parseJobCandidate({ source: 'campus', jobUrl: 'https://jobs.example.com/a?tracking=1#top', title: '软件工程师', company: '示例公司', description: '职位描述' }), { source: 'campus', jobUrl: 'https://jobs.example.com/a', title: '软件工程师', company: '示例公司', description: '职位描述' });
  assert.equal(parseDiscoveryRequest({ source: 'boss', keywords: '后端', city: '上海', limit: 5 }).limit, 5);
  assert.equal(parseRankingRequest({
    requestId: 'rank-001',
    policy: {
      policyId: 'policy-001', targetRoleTerms: ['product manager'], excludedTerms: [],
      acceptedCities: [], acceptedJobTypes: [], minimumMonthlySalaryK: 0
    },
    items: [{ jobId: 'job-001', facts: { city: null, jobType: 'unknown', monthlySalaryMinK: null } }],
    capabilityCatalog: [], maxSemanticCalls: 1, perItemTimeoutMs: 100, deadlineMs: 1_000
  }).requestId, 'rank-001');
  assert.equal(parseConversationAction({ jobId: 'job-001', planId: 'plan-001', requestId: 'request-001' }).planId, 'plan-001');
  assert.equal(parseWorkflowCommand({ jobId: 'job-001', requestId: 'request-001', stage: 'rank' }).stage, 'rank');
  assert.equal(parseWorkbenchCommand({ jobId: 'job-001', requestId: 'request-001', intent: 'open_review' }).intent, 'open_review');
  assert.equal(parseJobAgentIntent({ intent: 'search_start', requestId: 'request-001' }).intent, 'search_start');
});

test('Z001 zhilian inventory and screenshot evidence contracts stay bounded and devalued', async () => {
  const request = parseZhilianInventoryRequest({
    keywords: '后端工程师', city: '上海', maxPages: 2, maxCards: 20,
    maxDetails: 5, maxScrolls: 6, deadlineMs: 60_000
  });
  assert.equal(request.source, 'zhilian');
  assert.equal(request.maxDetails, 5);
  const evidence = parseVisualComparisonOutcome({
    annotated: 10, eligible: 8, attempted: 6, booleanVerified: 6,
    screenshotVerified: 5, manualRequired: 4
  });
  assert.equal(evidence.verified, 5);
  const { source: _source, ...publicRequest } = request;
  assert.throws(() => parseZhilianInventoryRequest({ ...publicRequest, selector: '.job-card' }), /not supported/);
  assert.throws(() => parseVisualComparisonOutcome({ annotated: 1, eligible: 1, attempted: 1, booleanVerified: 1, screenshotVerified: 1, manualRequired: 0, screenshotPath: 'secret.png' }), /not supported/);
  assert.throws(() => parseZhilianInventoryRequest({ ...publicRequest, maxPages: 4 }), /maxPages/);
  const inventory = freezeZhilianInventory(request, [
    { kind: 'search', state: 'candidate' }, { kind: 'search', state: 'candidate' },
    { kind: 'detail', state: 'manual_required' }
  ]);
  assert.deepEqual(inventory, {
    source: 'zhilian', annotated: 3, searchCount: 2, detailCount: 1,
    terminal: { candidate: 2, login_required: 0, verification_required: 0, page_drift: 0, manual_required: 1, failed: 0 },
    complete: true, writes: 0, submissions: 0, credentialReads: 0
  });
  assert.throws(() => freezeZhilianInventory(request, [{ kind: 'search', state: 'candidate', title: 'leak' }]), /not supported/);
  const stopped = await observeZhilianInventory(request, { observePage: async () => [{ kind: 'search', state: 'verification_required' }] });
  assert.equal(stopped.terminal.verification_required, 1);
  await assert.rejects(() => observeZhilianInventory(request), /observer_unavailable/);
});

test('Z002 source-isolated Zhilian adapter deduplicates and fails closed', async () => {
  const request = parseZhilianInventoryRequest({ keywords: '算法', city: '北京', maxPages: 2, maxCards: 5, maxDetails: 0, maxScrolls: 0, deadlineMs: 10_000 });
  const first = { jobUrl: 'https://www.zhaopin.com/jobdetail/a.htm?trace=1', title: '算法工程师', company: '示例公司', description: '负责算法开发' };
  const result = await discoverZhilianCandidates(request, { readPage: async ({ page }) => page === 1 ? { candidates: [first, { ...first, jobUrl: 'https://www.zhaopin.com/jobdetail/a.htm' }] } : { candidates: [] } });
  assert.equal(result.candidates.length, 1);
  assert.deepEqual({ blocker: result.blocker, writes: result.writes, submissions: result.submissions, credentialReads: result.credentialReads }, { blocker: undefined, writes: 0, submissions: 0, credentialReads: 0 });
  const blocked = await discoverZhilianCandidates(request, { readPage: async () => ({ blocker: 'verification_required' }) });
  assert.equal(blocked.blocker, 'verification_required');
  const times = [0, 0, 10_000];
  let privateBudget;
  const timedOut = await discoverZhilianCandidates(request, {
    now: () => times.shift() ?? 10_000,
    readPage: async (budget) => { privateBudget = budget; return { candidates: [first] }; }
  });
  assert.equal(privateBudget.deadlineMs, 10_000);
  assert.equal(timedOut.blocker, 'rate_limited');
  assert.equal(timedOut.candidates.length, 0);
  const transportTimeout = await discoverZhilianCandidates(request, { readPage: async () => { throw new Error('cdp_command_timeout'); } });
  assert.equal(transportTimeout.blocker, 'rate_limited');
  await assert.rejects(discoverZhilianCandidates(request, { readPage: async () => ({ candidates: [{ ...first, jobUrl: 'https://example.com/x' }] }) }), /origin_invalid/);
});

test('job contracts reject browser escape hatches, credentials, and unknown fields', () => {
  assert.throws(() => parseDiscoveryRequest({ source: 'boss', keywords: '后端', city: '上海', limit: 5, selector: '.card' }), /not supported/);
  assert.throws(() => parseConversationAction({ jobId: 'job-001', planId: 'plan-001', requestId: 'request-001', message: '发送这句话' }), /not supported/);
  assert.throws(() => requireHttpsJobUrl('https://name:secret@example.com/job'), JobDomainError);
  assert.throws(() => parseJobCandidate({ source: 'campus', jobUrl: 'https://jobs.example.com/a', title: 'x', company: 'x', description: 'x', cookie: 'secret' }), /not supported/);
});
