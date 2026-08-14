import { createHash, randomUUID } from 'node:crypto';

const MAX_REPLAN_ROUNDS = 4;
const EXECUTABLE = new Set(['fill_from_profile', 'ensure_repeatable']);
const COLLECTION_ALIASES = Object.freeze({
  education: ['education_list', 'education'],
  workExperiences: ['internship_list', 'internship'],
  projects: ['project_list', 'project'],
  workSamples: ['works_list', 'works', 'work'],
  awards: ['award_list', 'award'],
  languages: ['language_list', 'language']
});

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{8,160}$/.test(value);
}

function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

function digest(value) {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function safetyClass(safety) {
  return ({
    ordinary: 'ordinary', credential: 'sensitive', verification: 'verification', identity: 'identity',
    'final-submit': 'final_submission', file: 'attachment', consent: 'consent',
    destructive: 'destructive'
  })[safety] ?? 'sensitive';
}

function repeatableMetadata(control, controls) {
  if (control.role !== 'button' || control.safety !== 'ordinary') return undefined;
  const text = [control.semantics?.name, control.semantics?.label, control.semantics?.ariaLabel, control.semantics?.nearbyText]
    .filter(Boolean).join(' ').toLowerCase();
  for (const [collection, aliases] of Object.entries(COLLECTION_ALIASES)) {
    if (!aliases.some((alias) => text.includes(alias)) && !/(添加|新增|add)/i.test(text)) continue;
    const indexes = new Set();
    for (const candidate of controls) {
      const name = candidate.semantics?.name ?? '';
      for (const alias of aliases) {
        const match = new RegExp(`^${alias}\\[(\\d+)\\]`).exec(name);
        if (match) indexes.add(Number(match[1]));
      }
    }
    return { collection, index: indexes.size };
  }
  return undefined;
}

function capability(control, repeatable) {
  if (control.safety !== 'ordinary' || control.disabled || control.readOnly) return 'read_only';
  if (repeatable) return 'ensure_repeatable';
  if (control.role === 'checkbox' || control.role === 'switch') return 'set_boolean';
  if (control.role === 'combobox' || control.role === 'listbox' || control.role === 'radio' || control.tag === 'select') {
    return 'select_option';
  }
  if (control.inputType === 'date' || /date/i.test(control.semantics?.name ?? '')) return 'set_date';
  if (control.role === 'textbox' && (control.tag === 'textarea' || control.tag === 'contenteditable')) return 'fill_multiline';
  if (control.role === 'textbox') return 'fill_text';
  return 'read_only';
}

function structuralLabel(control) {
  return control.semantics?.label || control.semantics?.ariaLabel || control.semantics?.placeholder
    || control.semantics?.nearbyText || control.semantics?.name || control.role;
}

function sectionName(control) {
  const name = control.semantics?.name ?? '';
  return name.split(/[.[]/, 1)[0] || control.boundary || 'page';
}

function createPlannerFields(state) {
  const repeatables = new Map();
  const sourceControls = [];
  for (let index = 0; index < state.controls.length; index += 1) {
    const control = state.controls[index];
    if (control.role === 'radio') {
      const previous = sourceControls.at(-1);
      if (previous?.control.role === 'radio') {
        previous.options.push(structuralLabel(control));
        previous.control.hasValue = Boolean(previous.control.hasValue || control.hasValue);
        previous.control.required = Boolean(previous.control.required || control.required);
        continue;
      }
      sourceControls.push({ control: structuredClone(control), options: [structuralLabel(control)] });
      continue;
    }
    const next = state.controls[index + 1];
    if (control.role === 'combobox' && next?.role === 'textbox'
      && control.safety !== 'ordinary' && next.safety !== 'ordinary'
      && structuralLabel(control) === structuralLabel(next)) {
      sourceControls.push({ control: structuredClone(next), options: control.options ?? [] });
      index += 1;
      continue;
    }
    sourceControls.push({ control, options: control.options ?? [] });
  }
  const fields = sourceControls.map(({ control, options }) => {
    const repeatable = repeatableMetadata(control, state.controls);
    if (repeatable) repeatables.set(control.ref, repeatable);
    return {
      ref: control.ref,
      section: sectionName(control),
      label: structuralLabel(control),
      role: control.role,
      required: Boolean(control.required),
      hasValue: Boolean(control.hasValue),
      capability: capability(control, repeatable),
      safetyClass: safetyClass(control.safety),
      options: options.slice(0, 256).map((label, index) => ({
        optionRef: `option_${digest([control.ref, index, label]).slice(0, 24)}`,
        label
      })),
      conditional: false
    };
  });
  return { fields, repeatables };
}

function terminalConclusion(decision) {
  return ({
    profile_missing: 'profile_missing', manual: 'manual_required', review: 'review_required',
    conditional_not_applicable: 'not_applicable'
  })[decision.disposition];
}

export class ApplicationServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApplicationServiceError';
    this.code = code;
  }
}

export class RecruitmentApplicationService {
  constructor({
    kernel, profileService, authorizationStore, ledger, createPlannerRequest, compilePlan,
    now = () => Date.now(), createId = () => randomUUID(), maxReplanRounds = MAX_REPLAN_ROUNDS
  }) {
    this.kernel = kernel;
    this.profileService = profileService;
    this.authorizationStore = authorizationStore;
    this.ledger = ledger;
    this.createPlannerRequest = createPlannerRequest;
    this.compilePlan = compilePlan;
    this.now = now;
    this.createId = createId;
    this.maxReplanRounds = maxReplanRounds;
    this.started = false;
    this.inspection = undefined;
    this.plan = undefined;
    this.executing = false;
    this.cancelled = false;
    this.auditRows = new Map();
    this.replay = new Map();
    this.workflow = { schemaVersion: 1, status: 'idle', completedRequests: [], round: 0 };
  }

  async start() {
    if (this.started) return this.workspaceStatus();
    await this.kernel.start();
    this.workflow = await this.ledger.load();
    for (const entry of this.workflow.completedRequests ?? []) this.replay.set(entry.requestId, entry);
    this.started = true;
    return this.workspaceStatus();
  }

  async workspaceStatus(input = {}) {
    this.#requireStarted();
    if (!exactKeys(input, [])) throw new ApplicationServiceError('invalid_request', 'workspace_status accepts no properties');
    const kernelStatus = this.kernel.status();
    let profile;
    try {
      const snapshot = await this.profileService.getAgentSnapshot();
      profile = {
        state: 'ready', profileVersion: snapshot.profileVersion,
        profileSchemaVersion: snapshot.profileSchemaVersion,
        populatedScalarPaths: snapshot.completeness.populatedScalarPaths,
        totalScalarPaths: snapshot.completeness.totalScalarPaths,
        populatedRepeatableRoots: snapshot.completeness.repeatableRoots.filter((entry) => entry.hasValue).length
      };
    } catch (error) {
      profile = { state: error?.code === 'not_initialized' ? 'not_initialized' : 'unavailable' };
    }
    const lease = await this.authorizationStore.current();
    const authorized = Boolean(lease && profile.profileVersion === lease.profileVersion
      && kernelStatus.origin === lease.origin && lease.expiresAt > this.now());
    return {
      browser: { state: kernelStatus.state, origin: kernelStatus.origin, path: kernelStatus.path },
      profile,
      authorization: { state: authorized ? 'active' : 'inactive', scope: authorized ? 'ordinary' : 'none' },
      workflow: {
        status: this.workflow.status,
        round: this.workflow.round ?? 0,
        recoverable: this.workflow.status === 'needs_replan'
      }
    };
  }

  async inspect(input = {}) {
    this.#requireStarted();
    if (!exactKeys(input, [])) throw new ApplicationServiceError('invalid_request', 'application_inspect accepts no properties');
    if (this.executing) throw new ApplicationServiceError('workflow_busy', 'another execution owns the page');
    const profile = await this.profileService.getAgentSnapshot();
    const status = this.kernel.status();
    await this.#readyLease(status.origin, profile.profileVersion);
    const observed = await this.kernel.observe();
    const converted = createPlannerFields(observed.state);
    const plannerRequest = this.createPlannerRequest({ fields: converted.fields, profilePathCatalog: profile.catalog });
    this.inspection = {
      snapshotId: observed.state.snapshotId,
      pageEpoch: observed.pageEpoch,
      origin: observed.state.origin,
      plannerRequest,
      repeatables: converted.repeatables,
      profileVersion: profile.profileVersion
    };
    this.plan = undefined;
    this.auditRows.clear();
    for (const field of plannerRequest.fields) {
      this.auditRows.set(field.ref, {
        ref: field.ref, label: field.label, section: field.section, role: field.role,
        required: field.required, pageState: field.hasValue ? 'filled' : 'empty',
        safetyClass: field.safetyClass, conclusion: 'unplanned'
      });
    }
    return {
      snapshotId: this.inspection.snapshotId,
      pageEpoch: this.inspection.pageEpoch,
      origin: this.inspection.origin,
      fields: plannerRequest.fields,
      profilePathCatalog: plannerRequest.profilePathCatalog,
      runFlags: plannerRequest.runFlags,
      summary: {
        fieldCount: plannerRequest.fields.length,
        protectedCount: plannerRequest.fields.filter((field) => field.safetyClass !== 'ordinary').length,
        profilePathCount: plannerRequest.profilePathCatalog.length
      }
    };
  }

  async planApplication(input) {
    this.#requireStarted();
    if (!exactKeys(input, ['snapshotId', 'pageEpoch', 'proposal']) || !validId(input.snapshotId)
      || !Number.isSafeInteger(input.pageEpoch) || !input.proposal || typeof input.proposal !== 'object') {
      throw new ApplicationServiceError('invalid_request', 'application_plan requires a closed snapshot-bound proposal');
    }
    if (!this.inspection || input.snapshotId !== this.inspection.snapshotId || input.pageEpoch !== this.inspection.pageEpoch) {
      throw new ApplicationServiceError('needs_replan', 'the inspected page state is stale');
    }
    const lease = await this.#activeLease();
    const nextRound = (this.workflow.round ?? 0) + 1;
    if (nextRound > this.maxReplanRounds) {
      this.workflow = await this.ledger.save({ ...this.workflow, status: 'user_action_required' });
      throw new ApplicationServiceError('user_action_required', 'the bounded replanning budget is exhausted');
    }
    const compiled = this.compilePlan({
      plannerRequest: this.inspection.plannerRequest,
      proposal: input.proposal,
      binding: {
        origin: this.inspection.origin,
        leaseId: lease.leaseId,
        profileVersion: this.inspection.profileVersion,
        pageEpoch: this.inspection.pageEpoch
      },
      authority: {
        origin: lease.origin,
        activeLeaseId: lease.leaseId,
        profileVersion: lease.profileVersion,
        pageEpoch: this.inspection.pageEpoch,
        leaseActive: true
      },
      attemptBudget: 2
    });
    this.plan = compiled;
    this.cancelled = false;
    for (const decision of compiled.decisions) {
      const row = this.auditRows.get(decision.ref);
      if (!row) continue;
      const conclusion = terminalConclusion(decision);
      this.auditRows.set(decision.ref, {
        ...row,
        ...(decision.profilePath ? { profilePath: decision.profilePath } : {}),
        ...(decision.reason ? { reason: decision.reason } : {}),
        conclusion: conclusion ?? 'planned'
      });
    }
    this.workflow = await this.ledger.save({
      ...this.workflow,
      status: 'idle',
      jobId: this.workflow.jobId ?? `job_${this.createId().replaceAll('-', '')}`,
      origin: compiled.binding.origin,
      profileVersion: compiled.binding.profileVersion,
      planId: compiled.planId,
      round: nextRound
    });
    return {
      planId: compiled.planId,
      round: nextRound,
      decisionCount: compiled.decisions.length,
      executableCount: compiled.decisions.filter((decision) => EXECUTABLE.has(decision.disposition)).length,
      profileMissingCount: compiled.decisions.filter((decision) => decision.disposition === 'profile_missing').length,
      reviewCount: compiled.decisions.filter((decision) => decision.disposition === 'review').length,
      manualCount: compiled.decisions.filter((decision) => decision.disposition === 'manual').length,
      plannerSource: compiled.plannerSource,
      legacyFieldTemplateEnabled: compiled.legacyFieldTemplateEnabled
    };
  }

  async execute(input) {
    this.#requireStarted();
    if (!exactKeys(input, ['planId', 'requestId']) || typeof input.planId !== 'string'
      || !input.planId.startsWith('plan_') || !validId(input.requestId)) {
      throw new ApplicationServiceError('invalid_request', 'application_execute requires only planId and requestId');
    }
    const inputDigest = digest(input);
    const replay = this.replay.get(input.requestId);
    if (replay) {
      if (replay.digest !== inputDigest) throw new ApplicationServiceError('duplicate_request_conflict', 'requestId was reused with different input');
      return structuredClone(replay.response);
    }
    if (this.executing) throw new ApplicationServiceError('workflow_busy', 'another execution owns the page');
    if (this.cancelled) throw new ApplicationServiceError('cancelled', 'the workflow was cancelled');
    if (!this.plan || this.plan.planId !== input.planId || !this.inspection) {
      throw new ApplicationServiceError('needs_replan', 'the compiled plan is unavailable or stale');
    }
    this.executing = true;
    try {
      const lease = await this.#activeLease();
      this.kernel.grantOrdinaryLease(lease);
      this.workflow = await this.ledger.save({ ...this.workflow, status: 'running' });
      const outcomes = [];
      let state = 'completed';
      for (const decision of this.plan.decisions) {
        if (!EXECUTABLE.has(decision.disposition)) continue;
        if (this.cancelled) {
          state = 'cancelled';
          break;
        }
        const repeatable = this.inspection.repeatables.get(decision.ref);
        const intent = decision.disposition === 'ensure_repeatable'
          ? repeatable && repeatable.collection === decision.profilePath
            ? { kind: 'ensure_repeatable', collection: repeatable.collection, index: repeatable.index }
            : undefined
          : {
              kind: decision.capability === 'select_option' ? 'select_option'
                : decision.capability === 'set_date' ? 'set_date'
                  : decision.capability === 'set_boolean' ? 'set_boolean' : 'fill_text',
              profilePath: decision.profilePath
            };
        if (!intent) {
          outcomes.push({ ref: decision.ref, status: 'blocked', verified: false, attempts: 0, reason: 'unsupported_repeatable' });
          this.#recordOutcome(decision, outcomes.at(-1));
          state = 'user_action_required';
          continue;
        }
        let outcome;
        try {
          outcome = await this.kernel.execute({
            requestId: `${input.requestId}_${outcomes.length}`,
            leaseId: this.plan.binding.leaseId,
            profileVersion: this.plan.binding.profileVersion,
            pageEpoch: this.plan.binding.pageEpoch,
            snapshotId: this.inspection.snapshotId,
            ref: decision.ref,
            intent
          });
        } catch (error) {
          if (['stale_page_epoch', 'page_identity_changed'].includes(error?.message)) {
            state = 'needs_replan';
            outcomes.push({ ref: decision.ref, status: 'failed', verified: false, attempts: 0, reason: 'stale_page' });
            this.#recordOutcome(decision, outcomes.at(-1));
            break;
          }
          throw error;
        }
        outcomes.push(outcome);
        this.#recordOutcome(decision, outcome);
        if (!outcome.verified) state = outcome.status === 'blocked' ? 'user_action_required' : 'needs_replan';
        if (decision.disposition === 'ensure_repeatable' && outcome.verified) {
          state = 'needs_replan';
          break;
        }
      }
      let observation;
      try {
        observation = await this.kernel.observe();
      } catch {
        state = 'needs_replan';
      }
      this.inspection = undefined;
      this.plan = undefined;
      const response = {
        requestId: input.requestId,
        status: state,
        outcomes: outcomes.map((outcome) => ({
          ref: outcome.ref, status: outcome.status, verified: Boolean(outcome.verified),
          attempts: outcome.attempts ?? 0,
          ...(outcome.strategy ? { strategy: outcome.strategy } : {}),
          ...(outcome.reason ? { reason: outcome.reason } : {})
        })),
        verifiedCount: outcomes.filter((outcome) => outcome.verified).length,
        attemptedCount: outcomes.reduce((sum, outcome) => sum + (outcome.attempts ?? 0), 0),
        ...(observation ? { nextPageEpoch: observation.pageEpoch, nextSnapshotId: observation.state.snapshotId } : {})
      };
      const persisted = { requestId: input.requestId, digest: inputDigest, response };
      this.replay.set(input.requestId, persisted);
      this.workflow = await this.ledger.save({
        ...this.workflow,
        status: state,
        planId: undefined,
        completedRequests: [...(this.workflow.completedRequests ?? []), persisted]
      });
      return response;
    } finally {
      this.executing = false;
    }
  }

  async audit(input = {}) {
    this.#requireStarted();
    if (!exactKeys(input, [])) throw new ApplicationServiceError('invalid_request', 'application_audit accepts no properties');
    const rows = [...this.auditRows.values()];
    const kernelAudit = this.kernel.audit();
    return {
      workflowStatus: this.workflow.status,
      rows,
      summary: {
        inventoried: rows.length,
        terminal: rows.filter((row) => row.conclusion !== 'unplanned' && row.conclusion !== 'planned').length,
        verified: rows.filter((row) => row.conclusion === 'verified').length,
        profileMissing: rows.filter((row) => row.conclusion === 'profile_missing').length,
        reviewRequired: rows.filter((row) => row.conclusion === 'review_required').length,
        manualRequired: rows.filter((row) => row.conclusion === 'manual_required').length,
        finalSubmits: kernelAudit.summary.finalSubmits,
        credentialReads: kernelAudit.summary.credentialReads,
        cookieReads: kernelAudit.summary.cookieReads
      }
    };
  }

  async cancel(input = {}) {
    this.#requireStarted();
    if (!exactKeys(input, [])) throw new ApplicationServiceError('invalid_request', 'workflow_cancel accepts no properties');
    this.cancelled = true;
    this.plan = undefined;
    this.inspection = undefined;
    this.kernel.pause();
    await this.authorizationStore.revoke();
    this.workflow = await this.ledger.save({ ...this.workflow, status: 'cancelled', planId: undefined });
    return { status: 'cancelled', authorization: 'revoked', references: 'invalidated' };
  }

  close() {
    this.kernel.close();
    this.started = false;
  }

  async #activeLease() {
    if (!this.inspection) throw new ApplicationServiceError('needs_replan', 'a current inspection is required');
    return this.#readyLease(this.inspection.origin, this.inspection.profileVersion);
  }

  async #readyLease(origin, profileVersion) {
    const lease = await this.authorizationStore.current();
    if (!lease) throw new ApplicationServiceError('authorization_required', 'an active local ordinary-field lease is required');
    if (lease.origin !== origin || lease.profileVersion !== profileVersion) {
      throw new ApplicationServiceError('authorization_mismatch', 'the local lease does not match the current page and profile');
    }
    return lease;
  }

  #recordOutcome(decision, outcome) {
    const row = this.auditRows.get(decision.ref);
    if (!row) return;
    this.auditRows.set(decision.ref, {
      ...row,
      ...(decision.profilePath ? { profilePath: decision.profilePath } : {}),
      conclusion: outcome.verified ? 'verified' : outcome.status === 'blocked' ? 'manual_required' : 'write_failed',
      attempts: outcome.attempts ?? 0,
      verified: Boolean(outcome.verified),
      ...(outcome.reason ? { reason: outcome.reason } : {})
    });
  }

  #requireStarted() {
    if (!this.started) throw new ApplicationServiceError('service_not_started', 'application service is not started');
  }
}
