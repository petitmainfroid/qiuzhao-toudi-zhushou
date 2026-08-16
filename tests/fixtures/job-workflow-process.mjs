import path from 'node:path';
import { LocalJobRepository } from '../../modules/job-repository/repository.mjs';
import { JobWorkflowService } from '../../modules/job-workflow/service.mjs';
import { LocalJobWorkflowStore } from '../../modules/job-workflow/store.mjs';

const [operation, directory] = process.argv.slice(2);
if (!operation || !directory) throw new Error('operation_and_directory_required');
const repository = new LocalJobRepository({ filePath: path.join(directory, 'jobs.json') });
const store = new LocalJobWorkflowStore({ filePath: path.join(directory, 'workflows.json') });

const startRequest = Object.freeze({
  requestId: 'process-workflow-001',
  discovery: Object.freeze({
    keywords: 'Product Manager', city: 'Shanghai', maxPages: 1, maxCards: 2,
    maxDetails: 2, maxScrolls: 0, deadlineMs: 10_000
  })
});
const candidates = Object.freeze([1, 2].map((number) => Object.freeze({
  source: 'zhilian',
  jobUrl: `https://www.zhaopin.com/jobdetail/process-${number}.htm`,
  title: `Product Manager ${number}`,
  company: `Process Company ${number}`,
  description: `Own product delivery for process recovery ${number}.`
})));

function service(faultPoint, exitCode) {
  return new JobWorkflowService({
    repository,
    store,
    discover: async () => ({
      candidates, blocker: undefined, writes: 0, submissions: 0, credentialReads: 0
    }),
    faultInjector: async (point) => {
      if (point === faultPoint) process.exit(exitCode);
    }
  });
}

async function rankingCommand(workflow) {
  return {
    workflowId: workflow.workflowId,
    requestId: 'process-ranking-001',
    policy: {
      policyId: 'process-policy-001', targetRoleTerms: ['product'], excludedTerms: [],
      acceptedCities: ['Shanghai'], acceptedJobTypes: ['full_time'], minimumMonthlySalaryK: 0
    },
    items: workflow.jobIds.map((jobId) => ({
      jobId,
      facts: { city: 'Shanghai', jobType: 'full_time', monthlySalaryMinK: 20 },
      decision: { outcome: 'pass', score: 90, reasonCode: 'semantic_strong_match' }
    })),
    capabilityCatalog: [{ capabilityId: 'product_strategy', hasValue: true }],
    maxSemanticCalls: 2, perItemTimeoutMs: 100, deadlineMs: 2_000
  };
}

async function workflowStatus() {
  return service().status({ workflowId: startRequest.requestId });
}

let result;
if (operation === 'discovery-crash') result = await service('after_discovery_effect', 23).start(startRequest);
else if (operation === 'discovery-resume') result = await service().start(startRequest);
else if (operation === 'ranking-crash') result = await service('after_ranking_effect', 24).submitRanking(await rankingCommand(await workflowStatus()));
else if (operation === 'ranking-resume') result = await service().submitRanking(await rankingCommand(await workflowStatus()));
else if (operation === 'review-crash' || operation === 'review-resume') {
  const workflow = await workflowStatus();
  result = await service(operation === 'review-crash' ? 'after_review_effect' : undefined, 25).recordReview({
    workflowId: workflow.workflowId, requestId: 'process-review-001', jobId: workflow.jobIds[0], decision: 'approve'
  });
} else if (operation === 'prepare-crash' || operation === 'prepare-resume') {
  const workflow = await workflowStatus();
  result = await service(operation === 'prepare-crash' ? 'before_authorization_checkpoint' : undefined, 26).prepareApplication({
    workflowId: workflow.workflowId, requestId: 'process-prepare-001', jobId: workflow.jobIds[0]
  });
} else if (operation === 'audit') {
  const workflow = await workflowStatus();
  result = {
    workflow,
    workflowEvents: await store.events(workflow.workflowId),
    jobs: await repository.list(),
    jobEvents: Object.fromEntries(await Promise.all(workflow.jobIds.map(async (jobId) => [jobId, await repository.events(jobId)]))),
    workflowAudit: await store.safetyAudit(),
    repositoryAudit: await repository.safetyAudit()
  };
} else throw new Error('operation_not_supported');

process.stdout.write(`${JSON.stringify(result)}\n`);
