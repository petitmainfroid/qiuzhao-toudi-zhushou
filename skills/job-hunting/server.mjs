import { createInterface } from 'node:readline';
import { JOB_AGENT_TOOLS, createJobAgentToolHandlers } from './tool-registry.mjs';

const JSONRPC_VERSION = '2.0';
const MCP_PROTOCOL_VERSION = '2025-06-18';

function success(id, result) { return { jsonrpc: JSONRPC_VERSION, id, result }; }
function failure(id, code, message) { return { jsonrpc: JSONRPC_VERSION, id, error: { code, message } }; }
function publicError(error) { return { code: typeof error?.code === 'string' ? error.code : 'internal_error' }; }

export class JobHuntingMcpServer {
  constructor({ agentService }) {
    this.handlers = createJobAgentToolHandlers(agentService);
    this.initialized = false;
  }

  async handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)
      || message.jsonrpc !== JSONRPC_VERSION || typeof message.method !== 'string') {
      return failure(message?.id ?? null, -32600, 'Invalid Request');
    }
    if (message.method === 'initialize') {
      return success(message.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'qiuzhao-job-hunting-agent', version: '0.1.0' }
      });
    }
    if (message.method === 'notifications/initialized') { this.initialized = true; return undefined; }
    if (!this.initialized) return failure(message.id ?? null, -32002, 'Server not initialized');
    if (message.method === 'tools/list') return success(message.id, { tools: JOB_AGENT_TOOLS });
    if (message.method !== 'tools/call') return failure(message.id ?? null, -32601, 'Method not found');
    const params = message.params;
    if (!params || typeof params !== 'object' || Array.isArray(params)
      || Object.keys(params).some((key) => key !== 'name' && key !== 'arguments')
      || typeof params.name !== 'string' || !this.handlers[params.name]
      || (params.arguments !== undefined && (typeof params.arguments !== 'object' || Array.isArray(params.arguments)))) {
      return failure(message.id ?? null, -32602, 'Invalid params');
    }
    try {
      const result = await this.handlers[params.name](params.arguments ?? {});
      return success(message.id, {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
        isError: false
      });
    } catch (error) {
      const result = publicError(error);
      return success(message.id, {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
        isError: true
      });
    }
  }
}

export async function serveJobHuntingStdio({ agentService, input = process.stdin, output = process.stdout } = {}) {
  const server = new JobHuntingMcpServer({ agentService });
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    let response;
    try { response = await server.handle(JSON.parse(line)); }
    catch { response = failure(null, -32700, 'Parse error'); }
    if (response) output.write(`${JSON.stringify(response)}\n`);
  }
}
