import assert from 'node:assert/strict';
import test from 'node:test';
import { ZeroExtensionBrowserKernel } from '../modules/browser-kernel/runtime.mjs';

const connection = {
  launchId: 'session_12345678',
  profileId: 'profile_12345678',
  cdpPort: 43123,
  targetId: 'target_12345678',
  origin: 'https://xiaomi.jobs.f.mioffice.cn',
  pathPattern: '/internship/resume/:id/apply'
};

function control(overrides = {}) {
  return {
    ref: 'node_test_0001', role: 'textbox', tag: 'input', inputType: 'text',
    semantics: { label: '姓名', name: 'basic_info.name' }, disabled: false,
    readOnly: false, required: true, multiple: false, boundary: 'main', safety: 'ordinary',
    ...overrides
  };
}

function fixture({
  outcome, profileVersion = 'profile_12345678', controls = [control()], resumeAsset,
  catalog = [{ path: 'basic.fullName', kind: 'text', safetyClass: 'ordinary', hasValue: true }],
  resolvedValues = { 'basic.fullName': 'LOCAL_VALUE' }, repeatableRoots = []
} = {}) {
  let currentConnection = { ...connection };
  const target = {
    frameKey: 'main', backendNodeId: 7, fingerprint: 'fingerprint', role: controls[0].role,
    tag: controls[0].tag, inputType: controls[0].inputType, safety: controls[0].safety,
    boundary: 'main', disabled: false, readOnly: false,
    origin: connection.origin, path: connection.pathPattern
  };
  const state = {
    snapshotId: 'snapshot_12345678', origin: connection.origin, path: connection.pathPattern,
    controls, summary: { controlCount: controls.length, frameCount: 1, openShadowRootCount: 0, blockedControlCount: 0 }
  };
  const calls = [];
  const cdp = {
    async connect() {}, close() {},
    async send(method, params) {
      calls.push({ method, params });
      if (method === 'DOM.getDocument') return { root: { backendNodeId: 1 } };
      if (method === 'DOM.resolveNode') return { object: { objectId: 'object-1' } };
      if (method === 'Runtime.callFunctionOn' && String(params.functionDeclaration).includes('qiuzhaoPresence')) return { result: { value: false } };
      if (method === 'Runtime.callFunctionOn' && String(params.functionDeclaration).includes('qiuzhaoVerifyResume')) return { result: { value: true } };
      if (method === 'Runtime.callFunctionOn') {
        const payload = params.arguments?.[0]?.value;
        const fixedOutcome = typeof outcome === 'function' ? outcome(payload) : outcome;
        return { result: { value: fixedOutcome ?? { performed: true, verified: true, strategy: 'native-setter' } } };
      }
      return {};
    }
  };
  const browserSession = { async connection() { return { ...currentConnection }; } };
  const pageModule = {
    OpaqueReferenceRegistry: class {
      reference() { return controls[0].ref; }
      snapshot() { return state.snapshotId; }
      resolve(sessionId, snapshotId, ref) {
        return sessionId === connection.launchId && snapshotId === state.snapshotId && ref === controls[0].ref ? target : null;
      }
      invalidate() {}
    },
    buildPrivacySafePageState() { return state; },
    inspectControlTarget() { return { fingerprint: 'fingerprint', control: controls[0] }; },
    findPageControls(inputState, query) {
      const matches = inputState.controls.filter((item) => item.semantics.label.includes(query.text)).map((item) => ({
        ref: item.ref, role: item.role, label: item.semantics.label, score: 1, reasons: ['label'], safety: item.safety
      }));
      return { snapshotId: inputState.snapshotId, query: query.text, searchedControlCount: inputState.controls.length, matches };
    }
  };
  const snapshot = {
    profileVersion,
    catalog,
    completeness: { repeatableRoots }
  };
  const profileService = {
    async getAgentSnapshot() { return snapshot; },
    createResolver() { return { async resolveScalar({ profilePath }) { return resolvedValues[profilePath] ?? ''; } }; }
  };
  const kernel = new ZeroExtensionBrowserKernel({
    browserSession, profileService, resumeAsset, now: () => 1000, createId: () => 'nonce_12345678',
    cdpFactory: () => cdp, loadPageModule: async () => pageModule,
    loadFixedAction: async () => 'function (payload) { return payload; }'
  });
  return { kernel, calls, state, setConnection(value) { currentConnection = value; } };
}

async function ready(context) {
  await context.kernel.start();
  const observed = await context.kernel.observe();
  context.kernel.grantOrdinaryLease({
    leaseId: 'lease_12345678', origin: connection.origin,
    profileVersion: 'profile_12345678', expiresAt: 2000
  });
  return observed;
}

test('typed kernel observes and finds without page values', async () => {
  const context = fixture();
  await context.kernel.start();
  const observed = await context.kernel.observe();
  assert.equal(observed.state.controls[0].semantics.label, '姓名');
  assert.equal(observed.state.controls[0].hasValue, false);
  assert.equal(JSON.stringify(observed).includes('LOCAL_VALUE'), false);
  assert.equal(context.kernel.find({ pageEpoch: observed.pageEpoch, query: { text: '姓名' } }).matches.length, 1);
  assert.equal(context.calls[0].params.depth, 40);
  assert.deepEqual(context.calls.map((call) => call.method), ['DOM.getDocument', 'DOM.resolveNode', 'Runtime.callFunctionOn', 'Runtime.releaseObjectGroup']);
  const presenceSource = context.calls.find((call) => call.method === 'Runtime.callFunctionOn')?.params.functionDeclaration;
  assert.match(presenceSource, /tag !== 'input' \|\| !customSelectInput/);
  assert.match(presenceSource, /const localSelectRoot = element\?\.closest/);
  assert.match(presenceSource, /selector__selectItem/);
  assert.match(presenceSource, /editableSearch && !stableChild/);
  assert.match(presenceSource, /periodInputBegin/);
  assert.match(presenceSource, /return Boolean\(selected\)/);
});

test('ordinary buttons do not run scalar presence probes', async () => {
  const context = fixture({ controls: [control({ role: 'button', tag: 'button', inputType: 'button' })] });
  await context.kernel.start();
  const observed = await context.kernel.observe();
  assert.equal(observed.state.controls[0].hasValue, null);
  assert.deepEqual(context.calls.map((call) => call.method), ['DOM.getDocument']);
});

test('no-work checkbox derives only an empty/non-empty Boolean from the local collection', async () => {
  const context = fixture({
    controls: [control({ role: 'checkbox', tag: 'input', inputType: 'checkbox' })],
    catalog: [{ path: 'workExperiences', kind: 'repeatable', safetyClass: 'ordinary', hasValue: true }],
    repeatableRoots: [{ path: 'workExperiences', itemCount: 2, nonEmptyItemCount: 2, hasValue: true }]
  });
  const observed = await ready(context);
  const result = await context.kernel.execute({
    requestId: 'request_no_work', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: observed.state.controls[0].ref,
    intent: { kind: 'set_boolean_from_collection_empty', collection: 'workExperiences' }
  });
  assert.equal(result.verified, true);
  const action = context.calls.find((item) => item.method === 'Runtime.callFunctionOn'
    && !String(item.params.functionDeclaration).includes('qiuzhaoPresence'));
  assert.deepEqual(action.params.arguments[0].value, { action: 'check', strategy: 'primary', desired: 'unchecked' });
});

test('a framework-delayed checkbox commit receives one idempotent desired-state verification retry', async () => {
  let attempts = 0;
  const context = fixture({
    controls: [control({ role: 'checkbox', tag: 'input', inputType: 'checkbox' })],
    catalog: [{ path: 'workExperiences', kind: 'repeatable', safetyClass: 'ordinary', hasValue: false }],
    repeatableRoots: [{ path: 'workExperiences', itemCount: 0, nonEmptyItemCount: 0, hasValue: false }],
    outcome(payload) {
      if (payload.action !== 'check') return undefined;
      attempts += 1;
      return attempts === 1
        ? { performed: true, verified: false, strategy: 'exact-check', reason: 'verification-failed' }
        : { performed: true, verified: true, strategy: 'exact-check' };
    }
  });
  const observed = await ready(context);
  const result = await context.kernel.execute({
    requestId: 'request_delayed_check', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: observed.state.controls[0].ref,
    intent: { kind: 'set_boolean_from_collection_empty', collection: 'workExperiences' }
  });
  assert.equal(result.verified, true);
  assert.equal(result.attempts, 2);
  assert.equal(attempts, 2);
});

test('no-work checkbox counts only work-typed records when work and internship sections are separate', async () => {
  const context = fixture({
    controls: [
      control({
        role: 'checkbox', tag: 'input', inputType: 'checkbox',
        sectionContext: { kind: 'work', heading: 'work', recordIndex: 0 }
      }),
      control({
        ref: 'node_internship_context',
        sectionContext: { kind: 'internship', heading: 'internship', recordIndex: 0 }
      })
    ],
    catalog: [
      { path: 'workExperiences', kind: 'repeatable', safetyClass: 'ordinary', hasValue: true },
      { path: 'workExperiences.0.experienceType', kind: 'text', safetyClass: 'ordinary', hasValue: true },
      { path: 'workExperiences.1.experienceType', kind: 'text', safetyClass: 'ordinary', hasValue: true }
    ],
    resolvedValues: {
      'workExperiences.0.experienceType': 'internship',
      'workExperiences.1.experienceType': 'internship'
    },
    repeatableRoots: [{ path: 'workExperiences', itemCount: 2, nonEmptyItemCount: 2, hasValue: true }]
  });
  const observed = await ready(context);
  const result = await context.kernel.execute({
    requestId: 'request_no_typed_work', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: observed.state.controls[0].ref,
    intent: { kind: 'set_boolean_from_collection_empty', collection: 'workExperiences' }
  });
  assert.equal(result.verified, true);
  const action = context.calls.find((item) => item.method === 'Runtime.callFunctionOn'
    && !String(item.params.functionDeclaration).includes('qiuzhaoPresence'));
  assert.deepEqual(action.params.arguments[0].value, { action: 'check', strategy: 'primary', desired: 'checked' });
});

test('repeatable guard accepts a semantic inert-anchor target and counts section records', async () => {
  const add = control({
    ref: 'node_add_work_1', role: 'button', tag: 'a', inputType: undefined,
    semantics: { label: 'add', name: 'work_experience_list.add' },
    sectionContext: { kind: 'work', heading: 'work', recordIndex: 0 }
  });
  const existing = control({
    ref: 'node_work_company', semantics: { label: 'company', name: 'company' },
    sectionContext: { kind: 'work', heading: 'work', recordIndex: 0 }
  });
  const unrelatedOne = control({
    ref: 'node_basic_duplicate_one', semantics: { label: 'phone', name: 'work_experience_list' },
    sectionContext: { kind: 'basic', heading: 'basic', recordIndex: 0 }
  });
  const unrelatedTwo = control({
    ref: 'node_basic_duplicate_two', semantics: { label: 'phone', name: 'work_experience_list' },
    sectionContext: { kind: 'basic', heading: 'basic', recordIndex: 0 }
  });
  const context = fixture({
    controls: [add, existing, unrelatedOne, unrelatedTwo],
    catalog: [{ path: 'workExperiences', kind: 'repeatable', safetyClass: 'ordinary', hasValue: true }],
    repeatableRoots: [{ path: 'workExperiences', itemCount: 2, nonEmptyItemCount: 2, hasValue: true }]
  });
  const observed = await ready(context);
  const result = await context.kernel.execute({
    requestId: 'request_add_work', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: add.ref,
    intent: { kind: 'ensure_repeatable', collection: 'workExperiences', index: 1 }
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'verification_failed');
  assert.equal(context.calls.some((item) => item.method === 'Runtime.callFunctionOn'
    && item.params.arguments?.[0]?.value?.purpose === 'add-repeatable-record'), true);
});

test('kernel start automatically reconnects a disconnected dedicated browser session', async () => {
  let connectionAttempts = 0;
  let reconnectAttempts = 0;
  const cdp = { async connect() {}, close() {} };
  const pageModule = { OpaqueReferenceRegistry: class {} };
  const browserSession = {
    async connection() {
      connectionAttempts += 1;
      if (connectionAttempts === 1) throw new Error('session_not_ready');
      return { ...connection };
    },
    async status() { return { state: 'disconnected', errorCode: 'cdp_unavailable' }; },
    async reconnect() {
      reconnectAttempts += 1;
      return { state: 'ready' };
    }
  };
  const kernel = new ZeroExtensionBrowserKernel({
    browserSession,
    profileService: {},
    cdpFactory: () => cdp,
    loadPageModule: async () => pageModule,
    loadFixedAction: async () => 'function () {}'
  });
  assert.equal((await kernel.start()).state, 'ready');
  assert.equal(reconnectAttempts, 1);
  assert.equal(connectionAttempts, 2);
  assert.equal(kernel.status().state, 'ready');
});

test('kernel exposes disconnected state instead of throwing when CDP recovery fails', async () => {
  const browserSession = {
    async connection() { throw new Error('session_not_ready'); },
    async status() { return { state: 'disconnected', errorCode: 'cdp_unavailable' }; },
    async reconnect() { throw new Error('browser_startup_timeout'); }
  };
  const kernel = new ZeroExtensionBrowserKernel({ browserSession, profileService: {} });
  const status = await kernel.start();
  assert.equal(status.state, 'disconnected');
  assert.equal(status.errorCode, 'cdp_unavailable');
  assert.equal(status.authorized, false);
  await assert.rejects(() => kernel.observe(), /kernel_not_started/);
});

test('kernel status reattaches after the separately restarted browser becomes ready', async () => {
  let ready = false;
  const cdp = { async connect() {}, close() {} };
  const browserSession = {
    async connection() {
      if (!ready) throw new Error('session_not_ready');
      return { ...connection };
    },
    async status() { return ready ? { state: 'ready' } : { state: 'stopped', errorCode: 'session_missing' }; }
  };
  const kernel = new ZeroExtensionBrowserKernel({
    browserSession,
    profileService: {},
    cdpFactory: () => cdp,
    loadPageModule: async () => ({ OpaqueReferenceRegistry: class {} }),
    loadFixedAction: async () => 'function () {}'
  });
  assert.equal((await kernel.start()).state, 'stopped');
  ready = true;
  assert.equal((await kernel.refreshStatus()).state, 'ready');
});

test('ordinary action resolves the value locally and returns Boolean verification only', async () => {
  const context = fixture();
  const observed = await ready(context);
  const request = {
    requestId: 'request_12345678', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: observed.state.controls[0].ref,
    intent: { kind: 'fill_text', profilePath: 'basic.fullName' }
  };
  const result = await context.kernel.execute(request);
  assert.equal(result.status, 'verified');
  assert.equal(result.verified, true);
  assert.equal(JSON.stringify(result).includes('LOCAL_VALUE'), false);
  const call = context.calls.find((item) => item.method === 'Runtime.callFunctionOn' && !String(item.params.functionDeclaration).includes('qiuzhaoPresence'));
  assert.equal(call.params.arguments[0].value.expected, 'LOCAL_VALUE');
  const replay = await context.kernel.execute(request);
  assert.deepEqual(replay, result);
  // A delayed `verify-keyboard` call re-reads after a framework render boundary;
  // it is not a second primary write attempt.
  assert.equal(context.calls.filter((item) => item.method === 'Runtime.callFunctionOn'
    && item.params.arguments?.[0]?.value?.strategy === 'primary').length, 1);
  const audit = context.kernel.audit();
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.summary.verified, 1);
  assert.equal(audit.summary.finalSubmits, 0);
  assert.equal(JSON.stringify(audit).includes('LOCAL_VALUE'), false);
});

test('date range resolves a matched local start/end pair and uses the atomic range primitive', async () => {
  const rangeControl = control({ tag: 'custom', inputType: 'date-range', semantics: { label: '起止时间', name: 'education.0.start_end_time' } });
  const context = fixture({
    controls: [rangeControl],
    outcome: { performed: true, verified: true, strategy: 'native-date-range' },
    catalog: [
      { path: 'education.0.startDate', kind: 'date', safetyClass: 'ordinary', hasValue: true },
      { path: 'education.0.endDate', kind: 'date', safetyClass: 'ordinary', hasValue: true }
    ],
    resolvedValues: { 'education.0.startDate': '2020-09', 'education.0.endDate': '2024-06' }
  });
  const observed = await ready(context);
  const result = await context.kernel.execute({
    requestId: 'request_date_range', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: rangeControl.ref,
    intent: { kind: 'set_date_range', startProfilePath: 'education.0.startDate', endProfilePath: 'education.0.endDate' }
  });
  assert.equal(result.status, 'verified');
  assert.equal(result.strategy, 'native-date-range');
  const call = context.calls.find((item) => item.method === 'Runtime.callFunctionOn' && !String(item.params.functionDeclaration).includes('qiuzhaoPresence'));
  assert.deepEqual(call.params.arguments[0].value, {
    action: 'fill-range', strategy: 'primary', expectedStart: '2020-09', expectedEnd: '2024-06', rangeMode: 'native'
  });
  assert.equal(JSON.stringify({ result, audit: context.kernel.audit() }).includes('2020-09'), false);
});

test('start-only date range leaves the missing local end unresolved and unexposed', async () => {
  const rangeControl = control({
    tag: 'custom', inputType: 'date-range',
    semantics: { label: 'date range', name: 'workExperiences.0.start_end_time' }
  });
  const context = fixture({
    controls: [rangeControl],
    outcome: { performed: true, verified: true, strategy: 'native-date-range' },
    catalog: [
      { path: 'workExperiences.0.startDate', kind: 'date', safetyClass: 'ordinary', hasValue: true },
      { path: 'workExperiences.0.endDate', kind: 'date', safetyClass: 'ordinary', hasValue: false }
    ],
    resolvedValues: { 'workExperiences.0.startDate': '2026-05' }
  });
  const observed = await ready(context);
  const result = await context.kernel.execute({
    requestId: 'request_range_start', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: rangeControl.ref,
    intent: { kind: 'set_date_range_start', startProfilePath: 'workExperiences.0.startDate' }
  });
  assert.equal(result.status, 'verified');
  const call = context.calls.find((item) => item.method === 'Runtime.callFunctionOn'
    && !String(item.params.functionDeclaration).includes('qiuzhaoPresence'));
  assert.deepEqual(call.params.arguments[0].value, {
    action: 'fill-range', strategy: 'primary', expectedStart: '2026-05', startOnly: true, rangeMode: 'native'
  });
  assert.equal(JSON.stringify(result).includes('2026-05'), false);
});

test('controlled four-part ranges pace ordered substeps and retry one asynchronous menu mount', async () => {
  const seenSteps = [];
  const attemptsByStep = new Map();
  const rangeControl = control({
    tag: 'custom', inputType: 'year-month-range',
    semantics: { label: 'date range', name: 'education.0.start_end_time' }
  });
  const context = fixture({
    controls: [rangeControl],
    outcome(payload) {
      seenSteps.push(payload.rangeStep);
      if (payload.rangeStep === undefined) {
        return { performed: true, verified: false, strategy: 'year-month-select-range', reason: 'option-not-found' };
      }
      if (payload.rangeStep === 'verify') {
        return { performed: true, verified: true, strategy: 'year-month-select-range' };
      }
      const count = (attemptsByStep.get(payload.rangeStep) ?? 0) + 1;
      attemptsByStep.set(payload.rangeStep, count);
      return count === 1
        ? { performed: true, verified: false, strategy: 'year-month-select-range', reason: 'option-not-found' }
        : { performed: true, verified: true, strategy: 'year-month-select-range' };
    },
    catalog: [
      { path: 'education.0.startDate', kind: 'date', safetyClass: 'ordinary', hasValue: true },
      { path: 'education.0.endDate', kind: 'date', safetyClass: 'ordinary', hasValue: true }
    ],
    resolvedValues: { 'education.0.startDate': '2020-09', 'education.0.endDate': '2024-06' }
  });
  const observed = await ready(context);
  const result = await context.kernel.execute({
    requestId: 'request_paced_date_range', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: rangeControl.ref,
    intent: { kind: 'set_date_range', startProfilePath: 'education.0.startDate', endProfilePath: 'education.0.endDate' }
  });
  assert.equal(result.status, 'verified');
  assert.equal(result.attempts, 10);
  assert.deepEqual(seenSteps, [undefined, 0, 0, 1, 1, 2, 2, 3, 3, 'verify']);
  assert.equal(JSON.stringify({ result, audit: context.kernel.audit() }).includes('2020-09'), false);
});

test('resume upload uses only the injected default asset, verifies Boolean file metadata, and returns no path', async () => {
  const materializations = [];
  const resumeAsset = {
    async withMaterializedFile(callback) {
      materializations.push(true);
      return callback({
        filePath: 'C:\\Temp\\qiuzhao-resume-upload-test\\resume.pdf',
        metadata: { name: 'resume.pdf', mimeType: 'application/pdf', size: 2048 }
      });
    }
  };
  const resumeControl = control({
    role: 'textbox', tag: 'input', inputType: 'file', safety: 'file', multiple: false,
    semantics: { label: '上传简历', name: 'resume_file' }
  });
  const context = fixture({ controls: [resumeControl], resumeAsset });
  const observed = await ready(context);
  const result = await context.kernel.execute({
    requestId: 'request_resume01', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: observed.state.controls[0].ref,
    intent: { kind: 'upload_saved_resume' }
  });
  assert.equal(result.status, 'verified');
  assert.equal(result.verified, true);
  assert.equal(result.attempts, 1);
  assert.equal(result.strategy, 'cdp-file-input');
  assert.equal(materializations.length, 1);
  const upload = context.calls.find((call) => call.method === 'DOM.setFileInputFiles');
  assert.deepEqual(upload.params, {
    files: ['C:\\Temp\\qiuzhao-resume-upload-test\\resume.pdf'],
    backendNodeId: 7
  });
  const serialized = JSON.stringify({ result, audit: context.kernel.audit() });
  assert.equal(serialized.includes('C:\\\\Temp'), false);
  assert.equal(serialized.includes('resume.pdf'), false);
  assert.equal(context.kernel.audit().summary.resumeUploads, 1);
  assert.equal(context.kernel.audit().summary.finalSubmits, 0);
});

test('resume upload rejects ambiguous or protected attachment signals before materializing a file', async () => {
  let materialized = false;
  let lastContext;
  const resumeAsset = { async withMaterializedFile() { materialized = true; } };
  for (const semantics of [
    { label: '上传身份证', name: 'identity_file' },
    { label: '上传作品集', name: 'portfolio' },
    { label: '上传简历照片', name: 'resume_photo' }
  ]) {
    const context = fixture({
      controls: [control({ role: 'textbox', tag: 'input', inputType: 'file', safety: 'file', semantics })],
      resumeAsset
    });
    lastContext = context;
    const observed = await ready(context);
    const result = await context.kernel.execute({
      requestId: `request_block_${semantics.name}`, leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
      pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: observed.state.controls[0].ref,
      intent: { kind: 'upload_saved_resume' }
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'blocked_control');
  }
  assert.equal(materialized, false);
  assert.equal(lastContext.kernel.audit().summary.finalSubmits, 0);
});

test('a cleanup failure after CDP upload remains failed but records the real attempt', async () => {
  const cleanupError = new Error('resume_cleanup_failed');
  cleanupError.code = 'resume_cleanup_failed';
  const resumeAsset = {
    async withMaterializedFile(callback) {
      await callback({
        filePath: 'C:\\Temp\\qiuzhao-resume-upload-test\\resume.pdf',
        metadata: { name: 'resume.pdf', mimeType: 'application/pdf', size: 2048 }
      });
      throw cleanupError;
    }
  };
  const context = fixture({
    controls: [control({
      role: 'textbox', tag: 'input', inputType: 'file', safety: 'file', multiple: false,
      semantics: { label: '上传简历', name: 'resume_file' }
    })],
    resumeAsset
  });
  const observed = await ready(context);
  const outcome = await context.kernel.execute({
    requestId: 'request_cleanup01', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: observed.state.controls[0].ref,
    intent: { kind: 'upload_saved_resume' }
  });
  expectCleanupFailure(outcome);
  assert.equal(context.kernel.audit().summary.attempts, 1);
  assert.equal(context.kernel.audit().summary.resumeUploads, 0);
});

function expectCleanupFailure(outcome) {
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.reason, 'resume_cleanup_failed');
  assert.equal(outcome.attempts, 1);
  assert.equal(outcome.verified, false);
  return outcome;
}

test('bounded wait reobserves and pause invalidates both lease and page epoch', async () => {
  const context = fixture();
  const observed = await ready(context);
  const waited = await context.kernel.wait({
    requestId: 'waitreq_12345678', pageEpoch: observed.pageEpoch,
    condition: { kind: 'find', text: '姓名', minimumMatches: 1 }, timeoutMs: 100, pollIntervalMs: 25
  });
  assert.equal(waited.status, 'matched');
  assert.ok(waited.pageEpoch > observed.pageEpoch);
  assert.deepEqual(context.kernel.pause(), { state: 'paused', pageEpoch: waited.pageEpoch });
  assert.throws(() => context.kernel.find({ pageEpoch: waited.pageEpoch, query: { text: '姓名' } }), /stale_page_epoch/);
  assert.equal(context.kernel.status().authorized, false);
});

test('malicious commands, arbitrary values, selectors, and protected controls fail closed', async () => {
  const context = fixture({ controls: [control({ safety: 'identity' })] });
  const observed = await ready(context);
  const base = {
    requestId: 'request_12345678', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: observed.state.controls[0].ref
  };
  await assert.rejects(() => context.kernel.execute({ ...base, intent: { kind: 'eval', script: 'alert(1)' } }), /unknown_action/);
  await assert.rejects(() => context.kernel.execute({ ...base, value: 'secret', intent: { kind: 'fill_text', profilePath: 'basic.fullName' } }), /invalid_action_request/);
  await assert.rejects(() => context.kernel.execute({ ...base, selector: '#name', intent: { kind: 'fill_text', profilePath: 'basic.fullName' } }), /invalid_action_request/);
  const blocked = await context.kernel.execute({ ...base, intent: { kind: 'fill_text', profilePath: 'basic.fullName' } });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.reason, 'unsafe_control');
  assert.equal(context.calls.some((item) => item.method === 'Runtime.callFunctionOn' && !String(item.params.functionDeclaration).includes('qiuzhaoPresence')), false);
});

test('stale epoch, changed page, changed profile, and conflicting replay never write', async () => {
  const context = fixture();
  const observed = await ready(context);
  const base = {
    requestId: 'request_12345678', leaseId: 'lease_12345678', profileVersion: 'profile_12345678',
    pageEpoch: observed.pageEpoch, snapshotId: observed.state.snapshotId, ref: observed.state.controls[0].ref,
    intent: { kind: 'fill_text', profilePath: 'basic.fullName' }
  };
  await assert.rejects(() => context.kernel.execute({ ...base, pageEpoch: observed.pageEpoch + 1 }), /stale_page_epoch/);
  context.setConnection({ ...connection, pathPattern: '/internship/login' });
  await assert.rejects(() => context.kernel.execute(base), /page_identity_changed/);
  assert.equal(context.calls.some((item) => item.method === 'Runtime.callFunctionOn' && !String(item.params.functionDeclaration).includes('qiuzhaoPresence')), false);

  const profileContext = fixture({ profileVersion: 'profile_changed8' });
  const profileObserved = await ready(profileContext);
  const staleProfile = await profileContext.kernel.execute({ ...base, pageEpoch: profileObserved.pageEpoch, snapshotId: profileObserved.state.snapshotId });
  assert.equal(staleProfile.reason, 'stale_profile_version');
  assert.equal(profileContext.calls.some((item) => item.method === 'Runtime.callFunctionOn' && !String(item.params.functionDeclaration).includes('qiuzhaoPresence')), false);

  const replayContext = fixture();
  const replayObserved = await ready(replayContext);
  const first = { ...base, pageEpoch: replayObserved.pageEpoch, snapshotId: replayObserved.state.snapshotId };
  await replayContext.kernel.execute(first);
  await assert.rejects(() => replayContext.kernel.execute({ ...first, intent: { kind: 'select_option', profilePath: 'basic.fullName' } }), /duplicate_request_conflict/);
});
