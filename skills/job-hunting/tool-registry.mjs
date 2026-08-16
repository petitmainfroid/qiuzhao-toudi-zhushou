export const JOB_AGENT_TOOL_NAMES = Object.freeze([
  'job_workspace_status',
  'job_search_start',
  'job_ranking_submit',
  'job_review_queue',
  'job_review_decide',
  'job_application_prepare',
  'job_workflow_status',
  'job_workflow_cancel'
]);

const identifier = Object.freeze({ type: 'string', pattern: '^[a-z][a-z0-9_-]{2,80}$' });
const empty = Object.freeze({ type: 'object', properties: {}, additionalProperties: false });
const workflowQuery = Object.freeze({
  type: 'object', additionalProperties: false, required: ['workflowId'],
  properties: { workflowId: identifier }
});
const discovery = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['keywords', 'city', 'maxPages', 'maxCards', 'maxDetails', 'maxScrolls', 'deadlineMs'],
  properties: {
    keywords: { type: 'string', minLength: 1, maxLength: 120 },
    city: { type: 'string', minLength: 1, maxLength: 80 },
    maxPages: { type: 'integer', minimum: 1, maximum: 3 },
    maxCards: { type: 'integer', minimum: 1, maximum: 30 },
    maxDetails: { type: 'integer', minimum: 0, maximum: 10 },
    maxScrolls: { type: 'integer', minimum: 0, maximum: 12 },
    deadlineMs: { type: 'integer', minimum: 1000, maximum: 120000 }
  }
});
const policy = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['policyId', 'targetRoleTerms', 'excludedTerms', 'acceptedCities', 'acceptedJobTypes', 'minimumMonthlySalaryK'],
  properties: {
    policyId: identifier,
    targetRoleTerms: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', minLength: 1, maxLength: 80 } },
    excludedTerms: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 80 } },
    acceptedCities: { type: 'array', maxItems: 10, items: { type: 'string', minLength: 1, maxLength: 80 } },
    acceptedJobTypes: { type: 'array', maxItems: 4, uniqueItems: true, items: { enum: ['full_time', 'internship', 'part_time', 'contract'] } },
    minimumMonthlySalaryK: { type: 'integer', minimum: 0, maximum: 1000 }
  }
});
const facts = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['city', 'jobType', 'monthlySalaryMinK'],
  properties: {
    city: { oneOf: [{ type: 'string', minLength: 1, maxLength: 80 }, { type: 'null' }] },
    jobType: { enum: ['full_time', 'internship', 'part_time', 'contract', 'unknown'] },
    monthlySalaryMinK: { oneOf: [{ type: 'number', minimum: 0, maximum: 1000 }, { type: 'null' }] }
  }
});
const semanticDecision = Object.freeze({
  type: 'object', additionalProperties: false, required: ['outcome', 'score', 'reasonCode'],
  properties: {
    outcome: { enum: ['pass', 'reject', 'review'] },
    score: { type: 'number', minimum: 0, maximum: 100 },
    reasonCode: { enum: ['semantic_strong_match', 'semantic_partial_match', 'semantic_mismatch', 'semantic_insufficient_evidence'] }
  }
});

export const JOB_AGENT_TOOLS = Object.freeze([
  {
    name: 'job_workspace_status',
    description: 'List privacy-safe local job workflow states. This tool cannot inspect or control a browser.',
    inputSchema: empty
  },
  {
    name: 'job_search_start',
    description: 'Start or resume one bounded, read-only Zhilian discovery and deduplicating ingest workflow.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['requestId', 'discovery'],
      properties: { requestId: identifier, discovery }
    }
  },
  {
    name: 'job_ranking_submit',
    description: 'Submit one closed fact and semantic decision per frozen job. Local deterministic hard rejects cannot be overridden.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      required: ['workflowId', 'requestId', 'policy', 'items', 'capabilityCatalog', 'maxSemanticCalls', 'perItemTimeoutMs', 'deadlineMs'],
      properties: {
        workflowId: identifier,
        requestId: identifier,
        policy,
        items: {
          type: 'array', minItems: 1, maxItems: 20,
          items: {
            type: 'object', additionalProperties: false, required: ['jobId', 'facts', 'decision'],
            properties: { jobId: identifier, facts, decision: semanticDecision }
          }
        },
        capabilityCatalog: {
          type: 'array', maxItems: 50,
          items: {
            type: 'object', additionalProperties: false, required: ['capabilityId', 'hasValue'],
            properties: { capabilityId: identifier, hasValue: { type: 'boolean' } }
          }
        },
        maxSemanticCalls: { type: 'integer', minimum: 0, maximum: 20 },
        perItemTimeoutMs: { type: 'integer', minimum: 10, maximum: 30000 },
        deadlineMs: { type: 'integer', minimum: 100, maximum: 120000 }
      }
    }
  },
  { name: 'job_review_queue', description: 'Read the frozen workflow review queue without profile or page values.', inputSchema: workflowQuery },
  {
    name: 'job_review_decide',
    description: 'Record an explicit user review decision for one exact workflow job.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['workflowId', 'requestId', 'jobId', 'decision'],
      properties: { workflowId: identifier, requestId: identifier, jobId: identifier, decision: { enum: ['approve', 'reject', 'manual'] } }
    }
  },
  {
    name: 'job_application_prepare',
    description: 'Prepare one approved job only up to the local authorization-required gate. It cannot grant authorization, fill, upload, save, or submit.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['workflowId', 'requestId', 'jobId'],
      properties: { workflowId: identifier, requestId: identifier, jobId: identifier }
    }
  },
  { name: 'job_workflow_status', description: 'Read one resumable workflow and its privacy-safe job state.', inputSchema: workflowQuery },
  {
    name: 'job_workflow_cancel',
    description: 'Irreversibly cancel one workflow. Cancellation cannot delete records or create an external action.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['workflowId', 'requestId'],
      properties: { workflowId: identifier, requestId: identifier }
    }
  }
]);

export function createJobAgentToolHandlers(agentService) {
  return Object.freeze({
    job_workspace_status: (input) => agentService.workspaceStatus(input),
    job_search_start: (input) => agentService.searchStart(input),
    job_ranking_submit: (input) => agentService.rankingSubmit(input),
    job_review_queue: (input) => agentService.reviewQueue(input),
    job_review_decide: (input) => agentService.reviewDecide(input),
    job_application_prepare: (input) => agentService.applicationPrepare(input),
    job_workflow_status: (input) => agentService.workflowStatus(input),
    job_workflow_cancel: (input) => agentService.workflowCancel(input)
  });
}
