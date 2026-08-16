export const MCP_TOOL_NAMES = Object.freeze([
  'workspace_status',
  'application_inspect',
  'application_plan',
  'application_execute',
  'application_audit',
  'workflow_cancel'
]);

const emptyInput = Object.freeze({ type: 'object', properties: {}, additionalProperties: false });
const ref = Object.freeze({ type: 'string', pattern: '^[A-Za-z0-9:_-]{8,160}$' });
const profilePath = Object.freeze({
  type: 'string',
  pattern: '^[A-Za-z][A-Za-z0-9_]*(?:\\.(?:[A-Za-z][A-Za-z0-9_]*|0|[1-9][0-9]*))*$',
  maxLength: 256
});
const decision = Object.freeze({
  oneOf: [
    {
      type: 'object', additionalProperties: false, required: ['kind', 'ref', 'profilePath'],
      properties: { kind: { const: 'map' }, ref, profilePath }
    },
    {
      type: 'object', additionalProperties: false, required: ['kind', 'ref', 'profilePath'],
      properties: { kind: { const: 'profile_missing' }, ref, profilePath }
    },
    {
      type: 'object', additionalProperties: false, required: ['kind', 'ref', 'profilePath'],
      properties: { kind: { const: 'ensure_repeatable' }, ref, profilePath }
    },
    {
      type: 'object', additionalProperties: false, required: ['kind', 'ref', 'profilePath'],
      properties: { kind: { const: 'map_collection_empty' }, ref, profilePath }
    },
    {
      type: 'object', additionalProperties: false, required: ['kind', 'ref', 'startProfilePath', 'endProfilePath'],
      properties: {
        kind: { const: 'map_date_range' }, ref,
        startProfilePath: profilePath,
        endProfilePath: profilePath
      }
    },
    {
      type: 'object', additionalProperties: false, required: ['kind', 'ref', 'startProfilePath'],
      properties: { kind: { const: 'map_date_range_start' }, ref, startProfilePath: profilePath }
    },
    {
      type: 'object', additionalProperties: false, required: ['kind', 'ref', 'reason'],
      properties: {
        kind: { const: 'manual' }, ref,
        reason: { enum: ['protected_field', 'unsupported_control', 'user_input_required'] }
      }
    },
    {
      type: 'object', additionalProperties: false, required: ['kind', 'ref', 'reason'],
      properties: {
        kind: { const: 'review' }, ref,
        reason: { enum: ['ambiguous_mapping', 'sensitive_confirmation', 'page_state_conflict'] }
      }
    },
    {
      type: 'object', additionalProperties: false, required: ['kind', 'ref'],
      properties: { kind: { const: 'conditional_not_applicable' }, ref }
    },
    {
      type: 'object', additionalProperties: false, required: ['kind', 'ref'],
      properties: { kind: { const: 'upload_default_resume' }, ref }
    }
  ]
});

export const MCP_TOOLS = Object.freeze([
  {
    name: 'workspace_status',
    description: 'Check the local browser, profile, ordinary authorization, and workflow state without reading page fields.',
    inputSchema: emptyInput
  },
  {
    name: 'application_inspect',
    description: 'Inventory the current recruitment form and return structural labels, opaque refs, and profile-path availability without scalar values.',
    inputSchema: emptyInput
  },
  {
    name: 'application_plan',
    description: 'Compile one complete typed decision for every inspected field, including only the locally saved default resume for a verified resume attachment control. This tool cannot grant authorization or accept a file path.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['snapshotId', 'pageEpoch', 'proposal'],
      properties: {
        snapshotId: ref,
        pageEpoch: { type: 'integer', minimum: 1 },
        proposal: {
          type: 'object', additionalProperties: false, required: ['schemaVersion', 'decisions'],
          properties: {
            schemaVersion: { const: 1 },
            decisions: { type: 'array', minItems: 1, maxItems: 2048, items: decision }
          }
        }
      }
    }
  },
  {
    name: 'application_execute',
    description: 'Execute a locally authorized compiled plan using local profile resolution and Boolean write verification.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['planId', 'requestId'],
      properties: {
        planId: { type: 'string', pattern: '^plan_[a-f0-9]{64}$' },
        requestId: ref
      }
    }
  },
  {
    name: 'application_audit',
    description: 'Return the privacy-safe field-by-field conclusions and aggregate safety counters for the current workflow.',
    inputSchema: emptyInput
  },
  {
    name: 'workflow_cancel',
    description: 'Cancel the workflow, revoke the local lease, and invalidate page references.',
    inputSchema: emptyInput
  }
]);

export function createToolHandlers(applicationService) {
  return Object.freeze({
    workspace_status: (input) => applicationService.workspaceStatus(input),
    application_inspect: (input) => applicationService.inspect(input),
    application_plan: (input) => applicationService.planApplication(input),
    application_execute: (input) => applicationService.execute(input),
    application_audit: (input) => applicationService.audit(input),
    workflow_cancel: (input) => applicationService.cancel(input)
  });
}
