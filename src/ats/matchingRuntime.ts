import { canonicalFields } from "../matching/catalog";
import { matchField } from "../matching/matcher";
import { normalizeFieldText } from "../matching/normalize";
import type { FieldDescriptor, MatchResult } from "../matching/types";
import type { AtsFamilyDetectionContext, AtsFamilyIdentity } from "./contracts";
import type { AtsFamilyRegistry } from "./familyRegistry";
import type { AtsFamilyTemplate, AtsTemplateFieldRule } from "./templateContracts";
import type { AtsTemplateRegistry } from "./templateRegistry";

export interface AtsPageLocation {
  origin: string;
  pathname: string;
}

export interface AtsScanMetadata {
  familyId: string;
  familyVersion: string;
  detectionConfidence: number;
  templateVersion: string;
  mappingSource: "family-template" | "generic";
}

export interface AtsPageMatchingSession {
  metadata: AtsScanMetadata;
  template: AtsFamilyTemplate;
  match(descriptor: FieldDescriptor): MatchResult;
}

function displayLabel(descriptor: FieldDescriptor): string {
  return descriptor.label || descriptor.ariaLabel || descriptor.placeholder || descriptor.name || "未命名字段";
}

export function normalizeAtsSemanticKey(value: string): string {
  return value.trim().toLowerCase().replace(/\[\d+\]/g, "[]");
}

export function atsPathTemplate(pathname: string): string {
  const path = pathname.split("?")[0].split("#")[0];
  const segments = path.split("/").map((segment) => {
    if (/^\d{4,}$/.test(segment)) return ":id";
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
    if (/^[a-z0-9_-]{20,}$/i.test(segment)) return ":id";
    return segment;
  });
  return segments.join("/") || "/";
}

function pageLocation(): AtsPageLocation {
  if (typeof location === "undefined") return { origin: "local", pathname: "/" };
  return { origin: location.origin, pathname: location.pathname };
}

export function buildAtsDetectionContext(
  descriptors: readonly FieldDescriptor[],
  source: AtsPageLocation = pageLocation()
): AtsFamilyDetectionContext {
  const markers = Array.from(new Set(
    descriptors
      .map((descriptor) => normalizeAtsSemanticKey(descriptor.name))
      .filter((marker) => /^[a-z][a-z0-9_.-]*(?:\[\])?[a-z0-9_.-]*$/.test(marker))
  )).slice(0, 200);
  return {
    source: {
      origin: source.origin,
      pathTemplate: atsPathTemplate(source.pathname),
      language: typeof document === "undefined" ? "unknown" : document.documentElement.lang || "unknown",
      pageType: /(?:apply|application|resume)/i.test(source.pathname) ? "application" : "unknown",
      captureToolVersion: "0.2.0"
    },
    controls: [],
    markers
  };
}

function indexFromSemanticKey(value: string): number | null {
  const bracketed = /\[(\d+)\]/.exec(value);
  if (bracketed) return Number(bracketed[1]);
  return null;
}

function resolveProfilePath(pattern: string | null, semanticKey: string): string | null {
  if (!pattern) return null;
  if (!pattern.includes("{index}")) return pattern;
  const index = indexFromSemanticKey(semanticKey);
  return index === null ? null : pattern.replaceAll("{index}", String(index));
}

function canonicalForPath(path: string) {
  const basePath = path.replace(/\.(\d+)\./, ".0.");
  return canonicalFields.find((field) => field.path === basePath);
}

function templateRule(
  descriptor: FieldDescriptor,
  template: AtsFamilyTemplate
): { rule: AtsTemplateFieldRule; semanticKey: string } | null {
  const rawKey = descriptor.name.trim().toLowerCase();
  const normalizedKey = normalizeAtsSemanticKey(rawKey);
  if (!normalizedKey) return null;
  const rule = template.fieldRules.find((candidate) =>
    candidate.semanticKeys.includes(normalizedKey)
    && (!candidate.kinds || candidate.kinds.includes(descriptor.kind))
  );
  return rule ? { rule, semanticKey: rawKey } : null;
}

function finalSubmitMatch(descriptor: FieldDescriptor, template: AtsFamilyTemplate): boolean {
  const text = normalizeFieldText([
    descriptor.label,
    descriptor.ariaLabel,
    descriptor.placeholder,
    descriptor.name,
    descriptor.domId,
    descriptor.contextText
  ].join(" "));
  return template.finalSubmitExclusions.some((label) => text.includes(normalizeFieldText(label)));
}

export function matchFieldWithAtsTemplate(
  descriptor: FieldDescriptor,
  template: AtsFamilyTemplate
): MatchResult {
  const generic = matchField(descriptor);
  if (generic.excludedReason && generic.excludedReason !== "unmatched") return generic;
  if (finalSubmitMatch(descriptor, template)) {
    return {
      elementId: descriptor.elementId,
      fieldLabel: displayLabel(descriptor),
      profilePath: null,
      canonicalLabel: null,
      score: 0,
      confidence: "none",
      reasons: ["ATS 模板明确禁止最终投递控件"],
      requiresConfirmation: true,
      excludedReason: "unsupported-control"
    };
  }

  const matched = templateRule(descriptor, template);
  if (!matched) return generic;
  const { rule, semanticKey } = matched;
  if (rule.action === "exclude") {
    return {
      elementId: descriptor.elementId,
      fieldLabel: displayLabel(descriptor),
      profilePath: null,
      canonicalLabel: null,
      score: 0,
      confidence: "none",
      reasons: [`ATS 家族模板 ${template.familyId} 明确排除此控件`],
      requiresConfirmation: true,
      excludedReason: rule.exclusionReason ?? "unsupported-control",
      atsTemplate: {
        familyId: template.familyId,
        templateVersion: template.version,
        ruleId: rule.id,
        driverHint: rule.driverHint,
        verification: rule.verification
      }
    };
  }

  const profilePath = resolveProfilePath(rule.profilePathPattern, semanticKey);
  const companionProfilePath = resolveProfilePath(rule.companionProfilePathPattern ?? null, semanticKey);
  if (!profilePath) return generic;
  const canonical = canonicalForPath(profilePath);
  if (!canonical) return generic;
  return {
    elementId: descriptor.elementId,
    fieldLabel: displayLabel(descriptor),
    profilePath,
    canonicalLabel: canonical.label,
    score: 1,
    confidence: "high",
    reasons: [`使用已审查的 ${template.familyId} ATS 家族模板规则 ${rule.id}`],
    requiresConfirmation: rule.action === "confirm" || Boolean(canonical.sensitive),
    ...(companionProfilePath ? { companionProfilePath } : {}),
    atsTemplate: {
      familyId: template.familyId,
      templateVersion: template.version,
      ruleId: rule.id,
      driverHint: rule.driverHint,
      verification: rule.verification
    }
  };
}

export class AtsMatchingRuntime {
  constructor(
    private readonly families: AtsFamilyRegistry,
    private readonly templates: AtsTemplateRegistry
  ) {}

  resolve(
    descriptors: readonly FieldDescriptor[],
    source: AtsPageLocation = pageLocation()
  ): AtsPageMatchingSession {
    const identity: AtsFamilyIdentity = this.families.detect(buildAtsDetectionContext(descriptors, source));
    const template = this.templates.resolve(identity.id);
    if (!template) throw new Error("Generic ATS template is not registered.");
    return {
      template,
      metadata: {
        familyId: identity.id,
        familyVersion: identity.version,
        detectionConfidence: identity.confidence,
        templateVersion: template.version,
        mappingSource: identity.id === "generic-html" ? "generic" : "family-template"
      },
      match: (descriptor) => matchFieldWithAtsTemplate(descriptor, template)
    };
  }
}
