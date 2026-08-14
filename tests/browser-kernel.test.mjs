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

function fixture({ outcome, profileVersion = 'profile_12345678', controls = [control()] } = {}) {
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
      if (method === 'Runtime.callFunctionOn') return { result: { value: outcome ?? { performed: true, verified: true, strategy: 'native-setter' } } };
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
    inspectControlTarget() { return { fingerprint: 'fingerprint' }; },
    findPageControls(inputState, query) {
      const matches = inputState.controls.filter((item) => item.semantics.label.includes(query.text)).map((item) => ({
        ref: item.ref, role: item.role, label: item.semantics.label, score: 1, reasons: ['label'], safety: item.safety
      }));
      return { snapshotId: inputState.snapshotId, query: query.text, searchedControlCount: inputState.controls.length, matches };
    }
  };
  const snapshot = {
    profileVersion,
    catalog: [{ path: 'basic.fullName', kind: 'text', safetyClass: 'ordinary', hasValue: true }],
    completeness: { repeatableRoots: [] }
  };
  const profileService = {
    async getAgentSnapshot() { return snapshot; },
    createResolver() { return { async resolveScalar() { return 'LOCAL_VALUE'; } }; }
  };
  const kernel = new ZeroExtensionBrowserKernel({
    browserSession, profileService, now: () => 1000, createId: () => 'nonce_12345678',
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
  assert.deepEqual(context.calls.map((call) => call.method), ['DOM.getDocument', 'DOM.resolveNode', 'Runtime.callFunctionOn', 'Runtime.releaseObjectGroup']);
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
  assert.equal(context.calls.filter((item) => item.method === 'Runtime.callFunctionOn' && !String(item.params.functionDeclaration).includes('qiuzhaoPresence')).length, 1);
  const audit = context.kernel.audit();
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.summary.verified, 1);
  assert.equal(audit.summary.finalSubmits, 0);
  assert.equal(JSON.stringify(audit).includes('LOCAL_VALUE'), false);
});

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
