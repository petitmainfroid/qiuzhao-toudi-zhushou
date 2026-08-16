import assert from 'node:assert/strict';
import test from 'node:test';
import { MCP_TOOL_NAMES } from '../modules/mcp-server/tool-registry.mjs';
import {
  parseWorkflowApplicationPreparation,
  parseWorkflowRanking,
  parseWorkflowStart
} from '../modules/job-workflow/contracts.mjs';
import { JobHuntingAgentService } from '../skills/job-hunting/service.mjs';
import { JobHuntingMcpServer } from '../skills/job-hunting/server.mjs';
import { JOB_AGENT_TOOL_NAMES, JOB_AGENT_TOOLS } from '../skills/job-hunting/tool-registry.mjs';

test('job Agent contracts reject browser escape hatches, scalar profile values, and authorization creation', () => {
  const start = {
    requestId: 'workflow-request-001',
    discovery: { keywords: 'AI', city: 'Shanghai', maxPages: 1, maxCards: 1, maxDetails: 1, maxScrolls: 0, deadlineMs: 10_000 }
  };
  assert.equal(parseWorkflowStart(start).requestId, 'workflow-request-001');
  assert.throws(() => parseWorkflowStart({ ...start, selector: '.job' }), /not supported/);
  assert.throws(() => parseWorkflowStart({ ...start, discovery: { ...start.discovery, targetId: 'target-001' } }), /not supported/);
  assert.throws(() => parseWorkflowApplicationPreparation({
    workflowId: 'workflow-request-001', requestId: 'prepare-request-001', jobId: 'job-001', grantAuthorization: true
  }), /not supported/);
  const ranking = {
    workflowId: 'workflow-request-001', requestId: 'ranking-request-001',
    policy: { policyId: 'policy-001', targetRoleTerms: ['AI'], excludedTerms: [], acceptedCities: [], acceptedJobTypes: [], minimumMonthlySalaryK: 0 },
    items: [{
      jobId: 'job-001', facts: { city: null, jobType: 'unknown', monthlySalaryMinK: null },
      decision: { outcome: 'review', score: 50, reasonCode: 'semantic_insufficient_evidence' }
    }],
    capabilityCatalog: [{ capabilityId: 'education', hasValue: true }],
    maxSemanticCalls: 1, perItemTimeoutMs: 100, deadlineMs: 1_000
  };
  assert.equal(parseWorkflowRanking(ranking).decisions.length, 1);
  assert.throws(() => parseWorkflowRanking({
    ...ranking,
    capabilityCatalog: [{ capabilityId: 'education', hasValue: true, profileValue: 'private' }]
  }), /not supported/);
  assert.throws(() => parseWorkflowRanking({
    ...ranking,
    items: [{ ...ranking.items[0], decision: { outcome: 'pass', score: 10, reasonCode: 'semantic_strong_match' } }]
  }), /inconsistent/);
});

test('job Agent MCP is a separate intent namespace over the shared workflow service', async () => {
  const calls = [];
  const workflow = Object.fromEntries([
    ['workspaceStatus', 'workspace'], ['start', 'start'], ['submitRanking', 'ranking'],
    ['reviewQueue', 'queue'], ['recordReview', 'review'], ['prepareApplication', 'prepare'],
    ['status', 'status'], ['cancel', 'cancel']
  ].map(([method, result]) => [method, async (input) => { calls.push({ method, input }); return { result }; }]));
  const agentService = new JobHuntingAgentService({ workflow });
  const server = new JobHuntingMcpServer({ agentService });
  const initialized = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(initialized.result.serverInfo.name, 'qiuzhao-job-hunting-agent');
  await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const listed = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), JOB_AGENT_TOOL_NAMES);
  assert.equal(JOB_AGENT_TOOL_NAMES.some((name) => MCP_TOOL_NAMES.includes(name)), false);
  assert.equal(MCP_TOOL_NAMES.length, 6);
  const called = await server.handle({
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'job_workspace_status', arguments: {} }
  });
  assert.equal(called.result.structuredContent.result, 'workspace');
  assert.deepEqual(calls, [{ method: 'workspaceStatus', input: {} }]);
  assert.equal(JSON.stringify(JOB_AGENT_TOOLS).includes('profileValue'), false);
  assert.equal(JSON.stringify(JOB_AGENT_TOOLS).includes('grantAuthorization'), false);
  assert.equal(JSON.stringify(JOB_AGENT_TOOLS).includes('final_submit'), false);
});
