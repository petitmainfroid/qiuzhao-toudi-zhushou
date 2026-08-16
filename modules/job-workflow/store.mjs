import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  JobDomainError, requireBoundedText, requireEnum, requireExactKeys, requireIdentifier
} from '../job-contracts/index.mjs';
import { WORKFLOW_CHECKPOINTS, WORKFLOW_OUTCOMES } from './contracts.mjs';
import { jobWorkflowPath } from './paths.mjs';

const schemaVersion = 1;
const NO_MUTATION = Symbol('no_mutation');
const hashPattern = /^[a-f0-9]{64}$/;
const lockScopePattern = /^(?:workflow|job):[a-z][a-z0-9_-]{2,80}$/;

export class LocalJobWorkflowStore {
  #path;
  #now;
  #lockWaitMs;
  #writeQueue = Promise.resolve();

  constructor({ filePath = jobWorkflowPath(), now = () => new Date(), lockWaitMs = 2_000 } = {}) {
    this.#path = filePath;
    this.#now = now;
    this.#lockWaitMs = lockWaitMs;
  }

  async ensureStart({ workflowId, inputHash }) {
    requireIdentifier(workflowId, 'workflowId');
    requireHash(inputHash, 'inputHash');
    return this.#mutate((state) => {
      const existing = state.workflows.find((item) => item.workflowId === workflowId);
      if (existing) {
        if (existing.inputHash !== inputHash) {
          throw new JobDomainError('request_conflict', 'This workflow requestId is already bound to different input');
        }
        return noMutation({ created: false, workflow: publicWorkflow(existing) });
      }
      const at = isoNow(this.#now);
      const workflow = {
        workflowId, inputHash, state: 'queued', checkpoint: 'discovery_pending', version: 0,
        blocker: undefined, jobIds: [], rankingHash: undefined, rankingSummary: undefined,
        reviews: [], applicationGates: [], commands: [],
        attempts: { discovery: 0, ranking: 0, applicationPreparation: 0 },
        counters: { repositoryWrites: 0, semanticCalls: 0, externalActions: 0, pageWrites: 0, submissions: 0, credentialReads: 0 },
        createdAt: at, updatedAt: at
      };
      state.workflows.push(workflow);
      appendEvent(state, workflowId, 'workflow_created', 'workflow_created', this.#now);
      return { created: true, workflow: publicWorkflow(workflow) };
    });
  }

  async get(workflowId) {
    requireIdentifier(workflowId, 'workflowId');
    const workflow = (await this.#read()).workflows.find((item) => item.workflowId === workflowId);
    return workflow ? publicWorkflow(workflow) : undefined;
  }

  async list() {
    return Object.freeze((await this.#read()).workflows.map(publicWorkflow));
  }

  async events(workflowId) {
    requireIdentifier(workflowId, 'workflowId');
    return Object.freeze((await this.#read()).events
      .filter((event) => event.workflowId === workflowId)
      .map((event) => Object.freeze({ ...event })));
  }

  async registerCommand({ workflowId, requestId, kind, inputHash }) {
    requireIdentifier(workflowId, 'workflowId');
    requireIdentifier(requestId, 'requestId');
    requireIdentifier(kind, 'command.kind');
    requireHash(inputHash, 'command.inputHash');
    return this.#mutate((state) => {
      const workflow = findWorkflow(state, workflowId);
      const existing = workflow.commands.find((item) => item.requestId === requestId);
      if (existing) {
        if (existing.kind !== kind || existing.inputHash !== inputHash) {
          throw new JobDomainError('request_conflict', 'This command requestId is already bound to different input');
        }
        return noMutation({ reused: true, workflow: publicWorkflow(workflow) });
      }
      workflow.commands.push({ requestId, kind, inputHash });
      touch(workflow, this.#now);
      return { reused: false, workflow: publicWorkflow(workflow) };
    });
  }

  async update(workflowId, operation) {
    requireIdentifier(workflowId, 'workflowId');
    if (typeof operation !== 'function') throw new JobDomainError('invalid_input', 'workflow update must be a function');
    return this.#mutate((state) => {
      const workflow = findWorkflow(state, workflowId);
      const outcome = operation(workflow);
      if (!outcome || outcome.changed === false) return noMutation(publicWorkflow(workflow));
      if (outcome.event) {
        requireIdentifier(outcome.event.type, 'workflowEvent.type');
        const reasonCode = requireBoundedText(outcome.event.reasonCode, 'workflowEvent.reasonCode', { max: 80 });
        appendEvent(state, workflowId, outcome.event.type, reasonCode, this.#now);
      }
      workflow.version += 1;
      touch(workflow, this.#now);
      validateWorkflowRecord(workflow);
      return publicWorkflow(workflow);
    });
  }

  async withRunLock(scope, operation) {
    if (typeof scope !== 'string' || !lockScopePattern.test(scope)) {
      throw new JobDomainError('invalid_input', 'Workflow lock scope is invalid');
    }
    if (typeof operation !== 'function') throw new JobDomainError('invalid_input', 'Workflow lock operation is invalid');
    const digest = createHash('sha256').update(scope).digest('hex');
    const lockPath = `${this.#path}.locks${path.sep}${digest}.lock`;
    return withFileLock(lockPath, this.#lockWaitMs, operation, 'workflow_busy');
  }

  async safetyAudit() {
    const state = await this.#read();
    const forbidden = /password|passwd|cookie|authorization|bearer|captcha|otp|sms_?code|selector|script|raw_?html|profile_?value|message_?body|screenshot|ocr/i;
    const hits = new Set();
    const visit = (value, key = '') => {
      if (forbidden.test(key)) hits.add(key.toLowerCase());
      if (Array.isArray(value)) return value.forEach((item) => visit(item));
      if (value && typeof value === 'object') return Object.entries(value).forEach(([nestedKey, nested]) => visit(nested, nestedKey));
      if (typeof value === 'string' && /(?:data:image|<script\b|<form\b|[a-z]:\\users\\)/i.test(value)) hits.add('value_payload');
      return undefined;
    };
    visit(state);
    return Object.freeze({
      scannedWorkflows: state.workflows.length,
      scannedEvents: state.events.length,
      hitCount: hits.size,
      categories: Object.freeze([...hits].sort())
    });
  }

  async #mutate(operation) {
    const run = this.#writeQueue.then(() => withFileLock(`${this.#path}.lock`, this.#lockWaitMs, async () => {
      const state = await this.#read();
      const result = await operation(state);
      if (result?.[NO_MUTATION]) return result.value;
      state.revision += 1;
      await writeAtomic(this.#path, state);
      return result;
    }, 'workflow_store_busy'));
    this.#writeQueue = run.catch(() => undefined);
    return run;
  }

  async #read() {
    try {
      const parsed = JSON.parse(await readFile(this.#path, 'utf8'));
      if (!parsed || parsed.schemaVersion !== schemaVersion || !Number.isSafeInteger(parsed.revision)
        || !Array.isArray(parsed.workflows) || !Array.isArray(parsed.events)) throw new Error('invalid');
      requireExactKeys(parsed, ['schemaVersion', 'revision', 'workflows', 'events'], 'storedWorkflowState');
      parsed.workflows.forEach(validateWorkflowRecord);
      parsed.events.forEach(validateWorkflowEvent);
      return parsed;
    } catch (error) {
      if (error?.code === 'ENOENT') return { schemaVersion, revision: 0, workflows: [], events: [] };
      throw new JobDomainError('storage_corrupt', 'The local workflow store could not be read safely');
    }
  }
}

function validateWorkflowRecord(workflow) {
  requireExactKeys(workflow, [
    'workflowId', 'inputHash', 'state', 'checkpoint', 'version', 'blocker', 'jobIds',
    'rankingHash', 'rankingSummary', 'reviews', 'applicationGates', 'commands',
    'attempts', 'counters', 'createdAt', 'updatedAt'
  ], 'storedWorkflow');
  requireIdentifier(workflow.workflowId, 'storedWorkflow.workflowId');
  requireHash(workflow.inputHash, 'storedWorkflow.inputHash');
  requireEnum(workflow.state, WORKFLOW_OUTCOMES, 'storedWorkflow.state');
  requireEnum(workflow.checkpoint, WORKFLOW_CHECKPOINTS, 'storedWorkflow.checkpoint');
  if (!Number.isSafeInteger(workflow.version) || workflow.version < 0
    || !Array.isArray(workflow.jobIds) || !Array.isArray(workflow.reviews)
    || !Array.isArray(workflow.applicationGates) || !Array.isArray(workflow.commands)) {
    throw new JobDomainError('storage_corrupt', 'The local workflow record is invalid');
  }
  workflow.jobIds.forEach((jobId) => requireIdentifier(jobId, 'storedWorkflow.jobIds[]'));
  if (new Set(workflow.jobIds).size !== workflow.jobIds.length) throw new JobDomainError('storage_corrupt', 'Stored workflow job IDs are duplicated');
  if (workflow.blocker !== undefined) requireIdentifier(workflow.blocker, 'storedWorkflow.blocker');
  if (workflow.rankingHash !== undefined) requireHash(workflow.rankingHash, 'storedWorkflow.rankingHash');
  requireExactKeys(workflow.attempts, ['discovery', 'ranking', 'applicationPreparation'], 'storedWorkflow.attempts');
  requireNonNegativeIntegers(Object.values(workflow.attempts), 'storedWorkflow.attempts');
  requireExactKeys(workflow.counters, [
    'repositoryWrites', 'semanticCalls', 'externalActions', 'pageWrites', 'submissions', 'credentialReads'
  ], 'storedWorkflow.counters');
  requireNonNegativeIntegers(Object.values(workflow.counters), 'storedWorkflow.counters');
  const reviewed = new Set();
  for (const item of workflow.reviews) {
    requireExactKeys(item, ['jobId', 'decision'], 'storedWorkflow.reviews[]');
    requireIdentifier(item.jobId, 'storedWorkflow.reviews[].jobId');
    requireEnum(item.decision, ['approve', 'reject', 'manual'], 'storedWorkflow.reviews[].decision');
    if (!workflow.jobIds.includes(item.jobId) || reviewed.has(item.jobId)) throw new JobDomainError('storage_corrupt', 'Stored workflow reviews are invalid');
    reviewed.add(item.jobId);
  }
  const gated = new Set();
  for (const item of workflow.applicationGates) {
    requireExactKeys(item, ['jobId', 'state'], 'storedWorkflow.applicationGates[]');
    requireIdentifier(item.jobId, 'storedWorkflow.applicationGates[].jobId');
    requireEnum(item.state, ['authorization_required'], 'storedWorkflow.applicationGates[].state');
    if (!workflow.jobIds.includes(item.jobId) || gated.has(item.jobId)) throw new JobDomainError('storage_corrupt', 'Stored workflow application gates are invalid');
    gated.add(item.jobId);
  }
  const commandIds = new Set();
  for (const item of workflow.commands) {
    requireExactKeys(item, ['requestId', 'kind', 'inputHash'], 'storedWorkflow.commands[]');
    requireIdentifier(item.requestId, 'storedWorkflow.commands[].requestId');
    requireEnum(item.kind, ['ranking_submit', 'review_decide', 'application_prepare', 'workflow_cancel'], 'storedWorkflow.commands[].kind');
    requireHash(item.inputHash, 'storedWorkflow.commands[].inputHash');
    if (commandIds.has(item.requestId)) throw new JobDomainError('storage_corrupt', 'Stored command request IDs are duplicated');
    commandIds.add(item.requestId);
  }
  if (workflow.rankingSummary !== undefined) validateRankingSummary(workflow.rankingSummary);
  validateTimestamp(workflow.createdAt, 'storedWorkflow.createdAt');
  validateTimestamp(workflow.updatedAt, 'storedWorkflow.updatedAt');
  return workflow;
}

function validateRankingSummary(summary) {
  requireExactKeys(summary, ['annotated', 'terminalCount', 'counts', 'semanticCalls', 'repositoryWrites'], 'storedWorkflow.rankingSummary');
  requireNonNegativeIntegers([
    summary.annotated, summary.terminalCount, summary.semanticCalls, summary.repositoryWrites
  ], 'storedWorkflow.rankingSummary');
  requireExactKeys(summary.counts, ['pass', 'reject', 'review', 'failed', 'budget_exhausted'], 'storedWorkflow.rankingSummary.counts');
  requireNonNegativeIntegers(Object.values(summary.counts), 'storedWorkflow.rankingSummary.counts');
}

function validateWorkflowEvent(event) {
  requireExactKeys(event, ['eventId', 'workflowId', 'type', 'reasonCode', 'at'], 'storedWorkflowEvent');
  requireIdentifier(event.eventId, 'storedWorkflowEvent.eventId');
  requireIdentifier(event.workflowId, 'storedWorkflowEvent.workflowId');
  requireIdentifier(event.type, 'storedWorkflowEvent.type');
  requireBoundedText(event.reasonCode, 'storedWorkflowEvent.reasonCode', { max: 80 });
  validateTimestamp(event.at, 'storedWorkflowEvent.at');
}

function requireNonNegativeIntegers(values, name) {
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new JobDomainError('storage_corrupt', `${name} must contain non-negative integers`);
  }
}

function validateTimestamp(value, name) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new JobDomainError('storage_corrupt', `${name} is invalid`);
}

function findWorkflow(state, workflowId) {
  const workflow = state.workflows.find((item) => item.workflowId === workflowId);
  if (!workflow) throw new JobDomainError('workflow_not_found', 'The workflow was not found');
  return workflow;
}

function publicWorkflow(workflow) {
  return Object.freeze({
    workflowId: workflow.workflowId,
    state: workflow.state,
    checkpoint: workflow.checkpoint,
    version: workflow.version,
    ...(workflow.blocker ? { blocker: workflow.blocker } : {}),
    jobIds: Object.freeze([...workflow.jobIds]),
    attempts: Object.freeze({ ...workflow.attempts }),
    counters: Object.freeze({ ...workflow.counters }),
    ...(workflow.rankingSummary ? { rankingSummary: Object.freeze({ ...workflow.rankingSummary, counts: Object.freeze({ ...workflow.rankingSummary.counts }) }) } : {}),
    reviews: Object.freeze(workflow.reviews.map((item) => Object.freeze({ ...item }))),
    applicationGates: Object.freeze(workflow.applicationGates.map((item) => Object.freeze({ ...item }))),
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt
  });
}

function appendEvent(state, workflowId, type, reasonCode, now) {
  state.events.push({
    eventId: `wfe_${randomUUID().replaceAll('-', '')}`,
    workflowId,
    type,
    reasonCode,
    at: isoNow(now)
  });
}

function touch(workflow, now) { workflow.updatedAt = isoNow(now); }
function isoNow(now) { return now().toISOString(); }
function noMutation(value) { return { [NO_MUTATION]: true, value }; }
function requireHash(value, name) {
  if (typeof value !== 'string' || !hashPattern.test(value)) throw new JobDomainError('invalid_input', `${name} must be a SHA-256 digest`);
  return value;
}

async function writeAtomic(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, filePath);
}

async function withFileLock(lockPath, waitMs, operation, busyCode) {
  const deadline = Date.now() + waitMs;
  await mkdir(path.dirname(lockPath), { recursive: true });
  const owner = JSON.stringify({ pid: process.pid, nonce: randomUUID(), createdAt: Date.now() });
  while (true) {
    let handle;
    try {
      handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(owner);
      await handle.close();
      break;
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if (error?.code !== 'EEXIST') throw new JobDomainError('storage_unavailable', 'The workflow lock could not be created');
      const recoverable = await recoverableLockContents(lockPath, waitMs);
      if (recoverable !== undefined) {
        await unlinkIfUnchanged(lockPath, recoverable).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline) throw new JobDomainError(busyCode, 'The workflow is busy; retry shortly');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  try {
    return await operation();
  } finally {
    try {
      if (await readFile(lockPath, 'utf8') === owner) await unlink(lockPath);
    } catch {}
  }
}

async function recoverableLockContents(lockPath, waitMs) {
  try {
    const raw = await readFile(lockPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Number.isSafeInteger(parsed.pid) && parsed.pid > 0 && !processAlive(parsed.pid)) return raw;
    return Date.now() - (await stat(lockPath)).mtimeMs > Math.max(waitMs * 4, 30_000) ? raw : undefined;
  } catch {
    try {
      return Date.now() - (await stat(lockPath)).mtimeMs > Math.max(waitMs * 4, 30_000)
        ? await readFile(lockPath, 'utf8') : undefined;
    } catch { return undefined; }
  }
}

async function unlinkIfUnchanged(lockPath, expected) {
  if (await readFile(lockPath, 'utf8') === expected) await unlink(lockPath);
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}
