import { describe, expect, it, vi } from "vitest";
import type { FillResult, ScanResult } from "../content/engine";
import { createEmptyProfile } from "../domain/profile";
import type { PageBridge } from "./pageBridge";
import { ProductionAdapterPageBridge } from "./productionAdapterPageBridge";

function scanResult(site: string): ScanResult {
  return {
    title: site,
    site,
    fields: [],
    summary: {
      total: 0,
      fillable: 0,
      high: 0,
      needsConfirmation: 0,
      excluded: 0,
      empty: 0,
      equal: 0,
      conflict: 0,
      unreadable: 0
    }
  };
}

function bridge(site: string) {
  const result: FillResult = { outcomes: [], filledCount: 0, skippedCount: 0 };
  return {
    scan: vi.fn(async () => scanResult(site)),
    fill: vi.fn(async () => result),
    createRepeatableRecords: vi.fn(async () => ({
      group: "projects" as const,
      status: "created" as const,
      initialPageCount: 0,
      finalPageCount: 1,
      requestedCount: 1,
      createdCount: 1,
      remainingCount: 0
    })),
    attachResume: vi.fn(async () => ({ status: "attached" as const }))
  } satisfies PageBridge;
}

describe("ProductionAdapterPageBridge", () => {
  it("pins K5 after a successful exact-route scan and delegates later operations", async () => {
    const adapter = bridge("https://tenant.jobs.feishu.cn");
    const production = new ProductionAdapterPageBridge(
      adapter,
      async () => "https://tenant.jobs.feishu.cn/index/resume/123/apply",
      (url) => url.includes("jobs.feishu.cn")
    );
    const profile = createEmptyProfile();

    await expect(production.scan(profile)).resolves.toMatchObject({ site: "https://tenant.jobs.feishu.cn" });
    await production.fill(profile, []);
    await production.createRepeatableRecords(profile, "projects");

    expect(adapter.scan).toHaveBeenCalledOnce();
    expect(adapter.fill).toHaveBeenCalledOnce();
    expect(adapter.createRepeatableRecords).toHaveBeenCalledOnce();
  });

  it("rejects an unsupported URL without scanning or invoking a legacy fallback", async () => {
    const adapter = bridge("https://supported.example.test");
    const production = new ProductionAdapterPageBridge(
      adapter,
      async () => "https://unknown.example.test/apply",
      (url) => url.includes("supported.example.test")
    );
    const profile = createEmptyProfile();

    await expect(production.scan(profile)).rejects.toThrow("ats-adapter-url-unsupported");
    await expect(production.fill(profile, [])).rejects.toThrow("page-bridge-route-missing-rescan-required");
    expect(adapter.scan).not.toHaveBeenCalled();
    expect(adapter.fill).not.toHaveBeenCalled();
  });

  it("clears an earlier route when a later adapter scan fails", async () => {
    const adapter = bridge("https://app.mokahr.com");
    const production = new ProductionAdapterPageBridge(
      adapter,
      async () => "https://app.mokahr.com/campus_apply/tenant/site#/candidateHome/resume",
      () => true
    );
    const profile = createEmptyProfile();
    await production.scan(profile);

    adapter.scan.mockRejectedValueOnce(new Error("ats-adapter-unmatched"));
    await expect(production.scan(profile)).rejects.toThrow("ats-adapter-unmatched");
    await expect(production.fill(profile, [])).rejects.toThrow("page-bridge-route-missing-rescan-required");
  });
});
