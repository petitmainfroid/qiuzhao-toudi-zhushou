import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../domain/profile";
import type { ScanResult } from "../content/engine";
import type { PageBridge } from "./pageBridge";
import { SidePanel } from "./App";

function repeatableScan(missingCount: number): ScanResult {
  return {
    title: "Repeatable fixture",
    site: "https://xiaomi.jobs.f.mioffice.cn",
    fields: [],
    repeatableRecords: {
      adapterId: "xiaomi-recruitment",
      groups: [{
        key: "projects",
        label: "项目经历",
        profileCount: 2,
        pageCount: 2 - missingCount,
        indexes: missingCount ? [0] : [0, 1],
        missingCount,
        canCreate: missingCount > 0,
        ...(missingCount ? {} : { reason: "up-to-date" as const })
      }]
    },
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

describe("SidePanel repeatable record actions", () => {
  it("uses an explicit group action and rescans after safe creation", async () => {
    const profile = createEmptyProfile();
    profile.basic.fullName = "Fixture Candidate";
    profile.basic.phone = "13800000000";
    profile.basic.email = "fixture@example.test";
    profile.basic.nationality = "Fixture";
    profile.basic.currentCity = "Fixture City";
    profile.education[0].school = "Fixture University";
    profile.education[0].degree = "Bachelor";
    profile.education[0].educationType = "Full time";
    profile.education[0].major = "Computer Science";
    profile.education[0].startDate = "2020-09";
    profile.education[0].endDate = "2024-06";
    profile.jobPreference.targetRoles = "Engineer";
    profile.jobPreference.preferredCities = "Fixture City";
    profile.projects = [0, 1].map((index) => ({
      id: `project-${index}`,
      name: `Project ${index + 1}`,
      role: "Owner",
      startDate: "",
      endDate: "",
      description: "",
      outcome: "",
      link: ""
    }));
    const bridge: PageBridge = {
      scan: vi.fn()
        .mockResolvedValueOnce(repeatableScan(1))
        .mockResolvedValueOnce(repeatableScan(0)),
      createRepeatableRecords: vi.fn(async () => ({
        group: "projects" as const,
        status: "created" as const,
        initialPageCount: 1,
        finalPageCount: 2,
        requestedCount: 1,
        createdCount: 1,
        remainingCount: 0
      })),
      fill: vi.fn()
    };

    render(<SidePanel repository={{ load: async () => profile }} pageBridge={bridge} />);
    fireEvent.click(await screen.findByRole("button", { name: "扫描当前页面" }));
    expect(await screen.findByText("先补齐经历卡片")).toBeInTheDocument();
    expect(screen.getByText("档案 2 条 · 网页 1 条 · 缺少 1 条")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "创建缺失的项目经历" }));
    await waitFor(() => expect(bridge.createRepeatableRecords).toHaveBeenCalledWith(profile, "projects"));
    await waitFor(() => expect(bridge.scan).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/已创建 1 条记录并重新扫描/)).toBeInTheDocument();
    expect(screen.queryByText("先补齐经历卡片")).not.toBeInTheDocument();
  });
});
