import { describe, expect, it, vi } from "vitest";
import type { FillResult, ScanResult } from "../content/engine";
import { createEmptyProfile } from "../domain/profile";
import type { PageBridge } from "./pageBridge";
import { RoutedPageBridge } from "./routedPageBridge";

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
  const value = {
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
  return value;
}

describe("RoutedPageBridge", () => {
  it("pins K5 after a successful routed scan and delegates later operations only to K5", async () => {
    const primary = bridge("https://tenant.jobs.feishu.cn");
    const fallback = bridge("https://legacy.example.test");
    const routed = new RoutedPageBridge(
      primary,
      fallback,
      async () => "https://tenant.jobs.feishu.cn/index/resume/123/apply",
      (url) => url.includes("jobs.feishu.cn")
    );
    const profile = createEmptyProfile();

    await expect(routed.scan(profile)).resolves.toMatchObject({ site: "https://tenant.jobs.feishu.cn" });
    await routed.fill(profile, []);
    await routed.createRepeatableRecords(profile, "projects");

    expect(primary.scan).toHaveBeenCalledOnce();
    expect(primary.fill).toHaveBeenCalledOnce();
    expect(primary.createRepeatableRecords).toHaveBeenCalledOnce();
    expect(fallback.scan).not.toHaveBeenCalled();
    expect(fallback.fill).not.toHaveBeenCalled();
  });

  it("keeps non-migrated pages on the legacy bridge", async () => {
    const primary = bridge("https://tenant.jobs.feishu.cn");
    const fallback = bridge("https://legacy.example.test");
    const routed = new RoutedPageBridge(
      primary,
      fallback,
      async () => "https://legacy.example.test/apply",
      (url) => url.includes("jobs.feishu.cn")
    );
    const profile = createEmptyProfile();

    await routed.scan(profile);
    await routed.fill(profile, []);

    expect(fallback.scan).toHaveBeenCalledOnce();
    expect(fallback.fill).toHaveBeenCalledOnce();
    expect(primary.scan).not.toHaveBeenCalled();
  });

  it("fails closed without legacy fallback and clears an earlier route when a K5 scan fails", async () => {
    const primary = bridge("https://tenant.jobs.feishu.cn");
    const fallback = bridge("https://legacy.example.test");
    let url = "https://legacy.example.test/apply";
    const routed = new RoutedPageBridge(
      primary,
      fallback,
      async () => url,
      (value) => value.includes("jobs.feishu.cn")
    );
    const profile = createEmptyProfile();
    await routed.scan(profile);

    url = "https://tenant.jobs.feishu.cn/index/resume/123/apply";
    primary.scan.mockRejectedValueOnce(new Error("ats-adapter-unmatched"));
    await expect(routed.scan(profile)).rejects.toThrow("ats-adapter-unmatched");
    await expect(routed.fill(profile, [])).rejects.toThrow("page-bridge-route-missing-rescan-required");

    expect(primary.scan).toHaveBeenCalledOnce();
    expect(fallback.scan).toHaveBeenCalledOnce();
    expect(fallback.fill).not.toHaveBeenCalled();
  });
});
