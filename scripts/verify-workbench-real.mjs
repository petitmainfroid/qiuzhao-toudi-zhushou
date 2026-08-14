import { createWorkbenchServer } from '../modules/workbench/cli.mjs';

const host = await createWorkbenchServer();
try {
  const bootstrap = await fetch(host.url, { redirect: 'manual' });
  const cookie = bootstrap.headers.get('set-cookie');
  const page = await fetch(new URL('/', host.url), { headers: { Cookie: cookie ?? '' } });
  process.stdout.write(`${JSON.stringify({ bootstrap: bootstrap.status, page: page.status, session: Boolean(cookie) })}\n`);
} finally {
  await host.close();
}
