import { createHash, randomUUID } from 'node:crypto';
import { CdpTargetSession } from './cdp-session.mjs';
import { loadBundledModule, loadExportedFunctionSource } from './source-loader.mjs';

const ORDINARY_ACTIONS = new Set([
  'fill_text', 'select_option', 'set_date', 'set_boolean', 'open_control', 'ensure_repeatable'
]);
const REPEATABLE_COLLECTIONS = new Set([
  'education', 'workExperiences', 'projects', 'workSamples', 'awards', 'languages'
]);
const STRATEGIES = new Set([
  'none', 'native-setter', 'native-select', 'custom-select', 'native-date-range',
  'repeatable-add', 'exact-radio', 'exact-check', 'contenteditable-text',
  'open-control', 'keyboard-insert'
]);
const FAILURE_REASONS = new Set([
  'detached', 'blocked-control', 'disabled-or-readonly', 'hidden-control',
  'option-not-found', 'option-ambiguous', 'unsupported-control',
  'framework-rejected', 'verification-failed', 'stale-reference', 'bridge-failed'
]);
const COLLECTION_NAMES = {
  education: ['education_list', 'education'],
  workExperiences: ['internship_list', 'internship'],
  projects: ['project_list', 'project'],
  workSamples: ['works_list', 'works', 'work'],
  awards: ['award_list', 'award'],
  languages: ['language_list', 'language']
};
const READ_BOOLEAN_PRESENCE = `function qiuzhaoPresence() {
  const element = this;
  const tag = String(element?.tagName || '').toLowerCase();
  const type = String(element?.type || '').toLowerCase();
  if (type === 'checkbox' || type === 'radio') return Boolean(element.checked);
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return Boolean(String(element.value || '').trim());
  if (element?.isContentEditable) return Boolean(String(element.textContent || '').trim());
  const nested = element?.querySelector?.('input:not([type=hidden]), textarea, select');
  if (nested) {
    const nestedType = String(nested.type || '').toLowerCase();
    if (nestedType === 'checkbox' || nestedType === 'radio') return Boolean(nested.checked);
    return Boolean(String(nested.value || '').trim());
  }
  const selected = element?.querySelector?.('[aria-selected="true"], [data-selected="true"], [class*="selection-item"], [class*="selection-text"]');
  if (selected) return Boolean(String(selected.textContent || '').trim());
  return null;
}`;

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function identifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,160}$/.test(value);
}

function canonicalProfilePath(value) {
  return typeof value === 'string'
    && value.length <= 160
    && /^(?:derived\.age|(?:basic|jobPreference|answers)\.[A-Za-z][A-Za-z0-9]*|(?:education|workExperiences|projects|workSamples|awards|languages)\.\d+\.[A-Za-z][A-Za-z0-9]*)$/.test(value)
    && !/(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$)/.test(value);
}

function parseActionRequest(request) {
  if (!exactKeys(request, ['requestId', 'leaseId', 'profileVersion', 'pageEpoch', 'snapshotId', 'ref', 'intent'])) {
    throw new Error('invalid_action_request');
  }
  if (!identifier(request.requestId) || !identifier(request.leaseId) || !identifier(request.profileVersion)
    || !Number.isSafeInteger(request.pageEpoch) || request.pageEpoch < 1
    || !identifier(request.snapshotId) || !identifier(request.ref)
    || !request.intent || typeof request.intent !== 'object') throw new Error('invalid_action_request');
  const { intent } = request;
  if (!ORDINARY_ACTIONS.has(intent.kind)) throw new Error('unknown_action');
  if (['fill_text', 'select_option', 'set_date', 'set_boolean'].includes(intent.kind)) {
    if (!exactKeys(intent, ['kind', 'profilePath']) || !canonicalProfilePath(intent.profilePath)) {
      throw new Error('invalid_action_intent');
    }
  } else if (intent.kind === 'open_control') {
    if (!exactKeys(intent, ['kind'])) throw new Error('invalid_action_intent');
  } else if (!exactKeys(intent, ['kind', 'collection', 'index'])
    || !REPEATABLE_COLLECTIONS.has(intent.collection)
    || !Number.isSafeInteger(intent.index) || intent.index < 0 || intent.index > 49) {
    throw new Error('invalid_action_intent');
  }
  return request;
}

function durationBucket(duration) {
  if (duration < 100) return 'lt-100ms';
  if (duration <= 500) return '100-500ms';
  return 'gt-500ms';
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sanitizeOutcome(value) {
  if (!value || typeof value !== 'object' || typeof value.performed !== 'boolean'
    || typeof value.verified !== 'boolean' || !STRATEGIES.has(value.strategy)
    || (value.reason !== undefined && !FAILURE_REASONS.has(value.reason))) {
    return { performed: false, verified: false, strategy: 'none', reason: 'bridge-failed' };
  }
  return {
    performed: value.performed,
    verified: value.verified,
    strategy: value.strategy,
    ...(value.reason ? { reason: value.reason } : {})
  };
}

function compatible(intent, target) {
  if (intent.kind === 'set_boolean') return target.role === 'checkbox' || target.role === 'switch';
  if (intent.kind === 'open_control') return target.role === 'combobox' || target.role === 'listbox';
  if (intent.kind === 'ensure_repeatable') {
    return target.role === 'button' && target.tag !== 'a' && target.inputType !== 'submit';
  }
  if (intent.kind === 'select_option') {
    return target.tag === 'select' || target.role === 'radio'
      || target.role === 'combobox' || target.role === 'listbox';
  }
  return target.role === 'textbox' || target.tag === 'select';
}

function countCollection(state, collection) {
  const aliases = COLLECTION_NAMES[collection] ?? [];
  const indexes = new Set();
  const unindexedOccurrences = new Map();
  for (const control of state.controls) {
    const name = control.semantics.name ?? '';
    for (const alias of aliases) {
      const match = new RegExp(`^${alias}\\[(\\d+)\\]`).exec(name);
      if (match) {
        indexes.add(Number(match[1]));
        continue;
      }
      if (name === alias) {
        const semantic = control.semantics.label || control.semantics.ariaLabel
          || control.semantics.placeholder || `${control.role}|${control.tag}`;
        const key = `${alias}|${semantic}|${control.role}|${control.tag}`;
        unindexedOccurrences.set(key, (unindexedOccurrences.get(key) ?? 0) + 1);
      }
    }
  }
  return Math.max(indexes.size, ...unindexedOccurrences.values(), 0);
}

export class ZeroExtensionBrowserKernel {
  constructor({
    browserSession,
    profileService,
    now = () => Date.now(),
    createId = () => randomUUID(),
    cdpFactory = (connection) => new CdpTargetSession({
      port: connection.cdpPort,
      targetId: connection.targetId,
      expectedOrigin: connection.origin,
      expectedPath: connection.pathPattern
    }),
    loadPageModule = () => loadBundledModule('shared/bridge/pageState.ts'),
    loadFixedAction = () => loadExportedFunctionSource('shared/content/pageDriver.ts', 'runFixedPageAction')
  }) {
    this.browserSession = browserSession;
    this.profileService = profileService;
    this.now = now;
    this.createId = createId;
    this.cdpFactory = cdpFactory;
    this.loadPageModule = loadPageModule;
    this.loadFixedAction = loadFixedAction;
    this.connection = undefined;
    this.cdp = undefined;
    this.pageModule = undefined;
    this.fixedActionSource = undefined;
    this.registry = undefined;
    this.current = undefined;
    this.pageEpoch = 0;
    this.lease = undefined;
    this.requests = new Map();
    this.auditEntries = [];
    this.browserState = 'stopped';
    this.browserErrorCode = 'session_missing';
    this.offlineIdentity = undefined;
  }

  async start() {
    let connection;
    try {
      connection = await this.browserSession.connection();
    } catch (initialError) {
      const beforeRecovery = await this.#sessionStatus(initialError);
      if (beforeRecovery.state === 'disconnected') {
        try {
          const recovered = await this.browserSession.reconnect();
          if (recovered.state === 'ready') connection = await this.browserSession.connection();
          else return this.#setOffline(recovered, recovered.errorCode ?? 'browser_confirmation_required');
        } catch (recoveryError) {
          return this.#setOffline(await this.#sessionStatus(recoveryError), errorCode(recoveryError));
        }
      } else {
        return this.#setOffline(beforeRecovery, errorCode(initialError));
      }
    }
    try {
      const [pageModule, fixedActionSource] = await Promise.all([
        this.loadPageModule(),
        this.loadFixedAction()
      ]);
      const cdp = this.cdpFactory(connection);
      await cdp.connect();
      this.connection = connection;
      this.cdp = cdp;
      this.pageModule = pageModule;
      this.fixedActionSource = fixedActionSource;
      this.registry = new pageModule.OpaqueReferenceRegistry(() => this.createId().replaceAll('-', '').slice(0, 16));
      this.browserState = 'ready';
      this.browserErrorCode = undefined;
      this.offlineIdentity = undefined;
      return this.status();
    } catch (connectError) {
      return this.#setOffline(await this.#sessionStatus(connectError), errorCode(connectError));
    }
  }

  status() {
    return {
      state: this.cdp ? 'ready' : this.browserState,
      sessionId: this.connection?.launchId ?? this.offlineIdentity?.launchId,
      origin: this.connection?.origin ?? this.offlineIdentity?.origin,
      path: this.connection?.pathPattern ?? this.offlineIdentity?.path,
      pageEpoch: this.pageEpoch,
      authorized: Boolean(this.cdp && this.lease && this.lease.expiresAt > this.now()),
      ...(this.browserErrorCode ? { errorCode: this.browserErrorCode } : {})
    };
  }

  async refreshStatus() {
    const browserStatus = await this.#sessionStatus();
    if (browserStatus.state !== 'ready') {
      const fallback = browserStatus.state === 'login-needed'
        ? 'browser_confirmation_required'
        : browserStatus.errorCode ?? 'cdp_unavailable';
      return this.#setOffline(browserStatus, fallback);
    }
    if (!this.cdp || !this.connection) return this.start();
    return this.status();
  }

  async observe() {
    this.#requireStarted();
    await this.#assertIdentity();
    const { root } = await this.cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    if (!root) throw new Error('dom_document_missing');
    this.pageEpoch += 1;
    const rawState = this.pageModule.buildPrivacySafePageState(root, {
      sessionId: this.connection.launchId,
      origin: this.connection.origin,
      path: this.connection.pathPattern
    }, this.registry);
    const controls = [];
    for (const control of rawState.controls) {
      const target = this.registry.resolve(this.connection.launchId, rawState.snapshotId, control.ref);
      controls.push({
        ...control,
        hasValue: control.safety === 'ordinary' && target ? await this.#readPresence(target) : null
      });
    }
    const state = { ...rawState, controls };
    this.current = { state, root, pageEpoch: this.pageEpoch };
    return { pageEpoch: this.pageEpoch, state };
  }

  find({ pageEpoch, query }) {
    this.#requireCurrent(pageEpoch);
    if (!exactKeys(query, ['text', ...(query.roles === undefined ? [] : ['roles']), ...(query.limit === undefined ? [] : ['limit'])])
      || typeof query.text !== 'string' || !query.text.trim() || query.text.length > 120) {
      throw new Error('invalid_find_query');
    }
    return this.pageModule.findPageControls(this.current.state, query);
  }

  async wait({ requestId, pageEpoch, condition, timeoutMs = 3000, pollIntervalMs = 100 }) {
    if (!identifier(requestId) || !Number.isSafeInteger(pageEpoch) || pageEpoch < 1
      || !exactKeys(condition, ['kind', 'text', 'minimumMatches'])
      || condition.kind !== 'find' || typeof condition.text !== 'string'
      || !Number.isSafeInteger(condition.minimumMatches) || condition.minimumMatches < 1 || condition.minimumMatches > 20
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 15000
      || !Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 25 || pollIntervalMs > 1000) {
      throw new Error('invalid_wait_request');
    }
    this.#requireCurrent(pageEpoch);
    const startedAt = this.now();
    let polls = 0;
    while (this.now() - startedAt <= timeoutMs) {
      polls += 1;
      const observed = await this.observe();
      const result = this.pageModule.findPageControls(observed.state, { text: condition.text });
      if (result.matches.length >= condition.minimumMatches) {
        return { requestId, status: 'matched', pageEpoch: observed.pageEpoch, polls, durationBucket: durationBucket(this.now() - startedAt), result };
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    return { requestId, status: 'timeout', pageEpoch: this.pageEpoch, polls, durationBucket: durationBucket(this.now() - startedAt), reason: 'timeout' };
  }

  grantOrdinaryLease({ leaseId, origin, profileVersion, expiresAt }) {
    if (!identifier(leaseId) || origin !== this.connection?.origin || !identifier(profileVersion)
      || !Number.isSafeInteger(expiresAt) || expiresAt <= this.now() || expiresAt > this.now() + 30 * 60_000) {
      throw new Error('invalid_lease');
    }
    this.lease = { leaseId, origin, profileVersion, expiresAt };
    return { leaseId, origin, profileVersion, expiresAt, scope: 'ordinary' };
  }

  revokeLease() {
    this.lease = undefined;
  }

  pause() {
    this.revokeLease();
    this.registry?.invalidate();
    this.current = undefined;
    return { state: 'paused', pageEpoch: this.pageEpoch };
  }

  audit() {
    return {
      sessionId: this.connection?.launchId,
      origin: this.connection?.origin,
      path: this.connection?.pathPattern,
      entries: structuredClone(this.auditEntries),
      summary: {
        attempts: this.auditEntries.reduce((sum, entry) => sum + entry.attempts, 0),
        verified: this.auditEntries.filter((entry) => entry.status === 'verified').length,
        blocked: this.auditEntries.filter((entry) => entry.status === 'blocked').length,
        failed: this.auditEntries.filter((entry) => entry.status === 'failed').length,
        finalSubmits: 0,
        credentialReads: 0,
        cookieReads: 0
      }
    };
  }

  async execute(input) {
    const request = parseActionRequest(input);
    const requestDigest = digest(request);
    const existing = this.requests.get(request.requestId);
    if (existing) {
      if (existing.digest !== requestDigest) throw new Error('duplicate_request_conflict');
      return existing.result;
    }
    const result = await this.#executeFresh(request);
    this.requests.set(request.requestId, { digest: requestDigest, result });
    this.auditEntries.push({
      requestId: result.requestId,
      ref: result.ref,
      action: result.action,
      status: result.status,
      attempts: result.attempts,
      strategy: result.strategy,
      verified: result.verified,
      ...(result.reason ? { reason: result.reason } : {})
    });
    return result;
  }

  close() {
    this.revokeLease();
    this.registry?.invalidate();
    this.cdp?.close();
    this.cdp = undefined;
    this.current = undefined;
    this.connection = undefined;
    this.browserState = 'stopped';
    this.browserErrorCode = undefined;
    this.offlineIdentity = undefined;
  }

  async #sessionStatus(cause) {
    try {
      return await this.browserSession.status();
    } catch {
      return { state: 'stopped', errorCode: errorCode(cause) };
    }
  }

  #setOffline(sessionStatus, fallbackError) {
    this.revokeLease();
    this.registry?.invalidate();
    this.current = undefined;
    this.cdp?.close();
    this.cdp = undefined;
    this.connection = undefined;
    this.registry = undefined;
    this.pageModule = undefined;
    this.fixedActionSource = undefined;
    this.browserState = ['stopped', 'disconnected', 'login-needed'].includes(sessionStatus?.state)
      ? sessionStatus.state
      : 'disconnected';
    this.browserErrorCode = sessionStatus?.errorCode ?? fallbackError ?? 'cdp_unavailable';
    this.offlineIdentity = {
      launchId: sessionStatus?.launchId,
      origin: sessionStatus?.selectedTab?.origin ?? sessionStatus?.requestedPage?.origin,
      path: sessionStatus?.selectedTab?.pathPattern ?? sessionStatus?.requestedPage?.pathPattern
    };
    return this.status();
  }

  async #executeFresh(request) {
    const startedAt = this.now();
    const fail = (status, reason, attempts = 0, strategy = 'none', verified = false) => ({
      requestId: request.requestId,
      ref: request.ref,
      action: request.intent.kind,
      status,
      attempts,
      strategy,
      verified,
      reason,
      durationBucket: durationBucket(this.now() - startedAt)
    });
    this.#requireCurrent(request.pageEpoch);
    await this.#assertIdentity();
    if (!this.lease || this.lease.leaseId !== request.leaseId || this.lease.origin !== this.connection.origin
      || this.lease.profileVersion !== request.profileVersion || this.lease.expiresAt <= this.now()) {
      this.revokeLease();
      return fail('blocked', 'invalid_authorization');
    }
    const profileSnapshot = await this.profileService.getAgentSnapshot();
    if (profileSnapshot.profileVersion !== request.profileVersion) {
      this.revokeLease();
      return fail('blocked', 'stale_profile_version');
    }
    const target = this.registry.resolve(this.connection.launchId, request.snapshotId, request.ref);
    if (!target || target.origin !== this.connection.origin || target.path !== this.connection.pathPattern) {
      return fail('failed', 'stale_reference');
    }
    if (target.safety !== 'ordinary') return fail('blocked', 'unsafe_control');
    if (target.disabled || target.readOnly) return fail('blocked', 'disabled_or_readonly');
    if (!compatible(request.intent, target)) return fail('blocked', 'incompatible_action');

    let expected;
    let desired;
    if (['fill_text', 'select_option', 'set_date', 'set_boolean'].includes(request.intent.kind)) {
      const catalogEntry = profileSnapshot.catalog.find((entry) => entry.path === request.intent.profilePath);
      if (!catalogEntry || catalogEntry.safetyClass !== 'ordinary') return fail('blocked', 'invalid_profile_path');
      if (!catalogEntry.hasValue) return fail('failed', 'empty_profile_value');
      expected = await this.profileService.createResolver().resolveScalar({
        profileVersion: request.profileVersion,
        profilePath: request.intent.profilePath
      });
      if (!expected.trim()) return fail('failed', 'empty_profile_value');
      desired = expected.trim().toLowerCase() === 'true' ? 'checked' : 'unchecked';
    }
    if (request.intent.kind === 'ensure_repeatable') {
      const root = profileSnapshot.completeness.repeatableRoots.find((entry) => entry.path === request.intent.collection);
      if (!root || request.intent.index >= root.nonEmptyItemCount) return fail('failed', 'empty_profile_value');
      const beforeCount = countCollection(this.current.state, request.intent.collection);
      if (beforeCount > request.intent.index) return fail('verified', 'already_present', 0, 'repeatable-add', true);
      if (beforeCount !== request.intent.index) return fail('blocked', 'repeatable_gap');
    }

    const payload = request.intent.kind === 'fill_text'
      ? { action: 'fill', strategy: 'primary', expected }
      : request.intent.kind === 'select_option'
        ? { action: 'select', strategy: 'primary', expected }
        : request.intent.kind === 'set_date'
          ? { action: 'fill', strategy: 'primary', expected }
          : request.intent.kind === 'set_boolean'
            ? { action: 'check', strategy: 'primary', desired }
            : request.intent.kind === 'open_control'
              ? { action: 'click', strategy: 'primary', purpose: 'open-control' }
              : { action: 'click', strategy: 'primary', purpose: 'add-repeatable-record' };
    const primary = await this.#callFixed(target, payload);
    let outcome = primary;
    let attempts = 1;
    if ((request.intent.kind === 'fill_text' || request.intent.kind === 'set_date')
      && (primary.reason === 'framework-rejected' || primary.reason === 'verification-failed')) {
      const prepared = await this.#callFixed(target, { action: 'fill', strategy: 'prepare-keyboard', expected });
      if (prepared.performed) {
        await this.cdp.send('Input.insertText', { text: expected });
        outcome = await this.#callFixed(target, { action: 'fill', strategy: 'verify-keyboard', expected });
        attempts = 2;
      }
    }
    if (request.intent.kind === 'ensure_repeatable' && primary.performed && !primary.reason) {
      const observed = await this.observe();
      const verified = countCollection(observed.state, request.intent.collection) === request.intent.index + 1;
      outcome = verified
        ? { performed: true, verified: true, strategy: 'repeatable-add' }
        : { performed: true, verified: false, strategy: 'repeatable-add', reason: 'verification-failed' };
    }
    return {
      requestId: request.requestId,
      ref: request.ref,
      action: request.intent.kind,
      status: outcome.verified ? 'verified' : outcome.performed && !outcome.reason ? 'performed' : 'failed',
      attempts,
      strategy: outcome.strategy,
      verified: outcome.verified,
      ...(outcome.reason ? { reason: outcome.reason.replaceAll('-', '_') } : {}),
      durationBucket: durationBucket(this.now() - startedAt)
    };
  }

  async #callFixed(target, payload) {
    const current = await this.#inspectTarget(target);
    if (!current) return { performed: false, verified: false, strategy: 'none', reason: 'stale-reference' };
    const resolved = await this.cdp.send('DOM.resolveNode', { backendNodeId: target.backendNodeId, objectGroup: 'qiuzhao-fixed-action' });
    const objectId = resolved?.object?.objectId;
    if (!objectId) return { performed: false, verified: false, strategy: 'none', reason: 'stale-reference' };
    try {
      const result = await this.cdp.send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: this.fixedActionSource,
        arguments: [{ value: payload }],
        returnByValue: true,
        awaitPromise: false,
        userGesture: true,
        silent: true,
        objectGroup: 'qiuzhao-fixed-action'
      });
      if (result.exceptionDetails) return { performed: false, verified: false, strategy: 'none', reason: 'bridge-failed' };
      return sanitizeOutcome(result?.result?.value);
    } finally {
      await this.cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'qiuzhao-fixed-action' }).catch(() => undefined);
    }
  }

  async #readPresence(target) {
    const resolved = await this.cdp.send('DOM.resolveNode', { backendNodeId: target.backendNodeId, objectGroup: 'qiuzhao-presence' });
    const objectId = resolved?.object?.objectId;
    if (!objectId) return null;
    try {
      const result = await this.cdp.send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: READ_BOOLEAN_PRESENCE,
        returnByValue: true,
        awaitPromise: false,
        silent: true,
        objectGroup: 'qiuzhao-presence'
      });
      const value = result?.result?.value;
      return typeof value === 'boolean' ? value : null;
    } finally {
      await this.cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'qiuzhao-presence' }).catch(() => undefined);
    }
  }

  async #inspectTarget(target) {
    const { root } = await this.cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    if (!root) return null;
    const inspected = this.pageModule.inspectControlTarget(root, this.connection.origin, target.frameKey, target.backendNodeId);
    return inspected?.fingerprint === target.fingerprint ? inspected : null;
  }

  async #assertIdentity() {
    const latest = await this.browserSession.connection();
    if (latest.launchId !== this.connection.launchId || latest.targetId !== this.connection.targetId
      || latest.origin !== this.connection.origin || latest.pathPattern !== this.connection.pathPattern
      || latest.cdpPort !== this.connection.cdpPort) {
      this.registry?.invalidate();
      this.current = undefined;
      this.revokeLease();
      throw new Error('page_identity_changed');
    }
  }

  #requireStarted() {
    if (!this.cdp || !this.connection || !this.registry) throw new Error('kernel_not_started');
  }

  #requireCurrent(pageEpoch) {
    this.#requireStarted();
    if (!this.current || this.current.pageEpoch !== pageEpoch) throw new Error('stale_page_epoch');
  }
}

function errorCode(error) {
  return error instanceof Error && /^[a-z0-9_-]{1,80}$/.test(error.message)
    ? error.message
    : 'cdp_unavailable';
}
