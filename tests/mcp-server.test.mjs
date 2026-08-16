import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { MCP_TOOL_NAMES, MCP_TOOLS, QiuzhaoMcpServer, serveStdio } from '../modules/mcp-server/index.mjs';

function fakeApplicationService() {
  const calls = [];
  const response = (name) => async (input = {}) => {
    calls.push({ name, input });
    return { tool: name, safe: true };
  };
  return {
    calls,
    async start() { calls.push({ name: 'start' }); },
    close() { calls.push({ name: 'close' }); },
    workspaceStatus: response('workspace_status'),
    inspect: response('application_inspect'),
    planApplication: response('application_plan'),
    execute: response('application_execute'),
    audit: response('application_audit'),
    cancel: response('workflow_cancel')
  };
}

test('MCP registers exactly six closed tools and no authorization or arbitrary-browser surface', () => {
  assert.deepEqual(MCP_TOOLS.map((tool) => tool.name), [...MCP_TOOL_NAMES]);
  assert.equal(MCP_TOOLS.length, 6);
  const publicSchema = JSON.stringify(MCP_TOOLS);
  for (const forbidden of ['"selector"', '"value"', '"script"', '"cookie"', '"lease"', '"authorization"', '"submit"']) {
    assert.equal(publicSchema.toLowerCase().includes(forbidden), false, forbidden);
  }
});

test('real JSON-RPC MCP handshake calls all six tools without a recruitment page', async () => {
  const service = fakeApplicationService();
  const server = new QiuzhaoMcpServer({ applicationService: service });
  const initialized = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'Codex', version: '1' } } });
  assert.equal(initialized.result.serverInfo.name, 'qiuzhao-local-agent');
  await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const listed = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [...MCP_TOOL_NAMES]);
  for (let index = 0; index < MCP_TOOL_NAMES.length; index += 1) {
    const result = await server.handle({
      jsonrpc: '2.0', id: index + 3, method: 'tools/call',
      params: { name: MCP_TOOL_NAMES[index], arguments: {} }
    });
    assert.equal(result.result.isError, false);
    assert.equal(result.result.structuredContent.tool, MCP_TOOL_NAMES[index]);
  }
  assert.deepEqual(service.calls.map((call) => call.name), [...MCP_TOOL_NAMES]);
});

test('stdio transport handles initialize, list, call, unknown tool, and parse failure', async () => {
  const service = fakeApplicationService();
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => { text += chunk.toString('utf8'); });
  const serving = serveStdio({ applicationService: service, input, output });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'workspace_status', arguments: {} } })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'grant_lease', arguments: {} } })}\n`);
  input.end('{broken\n');
  await serving;
  const messages = text.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(messages.length, 5);
  assert.equal(messages[2].result.structuredContent.safe, true);
  assert.equal(messages[3].error.code, -32602);
  assert.equal(messages[4].error.code, -32700);
  assert.equal(service.calls.at(0).name, 'start');
  assert.equal(service.calls.at(-1).name, 'close');
});

test('stdio MCP remains discoverable and reports recovery when application start has no CDP', async () => {
  const service = fakeApplicationService();
  service.start = async () => { service.calls.push({ name: 'start-offline' }); };
  service.workspaceStatus = async () => ({
    browser: {
      state: 'disconnected', errorCode: 'cdp_unavailable',
      recommendedAction: 'reconnect', recoveryCommand: 'qiuzhao browser reconnect'
    },
    profile: { state: 'ready' },
    authorization: { state: 'inactive', scope: 'none' },
    workflow: { status: 'idle', round: 0, recoverable: false }
  });
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => { text += chunk.toString('utf8'); });
  const serving = serveStdio({ applicationService: service, input, output });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'workspace_status', arguments: {} } })}\n`);
  input.end();
  await serving;
  const messages = text.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(messages[1].result.tools.length, 6);
  assert.equal(messages[2].result.structuredContent.browser.state, 'disconnected');
  assert.equal(messages[2].result.structuredContent.browser.recommendedAction, 'reconnect');
});

test('calls before initialization and malformed or malicious tool payloads fail closed', async () => {
  const service = fakeApplicationService();
  const server = new QiuzhaoMcpServer({ applicationService: service });
  assert.equal((await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).error.code, -32002);
  await server.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {} });
  await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const malformed = await server.handle({
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'application_execute', arguments: {}, selector: '#name' }
  });
  assert.equal(malformed.error.code, -32602);
  const unknown = await server.handle({
    jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'eval', arguments: { script: 'alert(1)' } }
  });
  assert.equal(unknown.error.code, -32602);
  assert.equal(service.calls.length, 0);
});
