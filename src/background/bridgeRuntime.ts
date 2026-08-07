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
import {
  createChromePageUploadService,
  type PageUploadService
} from "../bridge/pageUpload";
import {
  createChromePageScreenshotService,
  type PageScreenshotService
} from "../bridge/pageScreenshot";
import {
  createChromeEvidenceLog,
  type PrivacySafeEvidenceLog
} from "../bridge/evidenceLog";

const defaultReferenceRegistry = new OpaqueReferenceRegistry();
const defaultPageStateService = new PrivacySafePageStateService(defaultReferenceRegistry);
const defaultPageActionService = createChromePageActionService(defaultReferenceRegistry);
const defaultRequestLedger = createChromeRequestLedger();
const defaultPageUploadService = createChromePageUploadService(defaultReferenceRegistry);
const defaultPageScreenshotService = createChromePageScreenshotService();
const defaultEvidenceLog = createChromeEvidenceLog();

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

function duplicateUpload(
  request: Extract<EmbeddedBridgeRequest, { type: "POWER_PAGE_UPLOAD" }>,
  reason: "duplicate-request-conflict" | "duplicate-request-uncertain"
): Extract<EmbeddedBridgeResponse, { ok: true; upload: unknown }> {
  return {
    ok: true,
    upload: {
      requestId: request.requestId,
      ref: request.ref,
      action: "upload-saved-resume",
      status: "blocked",
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
  requestLedger: PersistentRequestLedger = defaultRequestLedger,
  pageUploadService: PageUploadService = defaultPageUploadService,
  pageScreenshotService: PageScreenshotService = defaultPageScreenshotService,
  evidenceLog: PrivacySafeEvidenceLog = defaultEvidenceLog
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
      if (outcome.kind === "conflict" || outcome.kind === "uncertain") {
        const reason = outcome.kind === "conflict" ? "duplicate-request-conflict" : "duplicate-request-uncertain";
        await evidenceLog.append({
          command: "page-action",
          ref: request.ref,
          status: "blocked",
          attempts: 0,
          durationBucket: "lt-100ms",
          failureCategory: reason
        });
        return duplicateAction(request, reason);
      }
      void evidenceLog.append({
        command: "page-action",
        ref: outcome.value.ref,
        status: outcome.value.status,
        attempts: outcome.value.attempts,
        durationBucket: outcome.value.durationBucket,
        ...(outcome.value.reason ? { failureCategory: outcome.value.reason } : {})
      }).catch(() => undefined);
      return { ok: true, action: outcome.value };
    }
    if (request.type === "POWER_PAGE_UPLOAD_AUTHORIZE") {
      return {
        ok: true,
        uploadAuthorization: await pageUploadService.authorize(request, await manager.status(), true)
      };
    }
    if (request.type === "POWER_PAGE_UPLOAD_CANCEL") {
      const upload = pageUploadService.cancel(request);
      await evidenceLog.append({
        command: "upload-saved-resume",
        ref: upload.ref,
        status: upload.status,
        attempts: upload.attempts,
        durationBucket: upload.durationBucket,
        failureCategory: "user-cancelled"
      });
      return { ok: true, upload };
    }
    if (request.type === "POWER_PAGE_UPLOAD") {
      const outcome = await requestLedger.run({
        requestId: request.requestId,
        sessionId: request.sessionId,
        fingerprint: requestFingerprint(request)
      }, async () => pageUploadService.upload(request, await manager.status()));
      if (outcome.kind === "conflict" || outcome.kind === "uncertain") {
        const reason = outcome.kind === "conflict" ? "duplicate-request-conflict" : "duplicate-request-uncertain";
        await evidenceLog.append({
          command: "upload-saved-resume",
          ref: request.ref,
          status: "blocked",
          attempts: 0,
          durationBucket: "lt-100ms",
          failureCategory: reason
        });
        return duplicateUpload(request, reason);
      }
      await evidenceLog.append({
        command: "upload-saved-resume",
        ref: outcome.value.ref,
        status: outcome.value.status,
        attempts: outcome.value.attempts,
        durationBucket: outcome.value.durationBucket,
        ...(outcome.value.reason ? { failureCategory: outcome.value.reason } : {})
      });
      return { ok: true, upload: outcome.value };
    }
    if (request.type === "POWER_PAGE_SCREENSHOT") {
      const screenshot = await pageScreenshotService.capture(request, await manager.status(), true);
      await evidenceLog.append({
        command: "capture-screenshot",
        status: screenshot.status,
        attempts: screenshot.status === "captured" ? 1 : 0,
        durationBucket: screenshot.durationBucket,
        ...(screenshot.reason ? { failureCategory: screenshot.reason } : {})
      });
      return { ok: true, screenshot };
    }
    if (request.type === "POWER_EVIDENCE_LOGS") {
      return { ok: true, logs: await evidenceLog.list() };
    }
    pageUploadService.invalidate();
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
  requestLedger: PersistentRequestLedger = defaultRequestLedger,
  pageUploadService: PageUploadService = defaultPageUploadService,
  pageScreenshotService: PageScreenshotService = defaultPageScreenshotService,
  evidenceLog: PrivacySafeEvidenceLog = defaultEvidenceLog
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
      requestLedger,
      pageUploadService,
      pageScreenshotService,
      evidenceLog
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
    pageUploadService.invalidate();
    pageStateService.registry.invalidate();
    void manager.handleTabClosed(tabId);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POWER_SESSION_EXPIRY_ALARM) {
      pageActionService.invalidate();
      pageUploadService.invalidate();
      pageStateService.registry.invalidate();
      void manager.handleExpiryAlarm();
    }
  });

  registerEmbeddedCdpListeners((tabId) => {
    pageActionService.invalidate();
    pageUploadService.invalidate();
    pageStateService.registry.invalidate();
    void manager.handleDebuggerDetached(tabId);
  });
}
