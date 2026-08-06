import {
  EmbeddedCdpError,
  detachEmbeddedCdp,
  ensureAttached,
  readEmbeddedPageState
} from "./opencliCdp";
import {
  POWER_SESSION_EXPIRY_ALARM,
  POWER_SESSION_TTL_MS,
  type EmbeddedPageState,
  type PowerSessionReason,
  type PowerSessionView
} from "./protocol";

const POWER_SESSION_STORAGE_KEY = "qiuzhao.powerSession.v1";

interface StoredPowerSession {
  sessionId: string;
  tabId: number;
  origin: string;
  path: string;
  startedAt: number;
  expiresAt: number;
  status: "active" | "paused";
  pageState?: EmbeddedPageState;
  reason?: PowerSessionReason;
}

export interface PowerSessionStore {
  load(): Promise<StoredPowerSession | null>;
  save(session: StoredPowerSession): Promise<void>;
  clear(): Promise<void>;
}

export interface PowerSessionDependencies {
  getTab(tabId: number): Promise<{ id?: number; url?: string }>;
  attach(tabId: number): Promise<void>;
  detach(tabId: number): Promise<void>;
  readPageState(tabId: number): Promise<EmbeddedPageState>;
  store: PowerSessionStore;
  scheduleExpiry(expiresAt: number): Promise<void>;
  clearExpiry(): Promise<void>;
  now(): number;
  randomId(): string;
}

function inactive(reason: PowerSessionReason = "not-started"): PowerSessionView {
  return { status: "inactive", reason };
}

function publicSession(session: StoredPowerSession): PowerSessionView {
  return {
    status: session.status,
    sessionId: session.sessionId,
    tabId: session.tabId,
    origin: session.origin,
    path: session.path,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    ...(session.pageState ? { pageState: session.pageState } : {}),
    ...(session.reason ? { reason: session.reason } : {})
  };
}

function parseSecureLocation(rawUrl: string | undefined): { origin: string; path: string } {
  try {
    const url = new URL(rawUrl ?? "");
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe");
    return { origin: url.origin, path: url.pathname };
  }
  catch {
    throw new EmbeddedCdpError("unsupported-page", "强力会话只允许连接没有内嵌凭据的 HTTPS 招聘页面。");
  }
}

function errorReason(error: unknown): PowerSessionReason {
  return error instanceof EmbeddedCdpError ? error.code : "bridge-failed";
}

export class PowerSessionManager {
  constructor(private readonly dependencies: PowerSessionDependencies) {}

  async start(tabId: number, createdByUserGesture: boolean): Promise<PowerSessionView> {
    if (!createdByUserGesture) {
      throw new EmbeddedCdpError("bridge-failed", "强力会话必须由用户点击扩展界面后启动。");
    }
    const tab = await this.dependencies.getTab(tabId).catch(() => {
      throw new EmbeddedCdpError("tab-closed", "当前招聘标签页已经关闭。");
    });
    const location = parseSecureLocation(tab.url);
    const current = await this.dependencies.store.load();
    if (current?.status === "active" && current.tabId === tabId && current.origin === location.origin) {
      if (current.expiresAt > this.dependencies.now()) return publicSession(current);
      await this.stop("expired");
    }
    else if (current) {
      await this.dependencies.detach(current.tabId);
      await this.dependencies.store.clear();
    }

    await this.dependencies.attach(tabId);
    let pageState: EmbeddedPageState;
    try {
      pageState = await this.dependencies.readPageState(tabId);
      if (pageState.origin !== location.origin) {
        throw new EmbeddedCdpError("origin-changed", "页面在连接期间切换到了其他站点，已停止连接。");
      }
    }
    catch (error) {
      await this.dependencies.detach(tabId);
      throw error;
    }
    const startedAt = this.dependencies.now();
    const session: StoredPowerSession = {
      sessionId: this.dependencies.randomId(),
      tabId,
      origin: location.origin,
      path: location.path,
      startedAt,
      expiresAt: startedAt + POWER_SESSION_TTL_MS,
      status: "active",
      pageState
    };
    await this.dependencies.store.save(session);
    await this.dependencies.scheduleExpiry(session.expiresAt);
    return publicSession(session);
  }

  async status(): Promise<PowerSessionView> {
    const session = await this.dependencies.store.load();
    if (!session) return inactive();
    if (session.expiresAt <= this.dependencies.now()) {
      await this.stop("expired");
      return inactive("expired");
    }
    if (session.status === "paused") return publicSession(session);
    const tab = await this.dependencies.getTab(session.tabId).catch(() => null);
    if (!tab) {
      await this.stop("tab-closed");
      return inactive("tab-closed");
    }
    let location: { origin: string; path: string };
    try {
      location = parseSecureLocation(tab.url);
    }
    catch {
      return this.pause(session, "origin-changed");
    }
    if (location.origin !== session.origin) return this.pause(session, "origin-changed");
    if (location.path !== session.path) {
      const next = { ...session, path: location.path };
      await this.dependencies.store.save(next);
      return publicSession(next);
    }
    return publicSession(session);
  }

  async targetTabId(): Promise<number | null> {
    const session = await this.status();
    return session.status === "active" && typeof session.tabId === "number" ? session.tabId : null;
  }

  async refreshPageState(): Promise<PowerSessionView> {
    const session = await this.status();
    if (session.status !== "active" || typeof session.tabId !== "number") return session;
    try {
      await this.dependencies.attach(session.tabId);
      const pageState = await this.dependencies.readPageState(session.tabId);
      const stored = await this.dependencies.store.load();
      if (!stored || stored.sessionId !== session.sessionId || stored.status !== "active") return this.status();
      const next = { ...stored, path: pageState.path, pageState };
      await this.dependencies.store.save(next);
      return publicSession(next);
    }
    catch (error) {
      const stored = await this.dependencies.store.load();
      if (!stored) return inactive(errorReason(error));
      return this.pause(stored, errorReason(error));
    }
  }

  async handleNavigation(tabId: number, rawUrl: string): Promise<void> {
    const session = await this.dependencies.store.load();
    if (!session || session.tabId !== tabId || session.status !== "active") return;
    let location: { origin: string; path: string };
    try {
      location = parseSecureLocation(rawUrl);
    }
    catch {
      await this.pause(session, "origin-changed");
      return;
    }
    if (location.origin !== session.origin) {
      await this.pause(session, "origin-changed");
      return;
    }
    await this.dependencies.store.save({ ...session, path: location.path, pageState: undefined });
  }

  async handleTabClosed(tabId: number): Promise<void> {
    const session = await this.dependencies.store.load();
    if (session?.tabId === tabId) await this.stop("tab-closed");
  }

  async handleDebuggerDetached(tabId: number): Promise<void> {
    const session = await this.dependencies.store.load();
    if (!session || session.tabId !== tabId || session.status !== "active") return;
    await this.dependencies.store.save({ ...session, status: "paused", reason: "debugger-detached" });
  }

  async handleExpiryAlarm(): Promise<void> {
    const session = await this.dependencies.store.load();
    if (session && session.expiresAt <= this.dependencies.now()) await this.stop("expired");
  }

  async stop(_reason: PowerSessionReason = "not-started"): Promise<PowerSessionView> {
    const session = await this.dependencies.store.load();
    await this.dependencies.store.clear();
    await this.dependencies.clearExpiry();
    if (session) await this.dependencies.detach(session.tabId);
    return inactive(_reason);
  }

  private async pause(session: StoredPowerSession, reason: PowerSessionReason): Promise<PowerSessionView> {
    await this.dependencies.detach(session.tabId);
    const paused: StoredPowerSession = { ...session, status: "paused", reason, pageState: undefined };
    await this.dependencies.store.save(paused);
    return publicSession(paused);
  }
}

class ChromePowerSessionStore implements PowerSessionStore {
  async load(): Promise<StoredPowerSession | null> {
    const value = await chrome.storage.session.get(POWER_SESSION_STORAGE_KEY);
    const session = value[POWER_SESSION_STORAGE_KEY] as StoredPowerSession | undefined;
    return session ?? null;
  }

  async save(session: StoredPowerSession): Promise<void> {
    await chrome.storage.session.set({ [POWER_SESSION_STORAGE_KEY]: session });
  }

  async clear(): Promise<void> {
    await chrome.storage.session.remove(POWER_SESSION_STORAGE_KEY);
  }
}

function randomSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `power_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function createChromePowerSessionManager(): PowerSessionManager {
  return new PowerSessionManager({
    getTab: (tabId) => chrome.tabs.get(tabId),
    attach: ensureAttached,
    detach: detachEmbeddedCdp,
    readPageState: readEmbeddedPageState,
    store: new ChromePowerSessionStore(),
    scheduleExpiry: async (expiresAt) => {
      await chrome.alarms.create(POWER_SESSION_EXPIRY_ALARM, { when: expiresAt });
    },
    clearExpiry: async () => {
      await chrome.alarms.clear(POWER_SESSION_EXPIRY_ALARM);
    },
    now: () => Date.now(),
    randomId: randomSessionId
  });
}
