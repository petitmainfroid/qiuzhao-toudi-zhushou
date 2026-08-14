import assert from 'node:assert/strict';
import test from 'node:test';
import { RecruitmentApplicationService } from '../modules/application-service/application-service.mjs';
import { loadBundledNodeModule } from '../modules/browser-kernel/source-loader.mjs';

const ORIGIN = 'https://xiaomi.jobs.f.mioffice.cn';
const PROFILE_VERSION = `pv_${'a'.repeat(64)}`;
const LEASE = {
  schemaVersion: 1, leaseId: 'lease_12345678', origin: ORIGIN, profileVersion: PROFILE_VERSION,
  scope: 'ordinary', issuedAt: 1000, expiresAt: 100000
};

let planner;
let compiler;
test.before(async () => {
  planner = await loadBundledNodeModule('modules/semantic-planner/src/index.ts');
  compiler = await loadBundledNodeModule('modules/policy-compiler/src/index.ts');
});

function observedControls() {
  return [
    {
      ref: 'node_name_1234', role: 'textbox', tag: 'input', inputType: 'text',
      semantics: { label: '姓名', name: 'basic_info.name' }, disabled: false, readOnly: false,
      required: true, multiple: false, boundary: 'main', safety: 'ordinary', hasValue: false
    },
    {
      ref: 'node_id_123456', role: 'textbox', tag: 'input', inputType: 'text',
      semantics: { label: '身份证号', name: 'basic_info.identification' }, disabled: false, readOnly: false,
      required: true, multiple: false, boundary: 'main', safety: 'identity', hasValue: false
    }
  ];
}

function createHarness({ lease = LEASE, ledgerState, blockExecute, kernelStartError, kernelState = 'ready' } = {}) {
  let pageEpoch = 0;
  let executeRelease;
  const executeBarrier = blockExecute ? new Promise((resolve) => { executeRelease = resolve; }) : undefined;
  const kernelCalls = [];
  const kernel = {
    async start() { if (kernelStartError) throw new Error(kernelStartError); },
    status() {
      return kernelState === 'ready'
        ? { state: 'ready', origin: ORIGIN, path: '/internship/resume/:id/apply', pageEpoch }
        : { state: kernelState, errorCode: kernelStartError ?? 'cdp_unavailable', pageEpoch };
    },
    async observe() {
      pageEpoch += 1;
      return {
        pageEpoch,
        state: {
          snapshotId: `snapshot_${String(pageEpoch).padStart(8, '0')}`, origin: ORIGIN,
          path: '/internship/resume/:id/apply', controls: observedControls(),
          summary: { controlCount: 2, frameCount: 1, openShadowRootCount: 0, blockedControlCount: 1 }
        }
      };
    },
    grantOrdinaryLease(input) { kernelCalls.push({ kind: 'grant', input }); },
    async execute(input) {
      kernelCalls.push({ kind: 'execute', input });
      if (executeBarrier) await executeBarrier;
      return { requestId: input.requestId, ref: input.ref, action: input.intent.kind, status: 'verified', attempts: 1, strategy: 'native-setter', verified: true };
    },
    audit() { return { summary: { finalSubmits: 0, credentialReads: 0, cookieReads: 0 } }; },
    pause() { kernelCalls.push({ kind: 'pause' }); return { state: 'paused', pageEpoch }; },
    close() {}
  };
  const snapshot = {
    profileVersion: PROFILE_VERSION, profileSchemaVersion: 4,
    catalog: [
      { path: 'basic.fullName', kind: 'text', safetyClass: 'ordinary', hasValue: true },
      { path: 'basic.identityDocumentNumber', kind: 'text', safetyClass: 'sensitive', hasValue: true }
    ],
    completeness: { totalScalarPaths: 2, populatedScalarPaths: 2, repeatableRoots: [] }
  };
  const profileService = { async getAgentSnapshot() { return snapshot; } };
  let currentLease = lease;
  const authorizationStore = {
    async current() { return currentLease; },
    async revoke() { currentLease = undefined; }
  };
  let stored = ledgerState ?? { schemaVersion: 1, status: 'idle', completedRequests: [], round: 0 };
  const ledger = {
    async load() { return structuredClone(stored); },
    async save(next) { stored = structuredClone(next); return structuredClone(stored); }
  };
  const service = new RecruitmentApplicationService({
    kernel, profileService, authorizationStore, ledger,
    createPlannerRequest: planner.createAiPlannerRequest, compilePlan: compiler.compilePlan,
    now: () => 2000, createId: () => 'nonce_12345678'
  });
  return { service, kernelCalls, release: () => executeRelease?.(), getStored: () => stored };
}

function completeProposal(inspected) {
  return {
    schemaVersion: 1,
    decisions: inspected.fields.map((field) => field.safetyClass === 'ordinary'
      ? { kind: 'map', ref: field.ref, profilePath: 'basic.fullName' }
      : { kind: 'manual', ref: field.ref, reason: 'protected_field' })
  };
}

async function inspectAndPlan(harness) {
  await harness.service.start();
  const inspected = await harness.service.inspect();
  const planned = await harness.service.planApplication({
    snapshotId: inspected.snapshotId, pageEpoch: inspected.pageEpoch,
    proposal: completeProposal(inspected)
  });
  return { inspected, planned };
}

test('observe-plan-compile-execute-reobserve-audit returns no scalar values', async () => {
  const harness = createHarness();
  const { inspected, planned } = await inspectAndPlan(harness);
  assert.equal(inspected.fields.length, 2);
  assert.equal(inspected.profilePathCatalog[0].hasValue, true);
  assert.equal(planned.executableCount, 1);
  const executed = await harness.service.execute({ planId: planned.planId, requestId: 'request_12345678' });
  assert.equal(executed.status, 'completed');
  assert.equal(executed.verifiedCount, 1);
  const audit = await harness.service.audit();
  assert.equal(audit.rows.length, 2);
  assert.deepEqual(audit.rows.map((row) => row.conclusion), ['verified', 'manual_required']);
  assert.equal(audit.summary.finalSubmits, 0);
  const serialized = JSON.stringify({ inspected, planned, executed, audit });
  assert.equal(serialized.includes('LOCAL_VALUE'), false);
  assert.equal(serialized.includes('identityDocumentNumber'), true);
});

test('browser startup failure keeps Agent online with one actionable recovery step and zero writes', async () => {
  const harness = createHarness({ kernelStartError: 'session_not_ready', kernelState: 'disconnected' });
  await assert.doesNotReject(() => harness.service.start());
  const status = await harness.service.workspaceStatus();
  assert.deepEqual(status.browser, {
    state: 'disconnected',
    origin: undefined,
    path: undefined,
    errorCode: 'session_not_ready',
    recommendedAction: 'reconnect',
    recoveryCommand: 'qiuzhao browser reconnect'
  });
  await assert.rejects(() => harness.service.inspect(), (error) => error?.code === 'browser_not_ready');
  await assert.rejects(() => harness.service.planApplication({
    snapshotId: 'snapshot_12345678', pageEpoch: 1,
    proposal: { schemaVersion: 1, decisions: [] }
  }), (error) => error?.code === 'browser_not_ready');
  await assert.rejects(() => harness.service.execute({
    planId: `plan_${'a'.repeat(64)}`, requestId: 'request_offline1'
  }), (error) => error?.code === 'browser_not_ready');
  assert.equal(harness.kernelCalls.some((call) => call.kind === 'execute'), false);
});

test('no lease, wrong origin, stale state, and malicious payload fail before writes', async () => {
  for (const lease of [null, { ...LEASE, origin: 'https://wrong.example' }]) {
    const harness = createHarness({ lease });
    await harness.service.start();
    await assert.rejects(() => harness.service.inspect(), (error) => error?.code?.startsWith('authorization'));
    assert.equal(harness.kernelCalls.some((call) => call.kind === 'execute'), false);
  }
  const harness = createHarness();
  await harness.service.start();
  const inspected = await harness.service.inspect();
  await assert.rejects(() => harness.service.planApplication({
    snapshotId: inspected.snapshotId, pageEpoch: inspected.pageEpoch + 1, proposal: completeProposal(inspected)
  }), /stale/);
  await assert.rejects(() => harness.service.planApplication({
    snapshotId: inspected.snapshotId, pageEpoch: inspected.pageEpoch,
    proposal: { ...completeProposal(inspected), selector: '#name', value: 'secret' }
  }));
  assert.equal(harness.kernelCalls.some((call) => call.kind === 'execute'), false);
});

test('execution request is idempotent and conflicting replay is rejected', async () => {
  const harness = createHarness();
  const { planned } = await inspectAndPlan(harness);
  const request = { planId: planned.planId, requestId: 'request_replay88' };
  const first = await harness.service.execute(request);
  const second = await harness.service.execute(request);
  assert.deepEqual(second, first);
  assert.equal(harness.kernelCalls.filter((call) => call.kind === 'execute').length, 1);
  await assert.rejects(() => harness.service.execute({ ...request, planId: `plan_${'b'.repeat(64)}` }), /different input/);
});

test('cancellation revokes authority and restart converts running state to needs_replan', async () => {
  const harness = createHarness();
  await inspectAndPlan(harness);
  assert.deepEqual(await harness.service.cancel(), { status: 'cancelled', authorization: 'revoked', references: 'invalidated' });
  await assert.rejects(() => harness.service.execute({ planId: `plan_${'a'.repeat(64)}`, requestId: 'request_cancel88' }), /cancelled|stale/);
  assert.equal(harness.kernelCalls.some((call) => call.kind === 'pause'), true);

  const restarted = createHarness({ ledgerState: { schemaVersion: 1, status: 'needs_replan', completedRequests: [], round: 2 } });
  await restarted.service.start();
  const status = await restarted.service.workspaceStatus();
  assert.equal(status.workflow.status, 'needs_replan');
  assert.equal(status.workflow.recoverable, true);
});

test('bounded replanning and single-job lock fail closed', async () => {
  const budget = createHarness();
  await budget.service.start();
  for (let round = 0; round < 4; round += 1) {
    const inspected = await budget.service.inspect();
    await budget.service.planApplication({ snapshotId: inspected.snapshotId, pageEpoch: inspected.pageEpoch, proposal: completeProposal(inspected) });
  }
  const exhausted = await budget.service.inspect();
  await assert.rejects(() => budget.service.planApplication({
    snapshotId: exhausted.snapshotId, pageEpoch: exhausted.pageEpoch, proposal: completeProposal(exhausted)
  }), /bounded replanning budget/);

  const concurrent = createHarness({ blockExecute: true });
  const { planned } = await inspectAndPlan(concurrent);
  const first = concurrent.service.execute({ planId: planned.planId, requestId: 'request_concur01' });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(() => concurrent.service.execute({ planId: planned.planId, requestId: 'request_concur02' }), /another execution/);
  concurrent.release();
  await first;
});

test('a completed workflow starts a fresh bounded planning job', async () => {
  const harness = createHarness({
    ledgerState: {
      schemaVersion: 1,
      status: 'completed',
      jobId: 'job_previous_12345678',
      origin: ORIGIN,
      profileVersion: PROFILE_VERSION,
      round: 4,
      completedRequests: []
    }
  });
  await harness.service.start();
  const inspected = await harness.service.inspect();
  const plan = await harness.service.planApplication({
    snapshotId: inspected.snapshotId,
    pageEpoch: inspected.pageEpoch,
    proposal: completeProposal(inspected)
  });
  assert.equal(plan.round, 1);
  assert.notEqual(harness.getStored().jobId, 'job_previous_12345678');
});

test('inspection collapses one radio group and one protected composite into logical fields', async () => {
  const harness = createHarness();
  harness.service.kernel.observe = async () => ({
    pageEpoch: 1,
    state: {
      snapshotId: 'snapshot_00000001', origin: ORIGIN, path: '/internship/resume/:id/apply',
      controls: [
        ...['无', '内推', '大使推荐'].map((label, index) => ({
          ref: `node_radio_000${index}`, role: 'radio', tag: 'input', inputType: 'radio',
          semantics: { label }, disabled: false, readOnly: false, required: true,
          multiple: false, boundary: 'main', safety: 'ordinary', hasValue: index === 0
        })),
        {
          ref: 'node_idtype_001', role: 'combobox', tag: 'custom', semantics: { label: '个人证件' },
          disabled: false, readOnly: false, required: true, multiple: false, boundary: 'main', safety: 'identity', hasValue: null
        },
        {
          ref: 'node_idvalue_01', role: 'textbox', tag: 'input', inputType: 'text', semantics: { label: '个人证件' },
          disabled: false, readOnly: false, required: true, multiple: false, boundary: 'main', safety: 'identity', hasValue: null
        }
      ],
      summary: { controlCount: 5, frameCount: 1, openShadowRootCount: 0, blockedControlCount: 2 }
    }
  });
  await harness.service.start();
  const inspected = await harness.service.inspect();
  assert.equal(inspected.fields.length, 2);
  assert.deepEqual(inspected.fields[0].options.map((option) => option.label), ['无', '内推', '大使推荐']);
  assert.equal(inspected.fields[0].hasValue, true);
  assert.equal(inspected.fields[1].safetyClass, 'identity');
});

test('repeatable add controls bind to their own semantic collection instead of the first collection', async () => {
  const context = createHarness();
  context.service.profileService.getAgentSnapshot = async () => ({
    profileVersion: PROFILE_VERSION,
    profileSchemaVersion: 4,
    catalog: [{ path: 'workExperiences', kind: 'repeatable', safetyClass: 'ordinary', hasValue: true }],
    completeness: { totalScalarPaths: 0, populatedScalarPaths: 0, repeatableRoots: [{ path: 'workExperiences', nonEmptyItemCount: 1 }] }
  });
  context.service.kernel.observe = async () => ({
    pageEpoch: 1,
    state: {
      snapshotId: 'snapshot_repeat_12345678', origin: ORIGIN, path: '/apply',
      controls: [
        {
          ref: 'ref_internship_add', role: 'button', tag: 'button', inputType: '',
          semantics: { name: 'internship_list.add', label: '添加实习经历' },
          disabled: false, readOnly: false, required: false, multiple: false,
          boundary: 'main', safety: 'ordinary', hasValue: false
        }
      ],
      summary: { controlCount: 1, frameCount: 1, openShadowRootCount: 0, blockedControlCount: 0 }
    }
  });
  await context.service.start();
  const inspection = await context.service.inspect();
  const plan = await context.service.planApplication({
    snapshotId: inspection.snapshotId,
    pageEpoch: inspection.pageEpoch,
    proposal: { schemaVersion: 1, decisions: [{ kind: 'ensure_repeatable', ref: 'ref_internship_add', profilePath: 'workExperiences' }] }
  });
  const result = await context.service.execute({ planId: plan.planId, requestId: 'repeatable_request_12345678' });
  assert.notEqual(result.outcomes[0]?.reason, 'unsupported_repeatable');
  assert.equal(context.kernelCalls.find((call) => call.kind === 'execute')?.input.intent.collection, 'workExperiences');
});
