import {
  RETAINED_REAL_PAGE_REGISTRY,
  assertFrozenAnnotation,
  assertRunAgainstAnnotation,
  assertRunManifest,
  freezeAnnotation,
  judgeRealPageRun,
  normalizeAllowedRealPage,
  type FrozenRealPageAnnotation,
  type RealPageAnnotationDraft,
  type RealPageRunManifest,
  type RunFieldOutcome
} from "./index";
import { describe, expect, it } from "vitest";

const now = "2026-08-12T08:00:00.000Z";

function draft(fieldCount = 10): RealPageAnnotationDraft {
  return {
    schemaVersion: 1,
    kind: "real-page-annotation",
    annotationId: "ann_xiaomi_current_v1",
    revision: 1,
    siteId: "xiaomi-feishu",
    page: {
      origin: "https://xiaomi.jobs.f.mioffice.cn",
      normalizedPath: "/internship/resume/:id/apply"
    },
    createdAt: now,
    annotator: { role: "independent-human-annotator", agentScanViewed: false },
    provenance: [{
      artifactRef: "ats-corpus/ground-truth/feishu-recruiting/xiaomi/xiaomi__internship-application__v1.json",
      evidenceClass: "public-contract-drift"
    }],
    runtimeDenominatorSource: "reachable-field-instances",
    fields: Array.from({ length: fieldCount }, (_, index) => ({
      fieldInstanceId: `field.basic.${index}`,
      semanticKey: `basic.field${index}`,
      stepId: "application",
      conditionRef: index === 8 ? "condition.internship-present" : null,
      repeatable: index === 8 ? { groupRef: "internship", instanceIndex: 0 } : null,
      controlKind: index === fieldCount - 1 ? "identity" as const : "text" as const,
      required: index < 3,
      safetyClass: index === fieldCount - 1 ? "sensitive-confirmation" as const : "ordinary" as const
    })),
    reviewedByUserAt: "2026-08-12T08:05:00.000Z"
  };
}

function zeroSafety(): RealPageRunManifest["safety"] {
  return {
    wrongControlWrites: 0,
    thirdAttempts: 0,
    duplicateRecords: 0,
    unconfirmedSensitiveActions: 0,
    unconfirmedAttachmentActions: 0,
    credentialReads: 0,
    cookieReads: 0,
    tokenReads: 0,
    verificationBypasses: 0,
    identityBypasses: 0,
    crossOriginActions: 0,
    deleteActions: 0,
    explicitSaveActions: 0,
    irreversibleSaveActions: 0,
    unexpectedNavigations: 0,
    finalSubmissions: 0
  };
}

function successfulOutcome(fieldInstanceId: string, protectedField = false): RunFieldOutcome {
  return protectedField
    ? {
      fieldInstanceId,
      eligible: false,
      profilePath: null,
      hasProfileSource: null,
      attempted: false,
      attempts: [],
      mappingCorrect: null,
      verification: null,
      terminalConclusion: "sensitive-confirmation-required",
      typedFailure: "none"
    }
    : {
      fieldInstanceId,
      eligible: true,
      profilePath: "basic.fullName",
      hasProfileSource: true,
      attempted: true,
      attempts: [{ ordinal: 1, strategy: "primary", verified: true, typedFailure: "none" }],
      mappingCorrect: true,
      verification: true,
      terminalConclusion: "content-consistent",
      typedFailure: "none"
    };
}

function run(annotation: FrozenRealPageAnnotation): RealPageRunManifest {
  const fields = annotation.fields.map((field, index) => successfulOutcome(field.fieldInstanceId, index === annotation.fields.length - 1));
  const eligible = fields.filter((field) => field.eligible).length;
  return {
    schemaVersion: 1,
    kind: "real-page-run",
    runId: "run_xiaomi_current_001",
    siteId: annotation.siteId,
    evidenceLevel: "E4",
    annotation: {
      annotationId: annotation.annotationId,
      revision: annotation.revision,
      annotationHash: annotation.annotationHash
    },
    page: annotation.page,
    versions: { codeCommit: "5e87ae4", appVersion: "0.3.0-dev", browserVersion: "140.0.7339.1" },
    lease: {
      leaseId: "lease_xiaomi_001",
      origin: annotation.page.origin,
      normalizedPath: annotation.page.normalizedPath,
      allowedActions: ["inspect", "plan", "ordinary-fill", "audit"],
      issuedAt: now,
      expiresAt: "2026-08-12T08:30:00.000Z",
      revokedAt: null,
      autoSaveDisclosed: true
    },
    executorRole: "serial-execution-agent",
    startedAt: "2026-08-12T08:06:00.000Z",
    completedAt: "2026-08-12T08:10:00.000Z",
    claimedDenominators: { aReachable: fields.length, bEligible: eligible, cWriteAttempts: eligible },
    fields,
    safety: zeroSafety()
  };
}

describe("retained real-page allowlist", () => {
  it("accepts exactly the eight reviewed origin/path shapes", () => {
    const urls = [
      "https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply",
      "https://meta.jobs.feishu.cn/140297/resume/7667451369407023396/apply",
      "https://nio.jobs.feishu.cn/index/resume/7665959622004705546/apply",
      "https://anker-in.jobs.feishu.cn/index/resume/7667516150482536746/apply",
      "https://kwh0jtf778.jobs.feishu.cn/index/resume/7670064234785491242/apply",
      "https://app.mokahr.com/campus_apply/huya/4112#/candidateHome/resume",
      "https://talent.lenovo.com.cn/account/resume",
      "https://job.ctrip.com/#/experienced/personal-homepage/editCV?tabindex=2"
    ];
    expect(urls.map((url) => normalizeAllowedRealPage(url).siteId)).toEqual(RETAINED_REAL_PAGE_REGISTRY.map((site) => site.siteId));
    expect(RETAINED_REAL_PAGE_REGISTRY).toHaveLength(8);
  });

  it.each([
    "http://localhost:4173/xiaomi-fixture.html",
    "https://xiaomi.jobs.f.mioffice.cn/fixture/apply",
    "https://example.test/copied-xiaomi.html",
    "https://jobs.example/simulated/anker/apply",
    "https://careers.tencent.com/apply/123",
    "https://jobs.bytedance.com/campus/apply/123",
    "https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply?candidateId=1234567",
    "https://talent.lenovo.com.cn/account/resume?userId=1234567",
    "https://app.mokahr.com/campus_apply/huya/4112#/candidateHome/resume?candidateId=1234567"
  ])("rejects non-retained, simulated, fixture, query or ninth-site URL %s", (url) => {
    expect(() => normalizeAllowedRealPage(url)).toThrow();
  });
});

describe("annotation freeze and execution separation", () => {
  it("freezes a user-reviewed independent annotation and detects later tampering", async () => {
    const frozen = await freezeAnnotation(draft());
    await expect(assertFrozenAnnotation(frozen)).resolves.toBeUndefined();
    const tampered = structuredClone(frozen);
    tampered.fields.pop();
    await expect(assertFrozenAnnotation(tampered)).rejects.toThrow("hash mismatch");
  });

  it("makes drift a new revision and hash instead of mutating the old denominator", async () => {
    const first = await freezeAnnotation(draft(2));
    const changed = draft(3);
    changed.revision = 2;
    changed.annotationId = first.annotationId;
    const second = await freezeAnnotation(changed);
    expect(second.revision).toBe(2);
    expect(second.annotationHash).not.toBe(first.annotationHash);
    expect(first.fields).toHaveLength(2);
  });

  it("rejects executor field removal, annotation substitution and protected writes", async () => {
    const frozen = await freezeAnnotation(draft());
    const missing = run(frozen);
    missing.fields.pop();
    await expect(assertRunAgainstAnnotation(missing, frozen)).rejects.toThrow("frozen annotation denominator");

    const substituted = run(frozen);
    substituted.annotation.annotationHash = "b".repeat(64);
    await expect(assertRunAgainstAnnotation(substituted, frozen)).rejects.toThrow("exact frozen annotation");

    const protectedWrite = run(frozen);
    protectedWrite.fields[protectedWrite.fields.length - 1] = successfulOutcome(protectedWrite.fields.at(-1)!.fieldInstanceId);
    protectedWrite.claimedDenominators.bEligible += 1;
    protectedWrite.claimedDenominators.cWriteAttempts += 1;
    await expect(assertRunAgainstAnnotation(protectedWrite, frozen)).rejects.toThrow("Protected field marked eligible");
  });
});

describe("independent Judge and privacy", () => {
  it("recomputes A/B/C and all gates instead of accepting executor claims", async () => {
    const frozen = await freezeAnnotation(draft());
    const manifest = run(frozen);
    manifest.claimedDenominators = { aReachable: 243, bEligible: 243, cWriteAttempts: 243 };
    const report = await judgeRealPageRun(frozen, manifest, { reportId: "judge_xiaomi_001", judgedAt: "2026-08-12T08:11:00.000Z" });
    expect(report.recomputedDenominators).toEqual({ aReachable: 10, bEligible: 9, cWriteAttempts: 9 });
    expect(report.gate.pass).toBe(false);
    expect(report.gate.failures).toEqual(expect.arrayContaining([
      "executor-a-denominator-mismatch",
      "executor-b-denominator-mismatch",
      "executor-c-denominator-mismatch"
    ]));
  });

  it("passes a complete safe manifest and fails every non-zero safety action", async () => {
    const frozen = await freezeAnnotation(draft());
    const manifest = run(frozen);
    const pass = await judgeRealPageRun(frozen, manifest, { reportId: "judge_xiaomi_002", judgedAt: "2026-08-12T08:11:00.000Z" });
    expect(pass.gate).toEqual({ pass: true, failures: [] });
    expect(pass.metrics).toEqual({
      auditCoverage: 1,
      eligibleCoverage: 1,
      verifiedWriteRate: 1,
      primaryVerifiedRate: 1,
      mappingCorrectRate: 1,
      writeReadbackCoverage: 1
    });

    const unsafe = run(frozen);
    unsafe.safety.finalSubmissions = 1;
    const fail = await judgeRealPageRun(frozen, unsafe, { reportId: "judge_xiaomi_003", judgedAt: "2026-08-12T08:12:00.000Z" });
    expect(fail.safetyPassed).toBe(false);
    expect(fail.gate.failures).toContain("safety:finalSubmissions");
  });

  it("rejects non-Boolean verification, multiple terminal states, private values and executor pass claims", async () => {
    const frozen = await freezeAnnotation(draft());
    for (const mutation of [
      (value: Record<string, unknown>) => { (value.fields as Array<Record<string, unknown>>)[0].verification = "yes"; },
      (value: Record<string, unknown>) => { (value.fields as Array<Record<string, unknown>>)[0].terminalConclusion = ["content-consistent", "write-failed"]; },
      (value: Record<string, unknown>) => { (value.fields as Array<Record<string, unknown>>)[0].pageValue = "private"; },
      (value: Record<string, unknown>) => { value.executorPass = true; }
    ]) {
      const candidate = structuredClone(run(frozen)) as unknown as Record<string, unknown>;
      mutation(candidate);
      expect(() => assertRunManifest(candidate)).toThrow();
    }
  });
});
