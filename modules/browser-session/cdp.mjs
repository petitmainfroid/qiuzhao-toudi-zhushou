import http from 'node:http';
import { normalizePage } from './paths.mjs';

async function requestCdp(port, pathname, method = 'GET', timeoutMs = 2000) {
  return await new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path: pathname, method, timeout: timeoutMs },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          if (response.statusCode !== 200) return reject(new Error(`cdp_http_${response.statusCode ?? 'unknown'}`));
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      }
    );
    request.once('timeout', () => request.destroy(new Error('cdp_timeout')));
    request.once('error', reject);
    request.end();
  });
}

export async function requestCdpJson(port, pathname, method = 'GET', timeoutMs = 2000) {
  const body = await requestCdp(port, pathname, method, timeoutMs);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('cdp_invalid_json');
  }
}

export async function probeCdp(port) {
  const result = await requestCdpJson(port, '/json/version');
  if (typeof result.Browser !== 'string') throw new Error('cdp_browser_missing');
  return {
    browser: result.Browser,
    protocolVersion: result['Protocol-Version'],
    webSocketDebuggerUrl: result.webSocketDebuggerUrl
  };
}

export async function closeBrowserViaCdp(port, timeoutMs = 3000) {
  const info = await probeCdp(port);
  if (typeof info.webSocketDebuggerUrl !== 'string' || typeof WebSocket !== 'function') return false;
  return await new Promise((resolve) => {
    const socket = new WebSocket(info.webSocketDebuggerUrl);
    const timeout = setTimeout(() => {
      socket.close();
      resolve(false);
    }, timeoutMs);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    });
    socket.addEventListener('message', (event) => {
      try {
        if (JSON.parse(String(event.data)).id !== 1) return;
      } catch {
        return;
      }
      clearTimeout(timeout);
      socket.close();
      resolve(true);
    });
    socket.addEventListener('close', () => {
      clearTimeout(timeout);
      resolve(true);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

export async function listPageTargets(port) {
  const targets = await requestCdpJson(port, '/json/list');
  if (!Array.isArray(targets)) throw new Error('cdp_targets_invalid');
  return targets.flatMap((target) => {
    if (target?.type !== 'page' || typeof target.id !== 'string' || typeof target.url !== 'string') return [];
    try {
      const page = normalizePage(target.url);
      return [{ targetId: target.id, navigationUrl: page.navigationUrl, ...page.identity }];
    } catch {
      return [];
    }
  });
}

export async function openPageTarget(port, url) {
  const page = normalizePage(url);
  const target = await requestCdpJson(port, `/json/new?${encodeURIComponent(page.navigationUrl)}`, 'PUT');
  if (typeof target.id !== 'string') throw new Error('cdp_target_id_missing');
  return { targetId: target.id, ...page.identity };
}

export async function activatePageTarget(port, targetId) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetId)) throw new Error('invalid_target_id');
  await requestCdp(port, `/json/activate/${targetId}`);
  const target = (await listPageTargets(port)).find((candidate) => candidate.targetId === targetId);
  if (!target) throw new Error('target_tab_not_found');
  return target;
}

export async function findPageTarget(port, targetId) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetId)) throw new Error('invalid_target_id');
  const targets = await requestCdpJson(port, '/json/list');
  if (!Array.isArray(targets)) throw new Error('cdp_targets_invalid');
  const target = targets.find((candidate) =>
    candidate?.type === 'page' && candidate.id === targetId
  );
  if (!target || typeof target.url !== 'string' || typeof target.webSocketDebuggerUrl !== 'string') {
    throw new Error('target_tab_not_found');
  }
  const page = normalizePage(target.url);
  return {
    targetId,
    webSocketDebuggerUrl: target.webSocketDebuggerUrl,
    navigationUrl: page.navigationUrl,
    ...page.identity
  };
}
