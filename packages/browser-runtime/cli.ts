#!/usr/bin/env node
import { access } from "node:fs/promises";
import { callControl } from "./controlClient.js";
import { selectInstalledBrowser } from "./browserDiscovery.js";
import { defaultProfileDir, defaultSessionFile } from "./paths.js";
import { BrowserRuntime } from "./runtime.js";
import { readSession } from "./sessionStore.js";
import type { BrowserKind, BrowserRuntimeStatus } from "./types.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function browserKind(): BrowserKind | undefined {
  const value = option("--browser");
  if (value === undefined || value === "chrome" || value === "edge") return value;
  throw new Error("browser_must_be_chrome_or_edge");
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function sessionPath(): Promise<string> {
  return option("--session") ?? defaultSessionFile();
}

async function statusFallback(): Promise<BrowserRuntimeStatus> {
  const session = await readSession(await sessionPath());
  try {
    return await callControl(session, "GET", "/v1/status");
  } catch {
    return { ...session.status, state: "disconnected", errorCode: "control_unavailable" };
  }
}

async function run(): Promise<void> {
  const command = process.argv[2];
  if (command === "discover") {
    const { discoverInstalledBrowsers } = await import("./browserDiscovery.js");
    print(await discoverInstalledBrowsers());
    return;
  }

  if (command === "status") {
    print(await statusFallback());
    return;
  }

  if (command === "stop") {
    const session = await readSession(await sessionPath());
    print(await callControl(session, "POST", "/v1/stop"));
    return;
  }

  if (command !== "launch" && command !== "reconnect") {
    throw new Error(
      "usage: browser-runtime <discover|launch|reconnect|status|stop> [--browser chrome|edge] [--profile path] [--session path] [--url https://...]"
    );
  }

  const sessionFile = await sessionPath();
  if (command === "launch") {
    const browser = await selectInstalledBrowser(browserKind());
    const runtime = await BrowserRuntime.launch({
      browser,
      profileDir: option("--profile") ?? defaultProfileDir(browser.kind),
      sessionFile,
      targetUrl: option("--url")
    });
    print(runtime.getStatus());
    await runtime.waitUntilStopped();
    return;
  }

  const previous = await readSession(sessionFile);
  await access(previous.executablePath);
  if (!previous.status.browserPid || !previous.status.cdpPort) throw new Error("session_not_reconnectable");
  const runtime = await BrowserRuntime.adopt({
    browser: {
      kind: previous.status.browser,
      executablePath: previous.executablePath,
      source: "explicit",
      commandPrefix: previous.commandPrefix
    },
    profileDir: previous.status.profileDir,
    sessionFile,
    browserPid: previous.status.browserPid,
    cdpPort: previous.status.cdpPort,
    targetUrl: option("--url")
  });
  print(runtime.getStatus());
  await runtime.waitUntilStopped();
}

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "browser_runtime_failed"}\n`);
  process.exitCode = 1;
});
