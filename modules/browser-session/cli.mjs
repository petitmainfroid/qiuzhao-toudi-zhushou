#!/usr/bin/env node
import { BrowserSessionManager } from './browser-session.mjs';
import { discoverBrowsers } from './browser-discovery.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const command = process.argv[2];
  if (command === 'discover') return print(await discoverBrowsers());
  const manager = new BrowserSessionManager({
    sessionFile: option('--session'),
    profileDir: option('--profile')
  });
  if (command === 'launch') return print(await manager.launch({ browserKind: option('--browser'), targetUrl: option('--url') }));
  if (command === 'reconnect') return print(await manager.reconnect({ targetUrl: option('--url') }));
  if (command === 'open') {
    const url = option('--url');
    if (!url) throw new Error('url_required');
    return print(await manager.openUrl(url));
  }
  if (command === 'search') {
    const query = option('--query');
    if (!query) throw new Error('query_required');
    const page = option('--page');
    return print(await manager.searchBossJobs({ query, city: option('--city'), ...(page ? { page: Number(page) } : {}) }));
  }
  if (command === 'tabs') return print(await manager.listTabs());
  if (command === 'attach') {
    const targetId = option('--target');
    if (!targetId) throw new Error('target_required');
    return print(await manager.attachTab(targetId));
  }
  if (command === 'confirm-ready') return print(await manager.confirmReady());
  if (command === 'status') return print(await manager.status());
  if (command === 'disconnect') return print(await manager.disconnect());
  if (command === 'stop') return print(await manager.stop());
  throw new Error('usage: cli.mjs <discover|launch|reconnect|open|search|tabs|attach|confirm-ready|status|disconnect|stop>');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'browser_session_failed'}\n`);
  process.exitCode = 1;
});
