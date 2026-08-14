import { createHash } from 'node:crypto';

const ADD_CONTROL = /^(education_list|internship_list|works_list|project_list|award_list|language_list)\.add$/;

function structuralLabel(control) {
  return control.semantics?.label || control.semantics?.ariaLabel || control.semantics?.placeholder
    || control.semantics?.nearbyText || control.semantics?.name || '未命名字段';
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function safetyClass(control) {
  if (control.safety === 'identity' || control.safety === 'credential') return 'sensitive-confirmation';
  if (control.safety === 'file' || (control.safety === 'destructive' && structuralLabel(control).includes('[文件]'))) {
    return 'attachment-confirmation';
  }
  if (control.safety === 'verification') return 'manual-verification';
  if (control.safety === 'consent') return 'consent';
  if (control.safety === 'destructive') return 'destructive';
  if (control.safety === 'final-submit') return 'final-submit';
  return 'ordinary';
}

function controlKind(control) {
  const safety = safetyClass(control);
  if (safety === 'attachment-confirmation') return 'attachment';
  if (safety === 'manual-verification') return 'verification';
  if (safety === 'sensitive-confirmation') return 'identity';
  if (control.tag === 'textarea') return 'textarea';
  if (control.tag === 'contenteditable') return 'contenteditable';
  if (control.tag === 'select') return 'native-select';
  if (control.role === 'combobox' || control.role === 'listbox') return 'custom-select';
  if (control.role === 'radio') return 'radio';
  if (control.role === 'checkbox' || control.role === 'switch') return 'checkbox';
  if (control.tag === 'custom' && /起止时间/.test(structuralLabel(control))) return 'date-range';
  if (control.inputType === 'date') return 'date';
  if (control.inputType === 'month') return 'month';
  if (control.role === 'textbox') return 'text';
  if (control.role === 'button') return 'action';
  return 'unknown';
}

function groupName(control) {
  const name = control.semantics?.name ?? '';
  if (/^(education_list|internship_list|works_list|project_list|award_list|language_list)$/.test(name)) return name;
  return 'application';
}

function collapseControls(controls) {
  const output = [];
  const actions = [];
  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index];
    const add = ADD_CONTROL.exec(control.semantics?.name ?? '');
    if (add) {
      actions.push({ ref: control.ref, groupRef: add[1], label: structuralLabel(control) });
      continue;
    }
    if (control.role === 'radio') {
      const options = [structuralLabel(control)];
      let selected = Boolean(control.hasValue);
      while (controls[index + 1]?.role === 'radio') {
        index += 1;
        options.push(structuralLabel(controls[index]));
        selected ||= Boolean(controls[index].hasValue);
      }
      output.push({
        ...structuredClone(control), hasValue: selected,
        semantics: { ...control.semantics, label: '投递渠道' }, options
      });
      continue;
    }
    const next = controls[index + 1];
    if (control.role === 'combobox' && next?.role === 'textbox'
      && structuralLabel(control) === structuralLabel(next)
      && (control.safety !== 'ordinary' || next.safety !== 'ordinary')) {
      output.push({ ...structuredClone(next), safety: control.safety !== 'ordinary' ? control.safety : next.safety });
      index += 1;
      continue;
    }
    output.push(control);
  }
  return { controls: output, actions };
}

export function createLogicalFieldInventory(observed) {
  if (!observed?.state?.controls || !Array.isArray(observed.state.controls)) throw new Error('invalid_observation');
  const collapsed = collapseControls(observed.state.controls);
  const occurrences = new Map();
  const fields = collapsed.controls.map((control) => {
    const label = structuralLabel(control);
    const groupRef = groupName(control);
    const semanticHash = hash(`${groupRef}|${label}|${controlKind(control)}|${safetyClass(control)}`);
    const occurrenceKey = `${groupRef}|${semanticHash}`;
    const instanceIndex = occurrences.get(occurrenceKey) ?? 0;
    occurrences.set(occurrenceKey, instanceIndex + 1);
    const repeatable = groupRef === 'application' ? null : { groupRef, instanceIndex };
    return {
      fieldInstanceId: `xiaomi.${groupRef}.${semanticHash}.${instanceIndex}`,
      semanticKey: `${groupRef}.field_${semanticHash}`,
      stepId: 'application',
      conditionRef: null,
      repeatable,
      controlKind: controlKind(control),
      required: Boolean(control.required),
      safetyClass: safetyClass(control),
      privateReview: {
        label,
        pageState: control.hasValue === true ? 'filled' : control.hasValue === false ? 'empty' : 'not-read',
        ref: control.ref
      }
    };
  });
  return {
    schemaVersion: 1,
    kind: 'real-page-inventory-candidate',
    siteId: 'xiaomi-feishu',
    page: { origin: observed.state.origin, normalizedPath: observed.state.path },
    pageEpoch: observed.pageEpoch,
    rawControlCount: observed.state.controls.length,
    fields,
    excludedActions: collapsed.actions,
    summary: {
      reachableLogicalFields: fields.length,
      ordinary: fields.filter((field) => field.safetyClass === 'ordinary').length,
      protected: fields.filter((field) => field.safetyClass !== 'ordinary').length,
      repeatableInstances: fields.filter((field) => field.repeatable).length,
      userActions: collapsed.actions.length
    }
  };
}

export function publicInventoryEvidence(candidate) {
  const structural = candidate.fields.map(({ privateReview: _private, ...field }) => field);
  return {
    siteId: candidate.siteId,
    page: candidate.page,
    pageEpoch: candidate.pageEpoch,
    rawControlCount: candidate.rawControlCount,
    summary: candidate.summary,
    fieldStructureHash: createHash('sha256').update(JSON.stringify(structural)).digest('hex')
  };
}
