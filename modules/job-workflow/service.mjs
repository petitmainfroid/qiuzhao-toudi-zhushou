import { createHash } from 'node:crypto';
import { JobDomainError } from '../job-contracts/index.mjs';
import { ingestZhilianDiscovery } from '../job-repository/zhilian-ingest.mjs';
import { runJobRanking } from '../job-ranking/service.mjs';
import {
  parseWorkflowApplicationPreparation,
  parseWorkflowCancellation,
  parseWorkflowQuery,
  parseWorkflowRanking,
  parseWorkflowReview,
  parseWorkflowStart
} from './contracts.mjs';

export class JobWorkflowService {
  constructor({
    store,
    repository,
    discover,
    ingest = ingestZhilianDiscovery,
    rank = runJobRanking,
    faultInjector = async () => undefined
  } = {}) {
    if (!store || !['ensureStart', 'get', 'list', 'registerCommand', 'update', 'withRunLock'].every((name) => typeof store[name] === 'function')) {
      throw new JobDomainError('workflow_store_unavailable', 'The local workflow store is unavailable');
    }
    if (!repository || !['get', 'list', 'transition', 'finalizeRanking'].every((name) => typeof repository[name] === 'function')) {
      throw new JobDomainError('repository_unavailable', 'The local job repository is unavailable');
    }
    if (typeof discover !== 'function' || typeof ingest !== 'function' || typeof rank !== 'function' || typeof faultInjector !== 'function') {
      throw new JobDomainError('workflow_dependency_unavailable', 'A bounded workflow dependency is unavailable');
    }
    this.store = store;
    this.repository = repository;
    this.discover = discover;
    this.ingest = ingest;
    this.rank = rank;
    this.faultInjector = faultInjector;
  }

  async start(input) {
    const command = parseWorkflowStart(input);
    const inputHash = fingerprint(command);
    await this.store.ensureStart({ workflowId: command.requestId, inputHash });
    let current = await this.#requiredWorkflow(command.requestId);
    if (current.state === 'cancelled' || current.checkpoint !== 'discovery_pending') return this.#view(current);

    return this.store.withRunLock(`workflow:${command.requestId}`, async () => {
      current = await this.#requiredWorkflow(command.requestId);
      if (current.state === 'cancelled' || current.checkpoint !== 'discovery_pending') return this.#view(current);
      await this.store.update(command.requestId, (workflow) => {
        workflow.state = 'running';
        workflow.blocker = undefined;
        workflow.attempts.discovery += 1;
        return { changed: true, event: { type: 'stage_started', reasonCode: 'discovery_started' } };
      });

      let discovery;
      try {
        discovery = await this.discover(command.discovery);
      } catch (error) {
        if (error?.code === 'simulated_interruption') throw error;
        const blocked = await this.store.update(command.requestId, (workflow) => {
          workflow.state = 'blocked';
          workflow.blocker = 'discovery_failed';
          return { changed: true, event: { type: 'workflow_blocked', reasonCode: 'discovery_failed' } };
        });
        return this.#view(blocked);
      }

      if (discovery?.blocker) {
        assertSafeDiscoveryCounters(discovery);
        const blocked = await this.store.update(command.requestId, (workflow) => {
          workflow.state = 'blocked';
          workflow.blocker = discovery.blocker;
          workflow.counters.pageWrites += discovery.writes;
          workflow.counters.submissions += discovery.submissions;
          workflow.counters.credentialReads += discovery.credentialReads;
          return { changed: true, event: { type: 'workflow_blocked', reasonCode: discovery.blocker } };
        });
        return this.#view(blocked);
      }

      assertSafeDiscoveryCounters(discovery);
      if (!Array.isArray(discovery.candidates) || discovery.candidates.length === 0) {
        const blocked = await this.store.update(command.requestId, (workflow) => {
          workflow.state = 'blocked';
          workflow.blocker = 'no_candidates';
          return { changed: true, event: { type: 'workflow_blocked', reasonCode: 'no_candidates' } };
        });
        return this.#view(blocked);
      }

      const ingestion = await this.ingest(discovery, { repository: this.repository });
      await this.faultInjector('after_discovery_effect', Object.freeze({ workflowId: command.requestId }));
      const completed = await this.store.update(command.requestId, (workflow) => {
        if (workflow.state === 'cancelled') return { changed: false };
        workflow.state = 'blocked';
        workflow.checkpoint = 'ranking_required';
        workflow.blocker = 'ranking_required';
        workflow.jobIds = [...ingestion.jobIds];
        workflow.counters.repositoryWrites += ingestion.repositoryWrites;
        workflow.counters.pageWrites += discovery.writes;
        workflow.counters.submissions += discovery.submissions;
        workflow.counters.credentialReads += discovery.credentialReads;
        return { changed: true, event: { type: 'discovery_completed', reasonCode: 'ranking_required' } };
      });
      return this.#view(completed);
    });
  }

  async submitRanking(input) {
    const command = parseWorkflowRanking(input);
    const commandHash = fingerprint(command);
    const rankingHash = fingerprint({
      workflowId: command.workflowId,
      ranking: { ...command.ranking, requestId: undefined },
      decisions: command.decisions
    });
    let current = await this.#requiredWorkflow(command.workflowId);
    this.#assertActive(current);
    assertSameJobSet(current.jobIds, command.ranking.items.map((item) => item.jobId));
    if (current.checkpoint !== 'ranking_required') {
      await this.store.update(command.workflowId, (workflow) => {
        if (workflow.rankingHash !== rankingHash) throw new JobDomainError('ranking_already_finalized', 'This workflow ranking is already frozen');
        return { changed: false };
      });
      return this.#view(await this.#requiredWorkflow(command.workflowId));
    }

    await this.store.registerCommand({
      workflowId: command.workflowId,
      requestId: command.requestId,
      kind: 'ranking_submit',
      inputHash: commandHash
    });
    return this.store.withRunLock(`workflow:${command.workflowId}`, async () => {
      current = await this.#requiredWorkflow(command.workflowId);
      this.#assertActive(current);
      if (current.checkpoint !== 'ranking_required') return this.#view(current);
      await this.store.update(command.workflowId, (workflow) => {
        if (workflow.rankingHash && workflow.rankingHash !== rankingHash) {
          throw new JobDomainError('ranking_request_conflict', 'The frozen ranking input cannot be changed');
        }
        workflow.rankingHash = rankingHash;
        workflow.state = 'running';
        workflow.blocker = undefined;
        workflow.attempts.ranking += 1;
        return { changed: true, event: { type: 'stage_started', reasonCode: 'ranking_started' } };
      });

      const decisions = new Map(command.decisions.map((item) => [item.jobId, item.decision]));
      const result = await this.rank(command.ranking, {
        repository: this.repository,
        scoreJob: async ({ job }) => {
          const decision = decisions.get(job.jobId);
          if (!decision) throw new JobDomainError('semantic_decision_missing', 'A semantic decision is missing');
          return decision;
        }
      });
      await this.faultInjector('after_ranking_effect', Object.freeze({ workflowId: command.workflowId }));
      const completed = await this.store.update(command.workflowId, (workflow) => {
        if (workflow.state === 'cancelled') return { changed: false };
        workflow.state = 'blocked';
        workflow.checkpoint = 'review_required';
        workflow.blocker = 'review_required';
        workflow.counters.repositoryWrites += result.repositoryWrites;
        workflow.counters.semanticCalls += result.semanticCalls;
        workflow.counters.pageWrites += result.pageWrites;
        workflow.counters.submissions += result.submissions;
        workflow.counters.credentialReads += result.credentialReads;
        workflow.rankingSummary = {
          annotated: result.annotated,
          terminalCount: result.terminalCount,
          counts: { ...result.counts },
          semanticCalls: result.semanticCalls,
          repositoryWrites: result.repositoryWrites
        };
        return { changed: true, event: { type: 'ranking_completed', reasonCode: 'review_required' } };
      });
      return this.#view(completed);
    });
  }

  async status(input) {
    const { workflowId } = parseWorkflowQuery(input);
    return this.#view(await this.#requiredWorkflow(workflowId));
  }

  async workspaceStatus(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 0) {
      throw new JobDomainError('unknown_input', 'job workspace status accepts no input');
    }
    const workflows = await this.store.list();
    const counts = Object.freeze({
      total: workflows.length,
      active: workflows.filter((item) => !['cancelled', 'completed'].includes(item.state)).length,
      cancelled: workflows.filter((item) => item.state === 'cancelled').length,
      authorizationRequired: workflows.filter((item) => item.checkpoint === 'authorization_required' && item.state !== 'cancelled').length
    });
    return Object.freeze({
      state: 'ready',
      counts,
      workflows: Object.freeze(workflows.map((item) => Object.freeze({
        workflowId: item.workflowId,
        state: item.state,
        checkpoint: item.checkpoint,
        ...(item.blocker ? { blocker: item.blocker } : {}),
        jobCount: item.jobIds.length,
        updatedAt: item.updatedAt
      }))),
      finalSubmission: 'unreachable'
    });
  }

  async reviewQueue(input) {
    const { workflowId } = parseWorkflowQuery(input);
    const workflow = await this.#requiredWorkflow(workflowId);
    this.#assertActive(workflow);
    const reviewed = new Set(workflow.reviews.map((item) => item.jobId));
    const jobs = await Promise.all(workflow.jobIds.map((jobId) => this.repository.get(jobId)));
    const items = jobs.filter((job) => job && job.status === 'review_required' && !reviewed.has(job.id))
      .map((job) => Object.freeze({
        jobId: job.id,
        title: job.title,
        company: job.company,
        outcome: job.scoreSummary?.outcome,
        score: job.scoreSummary?.score,
        reasonCode: job.scoreSummary?.reasonCode,
        version: job.version
      }))
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.jobId.localeCompare(right.jobId));
    return Object.freeze({ workflowId, count: items.length, items: Object.freeze(items) });
  }

  async recordReview(input) {
    const command = parseWorkflowReview(input);
    const commandHash = fingerprint(command);
    let workflow = await this.#requiredWorkflow(command.workflowId);
    this.#assertActive(workflow);
    assertJobMember(workflow, command.jobId);
    const existing = workflow.reviews.find((item) => item.jobId === command.jobId);
    if (existing) {
      if (existing.decision !== command.decision) throw new JobDomainError('review_already_decided', 'This job already has a different review decision');
      return this.#view(workflow);
    }
    await this.store.registerCommand({
      workflowId: command.workflowId,
      requestId: command.requestId,
      kind: 'review_decide',
      inputHash: commandHash
    });

    return this.store.withRunLock(`job:${command.jobId}`, async () => {
      workflow = await this.#requiredWorkflow(command.workflowId);
      this.#assertActive(workflow);
      const replay = workflow.reviews.find((item) => item.jobId === command.jobId);
      if (replay) {
        if (replay.decision !== command.decision) throw new JobDomainError('review_already_decided', 'This job already has a different review decision');
        return this.#view(workflow);
      }
      const job = await this.repository.get(command.jobId);
      if (!job) throw new JobDomainError('job_not_found', 'The workflow job was not found');
      let repositoryWrites = 0;
      if (command.decision === 'approve') {
        if (job.status === 'review_required') {
          await this.repository.transition({
            jobId: job.id, expectedVersion: job.version, nextStatus: 'approved', reasonCode: 'user_approved'
          });
          repositoryWrites = 1;
        } else if (job.status !== 'approved') {
          throw new JobDomainError('review_state_conflict', 'The job cannot be approved from its current state');
        }
      } else if (command.decision === 'reject') {
        if (job.status === 'review_required') {
          await this.repository.transition({
            jobId: job.id, expectedVersion: job.version, nextStatus: 'rejected', reasonCode: 'user_rejected'
          });
          repositoryWrites = 1;
        } else if (job.status !== 'rejected') {
          throw new JobDomainError('review_state_conflict', 'The job cannot be rejected from its current state');
        }
      } else if (job.status !== 'review_required') {
        throw new JobDomainError('review_state_conflict', 'The job is no longer waiting for manual review');
      }
      await this.faultInjector('after_review_effect', Object.freeze({ workflowId: command.workflowId, jobId: command.jobId }));
      const reviewed = await this.store.update(command.workflowId, (record) => {
        const present = record.reviews.find((item) => item.jobId === command.jobId);
        if (present) return { changed: false };
        record.reviews.push({ jobId: command.jobId, decision: command.decision });
        record.counters.repositoryWrites += repositoryWrites;
        record.state = 'blocked';
        record.blocker = command.decision === 'approve' ? 'application_preparation_required' : 'review_required';
        return { changed: true, event: { type: 'review_recorded', reasonCode: `review_${command.decision}` } };
      });
      return this.#view(reviewed);
    });
  }

  async prepareApplication(input) {
    const command = parseWorkflowApplicationPreparation(input);
    const commandHash = fingerprint(command);
    let workflow = await this.#requiredWorkflow(command.workflowId);
    this.#assertActive(workflow);
    assertJobMember(workflow, command.jobId);
    const existing = workflow.applicationGates.find((item) => item.jobId === command.jobId);
    if (existing) return this.#view(workflow);
    await this.store.registerCommand({
      workflowId: command.workflowId,
      requestId: command.requestId,
      kind: 'application_prepare',
      inputHash: commandHash
    });
    return this.store.withRunLock(`job:${command.jobId}`, async () => {
      workflow = await this.#requiredWorkflow(command.workflowId);
      this.#assertActive(workflow);
      if (workflow.applicationGates.some((item) => item.jobId === command.jobId)) return this.#view(workflow);
      const review = workflow.reviews.find((item) => item.jobId === command.jobId);
      if (review?.decision !== 'approve') throw new JobDomainError('approval_required', 'The user must approve this exact job first');
      const job = await this.repository.get(command.jobId);
      if (!job || job.status !== 'approved') throw new JobDomainError('approval_state_invalid', 'The approved job state is unavailable');
      await this.store.update(command.workflowId, (record) => {
        record.state = 'running';
        record.blocker = undefined;
        record.attempts.applicationPreparation += 1;
        return { changed: true, event: { type: 'stage_started', reasonCode: 'authorization_checked' } };
      });
      await this.faultInjector('before_authorization_checkpoint', Object.freeze({ workflowId: command.workflowId, jobId: command.jobId }));
      const gated = await this.store.update(command.workflowId, (record) => {
        if (record.state === 'cancelled') return { changed: false };
        record.state = 'blocked';
        record.checkpoint = 'authorization_required';
        record.blocker = 'authorization_required';
        record.applicationGates.push({ jobId: command.jobId, state: 'authorization_required' });
        return { changed: true, event: { type: 'application_gate_reached', reasonCode: 'authorization_required' } };
      });
      return this.#view(gated);
    });
  }

  async cancel(input) {
    const command = parseWorkflowCancellation(input);
    const commandHash = fingerprint(command);
    let workflow = await this.#requiredWorkflow(command.workflowId);
    if (workflow.state === 'cancelled') return this.#view(workflow);
    await this.store.registerCommand({
      workflowId: command.workflowId,
      requestId: command.requestId,
      kind: 'workflow_cancel',
      inputHash: commandHash
    });
    return this.store.withRunLock(`workflow:${command.workflowId}`, async () => {
      workflow = await this.#requiredWorkflow(command.workflowId);
      if (workflow.state === 'cancelled') return this.#view(workflow);
      const cancelled = await this.store.update(command.workflowId, (record) => {
        record.state = 'cancelled';
        record.blocker = 'cancelled';
        return { changed: true, event: { type: 'workflow_cancelled', reasonCode: 'user_cancelled' } };
      });
      return this.#view(cancelled);
    });
  }

  async #requiredWorkflow(workflowId) {
    const workflow = await this.store.get(workflowId);
    if (!workflow) throw new JobDomainError('workflow_not_found', 'The workflow was not found');
    return workflow;
  }

  #assertActive(workflow) {
    if (workflow.state === 'cancelled') throw new JobDomainError('workflow_cancelled', 'The workflow has been cancelled and cannot resume');
  }

  async #view(workflow) {
    const jobs = await Promise.all(workflow.jobIds.map((jobId) => this.repository.get(jobId)));
    return Object.freeze({
      ...workflow,
      jobs: Object.freeze(jobs.filter(Boolean).map((job) => Object.freeze({ ...job }))),
      safety: Object.freeze({
        externalActions: workflow.counters.externalActions,
        pageWrites: workflow.counters.pageWrites,
        submissions: workflow.counters.submissions,
        credentialReads: workflow.counters.credentialReads,
        authorizationCanBeGrantedByAgent: false,
        finalSubmission: 'unreachable'
      })
    });
  }
}

function assertSameJobSet(expected, actual) {
  if (expected.length !== actual.length || new Set(actual).size !== actual.length
    || [...expected].sort().join('|') !== [...actual].sort().join('|')) {
    throw new JobDomainError('ranking_denominator_mismatch', 'Ranking must cover the exact frozen workflow job set once');
  }
}

function assertJobMember(workflow, jobId) {
  if (!workflow.jobIds.includes(jobId)) throw new JobDomainError('job_not_in_workflow', 'The job is not part of this workflow');
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertSafeDiscoveryCounters(discovery) {
  for (const key of ['writes', 'submissions', 'credentialReads']) {
    if (!Number.isSafeInteger(discovery?.[key]) || discovery[key] !== 0) {
      throw new JobDomainError('unsafe_discovery_result', 'Discovery must report zero page writes, submissions and credential reads');
    }
  }
}
