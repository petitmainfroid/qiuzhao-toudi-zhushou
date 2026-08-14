import { createHash } from "node:crypto";
import {
  parseAiDecisionProposal,
  parseAiPlannerRequest,
  type AiFieldDecision,
  type PrivacySafeObservedField,
  type ProfilePathCatalogEntry,
  type ProfilePathKind
} from "../../semantic-planner/src/index";
import type {
  CompilationAuthority,
  CompiledFieldDecision,
  CompiledPlan,
  CompilePlanInput,
  PlanBinding
} from "./types";

export type PolicyErrorCode =
  | "invalid_binding"
  | "lease_inactive"
  | "lease_mismatch"
  | "origin_mismatch"
  | "profile_version_mismatch"
  | "stale_page_epoch"
  | "invalid_attempt_budget"
  | "incomplete_proposal"
  | "duplicate_decision"
  | "unknown_ref"
  | "unknown_profile_path"
  | "ambiguous_profile_path"
  | "profile_value_state_mismatch"
  | "incompatible_decision"
  | "protected_action";

export class PolicyCompilationError extends Error {
  constructor(public readonly code: PolicyErrorCode, message: string) {
    super(message);
    this.name = "PolicyCompilationError";
  }
}

const EXECUTABLE_CAPABILITIES = new Set([
  "fill_text",
  "fill_multiline",
  "select_option",
  "set_date",
  "set_boolean"
]);

const KIND_CAPABILITIES: Readonly<Record<Exclude<ProfilePathKind, "repeatable">, readonly string[]>> = Object.freeze({
  text: ["fill_text", "fill_multiline", "select_option"],
  multiline: ["fill_multiline", "fill_text"],
  choice: ["select_option"],
  date: ["set_date"],
  boolean: ["set_boolean"]
});

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(value);
}

function normalizeOrigin(value: unknown): string {
  if (typeof value !== "string") throw new PolicyCompilationError("invalid_binding", "origin must be a string");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PolicyCompilationError("invalid_binding", "origin must be an absolute URL origin");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.origin !== value || url.username || url.password) {
    throw new PolicyCompilationError("invalid_binding", "origin must be an exact HTTP(S) origin without credentials or a path");
  }
  return url.origin;
}

function validateBinding(binding: Readonly<PlanBinding>, authority: Readonly<CompilationAuthority>): Readonly<PlanBinding> {
  const origin = normalizeOrigin(binding.origin);
  const authorityOrigin = normalizeOrigin(authority.origin);
  if (!validIdentifier(binding.leaseId) || !validIdentifier(authority.activeLeaseId)
    || !validIdentifier(binding.profileVersion) || !validIdentifier(authority.profileVersion)
    || !Number.isSafeInteger(binding.pageEpoch) || binding.pageEpoch < 0
    || !Number.isSafeInteger(authority.pageEpoch) || authority.pageEpoch < 0) {
    throw new PolicyCompilationError("invalid_binding", "binding identifiers and page epochs must be bounded opaque values");
  }
  if (!authority.leaseActive) throw new PolicyCompilationError("lease_inactive", "an active local lease is required");
  if (binding.leaseId !== authority.activeLeaseId) throw new PolicyCompilationError("lease_mismatch", "lease binding is not current");
  if (origin !== authorityOrigin) throw new PolicyCompilationError("origin_mismatch", "origin binding is not current");
  if (binding.profileVersion !== authority.profileVersion) {
    throw new PolicyCompilationError("profile_version_mismatch", "profile version binding is not current");
  }
  if (binding.pageEpoch !== authority.pageEpoch) {
    throw new PolicyCompilationError("stale_page_epoch", "page epoch binding is stale");
  }
  return Object.freeze({
    origin,
    leaseId: binding.leaseId,
    profileVersion: binding.profileVersion,
    pageEpoch: binding.pageEpoch
  });
}

function assertPathCompatible(field: PrivacySafeObservedField, entry: ProfilePathCatalogEntry): void {
  if (field.safetyClass !== "ordinary" || entry.safetyClass !== "ordinary") {
    throw new PolicyCompilationError("protected_action", `protected field or profile path cannot be executed: ${field.ref}`);
  }
  if (!EXECUTABLE_CAPABILITIES.has(field.capability) || entry.kind === "repeatable"
    || !KIND_CAPABILITIES[entry.kind].includes(field.capability)) {
    throw new PolicyCompilationError("incompatible_decision", `profile path kind is incompatible with ${field.ref}`);
  }
}

function assertMissingPathCompatible(field: PrivacySafeObservedField, entry: ProfilePathCatalogEntry): void {
  const capabilityMatches = entry.kind === "repeatable"
    ? field.capability === "ensure_repeatable"
    : field.capability !== "ensure_repeatable" && field.capability !== "read_only"
      && KIND_CAPABILITIES[entry.kind].includes(field.capability);
  const safetyMatches = field.safetyClass === "ordinary"
    ? entry.safetyClass === "ordinary"
    : entry.safetyClass === "sensitive";
  if (!capabilityMatches || !safetyMatches) {
    throw new PolicyCompilationError("incompatible_decision", `missing profile path is incompatible with ${field.ref}`);
  }
}

function compileDecision(
  field: PrivacySafeObservedField,
  decision: AiFieldDecision,
  pathCatalog: ReadonlyMap<string, readonly ProfilePathCatalogEntry[]>,
  attemptBudget: 1 | 2
): Readonly<CompiledFieldDecision> {
  const base = { ref: field.ref, capability: field.capability, safetyClass: field.safetyClass } as const;
  if (decision.kind === "map" || decision.kind === "profile_missing" || decision.kind === "ensure_repeatable") {
    const matches = pathCatalog.get(decision.profilePath) ?? [];
    if (matches.length === 0) throw new PolicyCompilationError("unknown_profile_path", `unknown profile path for ${field.ref}`);
    if (matches.length !== 1) throw new PolicyCompilationError("ambiguous_profile_path", `ambiguous profile path for ${field.ref}`);
    const entry = matches[0];
    if (decision.kind === "profile_missing") {
      assertMissingPathCompatible(field, entry);
      if (entry.hasValue) {
        throw new PolicyCompilationError("profile_value_state_mismatch", `profile path is not missing for ${field.ref}`);
      }
      return Object.freeze({ ...base, disposition: "profile_missing", profilePath: entry.path, maxAttempts: 0 });
    }
    if (!entry.hasValue) {
      throw new PolicyCompilationError("profile_value_state_mismatch", `profile path is empty for ${field.ref}`);
    }
    if (decision.kind === "ensure_repeatable") {
      if (field.safetyClass !== "ordinary" || entry.safetyClass !== "ordinary"
        || field.capability !== "ensure_repeatable" || entry.kind !== "repeatable" || field.hasValue) {
        throw new PolicyCompilationError("incompatible_decision", `repeatable decision is incompatible with ${field.ref}`);
      }
      return Object.freeze({ ...base, disposition: "ensure_repeatable", profilePath: entry.path, maxAttempts: attemptBudget });
    }
    if (field.hasValue) {
      throw new PolicyCompilationError("incompatible_decision", `existing page value requires review for ${field.ref}`);
    }
    assertPathCompatible(field, entry);
    return Object.freeze({ ...base, disposition: "fill_from_profile", profilePath: entry.path, maxAttempts: attemptBudget });
  }
  if (decision.kind === "conditional_not_applicable") {
    if (!field.conditional) {
      throw new PolicyCompilationError("incompatible_decision", `non-conditional field cannot be not applicable: ${field.ref}`);
    }
    return Object.freeze({ ...base, disposition: decision.kind, maxAttempts: 0 });
  }
  if (decision.kind === "manual") {
    return Object.freeze({ ...base, disposition: decision.kind, reason: decision.reason, maxAttempts: 0 });
  }
  return Object.freeze({ ...base, disposition: decision.kind, reason: decision.reason, maxAttempts: 0 });
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function compilePlan(input: Readonly<CompilePlanInput>): Readonly<CompiledPlan> {
  const request = parseAiPlannerRequest(input.plannerRequest);
  const proposal = parseAiDecisionProposal(input.proposal);
  if (input.attemptBudget !== 1 && input.attemptBudget !== 2) {
    throw new PolicyCompilationError("invalid_attempt_budget", "attempt budget must be one or two");
  }
  const binding = validateBinding(input.binding, input.authority);
  const fieldsByRef = new Map(request.fields.map((field) => [field.ref, field]));
  const decisionsByRef = new Map<string, AiFieldDecision>();
  for (const decision of proposal.decisions) {
    if (!fieldsByRef.has(decision.ref)) throw new PolicyCompilationError("unknown_ref", `unknown observed ref: ${decision.ref}`);
    if (decisionsByRef.has(decision.ref)) throw new PolicyCompilationError("duplicate_decision", `duplicate decision for ${decision.ref}`);
    decisionsByRef.set(decision.ref, decision);
  }
  if (decisionsByRef.size !== request.fields.length) {
    const missing = request.fields.filter((field) => !decisionsByRef.has(field.ref)).map((field) => field.ref);
    throw new PolicyCompilationError("incomplete_proposal", `missing decisions: ${missing.join(",")}`);
  }
  const catalog = new Map<string, ProfilePathCatalogEntry[]>();
  for (const entry of request.profilePathCatalog) {
    const matches = catalog.get(entry.path) ?? [];
    matches.push(entry);
    catalog.set(entry.path, matches);
  }
  const decisions = request.fields.map((field) => compileDecision(
    field,
    decisionsByRef.get(field.ref)!,
    catalog,
    input.attemptBudget
  ));
  const planPayload = {
    schemaVersion: 1,
    plannerSource: "ai",
    legacyFieldTemplateEnabled: false,
    binding,
    decisions
  } as const;
  const planId = `plan_${createHash("sha256").update(stableSerialize(planPayload)).digest("hex")}`;
  return deepFreeze({ ...planPayload, planId });
}
