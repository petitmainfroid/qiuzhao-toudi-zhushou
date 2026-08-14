#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';

const EXPECTED_TOOLS = Object.freeze([
  'application_audit',
  'application_execute',
  'application_inspect',
  'application_plan',
  'workflow_cancel',
  'workspace_status'
]);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function main() {
  const entry = path.resolve(process.argv[2] ?? '');
  if (!process.argv[2] || path.basename(entry) !== 'cli.mjs') throw new Error('mcp_entry_required');

  const child = spawn(process.execPath, [entry, 'serve'], {
    cwd: path.resolve(path.dirname(entry), '..', '..'),
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-2048); });

  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity, terminal: false });
  const timeout = setTimeout(() => {
    child.kill();
    fail('mcp_handshake_timeout');
  }, 30_000);

  try {
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'qiuzhao-skill-verifier', version: '1.0.0' } }
    })}\n`);

    for await (const line of lines) {
      const response = JSON.parse(line);
      if (response.id === 1) {
        if (response.error || response.result?.serverInfo?.name !== 'qiuzhao-local-agent') {
          throw new Error('mcp_initialize_failed');
        }
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
        continue;
      }
      if (response.id !== 2) continue;
      if (response.error || !Array.isArray(response.result?.tools)) throw new Error('mcp_tools_list_failed');
      const names = response.result.tools.map((tool) => tool?.name).sort();
      if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) throw new Error('mcp_tool_set_mismatch');
      process.stdout.write(`${JSON.stringify({
        server: response.result?.serverInfo?.name ?? 'qiuzhao-local-agent',
        transport: 'stdio',
        toolCount: names.length,
        tools: names
      })}\n`);
      return;
    }
    throw new Error(`mcp_server_closed${stderr ? '_with_error' : ''}`);
  } finally {
    clearTimeout(timeout);
    lines.close();
    child.stdin.end();
    child.kill();
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : 'mcp_verification_failed'));
