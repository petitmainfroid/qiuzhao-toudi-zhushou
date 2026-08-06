import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PowerSessionManager } from "../bridge/powerSession";
import type { PrivacySafePageStateService } from "../bridge/pageState";
import type { PageActionService } from "../bridge/pageActions";
import {
  handleEmbeddedBridgeRequest,
  isTrustedExtensionSender
} from "./bridgeRuntime";

function managerMock() {
  return {
    start: vi.fn(async () => ({ status: "active" as const, tabId: 42 })),
    status: vi.fn(async () => ({ status: "inactive" as const, reason: "not-started" as const })),
    targetTabId: vi.fn(async () => 42),
    refreshPageState: vi.fn(async () => ({ status: "active" as const, tabId: 42 })),
    stop: vi.fn(async () => ({ status: "inactive" as const, reason: "not-started" as const }))
  } as unknown as PowerSessionManager;
}

describe("embedded bridge background authorization", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: {
        id: "assistant-id",
        getURL: (path: string) => `chrome-extension://assistant-id/${path}`
      }
    });
  });

  it("accepts only messages originating from this extension", () => {
    expect(isTrustedExtensionSender({
      id: "assistant-id",
      url: "chrome-extension://assistant-id/sidepanel.html"
    })).toBe(true);
    expect(isTrustedExtensionSender({
      id: "assistant-id",
      url: "https://jobs.example/apply"
    })).toBe(false);
    expect(isTrustedExtensionSender({
      id: "other-extension",
      url: "chrome-extension://other-extension/panel.html"
    })).toBe(false);
  });

  it("rejects an untrusted start without touching the session manager", async () => {
    const manager = managerMock();
    const response = await handleEmbeddedBridgeRequest({
      type: "POWER_SESSION_START",
      requestId: "request_12345678",
      tabId: 42
    }, {
      id: "assistant-id",
      url: "https://jobs.example/apply"
    }, manager);

    expect(response).toEqual({
      ok: false,
      code: "bridge-failed",
      error: "只有扩展界面中的用户操作可以启动浏览器会话。"
    });
    expect(manager.start).not.toHaveBeenCalled();
  });

  it("routes trusted lifecycle requests without exposing page values", async () => {
    const manager = managerMock();
    const sender = {
      id: "assistant-id",
      url: "chrome-extension://assistant-id/sidepanel.html"
    };
    const response = await handleEmbeddedBridgeRequest({
      type: "POWER_SESSION_START",
      requestId: "request_12345678",
      tabId: 42
    }, sender, manager);

    expect(manager.start).toHaveBeenCalledWith(42, true);
    expect(response).toEqual({ ok: true, session: { status: "active", tabId: 42 } });
    expect(JSON.stringify(response)).not.toMatch(/cookie|password|authorization|value/i);
  });

  it("routes privacy-safe state and semantic find through the active session", async () => {
    const manager = managerMock();
    vi.mocked(manager.status).mockResolvedValue({
      status: "active",
      sessionId: "power_test",
      tabId: 42,
      origin: "https://jobs.example",
      path: "/apply"
    });
    const state = {
      snapshotId: "state_test_0001",
      origin: "https://jobs.example",
      path: "/apply",
      controls: [],
      summary: { controlCount: 0, frameCount: 1, openShadowRootCount: 0, blockedControlCount: 0 }
    };
    const pageStateService = {
      read: vi.fn(async () => state),
      find: vi.fn(async () => ({
        snapshotId: state.snapshotId,
        query: "姓名",
        searchedControlCount: 0,
        matches: []
      }))
    } as unknown as PrivacySafePageStateService;
    const sender = { id: "assistant-id", url: "chrome-extension://assistant-id/sidepanel.html" };

    expect(await handleEmbeddedBridgeRequest({
      type: "POWER_PAGE_STATE",
      requestId: "request_state_123"
    }, sender, manager, pageStateService)).toEqual({ ok: true, state });
    expect(await handleEmbeddedBridgeRequest({
      type: "POWER_PAGE_FIND",
      requestId: "request_find_1234",
      query: { text: "姓名", limit: 5 }
    }, sender, manager, pageStateService)).toEqual({
      ok: true,
      result: { snapshotId: state.snapshotId, query: "姓名", searchedControlCount: 0, matches: [] }
    });
    expect(pageStateService.read).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "power_test" }));
    expect(pageStateService.find).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "power_test" }),
      { text: "姓名", limit: 5 }
    );
  });

  it("requires a trusted extension request to authorize and route a profile-backed page action", async () => {
    const manager = managerMock();
    const activeSession = {
      status: "active" as const,
      sessionId: "power_test_session",
      tabId: 42,
      origin: "https://jobs.example",
      path: "/apply"
    };
    vi.mocked(manager.status).mockResolvedValue(activeSession);
    const pageActionService = {
      authorize: vi.fn(async () => ({ authorizationId: "action_auth_12345", expiresAt: 60_000 })),
      act: vi.fn(async (request) => ({
        requestId: request.requestId,
        ref: request.ref,
        action: request.intent.kind,
        status: "verified" as const,
        strategy: "native-setter" as const,
        attempts: 1 as const,
        durationBucket: "lt-100ms" as const
      })),
      invalidate: vi.fn()
    } as unknown as PageActionService;
    const pageStateService = {
      registry: { invalidate: vi.fn() }
    } as unknown as PrivacySafePageStateService;
    const sender = { id: "assistant-id", url: "chrome-extension://assistant-id/sidepanel.html" };

    expect(await handleEmbeddedBridgeRequest({
      type: "POWER_PAGE_ACTION_AUTHORIZE",
      requestId: "authorize_request_123"
    }, sender, manager, pageStateService, pageActionService)).toEqual({
      ok: true,
      authorization: { authorizationId: "action_auth_12345", expiresAt: 60_000 }
    });
    expect(pageActionService.authorize).toHaveBeenCalledWith(activeSession, true);

    const actionRequest = {
      type: "POWER_PAGE_ACTION" as const,
      requestId: "action_request_1234",
      authorizationId: "action_auth_12345",
      sessionId: "power_test_session",
      snapshotId: "state_snapshot_123",
      ref: "node_reference_123",
      intent: { kind: "fill" as const, source: { kind: "profile" as const, path: "basic.fullName" } }
    };
    const response = await handleEmbeddedBridgeRequest(
      actionRequest,
      sender,
      manager,
      pageStateService,
      pageActionService
    );
    expect(pageActionService.act).toHaveBeenCalledWith(actionRequest, activeSession);
    expect(response).toEqual({
      ok: true,
      action: expect.objectContaining({ status: "verified", attempts: 1 })
    });
    expect(JSON.stringify(response)).not.toMatch(/basic\.fullName|profile|value/i);
  });
});
