import { pathToFileURL } from 'node:url';
import { OrdinaryAuthorizationStore } from '../application-service/authorization-store.mjs';
import { createProductionApplicationService } from '../application-service/runtime-factory.mjs';
import { serveStdio } from './server.mjs';

function parseTtl(args) {
  const option = args.indexOf('--ttl-minutes');
  if (option < 0) return 10;
  const value = Number(args[option + 1]);
  if (!Number.isSafeInteger(value) || value < 1 || value > 30) throw new Error('ttl_minutes_must_be_1_to_30');
  return value;
}

export async function main(args = process.argv.slice(2)) {
  const command = args[0];
  if (command === 'serve') {
    const applicationService = await createProductionApplicationService();
    await serveStdio({ applicationService });
    return;
  }
  if (command === 'revoke') {
    await new OrdinaryAuthorizationStore().revoke();
    console.log(JSON.stringify({ authorization: 'revoked' }));
    return;
  }
  if (command !== 'status' && command !== 'authorize') {
    throw new Error('usage: cli.mjs <serve|status|authorize|revoke> [--ttl-minutes 1..30]');
  }
  const applicationService = await createProductionApplicationService();
  try {
    await applicationService.start();
    const status = await applicationService.workspaceStatus();
    if (command === 'status') {
      console.log(JSON.stringify(status));
      return;
    }
    if (status.browser.state !== 'ready' || status.profile.state !== 'ready' || !status.browser.origin) {
      throw new Error('browser_and_profile_must_be_ready');
    }
    const lease = await new OrdinaryAuthorizationStore().grant({
      origin: status.browser.origin,
      profileVersion: status.profile.profileVersion,
      ttlMs: parseTtl(args) * 60_000
    });
    console.log(JSON.stringify({
      authorization: 'active', scope: lease.scope, origin: lease.origin,
      profileVersion: lease.profileVersion, expiresAt: lease.expiresAt
    }));
  } finally {
    applicationService.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'mcp_cli_failed');
    process.exitCode = 1;
  });
}
