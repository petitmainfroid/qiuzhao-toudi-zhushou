import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessPageReadiness,
  classifyReadinessSignals,
  collectReadinessSignals,
  parseReadinessSignals
} from '../modules/page-readiness/index.mjs';

function signals(overrides = {}) {
  return {
    documentReady: true,
    visibleControlCount: 8,
    ordinaryControlCount: 8,
    passwordControlCount: 0,
    verificationControlCount: 0,
    applicationSemanticCount: 4,
    resumeControlCount: 1,
    loginActionCount: 0,
    verificationActionCount: 0,
    finalActionCount: 1,
    ...overrides
  };
}

test('generic structural signals distinguish application, login, verification, and unknown states', () => {
  assert.equal(classifyReadinessSignals(signals(), { origin: 'https://jobs.example', pathPattern: '/resume/:id/apply' }), 'application_ready');
  assert.equal(classifyReadinessSignals(signals({
    visibleControlCount: 2, ordinaryControlCount: 1, passwordControlCount: 1,
    applicationSemanticCount: 0, resumeControlCount: 0, finalActionCount: 0
  }), { pathPattern: '/account/login' }), 'login_required');
  assert.equal(classifyReadinessSignals(signals({
    visibleControlCount: 5, ordinaryControlCount: 5, applicationSemanticCount: 2,
    resumeControlCount: 0, finalActionCount: 0
  }), { origin: 'https://passport.example.com', pathPattern: '/cnwebauthnv3/preLogin' }), 'login_required');
  assert.equal(classifyReadinessSignals(signals({
    verificationControlCount: 1, passwordControlCount: 1
  }), { pathPattern: '/login' }), 'verification_required');
  assert.equal(classifyReadinessSignals(signals({
    visibleControlCount: 1, ordinaryControlCount: 1, applicationSemanticCount: 0,
    resumeControlCount: 0, finalActionCount: 0
  }), { pathPattern: '/jobs' }), 'unknown');
  assert.equal(classifyReadinessSignals(signals({
    visibleControlCount: 8, ordinaryControlCount: 8, applicationSemanticCount: 1,
    resumeControlCount: 0, finalActionCount: 3
  }), { origin: 'https://jobs.example', pathPattern: '/job-list' }), 'unknown');
});

test('signal parsing is closed, bounded, and rejects page-controlled extra data', () => {
  assert.deepEqual(parseReadinessSignals(signals()), signals());
  assert.throws(() => parseReadinessSignals({ ...signals(), value: 'private' }), /signals_invalid/);
  assert.throws(() => parseReadinessSignals({ ...signals(), ordinaryControlCount: 9000 }), /signals_invalid/);
  assert.throws(() => parseReadinessSignals({ ...signals(), documentReady: 'yes' }), /signals_invalid/);
});

test('live assessment requires stable samples and returns counts only', async () => {
  const samples = [signals({ documentReady: false }), signals(), signals()];
  let sent = 0;
  let closed = false;
  const result = await assessPageReadiness({
    port: 9222,
    targetId: 'target-ready',
    origin: 'https://jobs.example',
    pathPattern: '/resume/:id/apply',
    intervalMs: 0,
    cdpFactory: () => ({
      async send(method, params) {
        assert.equal(method, 'Runtime.evaluate');
        assert.equal(params.returnByValue, true);
        return { result: { value: samples[Math.min(sent++, samples.length - 1)] } };
      },
      close() { closed = true; }
    })
  });
  assert.equal(result.state, 'application_ready');
  assert.equal(sent, 3);
  assert.equal(closed, true);
  assert.deepEqual(Object.keys(result.evidence).sort(), [
    'applicationSemantics', 'finalActions', 'loginActions', 'ordinaryControls',
    'passwordControls', 'resumeControls', 'verificationActions',
    'verificationControls', 'visibleControls'
  ].sort());
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('browser-side collector source has no scalar, Cookie, storage, or HTML read surface', () => {
  const source = collectReadinessSignals.toString();
  assert.doesNotMatch(source, /\.value\b|document\.cookie|localStorage|sessionStorage|outerHTML|innerHTML|getCookies/i);
  assert.match(source, /getAttribute/);
});
