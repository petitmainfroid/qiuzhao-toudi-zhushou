import {
  EmbeddedCdpError,
  registerEmbeddedCdpListeners
} from "../bridge/opencliCdp";
import {
  POWER_SESSION_EXPIRY_ALARM,
  isEmbeddedBridgeRequest,
  type EmbeddedBridgeRequest,
  type EmbeddedBridgeResponse,
  type PowerSessionReason
} from "../bridge/protocol";
import {
  createChromePowerSessionManager,
  type PowerSessionManager
} from "../bridge/powerSession";
import { PrivacySafePageStateService } from "../bridge/pageState";

const defaultPageStateService = new PrivacySafePageStateService();

function failure(error: unknown): EmbeddedBridgeResponse {
  const code: PowerSessionReason = error instanceof EmbeddedCdpError
    ? error.code
    : "bridge-failed";
  const message = error instanceof EmbeddedCdpError
    ? error.message
    : "内置浏览器桥接没有完成请求。";
  return { ok: false, code, error: message };
}

export function isTrustedExtensionSender(sender: chrome.runtime.MessageSender): boolean {
  const extensionRoot = chrome.runtime.getURL("");
  return sender.id === chrome.runtime.id
    && typeof sender.url === "string"
    && sender.url.startsWith(extensionRoot);
}

export async function handleEmbeddedBridgeRequest(
  request: EmbeddedBridgeRequest,
  sender: chrome.runtime.MessageSender,
  manager: PowerSessionManager,
  pageStateService: PrivacySafePageStateService = defaultPageStateService
): Promise<EmbeddedBridgeResponse> {
  if (!isTrustedExtensionSender(sender)) {
    return { ok: false, code: "bridge-failed", error: "只有扩展界面中的用户操作可以启动浏览器会话。" };
  }
  try {
    if (request.type === "POWER_SESSION_START") {
      return { ok: true, session: await manager.start(request.tabId, true) };
    }
    if (request.type === "POWER_SESSION_STATUS") {
      return { ok: true, session: await manager.status() };
    }
    if (request.type === "POWER_SESSION_TARGET") {
      return { ok: true, tabId: await manager.targetTabId() };
    }
    if (request.type === "POWER_SESSION_REFRESH_STATE") {
      return { ok: true, session: await manager.refreshPageState() };
    }
    if (request.type === "POWER_PAGE_STATE") {
      return { ok: true, state: await pageStateService.read(await manager.status()) };
    }
    if (request.type === "POWER_PAGE_FIND") {
      return { ok: true, result: await pageStateService.find(await manager.status(), request.query) };
    }
    return { ok: true, session: await manager.stop() };
  }
  catch (error) {
    return failure(error);
  }
}

export function registerPowerSessionRuntime(
  manager: PowerSessionManager = createChromePowerSessionManager(),
  pageStateService: PrivacySafePageStateService = defaultPageStateService
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isEmbeddedBridgeRequest(message)) return undefined;
    void handleEmbeddedBridgeRequest(message, sender, manager, pageStateService).then(sendResponse);
    return true;
  });

  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    void manager.handleNavigation(details.tabId, details.url);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void manager.handleTabClosed(tabId);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POWER_SESSION_EXPIRY_ALARM) void manager.handleExpiryAlarm();
  });

  registerEmbeddedCdpListeners((tabId) => {
    void manager.handleDebuggerDetached(tabId);
  });
}
