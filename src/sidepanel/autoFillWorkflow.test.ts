import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile, type CandidateProfile } from "../domain/profile";
import type { FillProposal, FillSelection, ScanResult } from "../content/engine";
import {
  executePreparedAutoFill,
  startAutoFillWorkflow,
  type AutoFillGateway,
  type AutoFillStage
} from "./autoFillWorkflow";

function proposal(overrides: Partial<FillProposal> = {}): FillProposal {
  return {
    elementId: "name",
    fieldLabel: "姓名",
    profilePath: "basic.fullName",
    canonicalLabel: "姓名",
    score: 0.99,
    confidence: "high",
    reasons: ["标题完全一致"],
    requiresConfirmation: false,
    fingerprint: "text|name",
    mappingSource: "rule",
    hasValue: true,
    valuePreview: "测试用户",
    comparisonStatus: "empty",
    ...overrides
  };
}

function scan(fields: FillProposal[], repeatableRecords?: ScanResult["repeatableRecords"]): ScanResult {
  return {
    title: "自动填写测试页",
    site: "https://jobs.example",
    fields,
    ...(repeatableRecords ? { repeatableRecords } : {}),
    summary: {
      total: fields.length,
      fillable: fields.filter((field) => field.profilePath && field.hasValue && !field.excludedReason).length,
      high: 0,
      needsConfirmation: 0,
      excluded: fields.filter((field) => field.excludedReason).length,
      empty: fields.filter((field) => field.comparisonStatus === "empty").length,
      equal: fields.filter((field) => field.comparisonStatus === "equal").length,
      conflict: fields.filter((field) => field.comparisonStatus === "conflict").length,
      unreadable: fields.filter((field) => field.comparisonStatus === "unreadable").length
    }
  };
}

function profile(): CandidateProfile {
  const value = createEmptyProfile();
  value.basic.fullName = "测试用户";
  value.basic.birthDate = "2000-01-01";
  return value;
}

function fillResult(selections: FillSelection[]) {
  return {
    outcomes: selections.map((selection) => ({ ...selection, status: "filled" as const })),
    filledCount: selections.length,
    skippedCount: 0
  };
}

describe("one-click auto-fill workflow", () => {
  it("fills a safe-only page from one workflow request", async () => {
    const stages: AutoFillStage[] = [];
    const gateway: AutoFillGateway = {
      scan: vi.fn(async () => scan([proposal()])),
      fill: vi.fn(async (_profile, selections) => fillResult(selections))
    };

    const result = await startAutoFillWorkflow({
      gateway,
      profile: profile(),
      onStage: (stage) => stages.push(stage)
    });

    expect(result.status).toBe("complete");
    expect(gateway.fill).toHaveBeenCalledWith(
      expect.any(Object),
      [{ elementId: "name", profilePath: "basic.fullName" }],
      []
    );
    expect(stages).toEqual(["analyzing", "filling", "complete"]);
  });

  it("pauses once and fills only explicitly confirmed exceptions with the safe plan", async () => {
    const conflict = proposal({
      elementId: "birth",
      fieldLabel: "出生日期",
      profilePath: "basic.birthDate",
      canonicalLabel: "出生日期",
      requiresConfirmation: true,
      comparisonStatus: "conflict",
      comparisonToken: "birth-conflict"
    });
    const medium = proposal({
      elementId: "summary",
      fieldLabel: "个人介绍",
      profilePath: "answers.selfIntroduction",
      canonicalLabel: "自我介绍",
      confidence: "medium",
      requiresConfirmation: true
    });
    const gateway: AutoFillGateway = {
      scan: vi.fn(async () => scan([proposal(), conflict, medium])),
      fill: vi.fn(async (_profile, selections) => fillResult(selections))
    };

    const prepared = await startAutoFillWorkflow({ gateway, profile: profile() });
    expect(prepared.status).toBe("awaiting-confirmation");
    expect(gateway.fill).not.toHaveBeenCalled();

    await executePreparedAutoFill(
      { gateway, profile: profile() },
      prepared.plan,
      new Set(["birth"])
    );

    expect(gateway.fill).toHaveBeenCalledWith(expect.any(Object), [
      { elementId: "name", profilePath: "basic.fullName" },
      {
        elementId: "birth",
        profilePath: "basic.birthDate",
        conflictApprovalToken: "birth-conflict"
      }
    ], []);
  });

  it("creates supported missing records and rescans before filling", async () => {
    const initial = scan([], {
      adapterId: "feishu-recruiting",
      groups: [{
        key: "projects",
        label: "项目经历",
        profileCount: 2,
        pageCount: 1,
        indexes: [0],
        missingCount: 1,
        canCreate: true
      }]
    });
    const refreshed = scan([proposal()]);
    const gateway: AutoFillGateway = {
      scan: vi.fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(refreshed),
      createRepeatableRecords: vi.fn(async () => ({
        group: "projects" as const,
        status: "created" as const,
        initialPageCount: 1,
        finalPageCount: 2,
        requestedCount: 1,
        createdCount: 1,
        remainingCount: 0
      })),
      fill: vi.fn(async (_profile, selections) => fillResult(selections))
    };

    const result = await startAutoFillWorkflow({ gateway, profile: profile() });

    expect(gateway.createRepeatableRecords).toHaveBeenCalledWith(expect.any(Object), "projects");
    expect(gateway.scan).toHaveBeenCalledTimes(2);
    expect(result.plan.repeatableCreatedCount).toBe(1);
    expect(gateway.fill).toHaveBeenCalledTimes(1);
  });

  it("keeps excluded and final-submit-like controls out of every plan", async () => {
    const submit = proposal({
      elementId: "submit",
      fieldLabel: "提交申请",
      profilePath: null,
      canonicalLabel: null,
      confidence: "none",
      excludedReason: "unsupported-control",
      hasValue: false,
      comparisonStatus: "unreadable"
    });
    const gateway: AutoFillGateway = {
      scan: vi.fn(async () => scan([proposal(), submit])),
      fill: vi.fn(async (_profile, selections) => fillResult(selections))
    };

    const result = await startAutoFillWorkflow({ gateway, profile: profile() });

    expect(result.plan.safeSelections).toEqual([
      { elementId: "name", profilePath: "basic.fullName" }
    ]);
    expect(result.plan.confirmationProposals).toEqual([]);
    expect(result.plan.excludedCount).toBe(1);
  });
});
