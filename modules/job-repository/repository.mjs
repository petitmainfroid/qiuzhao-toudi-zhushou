import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JOB_STATUSES, JobDomainError, requireBoundedText, requireEnum, requireExactKeys, requireExpectedVersion, requireIdentifier } from '../job-contracts/index.mjs';
import { parseJobCandidate, parseStatusTransition, sensitiveJobTextCategories } from './contracts.mjs';
import { jobRepositoryPath } from './paths.mjs';

const schemaVersion = 1;
const NO_MUTATION = Symbol('no_mutation');
const rankingOutcomes = Object.freeze(['pass', 'reject', 'review', 'failed', 'budget_exhausted']);
const allowedTransitions = Object.freeze({
  discovered: ['scored', 'review_required', 'rejected', 'closed', 'failed'],
  scored: ['review_required', 'approved', 'rejected', 'failed'],
  review_required: ['approved', 'rejected', 'closed', 'failed'],
  approved: ['filling', 'closed', 'failed'],
  filling: ['filled_pending_review', 'failed'],
  filled_pending_review: ['submitted_by_user', 'approved', 'closed', 'failed'],
  submitted_by_user: ['closed'],
  rejected: [], closed: [], failed: ['review_required', 'approved', 'closed']
});

export class JobRepositoryConflictError extends JobDomainError {
  constructor() { super('version_conflict', 'The job record changed; refresh before retrying'); this.name = 'JobRepositoryConflictError'; }
}

export class LocalJobRepository {
  #path;
  #now;
  #lockWaitMs;
  #writeQueue = Promise.resolve();

  constructor({ filePath = jobRepositoryPath(), now = () => new Date(), lockWaitMs = 2_000 } = {}) {
    this.#path = filePath;
    this.#now = now;
    this.#lockWaitMs = lockWaitMs;
  }

  async upsert(candidateInput) {
    const candidate = parseJobCandidate(candidateInput);
    return this.#mutate(async (state) => {
      const identity = normalizedJobIdentity(candidate);
      const existing = state.jobs.find((job) => job.identity === identity);
      if (existing) {
        if (!existing.deletedAt && sameCandidate(existing, candidate)) {
          return noMutation({ created: false, changed: false, job: publicJob(existing) });
        }
        if (existing.deletedAt) existing.deletedAt = undefined;
        existing.jobUrl = candidate.jobUrl;
        existing.title = candidate.title;
        existing.company = candidate.company;
        existing.description = candidate.description;
        existing.updatedAt = isoNow(this.#now);
        existing.version += 1;
        appendEvent(state, existing, 'job_refreshed', { reasonCode: 'source_reobserved' }, this.#now);
        return { created: false, changed: true, job: publicJob(existing) };
      }
      const now = isoNow(this.#now);
      const job = {
        id: jobId(identity), identity, source: candidate.source, jobUrl: candidate.jobUrl,
        title: candidate.title, company: candidate.company, description: candidate.description,
        status: 'discovered', version: 0, createdAt: now, updatedAt: now,
        protected: false, scoreSummary: undefined, deletedAt: undefined
      };
      state.jobs.push(job);
      appendEvent(state, job, 'job_created', { reasonCode: 'source_discovered' }, this.#now);
      return { created: true, changed: true, job: publicJob(job) };
    });
  }

  async transition(input) {
    const command = parseStatusTransition(input);
    return this.#mutate(async (state) => {
      const job = findActiveJob(state, command.jobId);
      assertVersion(job, command.expectedVersion);
      if (!allowedTransitions[job.status].includes(command.nextStatus)) throw new JobDomainError('invalid_transition', 'This job status transition is not allowed');
      const fromStatus = job.status;
      job.status = command.nextStatus;
      job.version += 1;
      job.updatedAt = isoNow(this.#now);
      appendEvent(state, job, 'status_changed', { fromStatus, toStatus: job.status, reasonCode: command.reasonCode }, this.#now);
      return publicJob(job);
    });
  }

  async recordScore(input) {
    requireExactKeys(input, ['jobId', 'expectedVersion', 'outcome', 'score', 'reasonCode'], 'scoreRecord');
    const jobIdValue = requireIdentifier(input.jobId, 'scoreRecord.jobId');
    const expectedVersion = requireExpectedVersion(input.expectedVersion);
    const outcome = requireEnum(input.outcome, ['pass', 'reject', 'review', 'failed'], 'scoreRecord.outcome');
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) throw new JobDomainError('invalid_input', 'scoreRecord.score must be between 0 and 100');
    const reasonCode = requireBoundedText(input.reasonCode, 'scoreRecord.reasonCode', { max: 80 });
    return this.#mutate(async (state) => {
      const job = findActiveJob(state, jobIdValue);
      assertVersion(job, expectedVersion);
      if (job.scoreSummary) throw new JobDomainError('ranking_already_finalized', 'This job already has a ranking terminal');
      job.scoreSummary = { outcome, score: Math.round(input.score), reasonCode };
      job.version += 1;
      job.updatedAt = isoNow(this.#now);
      appendEvent(state, job, 'score_recorded', { reasonCode, outcome }, this.#now);
      return publicJob(job);
    });
  }

  async finalizeRanking(input) {
    requireExactKeys(input, ['jobId', 'expectedVersion', 'outcome', 'score', 'reasonCode'], 'rankingFinalization');
    const id = requireIdentifier(input.jobId, 'rankingFinalization.jobId');
    const expectedVersion = requireExpectedVersion(input.expectedVersion);
    const outcome = requireEnum(input.outcome, rankingOutcomes, 'rankingFinalization.outcome');
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
      throw new JobDomainError('invalid_input', 'rankingFinalization.score must be between 0 and 100');
    }
    const reasonCode = requireBoundedText(input.reasonCode, 'rankingFinalization.reasonCode', { max: 80 });
    return this.#mutate(async (state) => {
      const job = findActiveJob(state, id);
      assertVersion(job, expectedVersion);
      if (job.scoreSummary) throw new JobDomainError('ranking_already_finalized', 'This job already has a ranking terminal');
      if (!['discovered', 'scored'].includes(job.status)) {
        throw new JobDomainError('ranking_state_invalid', 'This job cannot be ranked from its current status');
      }
      job.scoreSummary = { outcome, score: Math.round(input.score), reasonCode };
      job.status = outcome === 'reject'
        ? 'rejected'
        : outcome === 'pass' || outcome === 'review'
          ? 'review_required'
          : 'failed';
      job.version += 1;
      job.updatedAt = isoNow(this.#now);
      appendEvent(state, job, 'ranking_finalized', { reasonCode, outcome }, this.#now);
      return publicJob(job);
    });
  }

  async setProtected(input) {
    requireExactKeys(input, ['jobId', 'expectedVersion', 'protected'], 'protectionChange');
    const id = requireIdentifier(input.jobId, 'protectionChange.jobId');
    const expectedVersion = requireExpectedVersion(input.expectedVersion);
    if (typeof input.protected !== 'boolean') throw new JobDomainError('invalid_input', 'protectionChange.protected must be boolean');
    return this.#mutate(async (state) => {
      const job = findActiveJob(state, id);
      assertVersion(job, expectedVersion);
      job.protected = input.protected;
      job.version += 1;
      job.updatedAt = isoNow(this.#now);
      appendEvent(state, job, 'protection_changed', { reasonCode: input.protected ? 'workflow_active' : 'workflow_idle' }, this.#now);
      return publicJob(job);
    });
  }

  async softDelete(input) {
    requireExactKeys(input, ['jobId', 'expectedVersion', 'reasonCode'], 'jobDelete');
    const id = requireIdentifier(input.jobId, 'jobDelete.jobId');
    const expectedVersion = requireExpectedVersion(input.expectedVersion);
    const reasonCode = requireBoundedText(input.reasonCode, 'jobDelete.reasonCode', { max: 80 });
    return this.#mutate(async (state) => {
      const job = findActiveJob(state, id);
      assertVersion(job, expectedVersion);
      if (job.protected) throw new JobDomainError('protected_record', 'A protected job record cannot be deleted');
      job.deletedAt = isoNow(this.#now);
      job.version += 1;
      job.updatedAt = job.deletedAt;
      appendEvent(state, job, 'job_soft_deleted', { reasonCode }, this.#now);
      return publicJob(job);
    });
  }

  async restore(input) {
    requireExactKeys(input, ['jobId', 'expectedVersion', 'reasonCode'], 'jobRestore');
    const id = requireIdentifier(input.jobId, 'jobRestore.jobId');
    const expectedVersion = requireExpectedVersion(input.expectedVersion);
    const reasonCode = requireBoundedText(input.reasonCode, 'jobRestore.reasonCode', { max: 80 });
    return this.#mutate(async (state) => {
      const job = state.jobs.find((entry) => entry.id === id);
      if (!job || !job.deletedAt) throw new JobDomainError('not_found', 'The deleted job record was not found');
      assertVersion(job, expectedVersion);
      job.deletedAt = undefined;
      job.version += 1;
      job.updatedAt = isoNow(this.#now);
      appendEvent(state, job, 'job_restored', { reasonCode }, this.#now);
      return publicJob(job);
    });
  }

  async get(jobIdValue) {
    const state = await this.#read();
    const job = state.jobs.find((entry) => entry.id === jobIdValue && !entry.deletedAt);
    return job ? publicJob(job) : undefined;
  }

  async list({ includeDeleted = false } = {}) {
    const state = await this.#read();
    return state.jobs.filter((job) => includeDeleted || !job.deletedAt).map(publicJob);
  }

  async events(jobIdValue) {
    requireIdentifier(jobIdValue, 'jobId');
    const state = await this.#read();
    return state.events.filter((event) => event.jobId === jobIdValue).map((event) => ({ ...event }));
  }

  async safetyAudit() {
    return auditPersistedState(await this.#read());
  }

  async #mutate(operation) {
    const run = this.#writeQueue.then(async () => withFileLock(this.#path, this.#lockWaitMs, async () => {
      const state = await this.#read();
      const result = await operation(state);
      if (result?.[NO_MUTATION]) return result.value;
      state.revision += 1;
      await writeAtomic(this.#path, state);
      return result;
    }));
    this.#writeQueue = run.catch(() => undefined);
    return run;
  }

  async #read() {
    try {
      const parsed = JSON.parse(await readFile(this.#path, 'utf8'));
      if (!parsed || parsed.schemaVersion !== schemaVersion || !Array.isArray(parsed.jobs) || !Array.isArray(parsed.events)) throw new Error('invalid');
      return parsed;
    } catch (error) {
      if (error?.code === 'ENOENT') return { schemaVersion, revision: 0, jobs: [], events: [] };
      throw new JobDomainError('storage_corrupt', 'The local job repository could not be read safely');
    }
  }
}

export function normalizedJobIdentity(candidate) {
  const parsed = parseJobCandidate(candidate);
  return `${parsed.source}:${parsed.jobUrl.toLowerCase()}`;
}

function findActiveJob(state, id) {
  const job = state.jobs.find((entry) => entry.id === id && !entry.deletedAt);
  if (!job) throw new JobDomainError('not_found', 'The job record was not found');
  return job;
}
function noMutation(value) { return { [NO_MUTATION]: true, value }; }
function sameCandidate(job, candidate) {
  return job.source === candidate.source
    && job.jobUrl === candidate.jobUrl
    && job.title === candidate.title
    && job.company === candidate.company
    && job.description === candidate.description;
}
function assertVersion(job, expectedVersion) { if (job.version !== expectedVersion) throw new JobRepositoryConflictError(); }
function jobId(identity) { return `job_${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`; }
function isoNow(now) { return now().toISOString(); }
function appendEvent(state, job, type, detail, now) {
  state.events.push({ eventId: `evt_${randomUUID().replaceAll('-', '')}`, jobId: job.id, type, at: isoNow(now), ...detail });
}
function publicJob(job) {
  return Object.freeze({ id: job.id, source: job.source, jobUrl: job.jobUrl, title: job.title, company: job.company, description: job.description, status: job.status, version: job.version, protected: job.protected, scoreSummary: job.scoreSummary ? { ...job.scoreSummary } : undefined, createdAt: job.createdAt, updatedAt: job.updatedAt, ...(job.deletedAt ? { deletedAt: job.deletedAt } : {}) });
}

const forbiddenKeyPatterns = Object.freeze([
  ['credential_key', /^(?:password|passwd|credential|authorization|bearer|secret|token|otp|sms_?code|verification_?code|captcha)$/i],
  ['browser_state_key', /^(?:cookie|cookies|local_?storage|session_?storage|browser_?storage|auth_?state)$/i],
  ['page_dump_key', /^(?:dom|html|raw_?html|page_?source|selector|script)$/i],
  ['profile_value_key', /^(?:profile|profile_?value|candidate_?profile|resume_?value)$/i],
  ['conversation_key', /^(?:chat|conversation|message_?body|full_?message)$/i],
  ['binary_capture_key', /^(?:screenshot|image_?data|capture|ocr_?text)$/i]
]);

function auditPersistedState(state) {
  const categories = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== 'object') {
      if (typeof value === 'string') {
        for (const category of sensitiveJobTextCategories(value)) categories.add(category);
        try {
          const url = new URL(value);
          if (url.username || url.password) categories.add('url_credentials');
        } catch {}
      }
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      for (const [category, pattern] of forbiddenKeyPatterns) {
        if (pattern.test(key)) categories.add(category);
      }
      visit(nested);
    }
  };
  visit(state);
  return Object.freeze({
    scannedJobs: state.jobs.length,
    scannedEvents: state.events.length,
    hitCount: categories.size,
    categories: Object.freeze([...categories].sort())
  });
}
async function writeAtomic(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, filePath);
}

async function withFileLock(filePath, waitMs, operation) {
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + waitMs;
  await mkdir(path.dirname(filePath), { recursive: true });
  while (true) {
    let handle;
    try {
      handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      await handle.close();
      break;
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if (error?.code !== 'EEXIST') throw new JobDomainError('storage_unavailable', 'The local job repository lock could not be created');
      const age = await lockAgeMs(lockPath);
      if (age > Math.max(waitMs * 2, 10_000)) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline) throw new JobDomainError('repository_busy', 'The local job repository is busy; retry shortly');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  try { return await operation(); } finally { await unlink(lockPath).catch(() => undefined); }
}

async function lockAgeMs(lockPath) {
  try { return Date.now() - (await stat(lockPath)).mtimeMs; } catch { return 0; }
}
