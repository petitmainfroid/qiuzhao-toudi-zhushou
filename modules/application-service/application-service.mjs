import { createHash, randomUUID } from 'node:crypto';

const MAX_REPLAN_ROUNDS = 24;
const EXECUTABLE = new Set([
  'fill_from_profile', 'fill_date_range', 'fill_date_range_start', 'ensure_repeatable', 'upload_default_resume',
  'set_boolean_from_collection_empty'
]);
const COLLECTION_ALIASES = Object.freeze({
  education: ['education_list', 'education'],
  workExperiences: ['work_experience_list', 'work_experience', 'internship_list', 'internship'],
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
    if (!aliases.some((alias) => text.includes(alias))) continue;
    const indexes = new Set();
    const sectionKind = collection === 'education' ? 'education'
      : collection === 'projects' ? 'project'
        : collection === 'awards' ? 'award'
          : collection === 'languages' ? 'language'
            : collection === 'workExperiences'
              ? (text.includes('internship') || text.includes('实习') ? 'internship' : 'work')
              : undefined;
    const sectionIndexes = new Set(sectionKind ? controls
      .filter((candidate) => candidate.role !== 'button' && candidate.sectionContext?.kind === sectionKind)
      .map((candidate) => candidate.sectionContext.recordIndex)
      .filter((index) => Number.isSafeInteger(index) && index >= 0) : []);
    if (sectionIndexes.size > 0) return { collection, index: sectionIndexes.size };
    const unindexedOccurrences = new Map();
    for (const candidate of controls) {
      const name = candidate.semantics?.name ?? '';
      for (const alias of aliases) {
        const match = new RegExp(`^${alias}\\[(\\d+)\\]`).exec(name);
        if (match) {
          indexes.add(Number(match[1]));
          continue;
        }
        if (name === alias) {
          const semantic = structuralLabel(candidate);
          const key = `${alias}|${semantic}|${candidate.role}|${candidate.tag}`;
          unindexedOccurrences.set(key, (unindexedOccurrences.get(key) ?? 0) + 1);
        }
      }
    }
    return { collection, index: Math.max(sectionIndexes.size, indexes.size, ...unindexedOccurrences.values(), 0) };
  }
  return undefined;
}

function capability(control, repeatable) {
  if (control.safety === 'file') {
    const signal = [
      control.semantics?.label,
      control.semantics?.ariaLabel,
      control.semantics?.placeholder,
      control.semantics?.nearbyText,
      control.semantics?.name
    ].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, '');
    const isResume = signal.includes('简历') || signal.includes('个人履历')
      || /(?:^|[^a-z])(?:resume|cv)(?:[^a-z]|$)/i.test(signal);
    const isForbidden = [
      '身份证', '证件', '护照', '头像', '照片', '成绩单', '作品', '推荐信', '资格证',
      'identity', 'passport', 'portrait', 'photo', 'transcript', 'portfolio', 'works', 'recommendation', 'certificate'
    ].some((token) => signal.includes(token));
    return control.inputType === 'file' && !control.multiple && !control.disabled && !control.readOnly
      && !control.hasValue && isResume && !isForbidden
      ? 'upload_saved_resume'
      : 'read_only';
  }
  if (control.safety !== 'ordinary' || control.disabled || control.readOnly) return 'read_only';
  // A range is one semantic field regardless of its presentation.  Some ATS
  // pages use two native date inputs while others expose four year/month
  // selectors.  The browser kernel chooses the safe fixed adapter; planners
  // never need to learn a site-specific representation.
  if (control.inputType === 'date-range' || control.inputType === 'year-month-range') return 'set_date_range';
  if (control.inputType === 'year-month') return 'read_only';
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
  if (control.sectionContext) {
    return `${control.sectionContext.kind}.${control.sectionContext.recordIndex}`;
  }
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
  const resumeUploadFields = fields.filter((field) => field.capability === 'upload_saved_resume');
  if (resumeUploadFields.length !== 1) {
    for (const field of resumeUploadFields) field.capability = 'read_only';
  }
  return { fields, repeatables };
}

function terminalConclusion(decision) {
  return ({
    profile_missing: 'profile_missing', manual: 'manual_required', review: 'review_required',
    conditional_not_applicable: 'not_applicable'
  })[decision.disposition];
}

// These are exact semantic aliases, not site templates. Section-owned fields
// are resolved below only after the section kind and record index are known;
// anything outside the closed vocabulary remains a review item.
const AUTOFILL_LABELS = Object.freeze({
  'basic.fullName': ['姓名', 'name', 'fullname', 'full name'],
  'basic.preferredName': ['常用名', '英文名', 'preferred name'],
  'basic.email': ['邮箱', 'email', 'e-mail'],
  'basic.phone': ['手机', '手机号', '电话', 'phone', 'mobile'],
  'basic.gender': ['性别', 'gender'],
  'basic.birthDate': ['出生日期', '出生年月', '生日', 'birthdate', 'dateofbirth'],
  'basic.nationality': ['国籍', '国籍（地区）', '国家或地区', 'nationality'],
  'basic.currentCity': ['所在地', '所在地点', '现居住地', '当前城市', '现居城市', 'currentcity'],
  'basic.hometown': ['家乡', '籍贯', 'hometown'],
  'basic.politicalStatus': ['政治面貌'],
  'basic.maritalStatus': ['婚姻状况'],
  'basic.heightCm': ['身高', '身高cm'],
  'basic.weightKg': ['体重', '体重kg'],
  'basic.hobbies': ['兴趣爱好', '爱好'],
  'education.0.degree': ['最高学历'],
  'jobPreference.workYears': ['工作经验', '工作年限', '工作经验年限'],
  'jobPreference.preferredCities': ['期望城市', '期望工作地点', '意向城市'],
  'jobPreference.targetRoles': ['期望职位', '意向职位', '目标岗位'],
  'jobPreference.availableDate': ['到岗时间', '可到岗时间'],
  'answers.selfIntroduction': ['自我介绍'],
  'answers.selfEvaluation': ['自我评价', '自我描述', '个人评价'],
  'answers.strengths': ['个人优势', '优势'],
  'answers.careerPlan': ['职业规划', '职业生涯规划']
});

const SECTION_PROFILE_ROOTS = Object.freeze({
  education: 'education',
  work: 'workExperiences',
  internship: 'workExperiences',
  project: 'projects',
  language: 'languages',
  award: 'awards'
});

const SECTION_FIELD_ALIASES = Object.freeze({
  education: Object.freeze({
    school: ['学校', '学校名称', '院校', '院校名称'],
    degree: ['学历', '学位'],
    educationType: ['学历类型', '学习形式', '培养方式'],
    major: ['专业', '专业名称'],
    gpa: ['gpa', '绩点'],
    ranking: ['排名', '专业排名'],
    college: ['学院', '院系'],
    majorCategory: ['专业类别'],
    mainCourses: ['主修课程', '主要课程'],
    description: ['教育描述', '在校经历']
  }),
  work: Object.freeze({
    company: ['公司', '公司名称', '单位名称'],
    department: ['部门', '所在部门'],
    role: ['职位', '职位名称', '岗位', '岗位名称'],
    description: ['工作职责', '岗位职责', '工作内容', '经历描述', '描述'],
    industry: ['行业', '所属行业'],
    location: ['工作地点', '工作城市'],
    achievement: ['工作成果', '主要业绩', '工作业绩']
  }),
  internship: Object.freeze({
    company: ['公司', '公司名称', '单位名称'],
    department: ['部门', '所在部门'],
    role: ['职位', '职位名称', '岗位', '岗位名称'],
    description: ['实习职责', '实习内容', '工作职责', '岗位职责', '工作内容', '经历描述', '描述'],
    industry: ['行业', '所属行业'],
    location: ['实习地点', '工作地点', '工作城市'],
    achievement: ['实习成果', '工作成果', '主要业绩']
  }),
  project: Object.freeze({
    name: ['项目', '项目名称'],
    role: ['项目角色', '职务', '担任角色'],
    description: ['项目描述', '描述', '项目介绍'],
    outcome: ['项目成果', '成果'],
    link: ['项目链接', '项目地址'],
    responsibilities: ['项目职责', '项目中职责', '职责']
  }),
  language: Object.freeze({
    language: ['语言', '语言类型', '语种'],
    proficiency: ['精通程度', '掌握程度', '熟练程度'],
    qualification: ['语言证书', '证书'],
    listeningSpeaking: ['听说', '听说能力'],
    readingWriting: ['读写', '读写能力'],
    score: ['分数', '成绩']
  }),
  award: Object.freeze({
    name: ['奖项', '奖项名称', '获奖名称'],
    description: ['奖项描述', '获奖描述'],
    category: ['奖项类别', '类别'],
    level: ['奖项级别', '级别'],
    grade: ['奖项等级', '等级']
  })
});

const SECTION_RANGE_LABELS = Object.freeze([
  '起止时间', '就读时间', '在校时间', '工作时间', '实习时间', '项目时间', '开始结束时间'
]);

const SECTION_START_LABELS = Object.freeze(['开始时间', '入学时间', '工作开始时间', '实习开始时间', '项目开始时间']);
const SECTION_END_LABELS = Object.freeze(['结束时间', '毕业时间', '工作结束时间', '实习结束时间', '项目结束时间']);
const AWARD_DATE_LABELS = Object.freeze(['获奖时间', '获奖日期', '奖项时间']);

function normalizedAutofillLabel(value) {
  return String(value ?? '').toLowerCase().replace(/[\s\p{P}\p{S}_-]/gu, '');
}

function exactAliasMatch(label, aliases) {
  const normalized = normalizedAutofillLabel(label);
  return aliases.some((alias) => normalizedAutofillLabel(alias) === normalized);
}

function sectionIdentity(section) {
  const match = /^(basic|education|work|internship|project|language|award)\.(\d+)$/.exec(String(section ?? ''));
  return match ? { kind: match[1], index: Number(match[2]) } : undefined;
}

function globalProfilePath(field) {
  const matches = Object.entries(AUTOFILL_LABELS)
    .filter(([, aliases]) => exactAliasMatch(field.label, aliases))
    .map(([profilePath]) => profilePath);
  return matches.length === 1 ? matches[0] : undefined;
}

function routedRecordIndex(kind, pageIndex, experienceRouting) {
  if (kind !== 'work' && kind !== 'internship') return pageIndex;
  if (!experienceRouting) return pageIndex;
  return experienceRouting[kind]?.[pageIndex];
}

function sectionProfileDecision(field, experienceRouting) {
  const section = sectionIdentity(field.section);
  if (!section || section.kind === 'basic') return undefined;
  const profileRoot = SECTION_PROFILE_ROOTS[section.kind];
  const recordIndex = routedRecordIndex(section.kind, section.index, experienceRouting);
  if (!profileRoot || !Number.isSafeInteger(recordIndex) || recordIndex < 0) return undefined;
  if (field.capability === 'set_date_range' && exactAliasMatch(field.label, SECTION_RANGE_LABELS)) {
    return {
      kind: 'date_range',
      startProfilePath: `${profileRoot}.${recordIndex}.startDate`,
      endProfilePath: `${profileRoot}.${recordIndex}.endDate`
    };
  }
  if (exactAliasMatch(field.label, SECTION_START_LABELS)) {
    return { kind: 'scalar', profilePath: `${profileRoot}.${recordIndex}.startDate` };
  }
  if (exactAliasMatch(field.label, SECTION_END_LABELS)) {
    return { kind: 'scalar', profilePath: `${profileRoot}.${recordIndex}.endDate` };
  }
  if (section.kind === 'award' && exactAliasMatch(field.label, AWARD_DATE_LABELS)) {
    return { kind: 'scalar', profilePath: `${profileRoot}.${recordIndex}.date` };
  }
  const aliases = SECTION_FIELD_ALIASES[section.kind] ?? {};
  const suffixes = Object.entries(aliases)
    .filter(([, labels]) => exactAliasMatch(field.label, labels))
    .map(([suffix]) => suffix);
  return suffixes.length === 1
    ? { kind: 'scalar', profilePath: `${profileRoot}.${recordIndex}.${suffixes[0]}` }
    : undefined;
}

function repeatablePageKind(field) {
  const contextual = /^(education|work|internship|project|language|award)\.\d+$/.exec(String(field.section ?? ''));
  if (contextual) return contextual[1];
  const corpus = normalizedAutofillLabel(`${field.section} ${field.label}`);
  if (/实习|internship/.test(corpus)) return 'internship';
  if (/工作|workexperience|employment/.test(corpus)) return 'work';
  if (/教育|education/.test(corpus)) return 'education';
  if (/项目|project/.test(corpus)) return 'project';
  if (/语言|language/.test(corpus)) return 'language';
  if (/获奖|奖项|award/.test(corpus)) return 'award';
  return undefined;
}

function compatibleScalar(field, entry) {
  if (!entry || !entry.hasValue || entry.safetyClass !== 'ordinary') return false;
  if (entry.kind === 'date') return field.capability === 'set_date';
  if (entry.kind === 'choice') return field.capability === 'select_option';
  if (entry.kind === 'boolean') return field.capability === 'set_boolean';
  return entry.kind !== 'repeatable'
    && ['fill_text', 'fill_multiline', 'select_option'].includes(field.capability);
}

function isNoWorkExperienceField(field) {
  if (field.capability !== 'set_boolean' || field.safetyClass !== 'ordinary') return false;
  const label = normalizedAutofillLabel(field.label);
  return ['没有工作经历', '无工作经历', '暂无工作经历', 'noworkexperience']
    .some((candidate) => normalizedAutofillLabel(candidate) === label);
}

const REPEATABLE_SECTION_KINDS = Object.freeze([
  'education', 'work', 'internship', 'project', 'language', 'award'
]);

const REPEATABLE_FILL_KINDS = new Set(['map', 'map_date_range', 'map_date_range_start']);

function plannerSectionCounts(fields) {
  const indexes = new Map(REPEATABLE_SECTION_KINDS.map((kind) => [kind, new Set()]));
  for (const field of fields) {
    if (field.capability === 'ensure_repeatable') continue;
    const section = sectionIdentity(field.section);
    if (!section || !indexes.has(section.kind)) continue;
    indexes.get(section.kind).add(section.index);
  }
  return Object.fromEntries([...indexes].map(([kind, values]) => [kind, values.size]));
}

function reconcileRepeatableDecisions(plannerRequest, decisions, {
  repeatableCounts = {},
  repeatables = new Map()
} = {}) {
  const decisionByRef = new Map(decisions.map((decision) => [decision.ref, decision]));
  const pageCounts = plannerSectionCounts(plannerRequest.fields);
  const pageKinds = new Set(plannerRequest.fields
    .map((field) => sectionIdentity(field.section)?.kind ?? (field.capability === 'ensure_repeatable'
      ? repeatablePageKind(field)
      : undefined))
    .filter((kind) => REPEATABLE_SECTION_KINDS.includes(kind)));
  const addControls = new Map(REPEATABLE_SECTION_KINDS.map((kind) => [kind, []]));
  for (const field of plannerRequest.fields) {
    if (field.capability !== 'ensure_repeatable') continue;
    const kind = repeatablePageKind(field);
    const repeatable = repeatables.get(field.ref);
    if (!kind || !repeatable || !addControls.has(kind)) continue;
    addControls.get(kind).push({ field, repeatable, decision: decisionByRef.get(field.ref) });
  }

  const deficits = [];
  const blockers = [];
  const addCandidates = [];
  const frontierRefs = new Set();
  for (const kind of REPEATABLE_SECTION_KINDS) {
    if (!pageKinds.has(kind)) continue;
    const targetCount = repeatableCounts[kind];
    if (!Number.isSafeInteger(targetCount) || targetCount <= 0) continue;
    const controls = addControls.get(kind);
    const controlCounts = [...new Set(controls.map(({ repeatable }) => repeatable.index))];
    const pageCount = controlCounts.length === 1 ? controlCounts[0] : (pageCounts[kind] ?? 0);
    if (targetCount <= pageCount) continue;
    deficits.push({ sectionKind: kind, pageCount, targetCount });
    if (controls.length === 0) {
      blockers.push({ code: 'repeatable_add_missing', sectionKind: kind, pageCount, targetCount });
      continue;
    }
    if (controls.length !== 1 || controlCounts.length !== 1) {
      blockers.push({ code: 'repeatable_add_ambiguous', sectionKind: kind, pageCount, targetCount });
      continue;
    }
    const candidate = controls[0];
    const currentSection = pageCount > 0 ? `${kind}.${pageCount - 1}` : undefined;
    const currentFields = currentSection
      ? plannerRequest.fields.filter((field) => field.section === currentSection && field.capability !== 'ensure_repeatable')
      : [];
    const mappedEmptyRefs = currentFields
      .filter((field) => !field.hasValue && REPEATABLE_FILL_KINDS.has(decisionByRef.get(field.ref)?.kind))
      .map((field) => field.ref);
    const unresolvedRequired = currentFields.some((field) => field.required && !field.hasValue
      && !REPEATABLE_FILL_KINDS.has(decisionByRef.get(field.ref)?.kind));
    if (unresolvedRequired) {
      blockers.push({ code: 'repeatable_frontier_unmapped', sectionKind: kind, pageCount, targetCount });
      continue;
    }
    if (mappedEmptyRefs.length > 0) {
      for (const ref of mappedEmptyRefs) frontierRefs.add(ref);
      continue;
    }
    if (candidate.decision?.kind !== 'ensure_repeatable') {
      blockers.push({ code: 'repeatable_add_ambiguous', sectionKind: kind, pageCount, targetCount });
      continue;
    }
    addCandidates.push({ ...candidate, sectionKind: kind, pageCount, targetCount });
  }

  // Adding is globally serialized. If any newest record still has safe mapped
  // fields, every add action is deferred until those fields have terminal
  // Boolean outcomes. Otherwise exactly one unambiguous add ref may execute.
  const scheduledAdd = frontierRefs.size === 0 ? addCandidates[0] : undefined;
  for (let index = 0; index < decisions.length; index += 1) {
    if (decisions[index].kind !== 'ensure_repeatable') continue;
    if (decisions[index].ref === scheduledAdd?.field.ref) continue;
    decisions[index] = { kind: 'review', ref: decisions[index].ref, reason: 'page_state_conflict' };
  }

  return {
    deficits,
    blockers,
    frontierRefs: [...frontierRefs],
    scheduledAdd: scheduledAdd ? {
      ref: scheduledAdd.field.ref,
      sectionKind: scheduledAdd.sectionKind,
      pageCount: scheduledAdd.pageCount,
      targetCount: scheduledAdd.targetCount
    } : undefined
  };
}

function createClosedAutofillState(plannerRequest, {
  experienceRouting,
  repeatableCounts = {},
  repeatables = new Map()
} = {}) {
  const available = new Map(plannerRequest.profilePathCatalog.map((entry) => [entry.path, entry]));
  const decisions = plannerRequest.fields.map((field) => {
    if (field.capability === 'upload_saved_resume' && field.safetyClass === 'attachment'
      && !field.hasValue && plannerRequest.defaultResume?.hasValue) {
      return { kind: 'upload_default_resume', ref: field.ref };
    }
    if (field.safetyClass !== 'ordinary') return { kind: 'manual', ref: field.ref, reason: 'protected_field' };
    if (isNoWorkExperienceField(field)) {
      const collection = available.get('workExperiences');
      if (collection?.kind === 'repeatable' && collection.safetyClass === 'ordinary') {
        const separateWorkAndInternship = plannerRequest.fields.some((candidate) => /^work\.\d+$/.test(candidate.section))
          && plannerRequest.fields.some((candidate) => /^internship\.\d+$/.test(candidate.section));
        const desiredChecked = separateWorkAndInternship && experienceRouting
          ? experienceRouting.work.length === 0
          : !collection.hasValue;
        return field.hasValue !== desiredChecked
          ? { kind: 'map_collection_empty', ref: field.ref, profilePath: collection.path }
          : { kind: 'review', ref: field.ref, reason: 'page_state_conflict' };
      }
      return { kind: 'review', ref: field.ref, reason: 'ambiguous_mapping' };
    }
    if (field.capability === 'ensure_repeatable') {
      const repeatable = repeatables.get(field.ref);
      const pageKind = repeatablePageKind(field);
      const targetCount = pageKind ? repeatableCounts[pageKind] : undefined;
      const rootEntry = repeatable ? available.get(repeatable.collection) : undefined;
      if (repeatable && rootEntry?.hasValue && rootEntry.safetyClass === 'ordinary'
        && Number.isSafeInteger(targetCount) && targetCount > repeatable.index && !field.hasValue) {
        return { kind: 'ensure_repeatable', ref: field.ref, profilePath: repeatable.collection };
      }
      return { kind: 'review', ref: field.ref, reason: 'ambiguous_mapping' };
    }
    if (field.hasValue) return { kind: 'review', ref: field.ref, reason: 'page_state_conflict' };
    if (field.capability === 'read_only') return { kind: 'manual', ref: field.ref, reason: 'unsupported_control' };
    const sectionDecision = sectionProfileDecision(field, experienceRouting);
    if (sectionDecision?.kind === 'date_range') {
      const start = available.get(sectionDecision.startProfilePath);
      const end = available.get(sectionDecision.endProfilePath);
      if (start?.hasValue && start.safetyClass === 'ordinary' && end?.safetyClass === 'ordinary') {
        return end.hasValue
          ? { kind: 'map_date_range', ref: field.ref, startProfilePath: start.path, endProfilePath: end.path }
          : { kind: 'map_date_range_start', ref: field.ref, startProfilePath: start.path };
      }
      return { kind: 'review', ref: field.ref, reason: 'ambiguous_mapping' };
    }
    const profilePath = sectionDecision?.profilePath ?? globalProfilePath(field);
    const entry = profilePath ? available.get(profilePath) : undefined;
    if (!profilePath || !compatibleScalar(field, entry)) {
      return { kind: 'review', ref: field.ref, reason: 'ambiguous_mapping' };
    }
    return { kind: 'map', ref: field.ref, profilePath };
  });
  const decisionByRef = new Map(decisions.map((decision) => [decision.ref, decision]));
  plannerRequest.fields.forEach((field, index) => {
    if (decisions[index]?.kind !== 'ensure_repeatable') return;
    const repeatable = repeatables.get(field.ref);
    const pageKind = repeatablePageKind(field);
    if (!repeatable || !pageKind || repeatable.index < 1) return;
    const currentSection = `${pageKind}.${repeatable.index - 1}`;
    const hasUnresolvedRequiredField = plannerRequest.fields.some((candidate) => {
      if (candidate.section !== currentSection || !candidate.required || candidate.hasValue) return false;
      const decision = decisionByRef.get(candidate.ref);
      return !['map', 'map_date_range', 'map_date_range_start'].includes(decision?.kind);
    });
    if (hasUnresolvedRequiredField) {
      decisions[index] = { kind: 'review', ref: field.ref, reason: 'ambiguous_mapping' };
    }
  });
  const reconciliation = reconcileRepeatableDecisions(plannerRequest, decisions, {
    repeatableCounts,
    repeatables
  });
  return { proposal: { schemaVersion: 1, decisions }, reconciliation };
}

export function buildClosedAutofillProposal(plannerRequest, options = {}) {
  return createClosedAutofillState(plannerRequest, options).proposal;
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
    kernel, profileService, resumeAsset, authorizationStore, ledger, createPlannerRequest, compilePlan,
    now = () => Date.now(), createId = () => randomUUID(), maxReplanRounds = MAX_REPLAN_ROUNDS
  }) {
    this.kernel = kernel;
    this.profileService = profileService;
    this.resumeAsset = resumeAsset ?? {
      getAgentSnapshot: async () => ({ hasValue: false, mimeType: 'application/pdf' })
    };
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
    this.autofillReplay = new Map();
    this.workflow = { schemaVersion: 1, status: 'idle', completedRequests: [], round: 0 };
    this.kernelStartupError = undefined;
  }

  async start() {
    if (this.started) return this.workspaceStatus();
    this.workflow = await this.ledger.load();
    for (const entry of this.workflow.completedRequests ?? []) this.replay.set(entry.requestId, entry);
    try {
      await this.kernel.start();
      this.kernelStartupError = undefined;
    } catch (error) {
      this.kernelStartupError = safeErrorCode(error);
    }
    this.started = true;
    return this.workspaceStatus();
  }

  async workspaceStatus(input = {}) {
    this.#requireStarted();
    if (!exactKeys(input, [])) throw new ApplicationServiceError('invalid_request', 'workspace_status accepts no properties');
    const kernelStatus = await this.#kernelStatus();
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
      browser: {
        state: kernelStatus.state,
        origin: kernelStatus.origin,
        path: kernelStatus.path,
        ...(kernelStatus.errorCode || this.kernelStartupError
          ? { errorCode: kernelStatus.errorCode ?? this.kernelStartupError }
          : {}),
        ...browserRecovery(kernelStatus.state)
      },
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
    const status = await this.#kernelStatus();
    this.#requireBrowserReady(status);
    const profile = await this.profileService.getAgentSnapshot();
    const defaultResume = await this.resumeAsset.getAgentSnapshot();
    await this.#readyLease(status.origin, profile.profileVersion);
    const observed = await this.kernel.observe();
    const converted = createPlannerFields(observed.state);
    const plannerRequest = this.createPlannerRequest({
      fields: converted.fields,
      profilePathCatalog: profile.catalog,
      defaultResume
    });
    this.inspection = {
      snapshotId: observed.state.snapshotId,
      pageEpoch: observed.pageEpoch,
      origin: observed.state.origin,
      plannerRequest,
      repeatables: converted.repeatables,
      repeatableRoots: profile.completeness.repeatableRoots,
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
      defaultResume: plannerRequest.defaultResume,
      runFlags: plannerRequest.runFlags,
      summary: {
        fieldCount: plannerRequest.fields.length,
        protectedCount: plannerRequest.fields.filter((field) => field.safetyClass !== 'ordinary').length,
        profilePathCount: plannerRequest.profilePathCatalog.length,
        defaultResumeAvailable: plannerRequest.defaultResume.hasValue
      }
    };
  }

  async planApplication(input) {
    this.#requireStarted();
    if (!exactKeys(input, ['snapshotId', 'pageEpoch', 'proposal']) || !validId(input.snapshotId)
      || !Number.isSafeInteger(input.pageEpoch) || !input.proposal || typeof input.proposal !== 'object') {
      throw new ApplicationServiceError('invalid_request', 'application_plan requires a closed snapshot-bound proposal');
    }
    this.#requireBrowserReady(await this.#kernelStatus());
    if (!this.inspection || input.snapshotId !== this.inspection.snapshotId || input.pageEpoch !== this.inspection.pageEpoch) {
      throw new ApplicationServiceError('needs_replan', 'the inspected page state is stale');
    }
    const lease = await this.#activeLease();
    const continuingReplan = ['idle', 'needs_replan'].includes(this.workflow.status)
      && Boolean(this.workflow.jobId)
      && this.workflow.origin === this.inspection.origin
      && this.workflow.profileVersion === this.inspection.profileVersion;
    const nextRound = continuingReplan ? (this.workflow.round ?? 0) + 1 : 1;
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
      jobId: continuingReplan && this.workflow.jobId
        ? this.workflow.jobId
        : `job_${this.createId().replaceAll('-', '')}`,
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
      uploadCount: compiled.decisions.filter((decision) => decision.disposition === 'upload_default_resume').length,
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
    this.#requireBrowserReady(await this.#kernelStatus());
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
        const intent = decision.disposition === 'upload_default_resume'
          ? { kind: 'upload_saved_resume' }
          : decision.disposition === 'fill_date_range'
            ? { kind: 'set_date_range', startProfilePath: decision.startProfilePath, endProfilePath: decision.endProfilePath }
          : decision.disposition === 'fill_date_range_start'
            ? { kind: 'set_date_range_start', startProfilePath: decision.startProfilePath }
          : decision.disposition === 'set_boolean_from_collection_empty'
            ? { kind: 'set_boolean_from_collection_empty', collection: decision.profilePath }
          : decision.disposition === 'ensure_repeatable'
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
        if (['ensure_repeatable', 'set_boolean_from_collection_empty'].includes(decision.disposition) && outcome.verified) {
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

  async autofill(input) {
    this.#requireStarted();
    if (!exactKeys(input, ['requestId']) || !validId(input.requestId)) {
      throw new ApplicationServiceError('invalid_request', 'application_autofill requires one bounded requestId');
    }
    const replay = this.autofillReplay.get(input.requestId);
    if (replay) return structuredClone(replay);
    // `autofill` is one explicit top-level bounded job. A prior command may
    // have ended in needs_replan/user_action_required and left its persisted
    // round counter behind; a new opaque requestId must receive its own bounded
    // rounds rather than inheriting and immediately exhausting the old job.
    // The loop below still retains one jobId across its own structural rounds.
    if (this.workflow.jobId) {
      this.workflow = await this.ledger.save({
        schemaVersion: 1,
        status: 'idle',
        completedRequests: this.workflow.completedRequests ?? [],
        round: 0
      });
    }
    const aggregate = {
      requestId: input.requestId,
      status: 'completed', outcomes: [], verifiedCount: 0, attemptedCount: 0, rounds: 0,
      plan: { decisionCount: 0, executableCount: 0, reviewCount: 0, manualCount: 0, uploadCount: 0 },
      blockers: []
    };
    let reconciliationPending = false;
    for (let round = 0; round < this.maxReplanRounds; round += 1) {
      const inspected = await this.inspect();
      const options = await this.#autofillOptions();
      const autofillState = createClosedAutofillState(this.inspection.plannerRequest, options);
      aggregate.blockers = autofillState.reconciliation.blockers;
      const planned = await this.planApplication({
        snapshotId: inspected.snapshotId,
        pageEpoch: inspected.pageEpoch,
        proposal: autofillState.proposal
      });
      const structuralRefs = new Set(this.plan.decisions
        .filter((decision) => ['ensure_repeatable', 'set_boolean_from_collection_empty'].includes(decision.disposition))
        .map((decision) => decision.ref));
      const requestId = round === 0 ? input.requestId : `autofill_${digest([input.requestId, round]).slice(0, 32)}`;
      const executed = await this.execute({ planId: planned.planId, requestId });
      aggregate.status = executed.status;
      aggregate.outcomes.push(...executed.outcomes);
      aggregate.verifiedCount += executed.verifiedCount;
      aggregate.attemptedCount += executed.attemptedCount;
      aggregate.rounds += 1;
      for (const key of Object.keys(aggregate.plan)) aggregate.plan[key] += planned[key];
      const structureChanged = executed.outcomes.some((outcome) => outcome.verified && structuralRefs.has(outcome.ref));
      const outcomeByRef = new Map(executed.outcomes.map((outcome) => [outcome.ref, outcome]));
      const frontierCompleted = autofillState.reconciliation.frontierRefs.length > 0
        && autofillState.reconciliation.frontierRefs.every((ref) => outcomeByRef.get(ref)?.verified);
      reconciliationPending = structureChanged || frontierCompleted;
      if (reconciliationPending) continue;
      if (aggregate.blockers.length > 0) aggregate.status = 'user_action_required';
      break;
    }
    if (reconciliationPending) {
      aggregate.status = 'user_action_required';
      aggregate.blockers = [...aggregate.blockers, {
        code: 'repeatable_reconciliation_budget_exhausted'
      }];
    }
    const result = structuredClone(aggregate);
    this.autofillReplay.set(input.requestId, result);
    return result;
  }

  async #autofillOptions() {
    const rootCounts = Object.fromEntries((this.inspection.repeatableRoots ?? [])
      .map((entry) => [entry.path, entry.nonEmptyItemCount]));
    let experienceRouting;
    if (typeof this.profileService.createResolver === 'function') {
      const resolver = this.profileService.createResolver();
      const typePaths = this.inspection.plannerRequest.profilePathCatalog
        .filter((entry) => /^workExperiences\.\d+\.experienceType$/.test(entry.path) && entry.hasValue)
        .sort((left, right) => Number(left.path.split('.')[1]) - Number(right.path.split('.')[1]));
      const routed = { work: [], internship: [] };
      for (const entry of typePaths) {
        const type = await resolver.resolveScalar({
          profileVersion: this.inspection.profileVersion,
          profilePath: entry.path
        });
        if (type === 'work' || type === 'internship') routed[type].push(Number(entry.path.split('.')[1]));
      }
      const pageHasWorkSection = this.inspection.plannerRequest.fields.some((field) => /^work\.\d+$/.test(field.section));
      const pageHasInternshipSection = this.inspection.plannerRequest.fields.some((field) => /^internship\.\d+$/.test(field.section));
      if (pageHasWorkSection && !pageHasInternshipSection) {
        routed.work = typePaths.map((entry) => Number(entry.path.split('.')[1]));
        routed.internship = [];
      }
      experienceRouting = routed;
    }
    return {
      experienceRouting,
      repeatables: this.inspection.repeatables,
      repeatableCounts: {
        education: rootCounts.education ?? 0,
        work: experienceRouting?.work.length ?? rootCounts.workExperiences ?? 0,
        internship: experienceRouting?.internship.length ?? rootCounts.workExperiences ?? 0,
        project: rootCounts.projects ?? 0,
        language: rootCounts.languages ?? 0,
        award: rootCounts.awards ?? 0
      }
    };
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
        cookieReads: kernelAudit.summary.cookieReads,
        resumeUploads: kernelAudit.summary.resumeUploads ?? 0
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

  async #kernelStatus() {
    try {
      return typeof this.kernel.refreshStatus === 'function'
        ? await this.kernel.refreshStatus()
        : this.kernel.status();
    } catch (error) {
      return { state: 'disconnected', errorCode: safeErrorCode(error) };
    }
  }

  #requireBrowserReady(status) {
    if (status?.state === 'ready') return;
    this.inspection = undefined;
    this.plan = undefined;
    throw new ApplicationServiceError('browser_not_ready', `browser is ${status?.state ?? 'unavailable'}`);
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

function safeErrorCode(error) {
  if (typeof error?.code === 'string' && /^[a-z0-9_-]{1,80}$/.test(error.code)) return error.code;
  return error instanceof Error && /^[a-z0-9_-]{1,80}$/.test(error.message)
    ? error.message
    : 'cdp_unavailable';
}

function browserRecovery(state) {
  if (state === 'ready') return { recommendedAction: 'none' };
  if (state === 'login-needed') {
    return { recommendedAction: 'login_in_browser', recoveryCommand: 'qiuzhao agent status' };
  }

  if (state === 'verification-needed') {
    return { recommendedAction: 'complete_verification_in_browser', recoveryCommand: 'qiuzhao agent status' };
  }
  if (state === 'confirmation-needed') {
    return { recommendedAction: 'confirm_ready', recoveryCommand: 'qiuzhao browser confirm-ready' };
  }
  if (state === 'disconnected') {
    return { recommendedAction: 'reconnect', recoveryCommand: 'qiuzhao browser reconnect' };
  }
  return { recommendedAction: 'launch', recoveryCommand: 'qiuzhao browser launch --url <招聘网页>' };
}
