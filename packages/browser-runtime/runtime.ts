import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { listInspectablePageUrls, probeCdp } from "./cdp.js";
import { CapabilityControlServer } from "./controlServer.js";
import { assertDedicatedProfileDir, normalizePageIdentity } from "./paths.js";
import { writeSession } from "./sessionStore.js";
import type {
  AdoptOptions,
  BrowserRuntimeStatus,
  LaunchOptions,
  RuntimeSessionRecord
} from "./types.js";

const DEVTOOLS_ACTIVE_PORT = "DevToolsActivePort";

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseBrowserVersion(browser: string): string | undefined {
  const match = browser.match(/\/(\d+(?:\.\d+){2,3})/);
  return match?.[1];
}

export function runtimeStateForPageUrls(
  pageUrls: readonly string[],
  targetUrl: string
): "ready" | "login-needed" {
  const requested = normalizePageIdentity(targetUrl);
  const identities = pageUrls.flatMap((pageUrl) => {
    try {
      return [normalizePageIdentity(pageUrl)];
    } catch {
      return [];
    }
  });
  return identities.some((identity) =>
    identity.origin === requested.origin && identity.pathPattern === requested.pathPattern
  ) ? "ready" : "login-needed";
}

export class BrowserRuntime {
  private child?: ChildProcess;
  private control?: CapabilityControlServer;
  private record: RuntimeSessionRecord;
  private stopping = false;

  private constructor(private readonly options: LaunchOptions, record: RuntimeSessionRecord) {
    this.record = record;
  }

  static async launch(options: LaunchOptions): Promise<BrowserRuntime> {
    const profileDir = await assertDedicatedProfileDir(options.profileDir);
    const target = options.targetUrl ? normalizePageIdentity(options.targetUrl) : undefined;
    const initial: RuntimeSessionRecord = {
      schemaVersion: 1,
      capability: randomBytes(32).toString("base64url"),
      executablePath: options.browser.executablePath,
      commandPrefix: options.browser.commandPrefix,
      status: {
        launchId: randomUUID(),
        state: "starting",
        browser: options.browser.kind,
        profileDir,
        controlPort: 0,
        startedAt: new Date().toISOString(),
        page: target ? { origin: target.origin, pathPattern: target.pathPattern } : undefined
      }
    };
    const runtime = new BrowserRuntime({ ...options, profileDir }, initial);
    await runtime.startControl();
    await runtime.persist();

    const args = [
      ...(options.browser.commandPrefix ?? []),
      `--user-data-dir=${profileDir}`,
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-mode",
      "--new-window",
      target?.safeUrl ?? "about:blank"
    ];
    runtime.child = spawn(options.browser.executablePath, args, {
      stdio: "ignore",
      windowsHide: false,
      detached: false
    });
    runtime.record.status.browserPid = runtime.child.pid;
    runtime.child.once("exit", () => void runtime.onBrowserExit());

    try {
      await runtime.waitForReady();
      return runtime;
    } catch (error) {
      runtime.record.status.state = "disconnected";
      runtime.record.status.errorCode = error instanceof Error ? error.message : "startup_failed";
      await runtime.persist();
      await runtime.stopBrowser();
      await runtime.control?.close();
      throw error;
    }
  }

  static async adopt(options: AdoptOptions): Promise<BrowserRuntime> {
    const profileDir = await assertDedicatedProfileDir(options.profileDir);
    if (!processExists(options.browserPid)) throw new Error("browser_process_missing");
    const cdp = await probeCdp(options.cdpPort);
    const target = options.targetUrl ? normalizePageIdentity(options.targetUrl) : undefined;
    const currentState = target
      ? runtimeStateForPageUrls(await listInspectablePageUrls(options.cdpPort), options.targetUrl!)
      : "ready";
    const record: RuntimeSessionRecord = {
      schemaVersion: 1,
      capability: randomBytes(32).toString("base64url"),
      executablePath: options.browser.executablePath,
      commandPrefix: options.browser.commandPrefix,
      status: {
        launchId: randomUUID(),
        state: currentState,
        browser: options.browser.kind,
        browserVersion: parseBrowserVersion(cdp.browser),
        browserPid: options.browserPid,
        profileDir,
        cdpPort: options.cdpPort,
        controlPort: 0,
        startedAt: new Date().toISOString(),
        page: target ? { origin: target.origin, pathPattern: target.pathPattern } : undefined
      }
    };
    const runtime = new BrowserRuntime({ ...options, profileDir }, record);
    await runtime.startControl();
    await runtime.persist();
    return runtime;
  }

  getStatus(): BrowserRuntimeStatus {
    return structuredClone(this.record.status);
  }

  getCapability(): string {
    return this.record.capability;
  }

  async refreshStatus(): Promise<BrowserRuntimeStatus> {
    if (
      this.record.status.state === "stopped"
      || this.record.status.state === "disconnected"
      || !this.options.targetUrl
      || !this.record.status.cdpPort
    ) return this.getStatus();
    const pageUrls = await listInspectablePageUrls(this.record.status.cdpPort);
    const nextState = runtimeStateForPageUrls(pageUrls, this.options.targetUrl);
    if (this.record.status.state !== nextState) {
      this.record.status.state = nextState;
      await this.persist();
    }
    return this.getStatus();
  }

  async stop(): Promise<BrowserRuntimeStatus> {
    if (this.stopping || this.record.status.state === "stopped") return this.getStatus();
    this.stopping = true;
    await this.stopBrowser();
    this.record.status.state = "stopped";
    delete this.record.status.errorCode;
    await this.persist();
    const result = this.getStatus();
    setImmediate(() => void this.control?.close());
    return result;
  }

  async disconnect(): Promise<BrowserRuntimeStatus> {
    if (this.record.status.state === "stopped") return this.getStatus();
    this.child?.removeAllListeners("exit");
    this.record.status.state = "disconnected";
    this.record.status.errorCode = "application_disconnected";
    await this.persist();
    await this.control?.close();
    return this.getStatus();
  }

  async waitUntilStopped(): Promise<void> {
    while (this.record.status.state !== "stopped" && this.record.status.state !== "disconnected") {
      await delay(100);
    }
    await this.control?.close();
  }

  private async startControl(): Promise<void> {
    this.control = new CapabilityControlServer(this.record.capability, {
      getStatus: () => this.refreshStatus(),
      stop: () => this.stop()
    });
    this.record.status.controlPort = await this.control.start();
  }

  private async persist(): Promise<void> {
    await writeSession(this.options.sessionFile, this.record);
  }

  private async waitForReady(): Promise<void> {
    const timeoutMs = this.options.startupTimeoutMs ?? 20_000;
    const pollMs = this.options.pollIntervalMs ?? 100;
    const deadline = Date.now() + timeoutMs;
    const activePortFile = path.join(this.record.status.profileDir, DEVTOOLS_ACTIVE_PORT);

    while (Date.now() < deadline) {
      if (this.child?.exitCode !== null) throw new Error("browser_exited_during_startup");
      try {
        const firstLine = (await readFile(activePortFile, "utf8")).split(/\r?\n/, 1)[0];
        const port = Number(firstLine);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid_cdp_port");
        const info = await probeCdp(port);
        let pageUrls = await listInspectablePageUrls(port);
        if (pageUrls.length === 0) throw new Error("cdp_page_missing");
        if (this.options.targetUrl) {
          const requested = normalizePageIdentity(this.options.targetUrl);
          const hasRequestedOrigin = pageUrls.some((pageUrl) => {
            try {
              return normalizePageIdentity(pageUrl).origin === requested.origin;
            } catch {
              return false;
            }
          });
          if (!hasRequestedOrigin) throw new Error("target_origin_not_identified");
          // Give client-side authentication redirects a bounded chance to
          // settle, then classify only from the normalized current path.
          await delay(750);
          pageUrls = await listInspectablePageUrls(port);
          this.record.status.page = {
            origin: requested.origin,
            pathPattern: requested.pathPattern
          };
          this.record.status.state = runtimeStateForPageUrls(pageUrls, this.options.targetUrl);
        } else {
          this.record.status.state = "ready";
        }
        this.record.status.cdpPort = port;
        this.record.status.browserVersion = parseBrowserVersion(info.browser);
        delete this.record.status.errorCode;
        await this.persist();
        return;
      } catch {
        await delay(pollMs);
      }
    }
    throw new Error("browser_startup_timeout");
  }

  private async stopBrowser(): Promise<void> {
    const pid = this.record.status.browserPid;
    if (!pid || !processExists(pid)) return;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return;
    }
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && processExists(pid)) await delay(100);
    if (processExists(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // The process may have exited between the checks.
      }
    }
  }

  private async onBrowserExit(): Promise<void> {
    if (this.stopping) return;
    this.record.status.state = "disconnected";
    this.record.status.errorCode = "browser_process_exited";
    await this.persist();
  }
}
