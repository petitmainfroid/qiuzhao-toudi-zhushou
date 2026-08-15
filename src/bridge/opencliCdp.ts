/**
 * Embedded CDP transport adapted from jackwener/OpenCLI 1.8.6
 * extension/src/cdp.ts at commit 399c0de2a76eb979aee3a3836cf2d24fd247780f.
 *
 * Upstream license: Apache-2.0. This modified port intentionally omits raw
 * evaluation, cookies, network capture, downloads, arbitrary filesystem-path
 * upload, and tab-container automation. See THIRD_PARTY_NOTICES.md.
 */

import type { EmbeddedPageState, PowerSessionReason } from "./protocol";

const attached = new Set<number>();
const CDP_COMMAND_TIMEOUT_MS = 15_000;
const CDP_PROBE_TIMEOUT_MS = 2_000;
const INTERACTIVE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "button",
  "a[href]",
  "[role='button']",
  "[role='combobox']"
].join(",");

export class EmbeddedCdpError extends Error {
  constructor(
    public readonly code: PowerSessionReason,
    message: string
  ) {
    super(message);
    this.name = "EmbeddedCdpError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyAttachError(error: unknown): EmbeddedCdpError {
  const message = errorMessage(error);
  if (/another debugger|already attached|debugger is already/i.test(message)) {
    return new EmbeddedCdpError("debugger-busy", "当前标签页正在被其他调试工具占用。请关闭 DevTools 或其他浏览器自动化工具后重试。");
  }
  return new EmbeddedCdpError("bridge-failed", "内置浏览器桥接无法连接此页面。");
}

export async function sendDebuggerCommand<T = unknown>(
  target: chrome.debugger.Debuggee,
  method: string,
  params?: Record<string, unknown>,
  timeoutMs: number = CDP_COMMAND_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const commandPromise = (params === undefined
    ? chrome.debugger.sendCommand(target, method)
    : chrome.debugger.sendCommand(target, method, params)) as Promise<T>;
  commandPromise.catch(() => undefined);
  try {
    return await Promise.race([
      commandPromise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new EmbeddedCdpError(
          "bridge-failed",
          `CDP 命令 ${method} 在 ${Math.round(timeoutMs / 1000)} 秒内没有完成。`
        )), timeoutMs);
      })
    ]);
  }
  finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isDebuggableUrl(url?: string): boolean {
  try {
    const parsed = new URL(url ?? "");
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  }
  catch {
    return false;
  }
}

export async function ensureAttached(tabId: number): Promise<void> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  }
  catch {
    attached.delete(tabId);
    throw new EmbeddedCdpError("tab-closed", "目标招聘标签页已经关闭。");
  }
  if (!isDebuggableUrl(tab.url)) {
    attached.delete(tabId);
    throw new EmbeddedCdpError("unsupported-page", "强力会话只允许连接 HTTPS 招聘页面。");
  }

  if (attached.has(tabId)) {
    try {
      await sendDebuggerCommand({ tabId }, "DOM.enable", undefined, CDP_PROBE_TIMEOUT_MS);
      return;
    }
    catch {
      attached.delete(tabId);
    }
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      attached.add(tabId);
      await sendDebuggerCommand({ tabId }, "DOM.enable");
      await sendDebuggerCommand({ tabId }, "Page.enable");
      return;
    }
    catch (error) {
      lastError = error;
      if (attached.has(tabId)) {
        attached.delete(tabId);
        try {
          await chrome.debugger.detach({ tabId });
        }
        catch {
          // The failed attach may already have been removed by Chrome.
        }
      }
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw classifyAttachError(lastError);
}

interface CdpFrameTree {
  frame?: { id?: string };
  childFrames?: CdpFrameTree[];
}

function countFrames(frame: CdpFrameTree | undefined): number {
  if (!frame) return 0;
  return 1 + (frame.childFrames ?? []).reduce(
    (total, child) => total + countFrames(child),
    0
  );
}

function safePageLocation(rawUrl: string | undefined): { origin: string; path: string } {
  try {
    const url = new URL(rawUrl ?? "");
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe");
    return { origin: url.origin, path: url.pathname };
  }
  catch {
    throw new EmbeddedCdpError("unsupported-page", "目标招聘页面不是安全的 HTTPS 地址。");
  }
}

export async function readEmbeddedPageState(tabId: number): Promise<EmbeddedPageState> {
  await ensureAttached(tabId);
  const [tab, documentResult, frameTreeResult] = await Promise.all([
    chrome.tabs.get(tabId),
    sendDebuggerCommand<{ root?: { nodeId?: number } }>({ tabId }, "DOM.getDocument", {
      depth: 0,
      pierce: false
    }),
    sendDebuggerCommand<{ frameTree?: CdpFrameTree }>({ tabId }, "Page.getFrameTree")
  ]);
  const nodeId = documentResult.root?.nodeId;
  if (typeof nodeId !== "number") {
    throw new EmbeddedCdpError("bridge-failed", "浏览器没有返回页面 DOM 根节点。");
  }
  const matches = await sendDebuggerCommand<{ nodeIds?: number[] }>({ tabId }, "DOM.querySelectorAll", {
    nodeId,
    selector: INTERACTIVE_SELECTOR
  });
  const location = safePageLocation(tab.url);
  return {
    ...location,
    interactiveCount: matches.nodeIds?.length ?? 0,
    frameCount: countFrames(frameTreeResult.frameTree)
  };
}

export async function detachEmbeddedCdp(tabId: number): Promise<void> {
  attached.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  }
  catch {
    // The tab may already be closed or detached. The local state is cleared.
  }
}

export function registerEmbeddedCdpListeners(onDetached?: (tabId: number) => void): void {
  chrome.debugger.onDetach.addListener((source) => {
    if (typeof source.tabId !== "number") return;
    attached.delete(source.tabId);
    onDetached?.(source.tabId);
  });
}

export const __test__ = {
  reset(): void {
    attached.clear();
  }
};
