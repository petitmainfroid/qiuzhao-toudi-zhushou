import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddedCdpError } from "./opencliCdp";
import {
  POWER_SESSION_TTL_MS,
  type EmbeddedPageState
} from "./protocol";
import {
  PowerSessionManager,
  type PowerSessionDependencies,
  type PowerSessionStore
} from "./powerSession";

function createHarness(url = "https://jobs.example/apply/1") {
  let now = 1_000;
  let tabUrl = url;
  let stored: Awaited<ReturnType<PowerSessionStore["load"]>> = null;
  const store: PowerSessionStore = {
    load: vi.fn(async () => stored),
    save: vi.fn(async (session) => { stored = structuredClone(session); }),
    clear: vi.fn(async () => { stored = null; })
  };
  const attach = vi.fn(async () => undefined);
  const detach = vi.fn(async () => undefined);
  const readPageState = vi.fn(async (): Promise<EmbeddedPageState> => ({
    origin: new URL(tabUrl).origin,
    path: new URL(tabUrl).pathname,
    interactiveCount: 7,
    frameCount: 2
  }));
  const dependencies: PowerSessionDependencies = {
    getTab: vi.fn(async () => ({ id: 42, url: tabUrl })),
    attach,
    detach,
    readPageState,
    store,
    scheduleExpiry: vi.fn(async () => undefined),
    clearExpiry: vi.fn(async () => undefined),
    now: () => now,
    randomId: () => "power_0123456789abcdef"
  };
  return {
    manager: new PowerSessionManager(dependencies),
    dependencies,
    attach,
    detach,
    readPageState,
    setUrl(next: string) { tabUrl = next; },
    advance(ms: number) { now += ms; },
    stored: () => stored
  };
}

describe("PowerSessionManager", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires a user gesture and a credential-free HTTPS target", async () => {
    const noGesture = createHarness();
    await expect(noGesture.manager.start(42, false)).rejects.toMatchObject({ code: "bridge-failed" });
    expect(noGesture.attach).not.toHaveBeenCalled();

    for (const url of ["http://jobs.example/apply", "chrome://settings", "https://user:secret@jobs.example/apply"]) {
      const harness = createHarness(url);
      await expect(harness.manager.start(42, true)).rejects.toMatchObject({ code: "unsupported-page" });
      expect(harness.attach).not.toHaveBeenCalled();
    }
  });

  it("starts one privacy-safe session and treats a duplicate start as idempotent", async () => {
    const harness = createHarness();
    const first = await harness.manager.start(42, true);
    const second = await harness.manager.start(42, true);

    expect(first).toEqual(expect.objectContaining({
      status: "active",
      sessionId: "power_0123456789abcdef",
      tabId: 42,
      origin: "https://jobs.example",
      path: "/apply/1",
      pageState: {
        origin: "https://jobs.example",
        path: "/apply/1",
        interactiveCount: 7,
        frameCount: 2
      }
    }));
    expect(JSON.stringify(first)).not.toMatch(/value|cookie|password|authorization/i);
    expect(second.sessionId).toBe(first.sessionId);
    expect(harness.attach).toHaveBeenCalledTimes(1);
    expect(harness.readPageState).toHaveBeenCalledTimes(1);
  });

  it("preserves the session on same-Origin navigation", async () => {
    const harness = createHarness();
    const first = await harness.manager.start(42, true);
    harness.setUrl("https://jobs.example/apply/2?private=ignored");
    await harness.manager.handleNavigation(42, "https://jobs.example/apply/2?private=ignored");
    const next = await harness.manager.status();

    expect(next).toEqual(expect.objectContaining({
      status: "active",
      sessionId: first.sessionId,
      path: "/apply/2"
    }));
    expect(next.pageState).toBeUndefined();
    expect(JSON.stringify(next)).not.toContain("private");
    expect(harness.detach).not.toHaveBeenCalled();
  });

  it("pauses and detaches immediately after an Origin change", async () => {
    const harness = createHarness();
    await harness.manager.start(42, true);
    harness.setUrl("https://other.example/continue");
    await harness.manager.handleNavigation(42, "https://other.example/continue");

    expect(await harness.manager.status()).toEqual(expect.objectContaining({
      status: "paused",
      reason: "origin-changed",
      origin: "https://jobs.example"
    }));
    expect(harness.detach).toHaveBeenCalledWith(42);
  });

  it("expires and detaches without selecting another tab", async () => {
    const harness = createHarness();
    await harness.manager.start(42, true);
    harness.advance(POWER_SESSION_TTL_MS + 1);

    expect(await harness.manager.status()).toEqual({ status: "inactive", reason: "expired" });
    expect(harness.detach).toHaveBeenCalledWith(42);
    expect(harness.stored()).toBeNull();
  });

  it("records tab close and external debugger detach as typed lifecycle outcomes", async () => {
    const closed = createHarness();
    await closed.manager.start(42, true);
    await closed.manager.handleTabClosed(42);
    expect(await closed.manager.status()).toEqual({ status: "inactive", reason: "not-started" });

    const detached = createHarness();
    await detached.manager.start(42, true);
    await detached.manager.handleDebuggerDetached(42);
    expect(await detached.manager.status()).toEqual(expect.objectContaining({
      status: "paused",
      reason: "debugger-detached"
    }));
  });

  it("detaches if the page changes Origin while the initial state is being read", async () => {
    const harness = createHarness();
    harness.readPageState.mockResolvedValue({
      origin: "https://other.example",
      path: "/continue",
      interactiveCount: 1,
      frameCount: 1
    });
    await expect(harness.manager.start(42, true)).rejects.toEqual(
      new EmbeddedCdpError("origin-changed", "页面在连接期间切换到了其他站点，已停止连接。")
    );
    expect(harness.detach).toHaveBeenCalledWith(42);
  });
});
