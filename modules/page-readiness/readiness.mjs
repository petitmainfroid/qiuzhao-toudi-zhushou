import { setTimeout as delay } from 'node:timers/promises';
import { CdpTargetSession } from '../browser-kernel/cdp-session.mjs';

const READINESS_STATES = new Set([
  'application_ready', 'login_required', 'verification_required', 'unknown'
]);

const SIGNAL_KEYS = [
  'documentReady', 'visibleControlCount', 'ordinaryControlCount', 'passwordControlCount',
  'verificationControlCount', 'applicationSemanticCount', 'resumeControlCount',
  'loginActionCount', 'verificationActionCount', 'finalActionCount'
];

// This function is serialized and evaluated in the selected page. It returns only
// bounded counts and booleans. It never reads input values, HTML, storage, Cookie,
// passwords, verification codes, or uploaded-file metadata.
export function collectReadinessSignals() {
  const MAX_CONTROLS = 2048;
  const MAX_ACTIONS = 1024;
  const CONTROL_SELECTOR = [
    'input:not([type="hidden"])', 'textarea', 'select', '[contenteditable="true"]',
    '[role="textbox"]', '[role="combobox"]', '[role="listbox"]', '[role="radio"]',
    '[role="checkbox"]'
  ].join(',');
  const ACTION_SELECTOR = 'button, input[type="submit"], input[type="button"], [role="button"]';
  const visible = (element) => {
    if (!(element instanceof Element)) return false;
    if (element.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const text = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const semanticText = (element) => {
    const labels = element.labels ? Array.from(element.labels).map((label) => text(label.textContent)).join(' ') : '';
    return text([
      element.getAttribute('name'), element.getAttribute('id'), element.getAttribute('type'),
      element.getAttribute('autocomplete'), element.getAttribute('placeholder'),
      element.getAttribute('aria-label'), labels
    ].filter(Boolean).join(' ')).toLowerCase();
  };
  const actionText = (element) => text([
    element.getAttribute('type'), element.getAttribute('name'), element.getAttribute('aria-label'),
    element.textContent
  ].filter(Boolean).join(' ')).toLowerCase();
  const applicationPattern = /(?:姓名|名字|邮箱|邮件|手机|电话|学校|院校|专业|学历|教育|工作经历|实习经历|项目经历|简历|性别|出生|求职|应聘|name|email|e-mail|phone|mobile|school|college|university|major|degree|education|experience|internship|project|resume|\bcv\b|gender|birth|candidate|application)/i;
  const verificationPattern = /(?:验证码|校验码|短信验证|图形验证|人机验证|一次性密码|captcha|verification|verify|one.?time|\botp\b)/i;
  const loginPattern = /(?:登录|登陆|登入|sign[ -]?in|log[ -]?in)/i;
  const finalPattern = /(?:提交申请|提交简历|确认申请|申请职位|投递简历|submit application|apply now|send application)/i;

  const controls = Array.from(document.querySelectorAll(CONTROL_SELECTOR)).slice(0, MAX_CONTROLS).filter(visible);
  let ordinaryControlCount = 0;
  let passwordControlCount = 0;
  let verificationControlCount = 0;
  let applicationSemanticCount = 0;
  let resumeControlCount = 0;
  for (const control of controls) {
    const type = text(control.getAttribute('type')).toLowerCase();
    const semantic = semanticText(control);
    if (type === 'password') passwordControlCount += 1;
    else ordinaryControlCount += 1;
    if (control.getAttribute('autocomplete') === 'one-time-code' || verificationPattern.test(semantic)) {
      verificationControlCount += 1;
    }
    if (applicationPattern.test(semantic)) applicationSemanticCount += 1;
    if (type === 'file' && /(?:简历|履历|resume|\bcv\b)/i.test(semantic)) resumeControlCount += 1;
  }

  const actions = Array.from(document.querySelectorAll(ACTION_SELECTOR)).slice(0, MAX_ACTIONS).filter(visible);
  let loginActionCount = 0;
  let verificationActionCount = 0;
  let finalActionCount = 0;
  for (const action of actions) {
    const semantic = actionText(action);
    if (loginPattern.test(semantic)) loginActionCount += 1;
    if (verificationPattern.test(semantic)) verificationActionCount += 1;
    if (finalPattern.test(semantic)) finalActionCount += 1;
  }

  const frames = Array.from(document.querySelectorAll('iframe')).slice(0, 128);
  if (frames.some((frame) => verificationPattern.test(text([
    frame.getAttribute('title'), frame.getAttribute('name'), frame.getAttribute('src')?.split('?', 1)[0]
  ].filter(Boolean).join(' '))))) verificationActionCount += 1;

  return {
    documentReady: document.readyState === 'interactive' || document.readyState === 'complete',
    visibleControlCount: controls.length,
    ordinaryControlCount,
    passwordControlCount,
    verificationControlCount,
    applicationSemanticCount,
    resumeControlCount,
    loginActionCount,
    verificationActionCount,
    finalActionCount
  };
}

function boundedInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 4096;
}

export function parseReadinessSignals(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== [...SIGNAL_KEYS].sort().join('|')
    || typeof value.documentReady !== 'boolean'
    || SIGNAL_KEYS.slice(1).some((key) => !boundedInteger(value[key]))) {
    throw new Error('page_readiness_signals_invalid');
  }
  return Object.freeze(Object.fromEntries(SIGNAL_KEYS.map((key) => [key, value[key]])));
}

export function classifyReadinessSignals(rawSignals, { origin = 'https://invalid.local', pathPattern = '/' } = {}) {
  const signals = parseReadinessSignals(rawSignals);
  let hostname = '';
  try { hostname = new URL(origin).hostname; } catch { /* Invalid caller origins are treated as no hostname signal. */ }
  const loginRoute = /(?:login|signin|sign-in|auth|passport)/i.test(`${hostname}${pathPattern}`);
  const applicationRoute = /(?:apply|application|candidate|resume|editcv|\bcv\b)/i.test(pathPattern);
  if (signals.verificationControlCount > 0 || signals.verificationActionCount > 0) {
    return 'verification_required';
  }
  if (signals.passwordControlCount > 0) return 'login_required';
  if (loginRoute && signals.resumeControlCount === 0 && signals.finalActionCount === 0
    && signals.ordinaryControlCount <= 8) return 'login_required';
  if (signals.loginActionCount > 0 && signals.ordinaryControlCount <= 4
    && signals.applicationSemanticCount < 2) return 'login_required';
  if (!signals.documentReady) return 'unknown';
  if (signals.applicationSemanticCount >= 2 && signals.ordinaryControlCount >= 2) {
    return 'application_ready';
  }
  if (signals.resumeControlCount === 1 && signals.ordinaryControlCount >= 2) {
    return 'application_ready';
  }
  if (applicationRoute && signals.finalActionCount > 0 && signals.applicationSemanticCount >= 1
    && signals.ordinaryControlCount >= 2) return 'application_ready';
  return 'unknown';
}

function publicEvidence(signals) {
  return Object.freeze({
    visibleControls: signals.visibleControlCount,
    ordinaryControls: signals.ordinaryControlCount,
    passwordControls: signals.passwordControlCount,
    verificationControls: signals.verificationControlCount,
    applicationSemantics: signals.applicationSemanticCount,
    resumeControls: signals.resumeControlCount,
    loginActions: signals.loginActionCount,
    verificationActions: signals.verificationActionCount,
    finalActions: signals.finalActionCount
  });
}

export async function assessPageReadiness({
  port, targetId, origin, pathPattern, attempts = 8, stableSamples = 2, intervalMs = 250,
  cdpFactory = (connection) => new CdpTargetSession({
    port: connection.port,
    targetId: connection.targetId,
    expectedOrigin: connection.origin,
    expectedPath: connection.pathPattern
  })
} = {}) {
  if (!Number.isInteger(port) || port < 1 || typeof targetId !== 'string'
    || typeof origin !== 'string' || typeof pathPattern !== 'string') {
    throw new Error('page_readiness_target_invalid');
  }
  const session = cdpFactory({ port, targetId, origin, pathPattern });
  let previousState;
  let stable = 0;
  let latestSignals;
  try {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await session.send('Runtime.evaluate', {
        expression: `(${collectReadinessSignals.toString()})()`,
        returnByValue: true,
        awaitPromise: false
      }, 5000);
      const signals = parseReadinessSignals(response?.result?.value);
      const state = classifyReadinessSignals(signals, { origin, pathPattern });
      latestSignals = signals;
      stable = state === previousState ? stable + 1 : 1;
      previousState = state;
      const enoughUnknownSamples = state !== 'unknown' || attempt >= 3;
      if (stable >= stableSamples && enoughUnknownSamples) {
        return Object.freeze({ state, evidence: publicEvidence(signals) });
      }
      if (attempt + 1 < attempts) await delay(intervalMs);
    }
    return Object.freeze({ state: previousState ?? 'unknown', evidence: publicEvidence(latestSignals) });
  } finally {
    session.close();
  }
}

export function isPageReadinessState(value) {
  return READINESS_STATES.has(value);
}
