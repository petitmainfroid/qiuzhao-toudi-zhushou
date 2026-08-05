import { fillPage, scanPage } from "./engine";
import { createMissingRepeatableRecords } from "./repeatableRecords";
import type { ContentRequest, ContentResponse } from "../shared/messages";

declare global {
  interface Window {
    __QIUZHAO_ASSISTANT_READY__?: boolean;
  }
}

if (!window.__QIUZHAO_ASSISTANT_READY__) {
  window.__QIUZHAO_ASSISTANT_READY__ = true;
  chrome.runtime.onMessage.addListener(
    (message: ContentRequest, _sender, sendResponse: (response: ContentResponse) => void) => {
      try {
        if (message.type === "PING_CONTENT") {
          sendResponse({ ready: true });
        }
        else if (message.type === "SCAN_PAGE") {
          sendResponse({ ok: true, result: scanPage(message.profile, message.mappings) });
        }
        else if (message.type === "CREATE_REPEATABLE_RECORDS") {
          void createMissingRepeatableRecords(message.profile, message.group)
            .then((result) => sendResponse({ ok: true, result }))
            .catch((error) => sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : "页面处理失败"
            }));
          return true;
        }
        else if (message.type === "FILL_PAGE") {
          void fillPage(message.profile, message.selections, message.mappings)
            .then((result) => sendResponse({ ok: true, result }))
            .catch((error) => sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : "页面处理失败"
            }));
          return true;
        }
      }
      catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "页面处理失败"
        });
      }
    }
  );
}

export {};
