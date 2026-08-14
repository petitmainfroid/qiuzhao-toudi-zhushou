import { createInterface } from 'node:readline';
import { MCP_TOOLS, createToolHandlers } from './tool-registry.mjs';

const JSONRPC_VERSION = '2.0';
const MCP_PROTOCOL_VERSION = '2025-06-18';

function errorData(error) {
  return { code: typeof error?.code === 'string' ? error.code : 'internal_error' };
}

function success(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

function failure(id, code, message, data) {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message, ...(data ? { data } : {}) } };
}

export class QiuzhaoMcpServer {
  constructor({ applicationService }) {
    this.applicationService = applicationService;
    this.handlers = createToolHandlers(applicationService);
    this.initialized = false;
  }

  async handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== JSONRPC_VERSION
      || typeof message.method !== 'string') {
      return failure(message?.id ?? null, -32600, 'Invalid Request');
    }
    if (message.method === 'notifications/initialized') {
      this.initialized = true;
      return undefined;
    }
    if (message.method === 'initialize') {
      if (message.params && (typeof message.params !== 'object' || Array.isArray(message.params))) {
        return failure(message.id ?? null, -32602, 'Invalid params');
      }
      return success(message.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'qiuzhao-local-agent', version: '0.1.0' }
      });
    }
    if (!this.initialized) return failure(message.id ?? null, -32002, 'Server not initialized');
    if (message.method === 'tools/list') return success(message.id, { tools: MCP_TOOLS });
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
      return success(message.id, {
        content: [{ type: 'text', text: JSON.stringify(errorData(error)) }],
        structuredContent: errorData(error),
        isError: true
      });
    }
  }
}

export async function serveStdio({ applicationService, input = process.stdin, output = process.stdout } = {}) {
  await applicationService.start();
  const server = new QiuzhaoMcpServer({ applicationService });
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    let response;
    try {
      response = await server.handle(JSON.parse(line));
    } catch {
      response = failure(null, -32700, 'Parse error');
    }
    if (response) output.write(`${JSON.stringify(response)}\n`);
  }
  applicationService.close();
}
