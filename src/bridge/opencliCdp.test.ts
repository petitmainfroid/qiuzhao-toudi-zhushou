import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __test__,
  ensureAttached,
  readEmbeddedPageState
} from "./opencliCdp";

describe("embedded OpenCLI-derived CDP transport", () => {
  beforeEach(() => {
    __test__.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("classifies a debugger conflict and never falls through to an arbitrary command", async () => {
    vi.useFakeTimers();
    const attach = vi.fn().mockRejectedValue(new Error("Another debugger is already attached to the tab"));
    const sendCommand = vi.fn();
    vi.stubGlobal("chrome", {
      tabs: { get: vi.fn(async () => ({ id: 42, url: "https://jobs.example/apply" })) },
      debugger: {
        attach,
        detach: vi.fn(),
        sendCommand,
        onDetach: { addListener: vi.fn() }
      }
    });

    const result = ensureAttached(42).then(
      () => null,
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toMatchObject({ code: "debugger-busy" });
    expect(attach).toHaveBeenCalledTimes(2);
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it("returns only URL shape and structural counts", async () => {
    const sendCommand = vi.fn(async (_target: unknown, method: string) => {
      if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
      if (method === "Page.getFrameTree") {
        return { frameTree: { frame: { id: "root" }, childFrames: [{ frame: { id: "child" } }] } };
      }
      if (method === "DOM.querySelectorAll") return { nodeIds: [2, 3, 4] };
      return {};
    });
    vi.stubGlobal("chrome", {
      tabs: { get: vi.fn(async () => ({
        id: 42,
        url: "https://jobs.example/apply/1?private=not-returned"
      })) },
      debugger: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        sendCommand,
        onDetach: { addListener: vi.fn() }
      }
    });

    const state = await readEmbeddedPageState(42);
    expect(state).toEqual({
      origin: "https://jobs.example",
      path: "/apply/1",
      interactiveCount: 3,
      frameCount: 2
    });
    expect(JSON.stringify(state)).not.toMatch(/private|value|cookie|password|authorization/i);
  });

  it("rejects non-HTTPS and credential-bearing URLs before debugger attachment", async () => {
    for (const url of ["http://jobs.example/apply", "https://user:secret@jobs.example/apply"]) {
      const attach = vi.fn();
      vi.stubGlobal("chrome", {
        tabs: { get: vi.fn(async () => ({ id: 42, url })) },
        debugger: {
          attach,
          detach: vi.fn(),
          sendCommand: vi.fn(),
          onDetach: { addListener: vi.fn() }
        }
      });
      __test__.reset();
      await expect(ensureAttached(42)).rejects.toMatchObject({ code: "unsupported-page" });
      expect(attach).not.toHaveBeenCalled();
    }
  });
});
