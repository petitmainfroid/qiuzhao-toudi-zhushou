import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultApplicationRoot } from './authorization-store.mjs';

const TERMINAL = new Set(['idle', 'completed', 'cancelled', 'needs_replan', 'user_action_required', 'failed']);

export function defaultWorkflowLedgerFile(env = process.env) {
  return path.join(defaultApplicationRoot(env), 'application-service', 'workflow-ledger.json');
}

function cleanState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) return undefined;
  if (typeof value.status !== 'string' || (!TERMINAL.has(value.status) && value.status !== 'running')) return undefined;
  if (!Array.isArray(value.completedRequests) || value.completedRequests.length > 64) return undefined;
  return value;
}

export class WorkflowLedger {
  constructor({ filePath = defaultWorkflowLedgerFile(), createId = () => crypto.randomUUID() } = {}) {
    this.filePath = filePath;
    this.createId = createId;
  }

  async load() {
    try {
      const parsed = cleanState(JSON.parse(await readFile(this.filePath, 'utf8')));
      if (!parsed) return { schemaVersion: 1, status: 'idle', completedRequests: [] };
      if (parsed.status === 'running') return { ...parsed, status: 'needs_replan', planId: undefined };
      return parsed;
    } catch {
      return { schemaVersion: 1, status: 'idle', completedRequests: [] };
    }
  }

  async save(state) {
    const safe = {
      schemaVersion: 1,
      status: state.status,
      ...(state.jobId ? { jobId: state.jobId } : {}),
      ...(state.origin ? { origin: state.origin } : {}),
      ...(state.profileVersion ? { profileVersion: state.profileVersion } : {}),
      ...(Number.isSafeInteger(state.round) ? { round: state.round } : {}),
      ...(state.planId ? { planId: state.planId } : {}),
      updatedAt: new Date().toISOString(),
      completedRequests: (state.completedRequests ?? []).slice(-64).map((entry) => ({
        requestId: entry.requestId,
        digest: entry.digest,
        response: entry.response
      }))
    };
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.${process.pid}.${this.createId().replaceAll('-', '')}.tmp`;
    await writeFile(temporary, `${JSON.stringify(safe)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, this.filePath);
    return safe;
  }
}
