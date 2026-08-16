import assert from 'node:assert/strict';
import test from 'node:test';
import { RecruitmentApplicationService, buildClosedAutofillProposal } from '../modules/application-service/application-service.mjs';
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

function createHarness({
  lease = LEASE, ledgerState, blockExecute, kernelStartError, kernelState = 'ready',
  controls = observedControls(), resumeAvailable = false, profileSnapshot, onKernelExecute,
  maxReplanRounds
} = {}) {
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
      const currentControls = typeof controls === 'function' ? controls() : controls;
      return {
        pageEpoch,
        state: {
          snapshotId: `snapshot_${String(pageEpoch).padStart(8, '0')}`, origin: ORIGIN,
          path: '/internship/resume/:id/apply', controls: currentControls,
          summary: { controlCount: currentControls.length, frameCount: 1, openShadowRootCount: 0, blockedControlCount: 1 }
        }
      };
    },
    grantOrdinaryLease(input) { kernelCalls.push({ kind: 'grant', input }); },
    async execute(input) {
      kernelCalls.push({ kind: 'execute', input });
      if (executeBarrier) await executeBarrier;
      if (onKernelExecute) return onKernelExecute(input);
      return { requestId: input.requestId, ref: input.ref, action: input.intent.kind, status: 'verified', attempts: 1, strategy: 'native-setter', verified: true };
    },
    audit() {
      return { summary: {
        finalSubmits: 0, credentialReads: 0, cookieReads: 0,
        resumeUploads: kernelCalls.filter((call) => call.kind === 'execute' && call.input.intent.kind === 'upload_saved_resume').length
      } };
    },
    pause() { kernelCalls.push({ kind: 'pause' }); return { state: 'paused', pageEpoch }; },
    close() {}
  };
  const snapshot = profileSnapshot ?? {
    profileVersion: PROFILE_VERSION, profileSchemaVersion: 4,
    catalog: [
      { path: 'basic.fullName', kind: 'text', safetyClass: 'ordinary', hasValue: true },
      { path: 'basic.identityDocumentNumber', kind: 'text', safetyClass: 'sensitive', hasValue: true }
    ],
    completeness: { totalScalarPaths: 2, populatedScalarPaths: 2, repeatableRoots: [] }
  };
  const profileService = { async getAgentSnapshot() { return snapshot; } };
  const resumeAsset = {
    async getAgentSnapshot() { return { hasValue: resumeAvailable, mimeType: 'application/pdf' }; }
  };
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
    kernel, profileService, resumeAsset, authorizationStore, ledger,
    createPlannerRequest: planner.createAiPlannerRequest, compilePlan: compiler.compilePlan,
    now: () => 2000, createId: () => 'nonce_12345678', maxReplanRounds
  });
  return { service, kernelCalls, release: () => executeRelease?.(), getStored: () => stored };
}

function completeProposal(inspected) {
  return {
    schemaVersion: 1,
    decisions: inspected.fields.map((field) => field.capability === 'upload_saved_resume'
      ? { kind: 'upload_default_resume', ref: field.ref }
      : field.safetyClass === 'ordinary'
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

test('closed autofill maps only an exact ordinary name field and leaves protected fields manual', async () => {
  const harness = createHarness();
  await harness.service.start();
  const inspected = await harness.service.inspect();
  const proposal = buildClosedAutofillProposal(harness.service.inspection.plannerRequest);
  assert.deepEqual(proposal.decisions, [
    { kind: 'map', ref: 'node_name_1234', profilePath: 'basic.fullName' },
    { kind: 'manual', ref: 'node_id_123456', reason: 'protected_field' }
  ]);
  const result = await harness.service.autofill({ requestId: 'autofill_request_1234' });
  assert.equal(result.verifiedCount, 1);
  assert.equal(result.plan.executableCount, 1);
  assert.equal(harness.kernelCalls.filter((call) => call.kind === 'execute').length, 1);
});

test('a new closed autofill request starts a fresh bounded job after an older replan exhausted its rounds', async () => {
  const harness = createHarness({
    ledgerState: {
      schemaVersion: 1,
      status: 'needs_replan',
      jobId: 'job_previous_autofill',
      origin: ORIGIN,
      profileVersion: PROFILE_VERSION,
      round: 4,
      completedRequests: []
    }
  });
  await harness.service.start();

  const result = await harness.service.autofill({ requestId: 'autofill_fresh_request' });

  assert.equal(result.verifiedCount, 1);
  assert.equal(result.rounds, 1);
  assert.equal(harness.getStored().round, 1);
  assert.notEqual(harness.getStored().jobId, 'job_previous_autofill');
});

test('closed autofill uses section record context, private experience routing, and ordered ranges', () => {
  const fields = [
    { ref: 'education_school_1', section: 'education.1', label: '学校名称', capability: 'select_option' },
    { ref: 'education_range_1', section: 'education.1', label: '就读时间', capability: 'set_date_range' },
    { ref: 'work_company_0', section: 'work.0', label: '公司名称', capability: 'fill_text' },
    { ref: 'internship_company_0', section: 'internship.0', label: '公司名称', capability: 'fill_text' },
    { ref: 'final_submit_0', section: 'main', label: '提交', capability: 'read_only', safetyClass: 'final_submission' }
  ].map((field) => ({
    role: 'textbox', required: false, hasValue: false, safetyClass: 'ordinary', options: [], conditional: false,
    ...field
  }));
  const catalog = [
    ['education.1.school', 'text'],
    ['education.1.startDate', 'date'],
    ['education.1.endDate', 'date'],
    ['workExperiences.0.company', 'text'],
    ['workExperiences.1.company', 'text']
  ].map(([path, kind]) => ({ path, kind, hasValue: true, safetyClass: 'ordinary' }));
  const proposal = buildClosedAutofillProposal({
    fields, profilePathCatalog: catalog, defaultResume: { hasValue: false, mimeType: 'application/pdf' }
  }, { experienceRouting: { work: [1], internship: [0] } });
  assert.deepEqual(proposal.decisions, [
    { kind: 'map', ref: 'education_school_1', profilePath: 'education.1.school' },
    { kind: 'map_date_range', ref: 'education_range_1', startProfilePath: 'education.1.startDate', endProfilePath: 'education.1.endDate' },
    { kind: 'map', ref: 'work_company_0', profilePath: 'workExperiences.1.company' },
    { kind: 'map', ref: 'internship_company_0', profilePath: 'workExperiences.0.company' },
    { kind: 'manual', ref: 'final_submit_0', reason: 'protected_field' }
  ]);
});

test('closed autofill derives the no-work checkbox only from local repeatable presence', () => {
  const request = {
    fields: [{
      ref: 'no_work_1234', section: 'work.0', label: '没有工作经历', role: 'checkbox',
      required: false, hasValue: true, capability: 'set_boolean', safetyClass: 'ordinary', options: [], conditional: false
    }],
    profilePathCatalog: [
      { path: 'workExperiences', kind: 'repeatable', hasValue: true, safetyClass: 'ordinary' }
    ],
    defaultResume: { hasValue: false, mimeType: 'application/pdf' }
  };
  assert.deepEqual(buildClosedAutofillProposal(request).decisions, [
    { kind: 'map_collection_empty', ref: 'no_work_1234', profilePath: 'workExperiences' }
  ]);
  request.fields[0].hasValue = false;
  assert.deepEqual(buildClosedAutofillProposal(request).decisions, [
    { kind: 'review', ref: 'no_work_1234', reason: 'page_state_conflict' }
  ]);

  request.fields.push({
    ref: 'internship_company_context', section: 'internship.0', label: '公司名称', role: 'textbox',
    required: false, hasValue: true, capability: 'fill_text', safetyClass: 'ordinary', options: [], conditional: false
  });
  assert.deepEqual(buildClosedAutofillProposal(request, {
    experienceRouting: { work: [], internship: [0, 1] }
  }).decisions[0], {
    kind: 'map_collection_empty', ref: 'no_work_1234', profilePath: 'workExperiences'
  });
});

test('closed autofill expands only a missing section record and can select the saved resume', () => {
  const fields = [
    {
      ref: 'add_internship_0', section: 'internship_list', label: '添加实习经历', role: 'button',
      required: false, hasValue: false, capability: 'ensure_repeatable', safetyClass: 'ordinary', options: [], conditional: false
    },
    {
      ref: 'resume_upload_0', section: 'main', label: '上传简历', role: 'textbox',
      required: false, hasValue: false, capability: 'upload_saved_resume', safetyClass: 'attachment', options: [], conditional: false
    }
  ];
  const proposal = buildClosedAutofillProposal({
    fields,
    profilePathCatalog: [{ path: 'workExperiences', kind: 'repeatable', hasValue: true, safetyClass: 'ordinary' }],
    defaultResume: { hasValue: true, mimeType: 'application/pdf' }
  }, {
    repeatableCounts: { internship: 2 },
    repeatables: new Map([['add_internship_0', { collection: 'workExperiences', index: 1 }]])
  });
  assert.deepEqual(proposal.decisions, [
    { kind: 'ensure_repeatable', ref: 'add_internship_0', profilePath: 'workExperiences' },
    { kind: 'upload_default_resume', ref: 'resume_upload_0' }
  ]);
});

test('closed autofill serializes repeatable growth and fills each new education record before the next add', async () => {
  let pageRecordCount = 0;
  const filledRecords = new Set();
  const desiredCount = 3;
  const controls = () => [{
    ref: 'education_add_ref_1234', role: 'button', tag: 'button', inputType: 'button',
    semantics: { label: '添加教育经历', name: 'education_list.add' },
    ...(pageRecordCount > 0 ? {
      sectionContext: { kind: 'education', heading: '教育经历', recordIndex: pageRecordCount - 1 }
    } : {}),
    disabled: false, readOnly: false, required: false, multiple: false,
    boundary: 'main', safety: 'ordinary', hasValue: false
  }, ...Array.from({ length: pageRecordCount }, (_, recordIndex) => ({
    ref: `education_school_ref_${recordIndex}`, role: 'textbox', tag: 'input', inputType: 'text',
    semantics: { label: '学校名称', name: `education_list[${recordIndex}].school` },
    sectionContext: { kind: 'education', heading: '教育经历', recordIndex },
    disabled: false, readOnly: false, required: true, multiple: false,
    boundary: 'main', safety: 'ordinary', hasValue: filledRecords.has(recordIndex)
  }))];
  const profileSnapshot = {
    profileVersion: PROFILE_VERSION,
    profileSchemaVersion: 4,
    catalog: [
      { path: 'education', kind: 'repeatable', safetyClass: 'ordinary', hasValue: true },
      ...Array.from({ length: desiredCount }, (_, recordIndex) => ({
        path: `education.${recordIndex}.school`, kind: 'text', safetyClass: 'ordinary', hasValue: true
      }))
    ],
    completeness: {
      totalScalarPaths: desiredCount,
      populatedScalarPaths: desiredCount,
      repeatableRoots: [{
        path: 'education', itemCount: desiredCount, nonEmptyItemCount: desiredCount, hasValue: true
      }]
    }
  };
  const actionSequence = [];
  const harness = createHarness({
    controls,
    profileSnapshot,
    onKernelExecute(input) {
      if (input.intent.kind === 'ensure_repeatable') {
        assert.equal(input.intent.index, pageRecordCount);
        pageRecordCount += 1;
        actionSequence.push(`add:${pageRecordCount - 1}`);
      } else {
        const match = /^education_school_ref_(\d+)$/.exec(input.ref);
        assert.ok(match);
        filledRecords.add(Number(match[1]));
        actionSequence.push(`fill:${match[1]}`);
      }
      return {
        requestId: input.requestId, ref: input.ref, action: input.intent.kind,
        status: 'verified', attempts: 1, strategy: 'test-primitive', verified: true
      };
    }
  });
  await harness.service.start();

  const result = await harness.service.autofill({ requestId: 'autofill_three_education_records' });

  assert.equal(result.status, 'completed');
  assert.equal(result.rounds, 6);
  assert.equal(result.verifiedCount, 6);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(actionSequence, [
    'add:0', 'fill:0',
    'add:1', 'fill:1',
    'add:2', 'fill:2'
  ]);
});

test('closed autofill returns a typed blocker when a represented repeatable section has no add control', async () => {
  const filledRecords = new Set();
  const controls = () => [{
    ref: 'education_school_only_0', role: 'textbox', tag: 'input', inputType: 'text',
    semantics: { label: '学校名称', name: 'education_list[0].school' },
    sectionContext: { kind: 'education', heading: '教育经历', recordIndex: 0 },
    disabled: false, readOnly: false, required: true, multiple: false,
    boundary: 'main', safety: 'ordinary', hasValue: filledRecords.has(0)
  }];
  const harness = createHarness({
    controls,
    profileSnapshot: {
      profileVersion: PROFILE_VERSION,
      profileSchemaVersion: 4,
      catalog: [
        { path: 'education', kind: 'repeatable', safetyClass: 'ordinary', hasValue: true },
        { path: 'education.0.school', kind: 'text', safetyClass: 'ordinary', hasValue: true },
        { path: 'education.1.school', kind: 'text', safetyClass: 'ordinary', hasValue: true }
      ],
      completeness: {
        totalScalarPaths: 2,
        populatedScalarPaths: 2,
        repeatableRoots: [{ path: 'education', itemCount: 2, nonEmptyItemCount: 2, hasValue: true }]
      }
    },
    onKernelExecute(input) {
      filledRecords.add(0);
      return {
        requestId: input.requestId, ref: input.ref, action: input.intent.kind,
        status: 'verified', attempts: 1, strategy: 'test-primitive', verified: true
      };
    }
  });
  await harness.service.start();

  const result = await harness.service.autofill({ requestId: 'autofill_missing_education_add' });

  assert.equal(result.status, 'user_action_required');
  assert.equal(result.rounds, 1);
  assert.deepEqual(result.blockers, [{
    code: 'repeatable_add_missing', sectionKind: 'education', pageCount: 1, targetCount: 2
  }]);
});

test('repeatable planning trusts section context when an add button omits the section heading', () => {
  const fields = [{
    ref: 'add_work_1234', section: 'work.0', label: '公司名称 职位名称 起止时间 描述', role: 'button',
    required: false, hasValue: false, capability: 'ensure_repeatable', safetyClass: 'ordinary', options: [], conditional: false
  }];
  const proposal = buildClosedAutofillProposal({
    fields,
    profilePathCatalog: [{ path: 'workExperiences', kind: 'repeatable', hasValue: true, safetyClass: 'ordinary' }],
    defaultResume: { hasValue: false, mimeType: 'application/pdf' }
  }, {
    repeatableCounts: { work: 2 },
    repeatables: new Map([['add_work_1234', { collection: 'workExperiences', index: 1 }]])
  });
  assert.deepEqual(proposal.decisions, [
    { kind: 'ensure_repeatable', ref: 'add_work_1234', profilePath: 'workExperiences' }
  ]);
});

test('closed autofill fills a known range start before adding the next record and never invents its missing end', () => {
  const fields = [
    {
      ref: 'required_range_0', section: 'internship.0', label: '起止时间', role: 'textbox',
      required: true, hasValue: false, capability: 'set_date_range', safetyClass: 'ordinary', options: [], conditional: false
    },
    {
      ref: 'add_internship_1', section: 'internship_list', label: '添加实习经历', role: 'button',
      required: false, hasValue: false, capability: 'ensure_repeatable', safetyClass: 'ordinary', options: [], conditional: false
    }
  ];
  const proposal = buildClosedAutofillProposal({
    fields,
    profilePathCatalog: [
      { path: 'workExperiences.0.startDate', kind: 'date', hasValue: true, safetyClass: 'ordinary' },
      { path: 'workExperiences.0.endDate', kind: 'date', hasValue: false, safetyClass: 'ordinary' },
      { path: 'workExperiences', kind: 'repeatable', hasValue: true, safetyClass: 'ordinary' }
    ],
    defaultResume: { hasValue: false, mimeType: 'application/pdf' }
  }, {
    experienceRouting: { work: [], internship: [0, 1] },
    repeatableCounts: { internship: 2 },
    repeatables: new Map([['add_internship_1', { collection: 'workExperiences', index: 1 }]])
  });
  assert.deepEqual(proposal.decisions, [
    { kind: 'map_date_range_start', ref: 'required_range_0', startProfilePath: 'workExperiences.0.startDate' },
    { kind: 'review', ref: 'add_internship_1', reason: 'page_state_conflict' }
  ]);
});

test('repeatable scheduling applies the same fill-before-add rule to every supported section kind', () => {
  const cases = [
    ['education', '学校名称', 'education.0.school', 'education'],
    ['work', '公司名称', 'workExperiences.0.company', 'workExperiences'],
    ['internship', '公司名称', 'workExperiences.1.company', 'workExperiences'],
    ['project', '项目名称', 'projects.0.name', 'projects'],
    ['language', '语言类型', 'languages.0.language', 'languages'],
    ['award', '奖项名称', 'awards.0.name', 'awards']
  ];
  const fields = cases.flatMap(([kind, label], index) => [{
    ref: `repeatable_value_ref_${index}`, section: `${kind}.0`, label, role: 'textbox',
    required: true, hasValue: false, capability: 'fill_text', safetyClass: 'ordinary', options: [], conditional: false
  }, {
    ref: `repeatable_add_ref_${index}`, section: `${kind}.0`, label: `添加${label}`, role: 'button',
    required: false, hasValue: false, capability: 'ensure_repeatable', safetyClass: 'ordinary', options: [], conditional: false
  }]);
  const profilePathCatalog = [
    ...new Set(cases.map(([, , , collection]) => collection))
  ].map((path) => ({ path, kind: 'repeatable', hasValue: true, safetyClass: 'ordinary' }));
  profilePathCatalog.push(...cases.map(([, , path]) => ({
    path, kind: 'text', hasValue: true, safetyClass: 'ordinary'
  })));
  const options = {
    experienceRouting: { work: [0], internship: [1] },
    repeatableCounts: Object.fromEntries(cases.map(([kind]) => [kind, 2])),
    repeatables: new Map(cases.map(([, , , collection], index) => [
      `repeatable_add_ref_${index}`, { collection, index: 1 }
    ]))
  };
  const request = {
    fields,
    profilePathCatalog,
    defaultResume: { hasValue: false, mimeType: 'application/pdf' }
  };

  const fillFirst = buildClosedAutofillProposal(request, options);
  assert.equal(fillFirst.decisions.filter((decision) => decision.kind === 'map').length, cases.length);
  assert.equal(fillFirst.decisions.filter((decision) => decision.kind === 'ensure_repeatable').length, 0);

  for (const field of request.fields) {
    if (field.capability !== 'ensure_repeatable') field.hasValue = true;
  }
  const addOne = buildClosedAutofillProposal(request, options);
  assert.equal(addOne.decisions.filter((decision) => decision.kind === 'ensure_repeatable').length, 1);
  assert.equal(addOne.decisions.find((decision) => decision.kind === 'ensure_repeatable')?.ref, 'repeatable_add_ref_0');
});

test('planner fields preserve section-first kind and record index', async () => {
  const controls = [{
    ref: 'node_school_1234', role: 'textbox', tag: 'input', inputType: 'text',
    semantics: { label: '学校名称', name: 'education_list' },
    sectionContext: { kind: 'education', heading: '教育经历', recordIndex: 1 },
    disabled: false, readOnly: false, required: true, multiple: false,
    boundary: 'main', safety: 'ordinary', hasValue: false
  }];
  const harness = createHarness({ controls });
  await harness.service.start();
  const inspected = await harness.service.inspect();
  assert.equal(inspected.fields[0].section, 'education.1');
});

test('repeatable counts use section record indexes instead of treating a populated card as missing', async () => {
  const field = (ref, recordIndex) => ({
    ref, role: 'textbox', tag: 'input', inputType: 'text', semantics: { label: '学校名称' },
    sectionContext: { kind: 'education', heading: '教育经历', recordIndex },
    disabled: false, readOnly: false, required: false, multiple: false,
    boundary: 'main', safety: 'ordinary', hasValue: false
  });
  const add = {
    ref: 'node_education_add', role: 'button', tag: 'button', inputType: 'button',
    semantics: { label: '添加教育经历', name: 'education_list.add' },
    sectionContext: { kind: 'education', heading: '教育经历', recordIndex: 1 },
    disabled: false, readOnly: false, required: false, multiple: false,
    boundary: 'main', safety: 'ordinary', hasValue: false
  };
  const harness = createHarness({ controls: [field('node_education_0', 0), field('node_education_1', 1), add] });
  harness.service.profileService.getAgentSnapshot = async () => ({
    profileVersion: PROFILE_VERSION,
    profileSchemaVersion: 4,
    catalog: [{ path: 'education', kind: 'repeatable', safetyClass: 'ordinary', hasValue: true }],
    completeness: { totalScalarPaths: 0, populatedScalarPaths: 0, repeatableRoots: [{ path: 'education', nonEmptyItemCount: 2 }] }
  });
  await harness.service.start();
  const inspected = await harness.service.inspect();
  assert.equal(inspected.fields.find((candidate) => candidate.ref === add.ref)?.capability, 'ensure_repeatable');
  assert.deepEqual(harness.service.inspection.repeatables.get(add.ref), { collection: 'education', index: 2 });
});

test('repeatable counts ignore unrelated controls that reuse a collection technical name', async () => {
  const education = {
    ref: 'node_education_only', role: 'textbox', tag: 'input', inputType: 'text',
    semantics: { label: '学校名称', name: 'education_list' },
    sectionContext: { kind: 'education', heading: '教育经历', recordIndex: 0 },
    disabled: false, readOnly: false, required: false, multiple: false,
    boundary: 'main', safety: 'ordinary', hasValue: true
  };
  const basic = (ref) => ({ ...education, ref, semantics: { label: '手机号码', name: 'education_list' },
    sectionContext: { kind: 'basic', heading: '个人信息', recordIndex: 0 } });
  const add = { ...education, ref: 'node_education_add_link', role: 'button', tag: 'a', inputType: undefined,
    semantics: { label: '添加教育经历', name: 'education_list.add' }, sectionContext: undefined, hasValue: false };
  const harness = createHarness({ controls: [basic('node_basic_dup_1'), basic('node_basic_dup_2'), education, add] });
  await harness.service.start();
  await harness.service.inspect();
  assert.deepEqual(harness.service.inspection.repeatables.get(add.ref), { collection: 'education', index: 1 });
});

test('repeatable collections without a section kind do not treat missing context as a record', async () => {
  const add = {
    ref: 'node_works_add', role: 'button', tag: 'button', inputType: 'button',
    semantics: { label: '添加作品', name: 'works_list.add' },
    disabled: false, readOnly: false, required: false, multiple: false,
    boundary: 'main', safety: 'ordinary', hasValue: false
  };
  const harness = createHarness({ controls: [
    { ...observedControls()[0], ref: 'node_unsectioned_text' }, add
  ] });
  await harness.service.start();
  await harness.service.inspect();
  assert.deepEqual(harness.service.inspection.repeatables.get(add.ref), { collection: 'workSamples', index: 0 });
});

test('a single semantic resume field uploads the saved default PDF without exposing asset details', async () => {
  const controls = [{
    ref: 'node_resume_1234', role: 'textbox', tag: 'input', inputType: 'file',
    semantics: { label: '上传简历', name: 'resume_file' }, disabled: false, readOnly: false,
    required: true, multiple: false, boundary: 'main', safety: 'file', hasValue: false
  }];
  const harness = createHarness({ controls, resumeAvailable: true });
  const { inspected, planned } = await inspectAndPlan(harness);
  assert.deepEqual(inspected.defaultResume, { hasValue: true, mimeType: 'application/pdf' });
  assert.equal(inspected.fields[0].capability, 'upload_saved_resume');
  assert.equal(planned.uploadCount, 1);
  assert.equal(planned.executableCount, 1);
  const executed = await harness.service.execute({ planId: planned.planId, requestId: 'request_resume01' });
  assert.equal(executed.status, 'completed');
  assert.equal(executed.verifiedCount, 1);
  const execution = harness.kernelCalls.find((call) => call.kind === 'execute');
  assert.deepEqual(execution.input.intent, { kind: 'upload_saved_resume' });
  const audit = await harness.service.audit();
  assert.equal(audit.summary.resumeUploads, 1);
  assert.equal(audit.summary.finalSubmits, 0);
  const serialized = JSON.stringify({ inspected, planned, executed, audit });
  assert.equal(/"(?:filePath|filename|bytes)"|\.pdf/i.test(serialized), false);
});

test('multiple resume-like file inputs stay read-only instead of becoming an ambiguous upload plan', async () => {
  const resumeControl = (ref) => ({
    ref, role: 'textbox', tag: 'input', inputType: 'file',
    semantics: { label: '上传简历', name: 'resume_file' }, disabled: false, readOnly: false,
    required: true, multiple: false, boundary: 'main', safety: 'file', hasValue: false
  });
  const harness = createHarness({
    controls: [resumeControl('node_resume_1234'), resumeControl('node_resume_5678')],
    resumeAvailable: true
  });
  await harness.service.start();
  const inspected = await harness.service.inspect();
  assert.deepEqual(inspected.fields.map((field) => field.capability), ['read_only', 'read_only']);
  assert.equal(inspected.fields.some((field) => field.capability === 'upload_saved_resume'), false);
  assert.equal(harness.kernelCalls.some((call) => call.kind === 'execute'), false);
});

test('an already uploaded resume stays read-only across a fresh inspection', async () => {
  const harness = createHarness({
    controls: [{
      ref: 'node_resume_existing', role: 'textbox', tag: 'input', inputType: 'file',
      semantics: { label: '更新简历', name: 'resume_file' }, disabled: false, readOnly: false,
      required: true, multiple: false, boundary: 'main', safety: 'file', hasValue: true
    }],
    resumeAvailable: true
  });
  await harness.service.start();
  const inspected = await harness.service.inspect();
  assert.equal(inspected.fields[0].hasValue, true);
  assert.equal(inspected.fields[0].capability, 'read_only');
  assert.equal(harness.kernelCalls.some((call) => call.kind === 'execute'), false);
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

test('page-readiness states expose one specific user recovery action', async () => {
  const cases = [
    ['login-needed', 'login_in_browser', 'qiuzhao agent status'],
    ['verification-needed', 'complete_verification_in_browser', 'qiuzhao agent status'],
    ['confirmation-needed', 'confirm_ready', 'qiuzhao browser confirm-ready']
  ];
  for (const [kernelState, recommendedAction, recoveryCommand] of cases) {
    const harness = createHarness({ kernelState });
    await harness.service.start();
    const status = await harness.service.workspaceStatus();
    assert.deepEqual(status.browser, {
      state: kernelState,
      origin: undefined,
      path: undefined,
      errorCode: 'cdp_unavailable',
      recommendedAction,
      recoveryCommand
    });
    await assert.rejects(() => harness.service.inspect(), (error) => error?.code === 'browser_not_ready');
    assert.equal(harness.kernelCalls.some((call) => call.kind === 'execute'), false);
  }
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
  const budget = createHarness({ maxReplanRounds: 4 });
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
