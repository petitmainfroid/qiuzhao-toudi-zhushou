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
import { OpaqueReferenceRegistry } from "../bridge/pageState";
import {
  createChromePageActionService,
  type PageActionService
} from "../bridge/pageActions";
import {
  createChromePageWorkflowService,
  type PageWorkflowService
} from "../bridge/pageWorkflows";
import {
  createChromeRequestLedger,
  requestFingerprint,
  type PersistentRequestLedger
} from "../bridge/requestLedger";

const defaultReferenceRegistry = new OpaqueReferenceRegistry();
const defaultPageStateService = new PrivacySafePageStateService(defaultReferenceRegistry);
const defaultPageActionService = createChromePageActionService(defaultReferenceRegistry);
const defaultRequestLedger = createChromeRequestLedger();

function duplicateAction(
  request: Extract<EmbeddedBridgeRequest, { type: "POWER_PAGE_ACTION" }>,
  reason: "duplicate-request-conflict" | "duplicate-request-uncertain"
): Extract<EmbeddedBridgeResponse, { ok: true; action: unknown }> {
  return {
    ok: true,
    action: {
      requestId: request.requestId,
      ref: request.ref,
      action: request.intent.kind,
      status: "blocked",
      strategy: "none",
      attempts: 0,
      reason,
      durationBucket: "lt-100ms"
    }
  };
}

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
  pageStateService: PrivacySafePageStateService = defaultPageStateService,
  pageActionService: PageActionService = defaultPageActionService,
  pageWorkflowService: PageWorkflowService = createChromePageWorkflowService(
    () => manager.status(),
    pageStateService
  ),
  requestLedger: PersistentRequestLedger = defaultRequestLedger
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
    if (request.type === "POWER_PAGE_WAIT") {
      return { ok: true, wait: await pageWorkflowService.wait(request) };
    }
    if (request.type === "POWER_PAGE_ACTION_AUTHORIZE") {
      return { ok: true, authorization: await pageActionService.authorize(await manager.status(), true) };
    }
    if (request.type === "POWER_PAGE_ACTION") {
      const outcome = await requestLedger.run({
        requestId: request.requestId,
        sessionId: request.sessionId,
        fingerprint: requestFingerprint(request)
      }, async () => pageActionService.act(request, await manager.status()));
      if (outcome.kind === "conflict") return duplicateAction(request, "duplicate-request-conflict");
      if (outcome.kind === "uncertain") return duplicateAction(request, "duplicate-request-uncertain");
      return { ok: true, action: outcome.value };
    }
    pageActionService.invalidate();
    pageStateService.registry.invalidate();
    return { ok: true, session: await manager.stop() };
  }
  catch (error) {
    return failure(error);
  }
}

export function registerPowerSessionRuntime(
  manager: PowerSessionManager = createChromePowerSessionManager(),
  pageStateService: PrivacySafePageStateService = defaultPageStateService,
  pageActionService: PageActionService = defaultPageActionService,
  pageWorkflowService: PageWorkflowService = createChromePageWorkflowService(
    () => manager.status(),
    pageStateService
  ),
  requestLedger: PersistentRequestLedger = defaultRequestLedger
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isEmbeddedBridgeRequest(message)) return undefined;
    void handleEmbeddedBridgeRequest(
      message,
      sender,
      manager,
      pageStateService,
      pageActionService,
      pageWorkflowService,
      requestLedger
    ).then(sendResponse);
    return true;
  });

  const handleNavigation = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
    if (details.frameId !== 0) return;
    pageActionService.invalidate();
    pageStateService.registry.invalidate();
    void manager.handleNavigation(details.tabId, details.url);
  };
  chrome.webNavigation.onCommitted.addListener(handleNavigation);
  chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);

  chrome.tabs.onRemoved.addListener((tabId) => {
    pageActionService.invalidate();
    pageStateService.registry.invalidate();
    void manager.handleTabClosed(tabId);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POWER_SESSION_EXPIRY_ALARM) {
      pageActionService.invalidate();
      pageStateService.registry.invalidate();
      void manager.handleExpiryAlarm();
    }
  });

  registerEmbeddedCdpListeners((tabId) => {
    pageActionService.invalidate();
    pageStateService.registry.invalidate();
    void manager.handleDebuggerDetached(tabId);
  });
}
