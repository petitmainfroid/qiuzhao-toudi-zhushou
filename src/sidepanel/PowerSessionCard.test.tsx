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
      authorizeActions: vi.fn(async () => ({
        authorizationId: "action_auth_12345",
        expiresAt: Date.now() + 60_000
      })),
      authorizeUpload: vi.fn(),
      uploadSavedResume: vi.fn(),
      cancelUpload: vi.fn(),
      captureScreenshot: vi.fn(async () => ({
        requestId: "screenshot_request_123",
        status: "captured" as const,
        durationBucket: "lt-100ms" as const,
        dataUrl: "data:image/png;base64,iVBORw0KGgo="
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
    fireEvent.click(screen.getByRole("button", { name: "允许本次内核填写" }));
    expect(await screen.findByText("已授权 60 秒；仅允许本地档案和当前快照。")).toBeInTheDocument();
    expect(bridge.authorizeActions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "读取结构" }));
    expect(await screen.findByText("已识别 9 个控件 · 2 个 frame · 1 个开放 shadow")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("按字段语义查找"), { target: { value: "毕业院校" } });
    fireEvent.click(screen.getByRole("button", { name: "查找" }));
    expect(await screen.findByText("node_test_0001")).toBeInTheDocument();
    expect(bridge.find).toHaveBeenCalledWith({ text: "毕业院校", limit: 8 });
  });

  it("shows screenshots only as removable in-memory previews", async () => {
    const bridge = {
      status: vi.fn(async () => ({
        status: "active" as const,
        sessionId: "power_screenshot",
        tabId: 42,
        origin: "https://jobs.example",
        path: "/apply"
      })),
      start: vi.fn(),
      refresh: vi.fn(),
      pageState: vi.fn(),
      find: vi.fn(),
      authorizeActions: vi.fn(),
      authorizeUpload: vi.fn(),
      uploadSavedResume: vi.fn(),
      cancelUpload: vi.fn(),
      captureScreenshot: vi.fn(async () => ({
        requestId: "screenshot_request_123",
        status: "captured" as const,
        durationBucket: "lt-100ms" as const,
        dataUrl: "data:image/png;base64,iVBORw0KGgo="
      })),
      stop: vi.fn()
    } satisfies PowerSessionBridge;
    render(<PowerSessionCard bridge={bridge} />);

    await screen.findByText("https://jobs.example");
    fireEvent.click(screen.getByRole("button", { name: "页面预览" }));
    expect(await screen.findByAltText("当前招聘页面的临时截图")).toBeInTheDocument();
    expect(bridge.captureScreenshot).toHaveBeenCalledWith("power_screenshot");
    fireEvent.click(screen.getByRole("button", { name: "移除临时页面预览" }));
    expect(screen.queryByAltText("当前招聘页面的临时截图")).not.toBeInTheDocument();
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
      authorizeActions: vi.fn(),
      authorizeUpload: vi.fn(),
      uploadSavedResume: vi.fn(),
      cancelUpload: vi.fn(),
      captureScreenshot: vi.fn(),
      stop: vi.fn()
    };
    render(<PowerSessionCard bridge={bridge} />);

    expect(await screen.findByText("页面已切换到其他站点，会话已暂停。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "连接当前招聘页" }));
    await waitFor(() => expect(bridge.start).toHaveBeenCalledTimes(1));
  });
});
