import { afterEach, describe, expect, it, vi } from "vitest";

describe("background action handling", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("opens the side panel from the action click without enabling automatic panel opening", async () => {
    const addClickListener = vi.fn();
    const setPanelBehavior = vi.fn().mockResolvedValue(undefined);
    const openPanel = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("chrome", {
      action: {
        onClicked: { addListener: addClickListener }
      },
      sidePanel: {
        setPanelBehavior,
        open: openPanel
      },
      runtime: {
        id: "assistant-id",
        getURL: (path: string) => `chrome-extension://assistant-id/${path}`,
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
        openOptionsPage: vi.fn()
      },
      webNavigation: {
        onCommitted: { addListener: vi.fn() },
        onHistoryStateUpdated: { addListener: vi.fn() }
      },
      tabs: {
        get: vi.fn(),
        onRemoved: { addListener: vi.fn() }
      },
      alarms: {
        onAlarm: { addListener: vi.fn() },
        create: vi.fn(),
        clear: vi.fn()
      },
      debugger: {
        onDetach: { addListener: vi.fn() },
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn()
      },
      storage: {
        session: {
          get: vi.fn(),
          set: vi.fn(),
          remove: vi.fn()
        }
      }
    });

    await import("./index");

    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
    const clickHandler = addClickListener.mock.calls[0]?.[0] as (tab: chrome.tabs.Tab) => void;
    expect(clickHandler).toBeTypeOf("function");

    clickHandler({ id: 42 } as chrome.tabs.Tab);
    clickHandler({} as chrome.tabs.Tab);

    expect(openPanel).toHaveBeenCalledTimes(1);
    expect(openPanel).toHaveBeenCalledWith({ tabId: 42 });
  });
});
