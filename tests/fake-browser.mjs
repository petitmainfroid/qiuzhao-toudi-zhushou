import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const profileArgument = process.argv.find((value) => value.startsWith('--user-data-dir='));
if (!profileArgument) throw new Error('fake_profile_missing');
const profileDir = profileArgument.slice('--user-data-dir='.length);
const initialUrl = process.argv.find((value) => /^https?:\/\//.test(value)) ?? 'about:blank';
let sequence = 1;
const targets = [{ id: `target-${sequence}`, type: 'page', url: initialUrl }];

const server = http.createServer((request, response) => {
  const pathname = request.url ?? '/';
  response.setHeader('Content-Type', 'application/json');
  if (pathname === '/json/version') return response.end(JSON.stringify({ Browser: 'FakeChrome/126.0.0.0', 'Protocol-Version': '1.3' }));
  if (pathname === '/json/list') return response.end(JSON.stringify(targets));
  if (request.method === 'PUT' && pathname.startsWith('/json/new?')) {
    sequence += 1;
    const target = { id: `target-${sequence}`, type: 'page', url: decodeURIComponent(pathname.slice('/json/new?'.length)) };
    targets.push(target);
    return response.end(JSON.stringify(target));
  }
  if (pathname.startsWith('/json/activate/')) {
    const id = pathname.slice('/json/activate/'.length);
    if (!targets.some((target) => target.id === id)) {
      response.statusCode = 404;
      return response.end(JSON.stringify({ error: 'missing' }));
    }
    return response.end(JSON.stringify({ activated: id }));
  }
  if (request.method === 'PUT' && pathname.startsWith('/test/navigate/')) {
    const [id, encodedUrl] = pathname.slice('/test/navigate/'.length).split('?url=');
    const target = targets.find((item) => item.id === id);
    if (!target || !encodedUrl) {
      response.statusCode = 404;
      return response.end(JSON.stringify({ error: 'missing' }));
    }
    target.url = decodeURIComponent(encodedUrl);
    return response.end(JSON.stringify(target));
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'not_found' }));
});

await mkdir(profileDir, { recursive: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('fake_listener_missing');
await writeFile(path.join(profileDir, 'DevToolsActivePort'), `${address.port}\n/devtools/browser/fake\n`);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
