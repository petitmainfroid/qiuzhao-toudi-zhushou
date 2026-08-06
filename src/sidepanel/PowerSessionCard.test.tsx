import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PowerSessionCard } from "./PowerSessionCard";
import type { PowerSessionBridge } from "./powerSessionBridge";

describe("PowerSessionCard", () => {
  it("starts only after the user clicks and shows privacy-safe structural state", async () => {
    const bridge: PowerSessionBridge = {
      status: vi.fn(async () => ({ status: "inactive" as const, reason: "not-started" as const })),
      start: vi.fn(async () => ({
        status: "active" as const,
        sessionId: "power_test",
        tabId: 42,
        origin: "https://jobs.example",
        path: "/apply/1",
        startedAt: 1,
        expiresAt: 2,
        pageState: {
          origin: "https://jobs.example",
          path: "/apply/1",
          interactiveCount: 9,
          frameCount: 2
        }
      })),
      refresh: vi.fn(),
      pageState: vi.fn(async () => ({
        snapshotId: "state_test_0001",
        origin: "https://jobs.example",
        path: "/apply/1",
        controls: [],
        summary: { controlCount: 9, frameCount: 2, openShadowRootCount: 1, blockedControlCount: 2 }
      })),
      find: vi.fn(async () => ({
        snapshotId: "state_test_0002",
        query: "毕业院校",
        searchedControlCount: 9,
        matches: [{
          ref: "node_test_0001",
          role: "textbox" as const,
          label: "毕业院校",
          score: 1,
          reasons: ["字段标签"],
          safety: "ordinary" as const
        }]
      })),
      stop: vi.fn()
    };
    render(<PowerSessionCard bridge={bridge} />);

    await waitFor(() => expect(bridge.status).toHaveBeenCalledTimes(1));
    expect(bridge.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "连接当前招聘页" }));

    expect(await screen.findByRole("heading", { name: "已连接当前招聘页" })).toBeInTheDocument();
    expect(screen.getByText("https://jobs.example")).toBeInTheDocument();
    expect(screen.getByText("9 个控件 · 2 个 frame")).toBeInTheDocument();
    expect(screen.queryByText(/cookie-value|password-value/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "读取结构" }));
    expect(await screen.findByText("已识别 9 个控件 · 2 个 frame · 1 个开放 shadow")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("按字段语义查找"), { target: { value: "毕业院校" } });
    fireEvent.click(screen.getByRole("button", { name: "查找" }));
    expect(await screen.findByText("node_test_0001")).toBeInTheDocument();
    expect(bridge.find).toHaveBeenCalledWith({ text: "毕业院校", limit: 8 });
  });

  it("explains a cross-Origin pause and permits an explicit reconnect", async () => {
    const bridge: PowerSessionBridge = {
      status: vi.fn(async () => ({
        status: "paused" as const,
        origin: "https://jobs.example",
        path: "/apply/1",
        reason: "origin-changed" as const
      })),
      start: vi.fn(async () => ({ status: "inactive" as const, reason: "not-started" as const })),
      refresh: vi.fn(),
      pageState: vi.fn(),
      find: vi.fn(),
      stop: vi.fn()
    };
    render(<PowerSessionCard bridge={bridge} />);

    expect(await screen.findByText("页面已切换到其他站点，会话已暂停。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "连接当前招聘页" }));
    await waitFor(() => expect(bridge.start).toHaveBeenCalledTimes(1));
  });
});
