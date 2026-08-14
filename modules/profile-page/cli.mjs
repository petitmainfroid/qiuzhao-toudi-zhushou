import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultApplicationRoot } from '../application-service/authorization-store.mjs';
import { defaultProfileApplicationRoot } from '../application-service/runtime-factory.mjs';
import { discoverBrowsers } from '../browser-session/index.mjs';
import { loadBundledNodeModule } from '../browser-kernel/source-loader.mjs';

function stateFile(env = process.env) {
  return path.join(defaultApplicationRoot(env), 'profile-page', 'host.json');
}

async function readState(env = process.env) {
  try {
    const value = JSON.parse(await readFile(stateFile(env), 'utf8'));
    if (value?.schemaVersion === 1 && Number.isSafeInteger(value.pid) && Number.isSafeInteger(value.port)) return value;
  } catch {
    // No active profile host state.
  }
  return undefined;
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function writeState(value, env = process.env) {
  const filePath = stateFile(env);
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { flag: 'wx', mode: 0o600 });
  await rename(temporary, filePath);
}

async function removeState(env = process.env) {
  await unlink(stateFile(env)).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
}

async function openVisibleBrowser(url, env = process.env) {
  const browsers = await discoverBrowsers(env);
  const browser = browsers.find((entry) => entry.kind === 'chrome') ?? browsers.find((entry) => entry.kind === 'edge');
  if (!browser) throw new Error('chrome_or_edge_not_found');
  const child = spawn(browser.executablePath, [...(browser.commandPrefix ?? []), '--new-window', url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  child.unref();
}

async function serve(env = process.env) {
  const [hostModule, profileModule] = await Promise.all([
    loadBundledNodeModule('gerenxinxi/profile-host/src/index.ts'),
    loadBundledNodeModule('gerenxinxi/profile-service/src/index.ts')
  ]);
  const uiDirectory = path.resolve(import.meta.dirname, '..', '..', 'gerenxinxi', 'profile-host', 'dist-ui');
  await access(path.join(uiDirectory, 'index.html'));
  const handle = await hostModule.startLocalProfileEditor({
    appDataDirectory: defaultProfileApplicationRoot(env),
    uiDirectory,
    protector: new profileModule.WindowsDpapiProtector()
  });
  await writeState({ schemaVersion: 1, pid: process.pid, port: handle.port, origin: handle.origin, startedAt: new Date().toISOString() }, env);
  await openVisibleBrowser(handle.bootstrapUrl, env);
  const stop = async () => {
    handle.revoke();
    await handle.stop();
    await removeState(env);
  };
  process.once('SIGINT', () => void stop().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void stop().finally(() => process.exit(0)));
  await new Promise(() => undefined);
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const command = args[0] ?? 'status';
  if (command === 'serve') return serve(env);
  const current = await readState(env);
  if (command === 'status') {
    const active = Boolean(current && alive(current.pid));
    if (!active && current) await removeState(env);
    console.log(JSON.stringify({ state: active ? 'running' : 'stopped' }));
    return;
  }
  if (command === 'stop') {
    if (current && alive(current.pid)) process.kill(current.pid, 'SIGTERM');
    else await removeState(env);
    console.log(JSON.stringify({ state: 'stopping' }));
    return;
  }
  throw new Error('usage: cli.mjs <serve|status|stop>');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'profile_page_failed');
    process.exitCode = 1;
  });
}
