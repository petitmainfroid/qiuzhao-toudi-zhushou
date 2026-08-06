import type {
  EmbeddedBridgeRequest,
  EmbeddedBridgeResponse,
  PageFindQuery,
  PageFindResult,
  PageActionAuthorizationView,
  PrivacySafePageState,
  PowerSessionView
} from "../bridge/protocol";

export interface PowerSessionBridge {
  status(): Promise<PowerSessionView>;
  start(): Promise<PowerSessionView>;
  refresh(): Promise<PowerSessionView>;
  pageState(): Promise<PrivacySafePageState>;
  find(query: PageFindQuery): Promise<PageFindResult>;
  authorizeActions(): Promise<PageActionAuthorizationView>;
  stop(): Promise<PowerSessionView>;
}

function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().replaceAll("-", "");
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function send(request: EmbeddedBridgeRequest): Promise<EmbeddedBridgeResponse> {
  return chrome.runtime.sendMessage(request) as Promise<EmbeddedBridgeResponse>;
}

function sessionFrom(response: EmbeddedBridgeResponse): PowerSessionView {
  if (!response.ok) throw new Error(response.error);
  if (!("session" in response)) throw new Error("浏览器会话没有返回状态。");
  return response.session;
}

function stateFrom(response: EmbeddedBridgeResponse): PrivacySafePageState {
  if (!response.ok) throw new Error(response.error);
  if (!("state" in response)) throw new Error("浏览器会话没有返回页面结构。");
  return response.state;
}

function findResultFrom(response: EmbeddedBridgeResponse): PageFindResult {
  if (!response.ok) throw new Error(response.error);
  if (!("result" in response)) throw new Error("浏览器会话没有返回查找结果。");
  return response.result;
}

function authorizationFrom(response: EmbeddedBridgeResponse): PageActionAuthorizationView {
  if (!response.ok) throw new Error(response.error);
  if (!("authorization" in response)) throw new Error("浏览器会话没有返回动作授权。");
  return response.authorization;
}

async function targetTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const activeHttps = tabs.find((tab) => tab.active && tab.url?.startsWith("https://"));
  const httpsTabs = tabs.filter((tab) => tab.url?.startsWith("https://"));
  const fallback = httpsTabs.at(-1);
  const tabId = activeHttps?.id ?? fallback?.id;
  if (typeof tabId !== "number") throw new Error("当前窗口没有可连接的 HTTPS 招聘页面。");
  return tabId;
}

export class ChromePowerSessionBridge implements PowerSessionBridge {
  async status(): Promise<PowerSessionView> {
    return sessionFrom(await send({ type: "POWER_SESSION_STATUS", requestId: requestId() }));
  }

  async start(): Promise<PowerSessionView> {
    return sessionFrom(await send({
      type: "POWER_SESSION_START",
      requestId: requestId(),
      tabId: await targetTabId()
    }));
  }

  async refresh(): Promise<PowerSessionView> {
    return sessionFrom(await send({ type: "POWER_SESSION_REFRESH_STATE", requestId: requestId() }));
  }

  async pageState(): Promise<PrivacySafePageState> {
    return stateFrom(await send({ type: "POWER_PAGE_STATE", requestId: requestId() }));
  }

  async find(query: PageFindQuery): Promise<PageFindResult> {
    return findResultFrom(await send({ type: "POWER_PAGE_FIND", requestId: requestId(), query }));
  }

  async authorizeActions(): Promise<PageActionAuthorizationView> {
    return authorizationFrom(await send({ type: "POWER_PAGE_ACTION_AUTHORIZE", requestId: requestId() }));
  }

  async stop(): Promise<PowerSessionView> {
    return sessionFrom(await send({ type: "POWER_SESSION_STOP", requestId: requestId() }));
  }
}

export class PreviewPowerSessionBridge implements PowerSessionBridge {
  async status(): Promise<PowerSessionView> {
    return { status: "inactive", reason: "not-started" };
  }

  async start(): Promise<PowerSessionView> {
    throw new Error("浏览器会话只在安装扩展后可用。");
  }

  async refresh(): Promise<PowerSessionView> {
    return this.status();
  }

  async pageState(): Promise<PrivacySafePageState> {
    throw new Error("页面结构只在安装扩展并连接 HTTPS 页面后可用。");
  }

  async find(_query: PageFindQuery): Promise<PageFindResult> {
    throw new Error("语义查找只在安装扩展并连接 HTTPS 页面后可用。");
  }

  async authorizeActions(): Promise<PageActionAuthorizationView> {
    throw new Error("动作授权只在安装扩展并连接 HTTPS 页面后可用。");
  }

  async stop(): Promise<PowerSessionView> {
    return this.status();
  }
}

export function resolvePowerSessionBridge(): PowerSessionBridge {
  const available = typeof chrome !== "undefined"
    && Boolean(chrome.runtime?.id && chrome.tabs && chrome.runtime.sendMessage);
  return available ? new ChromePowerSessionBridge() : new PreviewPowerSessionBridge();
}
