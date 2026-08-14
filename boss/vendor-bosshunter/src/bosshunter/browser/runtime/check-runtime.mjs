#!/usr/bin/env node
// BossHunter Browser Runtime standalone readiness check.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROXY_SCRIPT = path.join(ROOT, 'cdp-proxy.mjs');
const PROXY_PORT = Number(process.env.BOSSHUNTER_BROWSER_PROXY_PORT || process.env.CDP_PROXY_PORT || 3456);
const COMMON_PORTS = String(process.env.BOSSHUNTER_CHROME_PORTS || '9222,9229,9333')
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => value > 0 && value < 65536);

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  const version = `v${process.versions.node}`;
  if (major >= 22) console.log(`node: ok (${version})`);
  else console.log(`node: warn (${version}, Node.js 22+ recommended)`);
}

function checkPort(port, host = '127.0.0.1', timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host);
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, timeoutMs);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.once('error', () => { clearTimeout(timer); resolve(false); });
  });
}

function activePortFiles() {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || '';
  if (os.platform() === 'darwin') {
    return [
      path.join(home, 'Library/Application Support/Google/Chrome/DevToolsActivePort'),
      path.join(home, 'Library/Application Support/Chromium/DevToolsActivePort'),
    ];
  }
  if (os.platform() === 'linux') {
    return [
      path.join(home, '.config/google-chrome/DevToolsActivePort'),
      path.join(home, '.config/chromium/DevToolsActivePort'),
    ];
  }
  if (os.platform() === 'win32') {
    return [
      path.join(localAppData, 'Google/Chrome/User Data/DevToolsActivePort'),
      path.join(localAppData, 'Chromium/User Data/DevToolsActivePort'),
    ];
  }
  return [];
}

async function detectChromePort() {
  for (const filePath of activePortFiles()) {
    try {
      const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
      const port = parseInt(lines[0], 10);
      if (port > 0 && port < 65536 && await checkPort(port)) return port;
    } catch {}
  }
  for (const port of COMMON_PORTS) {
    if (await checkPort(port)) return port;
  }
  return null;
}

async function httpGetJson(url, timeoutMs = 3000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return JSON.parse(await response.text());
  } catch {
    return null;
  }
}

function startProxyDetached() {
  const logFile = path.join(os.tmpdir(), 'bosshunter-browser-runtime.log');
  const logFd = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [PROXY_SCRIPT], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, BOSSHUNTER_BROWSER_PROXY_PORT: String(PROXY_PORT) },
    ...(os.platform() === 'win32' ? { windowsHide: true } : {}),
  });
  child.unref();
  fs.closeSync(logFd);
  return logFile;
}

async function isBossHunterRuntime() {
  const health = await httpGetJson(`http://127.0.0.1:${PROXY_PORT}/health`);
  return health?.runtime === 'bosshunter';
}

async function ensureProxy() {
  const targetsUrl = `http://127.0.0.1:${PROXY_PORT}/targets`;
  const existing = await httpGetJson(targetsUrl);
  if (Array.isArray(existing) && await isBossHunterRuntime()) {
    console.log(`runtime: ready (http://127.0.0.1:${PROXY_PORT})`);
    return true;
  }

  console.log('runtime: starting...');
  const logFile = startProxyDetached();
  await new Promise((resolve) => setTimeout(resolve, 1500));

  for (let i = 1; i <= 15; i++) {
    const result = await httpGetJson(targetsUrl, 8000);
    if (Array.isArray(result) && await isBossHunterRuntime()) {
      console.log(`runtime: ready (http://127.0.0.1:${PROXY_PORT})`);
      return true;
    }
    if (i === 1) console.log('chrome: authorization may be pending; approve the Chrome prompt if shown');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`runtime: failed (log: ${logFile})`);
  return false;
}

async function main() {
  checkNode();
  const chromePort = await detectChromePort();
  if (!chromePort) {
    console.log('chrome: not connected');
    console.log('Open Chrome remote debugging or start Chrome with --remote-debugging-port=9222');
    process.exit(1);
  }
  console.log(`chrome: ok (port ${chromePort})`);

  if (!await ensureProxy()) process.exit(1);
}

await main();
