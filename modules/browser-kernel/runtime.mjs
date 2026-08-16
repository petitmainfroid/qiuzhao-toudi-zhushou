import { createHash, randomUUID } from 'node:crypto';
import { CdpTargetSession } from './cdp-session.mjs';
import { loadBundledModule, loadExportedFunctionSource } from './source-loader.mjs';

const ORDINARY_ACTIONS = new Set([
  'fill_text', 'select_option', 'set_date', 'set_boolean', 'open_control', 'ensure_repeatable',
  'upload_saved_resume', 'set_date_range', 'set_date_range_start', 'set_boolean_from_collection_empty'
]);
const REPEATABLE_COLLECTIONS = new Set([
  'education', 'workExperiences', 'projects', 'workSamples', 'awards', 'languages'
]);
const STRATEGIES = new Set([
  'none', 'native-setter', 'native-select', 'custom-select', 'native-date-range', 'year-month-select-range',
  'repeatable-add', 'exact-radio', 'exact-check', 'contenteditable-text',
  'open-control', 'keyboard-insert', 'cdp-file-input'
]);
const FAILURE_REASONS = new Set([
  'detached', 'blocked-control', 'disabled-or-readonly', 'hidden-control',
  'option-not-found', 'option-ambiguous', 'unsupported-control',
    'framework-rejected', 'verification-failed', 'stale-reference', 'bridge-failed',
    'invalid-profile-range'
]);
const COLLECTION_NAMES = {
  education: ['education_list', 'education'],
  workExperiences: ['work_experience_list', 'work_experience', 'internship_list', 'internship'],
  projects: ['project_list', 'project'],
  workSamples: ['works_list', 'works', 'work'],
  awards: ['award_list', 'award'],
  languages: ['language_list', 'language']
};
// This target-session transport is reliable when presence probes are ordered.
// Parallel resolve/call/release cycles can starve one another on real ATS pages
// even though every individual Boolean probe completes in under 100ms.
const MAX_CONCURRENT_PRESENCE_PROBES = 1;
const PRESENCE_PROBE_TIMEOUT_MS = 500;
// Recruitment forms are deeply nested, but an unbounded CDP DOM walk can
// include virtualized option portals and stall inspection.  Thirty levels
// retain the current real-page form controls while keeping a snapshot bounded.
// Real form-array cards can place their leaf inputs several wrapper layers
// below the module heading. Keep this bounded, but deep enough to include the
// retained NIO education controls observed at DOM depths 32-34.
const INSPECTION_DOM_DEPTH = 40;

async function mapBounded(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
const READ_BOOLEAN_PRESENCE = `function qiuzhaoPresence(inputType) {
  const element = this;
  if (/^(?:date-range|year-month-range)$/.test(String(inputType || ''))) {
    if (/\\d{4}\\s*[-/.年]\\s*\\d{1,2}/.test(String(element?.textContent || ''))) return true;
    const rangeParts = Array.from(element?.querySelectorAll?.('input') || [])
      .filter((input) => ['text', 'date', 'month'].includes(String(input.type || '').toLowerCase()));
    if (rangeParts.length === 4) {
      const renderedPart = (input) => String(input.value || input.parentElement?.textContent || '').trim();
      if (/\\d{4}/.test(renderedPart(rangeParts[0]))
        && /(?:^|\\D)\\d{1,2}(?:\\D|$)/.test(renderedPart(rangeParts[1]))) return true;
    }
    const endpoints = Array.from(element?.querySelectorAll?.(
      '[data-cy$="periodInputBegin"], [data-cy$="periodInputEnd"], .atsx-date-picker-period-month-label'
    ) || []);
    if (endpoints.some((endpoint) => /^\\s*\\d{4}\\s*[-/.年]\\s*\\d{1,2}\\s*月?\\s*$/.test(String(endpoint.textContent || '')))) {
      return true;
    }
  }
  const tag = String(element?.tagName || '').toLowerCase();
  const type = String(element?.type || '').toLowerCase();
  if (type === 'file') {
    if (element.files && element.files.length > 0) return true;
    let current = element.parentElement;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      const currentTag = String(current.tagName || '').toLowerCase();
      if (currentTag === 'form' || currentTag === 'body' || currentTag === 'html') break;
      const text = String(current.innerText || current.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 1200);
      if (/(?:已上传|上传成功|重新上传|替换文件|更新|uploaded|upload complete|replace|change file)/i.test(text)) return true;
    }
    return false;
  }
  if (type === 'checkbox' || type === 'radio') return Boolean(element.checked);
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    let structuralSelectRoot = null;
    if (tag === 'input') {
      let selectContainer = false;
      let dropdownContainer = null;
      for (let current = element.parentElement, depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
        const classes = String(current.className || '');
        selectContainer = selectContainer || /select/i.test(classes);
        if (!dropdownContainer && /dropdown/i.test(classes)) dropdownContainer = current;
        if (selectContainer && dropdownContainer) { structuralSelectRoot = dropdownContainer; break; }
        if (/^(?:FORM|BODY|HTML)$/.test(String(current.tagName || ''))) break;
      }
    }
    const customSelectInput = tag === 'input' && (String(element.getAttribute('role') || '').toLowerCase() === 'combobox'
      || /(?:^|\s)[^\s]*(?:treeSelect|tree-select|select__selector__search)[^\s]*/i.test(String(element.className || ''))
      || Boolean(structuralSelectRoot));
    const customSearchInput = customSelectInput && !element.readOnly;
    // A tree/select's editable combobox is a transient option filter, not the
    // selected application value. Presence must therefore come from a local
    // selected marker below, never from that query text.
    if (!customSearchInput && String(element.value || '').trim()) return true;
    // A blank ordinary native control is conclusively empty. Only a known
    // custom-select search input needs the bounded wrapper walk below. On
    // long Feishu/Moka forms, walking large form-array ancestors for every
    // blank text input made one privacy-safe observation take minutes.
    if (tag !== 'input' || !customSelectInput) return false;
  }
  if (element?.isContentEditable) return Boolean(String(element.textContent || '').trim());
  const selectedSelector = '[aria-selected="true"], [data-selected="true"], [class*="selection-item"], [class*="selection-text"], [class*="selection-selected-value"], [class*="select-selection__rendered"], [class*="selector__content"], [class*="selector__selectItem"], [class*="display-value"], [data-cy="contentRender"]';
  const localSelectRoot = element?.closest?.('.ud__select, .atsx-select, .ant-select, .el-select')
    || (() => {
      let selectContainer = false;
      let dropdownContainer = null;
      for (let current = element?.parentElement, depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
        const classes = String(current.className || '');
        selectContainer = selectContainer || /select/i.test(classes);
        if (!dropdownContainer && /dropdown/i.test(classes)) dropdownContainer = current;
        if (selectContainer && dropdownContainer) return dropdownContainer;
        if (/^(?:FORM|BODY|HTML)$/.test(String(current.tagName || ''))) break;
      }
      return null;
    })()
    || (element?.matches?.('[role="combobox"], [role="listbox"]') ? element : null);
  const nested = element?.querySelector?.('input:not([type=hidden]), textarea, select');
  if (nested) {
    const nestedType = String(nested.type || '').toLowerCase();
    if (nestedType === 'checkbox' || nestedType === 'radio') return Boolean(nested.checked);
    // Custom ATS selects commonly keep a blank internal search input while
    // rendering the selected caption in a sibling container. Do not expose
    // that caption: only fall through to a Boolean presence check below.
    if (!localSelectRoot && String(nested.value || '').trim()) return true;
  }
  // A custom selector's presence is local to that selector. Never climb into
  // the surrounding field/section where a selected sibling can make this
  // blank control look filled. Search/filter text also is not a committed
  // value; only a local selected marker counts.
  if (localSelectRoot) {
    const selected = Array.from(localSelectRoot.querySelectorAll?.(selectedSelector) || []).find((candidate) => {
      if (!candidate.isConnected || candidate.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
      const editableSearch = candidate.querySelector?.('input:not([readonly]):not([disabled])');
      const stableChild = candidate.querySelector?.('[aria-selected="true"], [data-selected="true"], [class*="selection-item"], [class*="selection-selected-value"], [class*="selector__selectItem"]');
      if (editableSearch && !stableChild) return false;
      const style = candidate.ownerDocument?.defaultView?.getComputedStyle?.(candidate);
      return (!style || (style.display !== 'none' && style.visibility !== 'hidden'))
        && Boolean(String(candidate.textContent || '').trim());
    });
    return Boolean(selected);
  }
  // Presence is local to a control.  Never query the document-sized body/form
  // subtree for every blank custom input: ATS pages can have dozens of them.
  for (let current = element, depth = 0; current && current.nodeType === 1 && depth < 8; current = current.parentElement, depth += 1) {
    if (current.tagName === 'FORM' || current.tagName === 'BODY' || current.tagName === 'HTML') break;
    const selected = Array.from(current.querySelectorAll?.(selectedSelector) || []).find((candidate) => {
      if (!candidate.isConnected || candidate.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
      const editableSearch = candidate.querySelector?.('input:not([readonly]):not([disabled])');
      const stableChild = candidate.querySelector?.('[aria-selected="true"], [data-selected="true"], [class*="selection-item"], [class*="selection-selected-value"], [class*="selector__selectItem"]');
      if (editableSearch && !stableChild) return false;
      const style = candidate.ownerDocument?.defaultView?.getComputedStyle?.(candidate);
      return (!style || (style.display !== 'none' && style.visibility !== 'hidden'))
        && Boolean(String(candidate.textContent || '').trim());
    });
    if (selected) return true;
    // The current custom-select container itself may render its caption as
    // direct text, with no selected-marker descendant.  It is safe to return
    // only a Boolean and bound the ancestor walk to the local control.
    const className = String(current.className || '');
    if (/apply-field/i.test(className)) break;
    if (/formily-item/i.test(className)) break;
  }
  return tag === 'input' ? false : null;
}`;
const VERIFY_RESUME_INPUT = `function qiuzhaoVerifyResume(expected) {
  const element = this;
  if (!(element instanceof HTMLInputElement) || String(element.type).toLowerCase() !== 'file') return false;
  if (!element.files || element.files.length !== 1) return false;
  const file = element.files[0];
  return file.name === expected.name && file.size === expected.size && file.type === expected.mimeType;
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
  } else if (intent.kind === 'set_date_range') {
    if (!exactKeys(intent, ['kind', 'startProfilePath', 'endProfilePath'])
      || !canonicalProfilePath(intent.startProfilePath) || !canonicalProfilePath(intent.endProfilePath)
      || !/^(education|workExperiences|projects)\.\d+\.startDate$/.test(intent.startProfilePath)
      || intent.endProfilePath !== intent.startProfilePath.replace(/startDate$/, 'endDate')) throw new Error('invalid_action_intent');
  } else if (intent.kind === 'set_date_range_start') {
    if (!exactKeys(intent, ['kind', 'startProfilePath'])
      || !canonicalProfilePath(intent.startProfilePath)
      || !/^(education|workExperiences|projects)\.\d+\.startDate$/.test(intent.startProfilePath)) {
      throw new Error('invalid_action_intent');
    }
  } else if (intent.kind === 'set_boolean_from_collection_empty') {
    if (!exactKeys(intent, ['kind', 'collection']) || intent.collection !== 'workExperiences') {
      throw new Error('invalid_action_intent');
    }
  } else if (intent.kind === 'open_control' || intent.kind === 'upload_saved_resume') {
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
  if (intent.kind === 'upload_saved_resume') return target.tag === 'input' && target.inputType === 'file';
  if (intent.kind === 'set_boolean' || intent.kind === 'set_boolean_from_collection_empty') {
    return target.role === 'checkbox' || target.role === 'switch';
  }
  if (intent.kind === 'set_date_range' || intent.kind === 'set_date_range_start') {
    return target.tag === 'custom' && (target.inputType === 'date-range' || target.inputType === 'year-month-range');
  }
  if (intent.kind === 'open_control') return target.role === 'combobox' || target.role === 'listbox';
  if (intent.kind === 'ensure_repeatable') {
    return target.role === 'button' && target.inputType !== 'submit';
  }
  if (intent.kind === 'select_option') {
    return target.tag === 'select' || target.role === 'radio'
      || target.role === 'combobox' || target.role === 'listbox';
  }
  return target.role === 'textbox' || target.tag === 'select';
}

function isResumeAttachmentControl(control) {
  if (control?.tag !== 'input' || control.inputType !== 'file' || control.multiple) return false;
  const signal = [
    control.semantics?.label,
    control.semantics?.ariaLabel,
    control.semantics?.placeholder,
    control.semantics?.nearbyText,
    control.semantics?.name
  ].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, '');
  const isResume = signal.includes('简历') || signal.includes('个人履历')
    || /(?:^|[^a-z])(?:resume|cv)(?:[^a-z]|$)/i.test(signal);
  const forbidden = [
    '身份证', '证件', '护照', '头像', '照片', '成绩单', '作品', '推荐信', '资格证',
    'identity', 'passport', 'portrait', 'photo', 'transcript', 'portfolio', 'works', 'recommendation', 'certificate'
  ].some((token) => signal.includes(token));
  return isResume && !forbidden;
}

function countCollection(state, collection, sectionKind) {
  const aliases = COLLECTION_NAMES[collection] ?? [];
  const contextualIndexes = new Set(sectionKind ? state.controls
    .filter((control) => control.role !== 'button' && control.sectionContext?.kind === sectionKind)
    .map((control) => control.sectionContext.recordIndex)
    .filter((index) => Number.isSafeInteger(index) && index >= 0) : []);
  if (contextualIndexes.size > 0) return contextualIndexes.size;
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
  return Math.max(contextualIndexes.size, indexes.size, ...unindexedOccurrences.values(), 0);
}

function deriveRepeatableSectionKind(control, collection) {
  if (control?.sectionContext?.kind) return control.sectionContext.kind;
  if (collection === 'education') return 'education';
  if (collection === 'projects') return 'project';
  if (collection === 'awards') return 'award';
  if (collection === 'languages') return 'language';
  if (collection !== 'workExperiences') return undefined;
  const signal = [control?.semantics?.name, control?.semantics?.label, control?.semantics?.ariaLabel]
    .filter(Boolean).join(' ').toLowerCase();
  return signal.includes('internship') || signal.includes('实习') ? 'internship' : 'work';
}

export class ZeroExtensionBrowserKernel {
  constructor({
    browserSession,
    profileService,
    resumeAsset,
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
    this.resumeAsset = resumeAsset;
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
      const fallback = ({
        'login-needed': 'browser_login_required',
        'verification-needed': 'browser_verification_required',
        'confirmation-needed': 'browser_confirmation_required'
      })[browserStatus.state] ?? browserStatus.errorCode ?? 'cdp_unavailable';
      return this.#setOffline(browserStatus, fallback);
    }
    if (!this.cdp || !this.connection) return this.start();
    return this.status();
  }

  async observe() {
    this.#requireStarted();
    await this.#assertIdentity();
    const { root } = await this.cdp.send('DOM.getDocument', { depth: INSPECTION_DOM_DEPTH, pierce: true });
    if (!root) throw new Error('dom_document_missing');
    this.pageEpoch += 1;
    const rawState = this.pageModule.buildPrivacySafePageState(root, {
      sessionId: this.connection.launchId,
      origin: this.connection.origin,
      path: this.connection.pathPattern
    }, this.registry);
    // Presence reads are independent, privacy-preserving Boolean probes. Do
    // them concurrently while retaining DOM order: real application pages can
    // contain dozens of controls, and serial CDP round-trips made the required
    // post-write verification exceed the operation deadline.
    const controls = await mapBounded(rawState.controls, MAX_CONCURRENT_PRESENCE_PROBES, async (control) => {
      const target = this.registry.resolve(this.connection.launchId, rawState.snapshotId, control.ref);
      let hasValue = null;
      // Buttons do not have a scalar presence state. Treating their visible
      // caption as a value incorrectly blocks ordinary repeatable-section add
      // intents before the compiler can compare the current and target count.
      if ((control.safety === 'ordinary' || control.safety === 'file') && control.role !== 'button' && target) {
        try { hasValue = await this.#readPresence(target, control.inputType); } catch { hasValue = null; }
      }
      return {
        ...control,
        hasValue
      };
    });
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
        resumeUploads: this.auditEntries.filter((entry) => entry.action === 'upload_saved_resume' && entry.verified).length,
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
    this.browserState = [
      'stopped', 'disconnected', 'login-needed', 'verification-needed', 'confirmation-needed'
    ].includes(sessionStatus?.state)
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
    const uploadingResume = request.intent.kind === 'upload_saved_resume';
    if (uploadingResume ? target.safety !== 'file' : target.safety !== 'ordinary') {
      return fail('blocked', 'unsafe_control');
    }
    if (target.disabled || target.readOnly) return fail('blocked', 'disabled_or_readonly');
    if (!compatible(request.intent, target)) return fail('blocked', 'incompatible_action');
    if (uploadingResume) return this.#uploadDefaultResume(request, target, startedAt);

    let expected;
    let desired;
    let repeatableSectionKind;
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
    if (request.intent.kind === 'set_date_range') {
      const resolver = this.profileService.createResolver();
      const [start, end] = await Promise.all([
        resolver.resolveScalar({ profileVersion: request.profileVersion, profilePath: request.intent.startProfilePath }),
        resolver.resolveScalar({ profileVersion: request.profileVersion, profilePath: request.intent.endProfilePath })
      ]);
      if (!start?.trim() || !end?.trim() || start.trim() > end.trim()) return fail('failed', 'invalid_profile_range');
      expected = { start: start.trim(), end: end.trim() };
    }
    if (request.intent.kind === 'set_date_range_start') {
      const catalogEntry = profileSnapshot.catalog.find((entry) => entry.path === request.intent.startProfilePath);
      const pairedEnd = profileSnapshot.catalog.find(
        (entry) => entry.path === request.intent.startProfilePath.replace(/startDate$/, 'endDate')
      );
      if (!catalogEntry?.hasValue || catalogEntry.kind !== 'date' || catalogEntry.safetyClass !== 'ordinary'
        || !pairedEnd || pairedEnd.hasValue || pairedEnd.kind !== 'date' || pairedEnd.safetyClass !== 'ordinary') {
        return fail('blocked', 'invalid_profile_path');
      }
      const start = await this.profileService.createResolver().resolveScalar({
        profileVersion: request.profileVersion,
        profilePath: request.intent.startProfilePath
      });
      if (!start?.trim()) return fail('failed', 'empty_profile_value');
      expected = { start: start.trim() };
    }
    if (request.intent.kind === 'ensure_repeatable') {
      const root = profileSnapshot.completeness.repeatableRoots.find((entry) => entry.path === request.intent.collection);
      if (!root || request.intent.index >= root.nonEmptyItemCount) return fail('failed', 'empty_profile_value');
      const observedControl = this.current.state.controls.find((control) => control.ref === request.ref);
      repeatableSectionKind = deriveRepeatableSectionKind(observedControl, request.intent.collection);
      const beforeCount = countCollection(this.current.state, request.intent.collection, repeatableSectionKind);
      if (beforeCount > request.intent.index) return fail('verified', 'already_present', 0, 'repeatable-add', true);
      if (beforeCount !== request.intent.index) return fail('blocked', 'repeatable_gap');
    }
    if (request.intent.kind === 'set_boolean_from_collection_empty') {
      const root = profileSnapshot.completeness.repeatableRoots.find(
        (entry) => entry.path === request.intent.collection
      );
      if (!root) return fail('blocked', 'invalid_profile_path');
      let relevantCount = root.nonEmptyItemCount;
      const observedControl = this.current.state.controls.find((control) => control.ref === request.ref);
      const sectionKind = observedControl?.sectionContext?.kind;
      const pageHasWork = this.current.state.controls.some((control) => control.sectionContext?.kind === 'work');
      const pageHasInternship = this.current.state.controls.some((control) => control.sectionContext?.kind === 'internship');
      if (request.intent.collection === 'workExperiences' && pageHasWork && pageHasInternship
        && ['work', 'internship'].includes(sectionKind)) {
        const typeEntries = profileSnapshot.catalog
          .filter((entry) => /^workExperiences\.\d+\.experienceType$/.test(entry.path) && entry.hasValue);
        let matchingCount = 0;
        const resolver = this.profileService.createResolver();
        for (const entry of typeEntries) {
          const type = await resolver.resolveScalar({
            profileVersion: request.profileVersion,
            profilePath: entry.path
          });
          if (type === sectionKind) matchingCount += 1;
        }
        // Untyped legacy records prevent an unsafe "none" assertion; they
        // remain conservatively counted in either section.
        relevantCount = matchingCount + Math.max(0, root.nonEmptyItemCount - typeEntries.length);
      }
      desired = relevantCount === 0 ? 'checked' : 'unchecked';
    }

    const payload = request.intent.kind === 'fill_text'
      ? { action: 'fill', strategy: 'primary', expected }
      : request.intent.kind === 'select_option'
        ? {
            action: 'select', strategy: 'primary', expected,
            ...(['basic.currentCity', 'jobPreference.preferredCities'].includes(request.intent.profilePath)
              ? { matchMode: 'administrative-area' }
              : {})
          }
        : request.intent.kind === 'set_date'
          ? { action: 'fill', strategy: 'primary', expected }
          : request.intent.kind === 'set_date_range'
            ? {
                action: 'fill-range', strategy: 'primary', expectedStart: expected.start, expectedEnd: expected.end,
                rangeMode: target.inputType === 'year-month-range' ? 'year-month-select' : 'native'
              }
          : request.intent.kind === 'set_date_range_start'
            ? {
                action: 'fill-range', strategy: 'primary', expectedStart: expected.start, startOnly: true,
                rangeMode: target.inputType === 'year-month-range' ? 'year-month-select' : 'native'
              }
          : request.intent.kind === 'set_boolean' || request.intent.kind === 'set_boolean_from_collection_empty'
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
    // Native setters can look correct synchronously yet be discarded by a
    // framework render on the next task. Verify the value again after that
    // render boundary; if it vanished, use the already-bounded keyboard path
    // and require the same delayed exact verification before reporting a fill.
    if ((request.intent.kind === 'fill_text' || request.intent.kind === 'set_date') && outcome.verified) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const durable = await this.#callFixed(target, { action: 'fill', strategy: 'verify-keyboard', expected });
      if (!durable.verified) {
        const prepared = await this.#callFixed(target, { action: 'fill', strategy: 'prepare-keyboard', expected });
        if (prepared.performed) {
          await this.cdp.send('Input.insertText', { text: expected });
          outcome = await this.#callFixed(target, { action: 'fill', strategy: 'verify-keyboard', expected });
          attempts = Math.max(attempts, 2);
          if (outcome.verified) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            outcome = await this.#callFixed(target, { action: 'fill', strategy: 'verify-keyboard', expected });
          }
        } else {
          outcome = { performed: true, verified: false, strategy: primary.strategy, reason: 'framework-rejected' };
        }
      }
    }
    if ((request.intent.kind === 'set_boolean' || request.intent.kind === 'set_boolean_from_collection_empty')
      && primary.performed && !primary.verified && primary.reason === 'verification-failed') {
      // React-controlled checkboxes can commit on the next render task. The
      // second exact desired-state call is idempotent: it verifies the same
      // local Boolean and clicks only if that state still differs.
      await new Promise((resolve) => setTimeout(resolve, 120));
      outcome = await this.#callFixed(target, payload);
      attempts = 2;
    }
    if (request.intent.kind === 'select_option' && primary.reason === 'option-not-found') {
      // Some custom selects mount their options asynchronously. Open the
      // already-authorized opaque control, wait briefly for that UI update,
      // then retry the same exact option intent once.
      const opened = primary.performed
        ? { performed: true }
        : await this.#callFixed(target, { action: 'click', strategy: 'primary', purpose: 'open-control' });
      if (opened.performed) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        outcome = await this.#callFixed(target, payload);
        attempts = 2;
        if (outcome.reason === 'option-not-found' && outcome.performed) {
          await new Promise((resolve) => setTimeout(resolve, 120));
          outcome = await this.#callFixed(target, payload);
          attempts = 3;
          if (outcome.reason === 'option-not-found' && outcome.performed) {
            await new Promise((resolve) => setTimeout(resolve, 120));
            outcome = await this.#callFixed(target, payload);
            attempts = 4;
          }
        }
      }
    }
    if (request.intent.kind === 'select_option' && outcome.performed && outcome.reason === 'verification-failed') {
      // React-controlled selects can commit their display caption on the next
      // render task. Re-read only a Boolean from this exact opaque node; do
      // not reuse a now-stale structural fingerprint or click another option.
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (await this.#readPresence(target, target.inputType)) {
        outcome = { performed: true, verified: true, strategy: 'custom-select' };
      }
    }
    if (['set_date_range', 'set_date_range_start'].includes(request.intent.kind)
      && primary.reason === 'option-not-found' && primary.performed) {
      let useWholeRangeRetry = target.inputType !== 'year-month-range';
      if (!useWholeRangeRetry) {
        // React-controlled four-part ranges can batch start/end year/month
        // clicks made in one page-world task and discard every intermediate
        // selection. Keep one external range intent, but cross a render
        // boundary between its four fixed, ordered substeps.
        await new Promise((resolve) => setTimeout(resolve, 120));
        const rangeSteps = request.intent.kind === 'set_date_range_start' ? [0, 1] : [0, 1, 2, 3];
        for (const rangeStep of rangeSteps) {
          outcome = await this.#callFixed(target, { ...payload, rangeStep });
          attempts += 1;
          if (rangeStep === 0 && !outcome.performed && outcome.reason === 'incompatible-action') {
            useWholeRangeRetry = true;
            break;
          }
          if (!outcome.verified && outcome.performed && outcome.reason === 'option-not-found') {
            // A controlled dropdown may mount its menu only after the current
            // page task. The first call opens this exact subcontrol; the one
            // bounded retry selects from the now-mounted exact option list.
            await new Promise((resolve) => setTimeout(resolve, 120));
            outcome = await this.#callFixed(target, { ...payload, rangeStep });
            attempts += 1;
          }
          if (!outcome.verified) break;
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        if (!useWholeRangeRetry && outcome.verified) {
          outcome = await this.#callFixed(target, { ...payload, rangeStep: 'verify' });
          attempts += 1;
        }
      }
      if (useWholeRangeRetry) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        outcome = await this.#callFixed(target, payload);
        attempts += 1;
        if (outcome.reason === 'option-not-found' && outcome.performed) {
          await new Promise((resolve) => setTimeout(resolve, 120));
          outcome = await this.#callFixed(target, payload);
          attempts += 1;
        }
      }
    }
    if (request.intent.kind === 'ensure_repeatable' && primary.performed && !primary.reason) {
      const observed = await this.observe();
      const verified = countCollection(observed.state, request.intent.collection, repeatableSectionKind) === request.intent.index + 1;
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

  async #uploadDefaultResume(request, target, startedAt) {
    const result = (status, reason, attempts = 0, verified = false) => ({
      requestId: request.requestId,
      ref: request.ref,
      action: request.intent.kind,
      status,
      attempts,
      strategy: attempts ? 'cdp-file-input' : 'none',
      verified,
      ...(reason ? { reason } : {}),
      durationBucket: durationBucket(this.now() - startedAt)
    });
    const current = await this.#inspectTarget(target);
    if (!current) return result('failed', 'stale_reference');
    if (!isResumeAttachmentControl(current.control)) return result('blocked', 'blocked_control');
    if (await this.#readPresence(target)) return result('blocked', 'existing_file');
    if (!this.resumeAsset?.withMaterializedFile) return result('failed', 'resume_missing');

    let attempted = false;
    try {
      return await this.resumeAsset.withMaterializedFile(async ({ filePath, metadata }) => {
        attempted = true;
        await this.cdp.send('DOM.setFileInputFiles', {
          files: [filePath],
          backendNodeId: target.backendNodeId
        });
        const resolved = await this.cdp.send('DOM.resolveNode', {
          backendNodeId: target.backendNodeId,
          objectGroup: 'qiuzhao-resume-upload'
        });
        const objectId = resolved?.object?.objectId;
        if (!objectId) return result('failed', 'stale_reference', 1);
        try {
          const verification = await this.cdp.send('Runtime.callFunctionOn', {
            objectId,
            functionDeclaration: VERIFY_RESUME_INPUT,
            arguments: [{ value: metadata }],
            returnByValue: true,
            awaitPromise: false,
            silent: true,
            objectGroup: 'qiuzhao-resume-upload'
          });
          return verification?.result?.value === true
            ? result('verified', undefined, 1, true)
            : result('failed', 'verification_failed', 1);
        } finally {
          await this.cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'qiuzhao-resume-upload' }).catch(() => undefined);
        }
      });
    } catch (error) {
      const code = error?.code ?? error?.message;
      const reason = ['resume_missing', 'invalid_resume', 'resume_cleanup_failed'].includes(code)
        ? code
        : 'bridge_failed';
      return result('failed', reason, attempted ? 1 : 0);
    }
  }

  async #readPresence(target, inputType) {
    const resolved = await this.cdp.send(
      'DOM.resolveNode', { backendNodeId: target.backendNodeId, objectGroup: 'qiuzhao-presence' }, PRESENCE_PROBE_TIMEOUT_MS
    );
    const objectId = resolved?.object?.objectId;
    if (!objectId) return null;
    try {
      const result = await this.cdp.send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: READ_BOOLEAN_PRESENCE,
        arguments: [{ value: inputType ?? '' }],
        returnByValue: true,
        awaitPromise: false,
        silent: true,
        objectGroup: 'qiuzhao-presence'
      }, PRESENCE_PROBE_TIMEOUT_MS);
      const value = result?.result?.value;
      return typeof value === 'boolean' ? value : null;
    } finally {
      await this.cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'qiuzhao-presence' }, PRESENCE_PROBE_TIMEOUT_MS).catch(() => undefined);
    }
  }

  async #inspectTarget(target) {
    const { root } = await this.cdp.send('DOM.getDocument', { depth: INSPECTION_DOM_DEPTH, pierce: true });
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
