import assert from 'node:assert/strict';
import test from 'node:test';
import { JobDomainError, requireHttpsJobUrl } from '../modules/job-contracts/index.mjs';
import { parseJobCandidate } from '../modules/job-repository/contracts.mjs';
import { parseDiscoveryRequest } from '../modules/job-discovery/contracts.mjs';
import { parseRankingRequest } from '../modules/job-ranking/contracts.mjs';
import { parseConversationAction } from '../modules/conversation-service/contracts.mjs';
import { parseWorkflowCommand } from '../modules/job-workflow/contracts.mjs';
import { parseWorkbenchCommand } from '../apps/workbench/contracts.mjs';
import { parseJobAgentIntent } from '../skills/job-hunting/contracts.mjs';

test('job contracts accept only their closed, intent-level inputs', () => {
  assert.deepEqual(parseJobCandidate({ source: 'campus', jobUrl: 'https://jobs.example.com/a?tracking=1#top', title: '软件工程师', company: '示例公司', description: '职位描述' }), { source: 'campus', jobUrl: 'https://jobs.example.com/a', title: '软件工程师', company: '示例公司', description: '职位描述' });
  assert.equal(parseDiscoveryRequest({ source: 'boss', keywords: '后端', city: '上海', limit: 5 }).limit, 5);
  assert.equal(parseRankingRequest({ jobId: 'job-001', capabilitySummary: 'Node.js' }).jobId, 'job-001');
  assert.equal(parseConversationAction({ jobId: 'job-001', planId: 'plan-001', requestId: 'request-001' }).planId, 'plan-001');
  assert.equal(parseWorkflowCommand({ jobId: 'job-001', requestId: 'request-001', stage: 'rank' }).stage, 'rank');
  assert.equal(parseWorkbenchCommand({ jobId: 'job-001', requestId: 'request-001', intent: 'open_review' }).intent, 'open_review');
  assert.equal(parseJobAgentIntent({ intent: 'discover_jobs', requestId: 'request-001' }).intent, 'discover_jobs');
});

test('job contracts reject browser escape hatches, credentials, and unknown fields', () => {
  assert.throws(() => parseDiscoveryRequest({ source: 'boss', keywords: '后端', city: '上海', limit: 5, selector: '.card' }), /not supported/);
  assert.throws(() => parseConversationAction({ jobId: 'job-001', planId: 'plan-001', requestId: 'request-001', message: '发送这句话' }), /not supported/);
  assert.throws(() => requireHttpsJobUrl('https://name:secret@example.com/job'), JobDomainError);
  assert.throws(() => parseJobCandidate({ source: 'campus', jobUrl: 'https://jobs.example.com/a', title: 'x', company: 'x', description: 'x', cookie: 'secret' }), /not supported/);
});
