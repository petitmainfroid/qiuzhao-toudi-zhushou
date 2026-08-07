import { EmbeddedCdpError, ensureAttached, sendDebuggerCommand } from "./opencliCdp";
import type {
  EmbeddedBridgeRequest,
  PageScreenshotFailureReason,
  PageScreenshotResult,
  PowerSessionView
} from "./protocol";

type ScreenshotRequest = Extract<EmbeddedBridgeRequest, { type: "POWER_PAGE_SCREENSHOT" }>;

export interface PageScreenshotExecutor {
  capture(tabId: number): Promise<string>;
}

export interface PageScreenshotServiceDependencies {
  executor: PageScreenshotExecutor;
  now(): number;
}

function durationBucket(duration: number): PageScreenshotResult["durationBucket"] {
  if (duration < 100) return "lt-100ms";
  if (duration <= 500) return "100-500ms";
  return "gt-500ms";
}

function secureLocation(rawUrl: string | undefined): { origin: string; path: string } | null {
  try {
    const url = new URL(rawUrl ?? "");
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return { origin: url.origin, path: url.pathname };
  }
  catch {
    return null;
  }
}

export class PageScreenshotService {
  constructor(private readonly dependencies: PageScreenshotServiceDependencies) {}

  async capture(
    request: ScreenshotRequest,
    session: PowerSessionView,
    createdByUserGesture: boolean
  ): Promise<PageScreenshotResult> {
    const startedAt = this.dependencies.now();
    const failed = (reason: PageScreenshotFailureReason): PageScreenshotResult => ({
      requestId: request.requestId,
      status: "failed",
      reason,
      durationBucket: durationBucket(this.dependencies.now() - startedAt)
    });
    if (
      !createdByUserGesture
      || session.status !== "active"
      || request.sessionId !== session.sessionId
      || typeof session.tabId !== "number"
      || !session.origin
      || !session.path
    ) return failed("session-inactive");
    const location = secureLocation((await chrome.tabs.get(session.tabId)).url);
    if (!location || location.origin !== session.origin || location.path !== session.path) {
      return failed("page-changed");
    }
    try {
      const dataUrl = await this.dependencies.executor.capture(session.tabId);
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return failed("bridge-failed");
      return {
        requestId: request.requestId,
        status: "captured",
        dataUrl,
        durationBucket: durationBucket(this.dependencies.now() - startedAt)
      };
    }
    catch (error) {
      const reason: PageScreenshotFailureReason = error instanceof EmbeddedCdpError
        ? error.code === "debugger-busy" ? "debugger-conflict"
          : error.code === "timeout" ? "timeout"
            : "bridge-failed"
        : "bridge-failed";
      return failed(reason);
    }
  }
}

export class ChromePageScreenshotExecutor implements PageScreenshotExecutor {
  async capture(tabId: number): Promise<string> {
    await ensureAttached(tabId);
    const response = await sendDebuggerCommand<{ data?: string }>({ tabId }, "Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false
    });
    if (!response.data) throw new Error("screenshot-empty");
    return `data:image/png;base64,${response.data}`;
  }
}

export function createChromePageScreenshotService(): PageScreenshotService {
  return new PageScreenshotService({
    executor: new ChromePageScreenshotExecutor(),
    now: () => Date.now()
  });
}
