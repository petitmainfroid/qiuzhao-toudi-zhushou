import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PageScreenshotService,
  type PageScreenshotExecutor
} from "./pageScreenshot";
import type { PowerSessionView } from "./protocol";

const session: PowerSessionView = {
  status: "active",
  sessionId: "power_screenshot_session",
  tabId: 42,
  origin: "https://jobs.example",
  path: "/apply"
};

describe("ephemeral screenshot service", () => {
  let executor: PageScreenshotExecutor;
  let service: PageScreenshotService;

  beforeEach(() => {
    vi.stubGlobal("chrome", {
      tabs: { get: vi.fn(async () => ({ id: 42, url: "https://jobs.example/apply?private=never-log" })) }
    });
    executor = { capture: vi.fn(async () => "data:image/png;base64,iVBORw0KGgo=") };
    service = new PageScreenshotService({ executor, now: () => 1_000 });
  });

  it("returns image bytes only to the immediate user-visible response", async () => {
    const result = await service.capture({
      type: "POWER_PAGE_SCREENSHOT",
      requestId: "screenshot_request_123",
      sessionId: session.sessionId!
    }, session, true);
    expect(result).toEqual({
      requestId: "screenshot_request_123",
      status: "captured",
      durationBucket: "lt-100ms",
      dataUrl: "data:image/png;base64,iVBORw0KGgo="
    });
    expect(executor.capture).toHaveBeenCalledWith(42);
    expect(JSON.stringify({ ...result, dataUrl: undefined })).not.toContain("private=never-log");
  });

  it("blocks missing gestures, wrong sessions and page changes before capture", async () => {
    const request = {
      type: "POWER_PAGE_SCREENSHOT" as const,
      requestId: "screenshot_request_456",
      sessionId: session.sessionId!
    };
    expect(await service.capture(request, session, false))
      .toEqual(expect.objectContaining({ status: "failed", reason: "session-inactive" }));
    expect(await service.capture({ ...request, sessionId: "power_wrong_session" }, session, true))
      .toEqual(expect.objectContaining({ status: "failed", reason: "session-inactive" }));
    vi.mocked(chrome.tabs.get).mockResolvedValue({ id: 42, url: "https://jobs.example/changed" } as chrome.tabs.Tab);
    expect(await service.capture(request, session, true))
      .toEqual(expect.objectContaining({ status: "failed", reason: "page-changed" }));
    expect(executor.capture).not.toHaveBeenCalled();
  });
});
