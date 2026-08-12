import { describe, expect, it } from "vitest";
import { createAiPlannerRequest } from "../../semantic-planner/src/index";
import { PolicyCompilationError, compilePlan } from "../src/index";

const plannerRequest = createAiPlannerRequest({
  fields: [
    {
      ref: "field:name", section: "Basics", label: "Name", role: "textbox", required: true,
      hasValue: false, capability: "fill_text", safetyClass: "ordinary", options: [], conditional: false
    },
    {
      ref: "field:email", section: "Basics", label: "Email", role: "textbox", required: true,
      hasValue: false, capability: "fill_text", safetyClass: "ordinary", options: [], conditional: false
    },
    {
      ref: "field:id", section: "Basics", label: "Identity", role: "textbox", required: true,
      hasValue: false, capability: "fill_text", safetyClass: "identity", options: [], conditional: false
    },
    {
      ref: "field:conditional", section: "Other", label: "Conditional", role: "textbox", required: false,
      hasValue: false, capability: "fill_text", safetyClass: "ordinary", options: [], conditional: true
    },
    {
      ref: "field:projects", section: "Projects", label: "Projects", role: "group", required: false,
      hasValue: false, capability: "ensure_repeatable", safetyClass: "ordinary", options: [], conditional: false
    }
  ],
  profilePathCatalog: [
    { path: "basics.fullName", kind: "text", hasValue: true, safetyClass: "ordinary" },
    { path: "basics.email", kind: "text", hasValue: false, safetyClass: "ordinary" },
    { path: "basics.identityNumber", kind: "text", hasValue: true, safetyClass: "sensitive" },
    { path: "projects", kind: "repeatable", hasValue: true, safetyClass: "ordinary" }
  ]
});

const proposal = {
  schemaVersion: 1,
  decisions: [
    { kind: "map", ref: "field:name", profilePath: "basics.fullName" },
    { kind: "profile_missing", ref: "field:email", profilePath: "basics.email" },
    { kind: "manual", ref: "field:id", reason: "protected_field" },
    { kind: "conditional_not_applicable", ref: "field:conditional" },
    { kind: "ensure_repeatable", ref: "field:projects", profilePath: "projects" }
  ]
} as const;

const binding = {
  origin: "https://jobs.example.test",
  leaseId: "lease_01",
  profileVersion: "profile_07",
  pageEpoch: 14
} as const;

const authority = {
  origin: binding.origin,
  activeLeaseId: binding.leaseId,
  profileVersion: binding.profileVersion,
  pageEpoch: binding.pageEpoch,
  leaseActive: true
} as const;

function compile(overrides: Record<string, unknown> = {}) {
  return compilePlan({ plannerRequest, proposal, binding, authority, attemptBudget: 2, ...overrides } as never);
}

describe("deterministic fail-closed policy compiler", () => {
  it("binds every observed ref exactly once with an immutable plan id", () => {
    const plan = compile();
    expect(plan.planId).toMatch(/^plan_[a-f0-9]{64}$/);
    expect(plan.plannerSource).toBe("ai");
    expect(plan.legacyFieldTemplateEnabled).toBe(false);
    expect(plan.binding).toEqual(binding);
    expect(plan.decisions.map((decision) => decision.ref)).toEqual(plannerRequest.fields.map((field) => field.ref));
    expect(new Set(plan.decisions.map((decision) => decision.ref)).size).toBe(plannerRequest.fields.length);
    expect(plan.decisions.map(({ disposition, maxAttempts }) => ({ disposition, maxAttempts }))).toEqual([
      { disposition: "fill_from_profile", maxAttempts: 2 },
      { disposition: "profile_missing", maxAttempts: 0 },
      { disposition: "manual", maxAttempts: 0 },
      { disposition: "conditional_not_applicable", maxAttempts: 0 },
      { disposition: "ensure_repeatable", maxAttempts: 2 }
    ]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.binding)).toBe(true);
    expect(Object.isFrozen(plan.decisions)).toBe(true);
    expect(Object.isFrozen(plan.decisions[0])).toBe(true);
  });

  it("compiles deterministically independent of proposal order", () => {
    const first = compile();
    const second = compile({ proposal: { ...proposal, decisions: [...proposal.decisions].reverse() } });
    expect(second).toEqual(first);
    expect(second.planId).toBe(first.planId);
  });

  it("preserves the completeness and determinism properties across generated proposal permutations", () => {
    let state = 0x5f098;
    const next = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state;
    };
    const expected = compile();
    for (let sample = 0; sample < 100; sample += 1) {
      const decisions = [...proposal.decisions];
      for (let index = decisions.length - 1; index > 0; index -= 1) {
        const swap = next() % (index + 1);
        [decisions[index], decisions[swap]] = [decisions[swap], decisions[index]];
      }
      const candidate = compile({ proposal: { ...proposal, decisions } });
      expect(candidate.planId).toBe(expected.planId);
      expect(candidate.decisions).toEqual(expected.decisions);
      expect(candidate.decisions).toHaveLength(plannerRequest.fields.length);
      expect(new Set(candidate.decisions.map((decision) => decision.ref)).size).toBe(plannerRequest.fields.length);
    }
  });

  it("changes plan id for every execution-relevant binding", () => {
    const original = compile().planId;
    expect(compile({ binding: { ...binding, pageEpoch: 15 }, authority: { ...authority, pageEpoch: 15 } }).planId).not.toBe(original);
    expect(compile({ binding: { ...binding, leaseId: "lease_02" }, authority: { ...authority, activeLeaseId: "lease_02" } }).planId).not.toBe(original);
    expect(compile({ binding: { ...binding, profileVersion: "profile_08" }, authority: { ...authority, profileVersion: "profile_08" } }).planId).not.toBe(original);
    expect(compile({ binding: { ...binding, origin: "https://careers.example.test" }, authority: { ...authority, origin: "https://careers.example.test" } }).planId).not.toBe(original);
    expect(compile({ attemptBudget: 1 }).planId).not.toBe(original);
  });

  it.each([
    ["lease_inactive", { authority: { ...authority, leaseActive: false } }],
    ["lease_mismatch", { authority: { ...authority, activeLeaseId: "lease_other" } }],
    ["origin_mismatch", { authority: { ...authority, origin: "https://other.example.test" } }],
    ["profile_version_mismatch", { authority: { ...authority, profileVersion: "profile_other" } }],
    ["stale_page_epoch", { authority: { ...authority, pageEpoch: 15 } }],
    ["invalid_attempt_budget", { attemptBudget: 3 }]
  ])("fails closed on binding/policy violation %s", (code, overrides) => {
    expect(() => compile(overrides)).toThrow(expect.objectContaining({ code }));
  });

  it("rejects missing, duplicate, and unknown field decisions", () => {
    expect(() => compile({ proposal: { ...proposal, decisions: proposal.decisions.slice(1) } }))
      .toThrow(expect.objectContaining({ code: "incomplete_proposal" }));
    expect(() => compile({ proposal: { ...proposal, decisions: [...proposal.decisions, proposal.decisions[0]] } }))
      .toThrow(expect.objectContaining({ code: "duplicate_decision" }));
    expect(() => compile({
      proposal: { ...proposal, decisions: [...proposal.decisions, { kind: "manual", ref: "field:unknown", reason: "user_input_required" }] }
    })).toThrow(expect.objectContaining({ code: "unknown_ref" }));
  });

  it("fails closed on an ambiguous duplicated profile path catalog", () => {
    const contaminatedRequest = {
      ...plannerRequest,
      profilePathCatalog: [...plannerRequest.profilePathCatalog, plannerRequest.profilePathCatalog[0]]
    };
    expect(() => compile({ plannerRequest: contaminatedRequest }))
      .toThrow(expect.objectContaining({ code: "duplicate_profile_path" }));
  });

  it("rejects unknown, missing, incompatible, and protected mappings", () => {
    const replace = (ref: string, replacement: unknown) => ({
      ...proposal,
      decisions: proposal.decisions.map((decision) => decision.ref === ref ? replacement : decision)
    });
    expect(() => compile({ proposal: replace("field:name", { kind: "map", ref: "field:name", profilePath: "unknown.path" }) }))
      .toThrow(expect.objectContaining({ code: "unknown_profile_path" }));
    expect(() => compile({ proposal: replace("field:email", { kind: "map", ref: "field:email", profilePath: "basics.email" }) }))
      .toThrow(expect.objectContaining({ code: "profile_value_state_mismatch" }));
    expect(() => compile({ proposal: replace("field:email", { kind: "profile_missing", ref: "field:email", profilePath: "projects" }) }))
      .toThrow(expect.objectContaining({ code: "incompatible_decision" }));
    expect(() => compile({ proposal: replace("field:name", { kind: "ensure_repeatable", ref: "field:name", profilePath: "projects" }) }))
      .toThrow(expect.objectContaining({ code: "incompatible_decision" }));
    expect(() => compile({ proposal: replace("field:id", { kind: "map", ref: "field:id", profilePath: "basics.identityNumber" }) }))
      .toThrow(expect.objectContaining({ code: "protected_action" }));
  });

  it("fails closed instead of overwriting a field that already has a page value", () => {
    const existingValueRequest = createAiPlannerRequest({
      fields: plannerRequest.fields.map((field) => field.ref === "field:name" ? { ...field, hasValue: true } : field),
      profilePathCatalog: plannerRequest.profilePathCatalog
    });
    expect(() => compile({ plannerRequest: existingValueRequest }))
      .toThrow(expect.objectContaining({ code: "incompatible_decision" }));
  });

  it("fails closed instead of creating a duplicate repeatable record", () => {
    const existingRecordRequest = createAiPlannerRequest({
      fields: plannerRequest.fields.map((field) => field.ref === "field:projects" ? { ...field, hasValue: true } : field),
      profilePathCatalog: plannerRequest.profilePathCatalog
    });
    expect(() => compile({ plannerRequest: existingRecordRequest }))
      .toThrow(expect.objectContaining({ code: "incompatible_decision" }));
  });

  it("rejects arbitrary values and browser/protected actions before compilation", () => {
    for (const malicious of [
      { value: "Alice" }, { selector: "#name" }, { xpath: "//input" }, { coordinates: [1, 2] },
      { javascript: "document.forms[0].submit()" }, { rawCdp: {} }, { file: "resume.pdf" },
      { cookie: "secret" }, { credential: "secret" }, { action: "save" }, { delete: true },
      { consent: true }, { submit: true }
    ]) {
      const contaminated = {
        ...proposal,
        decisions: [{ ...proposal.decisions[0], ...malicious }, ...proposal.decisions.slice(1)]
      };
      expect(() => compile({ proposal: contaminated })).toThrow();
    }
  });

  it("never grants attempts to review, manual, missing, or not-applicable decisions", () => {
    const reviewProposal = {
      ...proposal,
      decisions: proposal.decisions.map((decision) => decision.ref === "field:name"
        ? { kind: "review", ref: "field:name", reason: "ambiguous_mapping" }
        : decision)
    };
    const plan = compile({ proposal: reviewProposal });
    expect(plan.decisions.find((decision) => decision.ref === "field:name"))
      .toEqual(expect.objectContaining({ disposition: "review", maxAttempts: 0 }));
    expect(Math.max(...plan.decisions.map((decision) => decision.maxAttempts))).toBeLessThanOrEqual(2);
  });

  it("exposes typed errors without embedding candidate or page values", () => {
    try {
      compile({ authority: { ...authority, pageEpoch: 99 } });
      throw new Error("expected compilation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyCompilationError);
      expect(String(error)).not.toMatch(/Alice|cookie|credential|selector|resume\.pdf/);
    }
  });
});
