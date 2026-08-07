import { AtsObservationError } from "./sanitize";
import type {
  AtsFamilyTemplate,
  AtsTemplateFieldRule,
  AtsTemplateRepeatableRule,
  AtsTemplateSectionRule
} from "./templateContracts";

const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const VERSION_PATTERN = /^\d+(?:\.\d+){0,2}$/;
const RULE_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const SEMANTIC_KEY_PATTERN = /^[a-z][a-z0-9_.-]*(?:\[\])?[a-z0-9_.-]*$/;
const PROFILE_PATH_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:\.(?:[A-Za-z][A-Za-z0-9]*|\{index\}))*$/;
const PATH_ALIAS_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const SAFE_SELECTOR_PATTERN = /^(?:[a-z][a-z0-9-]*|\.[A-Za-z_][A-Za-z0-9_-]{1,79}|\[(?:data-[a-z0-9-]+|role)(?:='[a-z-]+')?\])$/;
const VALUE_LIKE_PATTERN = /(?:https?:\/\/|<[^>]+>|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\d{7,})/i;

function safeText(value: string, label: string, maximum = 80): void {
  if (!value || value.length > maximum || VALUE_LIKE_PATTERN.test(value)) {
    throw new AtsObservationError(`Unsafe ${label} in ATS template.`);
  }
}

function validateFieldRule(rule: AtsTemplateFieldRule): void {
  if (!RULE_ID_PATTERN.test(rule.id)) throw new AtsObservationError(`Invalid ATS template rule id: ${rule.id}`);
  if (!Array.isArray(rule.semanticKeys) || rule.semanticKeys.length < 1 || rule.semanticKeys.length > 12) {
    throw new AtsObservationError(`ATS template rule ${rule.id} must have bounded semantic keys.`);
  }
  for (const key of rule.semanticKeys) {
    safeText(key, "semantic key", 120);
    if (!SEMANTIC_KEY_PATTERN.test(key)) throw new AtsObservationError(`Invalid ATS semantic key: ${key}`);
  }
  if (rule.action === "exclude") {
    if (rule.profilePathPattern !== null) throw new AtsObservationError(`Excluded ATS rule ${rule.id} cannot map a profile path.`);
  }
  else if (!rule.profilePathPattern || !PROFILE_PATH_PATTERN.test(rule.profilePathPattern)) {
    throw new AtsObservationError(`ATS rule ${rule.id} has an invalid profile path pattern.`);
  }
  if (rule.profilePathPattern) safeText(rule.profilePathPattern, "profile path", 120);
  if (rule.companionProfilePathPattern) {
    if (rule.action === "exclude" || !PROFILE_PATH_PATTERN.test(rule.companionProfilePathPattern)) {
      throw new AtsObservationError(`ATS rule ${rule.id} has an invalid companion profile path pattern.`);
    }
    safeText(rule.companionProfilePathPattern, "companion profile path", 120);
  }
  if (rule.kinds && (rule.kinds.length < 1 || new Set(rule.kinds).size !== rule.kinds.length)) {
    throw new AtsObservationError(`ATS rule ${rule.id} has invalid control kinds.`);
  }
}

function validateSection(section: AtsTemplateSectionRule): void {
  if (!RULE_ID_PATTERN.test(section.id)) throw new AtsObservationError(`Invalid ATS section id: ${section.id}`);
  if (!Array.isArray(section.labels) || section.labels.length < 1 || section.labels.length > 8) {
    throw new AtsObservationError(`ATS section ${section.id} must have bounded labels.`);
  }
  section.labels.forEach((label) => safeText(label, "section label"));
}

function validateRepeatable(rule: AtsTemplateRepeatableRule, sectionIds: Set<string>): void {
  if (!sectionIds.has(rule.sectionId)) throw new AtsObservationError(`Unknown ATS repeatable section: ${rule.sectionId}`);
  if (!Number.isInteger(rule.maximumCreatesPerRun) || rule.maximumCreatesPerRun < 1 || rule.maximumCreatesPerRun > 20) {
    throw new AtsObservationError(`Invalid ATS repeatable create bound for ${rule.group}.`);
  }
  if (rule.pathAliases.length < 1 || rule.pathAliases.length > 8
    || rule.pathAliases.some((alias) => !PATH_ALIAS_PATTERN.test(alias))) {
    throw new AtsObservationError(`ATS repeatable rule ${rule.group} has invalid path aliases.`);
  }
  if (rule.sectionSelectors.length < 1 || rule.sectionSelectors.length > 8
    || rule.sectionSelectors.some((selector) => !SAFE_SELECTOR_PATTERN.test(selector))) {
    throw new AtsObservationError(`ATS repeatable rule ${rule.group} has invalid section selectors.`);
  }
  if (rule.addControlSelectors.length < 1 || rule.addControlSelectors.length > 8
    || rule.addControlSelectors.some((selector) => !SAFE_SELECTOR_PATTERN.test(selector))) {
    throw new AtsObservationError(`ATS repeatable rule ${rule.group} has invalid add-control selectors.`);
  }
  if (rule.recordRootSelectors.length < 1 || rule.recordRootSelectors.length > 8
    || rule.recordRootSelectors.some((selector) => !SAFE_SELECTOR_PATTERN.test(selector))) {
    throw new AtsObservationError(`ATS repeatable rule ${rule.group} has invalid record-root selectors.`);
  }
  if (rule.saveControlSelectors.length < 1 || rule.saveControlSelectors.length > 8
    || rule.saveControlSelectors.some((selector) => !SAFE_SELECTOR_PATTERN.test(selector))) {
    throw new AtsObservationError(`ATS repeatable rule ${rule.group} has invalid save-control selectors.`);
  }
  if (rule.addLabels.length < 1 || rule.addLabels.length > 12
    || rule.saveLabels.length < 1 || rule.saveLabels.length > 8) {
    throw new AtsObservationError(`ATS repeatable rule ${rule.group} requires add and save labels.`);
  }
  for (const values of [
    rule.pathAliases,
    rule.sectionSelectors,
    rule.addControlSelectors,
    rule.recordRootSelectors,
    rule.saveControlSelectors,
    rule.addLabels,
    rule.saveLabels
  ]) {
    if (new Set(values).size !== values.length) {
      throw new AtsObservationError(`ATS repeatable rule ${rule.group} contains duplicate values.`);
    }
  }
  [...rule.addLabels, ...rule.saveLabels].forEach((label) => safeText(label, "repeatable label"));
}

export function validateAtsFamilyTemplate(template: AtsFamilyTemplate): AtsFamilyTemplate {
  if (!ID_PATTERN.test(template.familyId)) throw new AtsObservationError(`Invalid ATS template family id: ${template.familyId}`);
  if (!VERSION_PATTERN.test(template.version)) throw new AtsObservationError(`Invalid ATS template version: ${template.version}`);
  if (!Array.isArray(template.fieldRules) || template.fieldRules.length > 300) {
    throw new AtsObservationError("ATS template has too many field rules.");
  }
  template.fieldRules.forEach(validateFieldRule);
  const ruleIds = template.fieldRules.map((rule) => rule.id);
  if (new Set(ruleIds).size !== ruleIds.length) throw new AtsObservationError("ATS template rule ids must be unique.");

  template.sections.forEach(validateSection);
  const sectionIds = template.sections.map((section) => section.id);
  if (new Set(sectionIds).size !== sectionIds.length) throw new AtsObservationError("ATS template section ids must be unique.");
  const sectionSet = new Set(sectionIds);
  template.repeatableRules.forEach((rule) => validateRepeatable(rule, sectionSet));

  if (!Array.isArray(template.finalSubmitExclusions) || template.finalSubmitExclusions.length < 1) {
    throw new AtsObservationError("ATS template must explicitly exclude final submission.");
  }
  template.finalSubmitExclusions.forEach((label) => safeText(label, "final-submit exclusion"));
  return template;
}

export class AtsTemplateRegistry {
  private readonly templates = new Map<string, AtsFamilyTemplate>();

  constructor(templates: AtsFamilyTemplate[]) {
    templates.forEach((template) => this.register(template));
  }

  register(template: AtsFamilyTemplate): void {
    validateAtsFamilyTemplate(template);
    if (this.templates.has(template.familyId)) {
      throw new AtsObservationError(`Duplicate ATS template family id: ${template.familyId}`);
    }
    this.templates.set(template.familyId, template);
  }

  resolve(familyId: string): AtsFamilyTemplate | null {
    return this.templates.get(familyId) ?? this.templates.get("generic-html") ?? null;
  }
}
