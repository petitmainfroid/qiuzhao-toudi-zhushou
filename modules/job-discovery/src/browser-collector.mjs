import { createHash } from 'node:crypto';

const MAX_VISIBLE_CARDS = 50;
const MAX_CARD_TEXT = 2_400;

// Fixed product code: no Agent-supplied selector or page script is accepted.
const COLLECT_VISIBLE_BOSS_CARDS = `function qiuzhaoCollectVisibleBossCards() {
  const clean = (value, limit) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, limit);
  const lines = (value) => String(value || '').split(/\\n+/).map((line) => clean(line, 256)).filter(Boolean);
  if (location.origin !== 'https://www.zhipin.com' || !/^\\/web\\/geek\\/jobs?$/.test(location.pathname)) return { kind: 'blocked', reason: 'page_drift', cards: [] };
  const cards = []; const seen = new Set();
  for (const anchor of document.querySelectorAll('a[href]')) {
    if (cards.length >= 50) break;
    let href; try { href = new URL(anchor.href, location.href); } catch { continue; }
    if (href.origin !== location.origin || !/^(?:\\/job_detail\\/|\\/c\\d{4,}-p\\d{4,})/.test(href.pathname) || seen.has(href.pathname)) continue;
    let container = anchor;
    for (let level = 0; level < 5 && container.parentElement; level += 1) {
      const next = container.parentElement; const text = clean(next.innerText, 2400);
      if (text.length >= 12 && text.length <= 2400) { container = next; break; }
      container = next;
    }
    const visibleLines = lines(container.innerText).slice(0, 24);
    const title = clean(anchor.getAttribute('aria-label') || anchor.innerText || visibleLines[0], 256);
    if (!title) continue;
    seen.add(href.pathname);
    cards.push({ title, company: clean(visibleLines[1] || '', 256) || 'Unknown', location: clean(visibleLines.find((line) => /(?:市|区|县|远程|北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|厦门|天津|重庆)/.test(line)) || '', 256) || 'Unknown', description: clean(visibleLines.join(' '), 2400), path: href.pathname, sourceJobRef: href.pathname });
  }
  return { kind: 'ok', cards };
}`;

function safeText(value, max) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function safePath(value) {
  if (typeof value !== 'string' || /[?#]/.test(value)) return undefined;
  if (/^\/c\d{4,}-p\d{4,}\/?$/.test(value)) return value;
  if (/^\/job_detail\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(value)) return value;
  return undefined;
}

export async function collectVisibleBossCards({ cdp, connection }) {
  if (!cdp || connection?.origin !== 'https://www.zhipin.com' || connection?.pathPattern !== '/web/geek/job') return Object.freeze({ kind: 'blocked', reason: 'page_drift', cards: Object.freeze([]) });
  const result = await cdp.send('Runtime.evaluate', { expression: `(${COLLECT_VISIBLE_BOSS_CARDS})()`, returnByValue: true, awaitPromise: false, userGesture: false, silent: true });
  const value = result?.result?.value;
  if (!value || typeof value !== 'object' || value.kind !== 'ok' || !Array.isArray(value.cards)) return Object.freeze({ kind: 'blocked', reason: value?.reason === 'page_drift' ? 'page_drift' : 'site_policy', cards: Object.freeze([]) });
  const unique = new Map();
  for (const item of value.cards.slice(0, MAX_VISIBLE_CARDS)) {
    const path = safePath(item?.path); const title = safeText(item?.title, 256); const sourceJobRef = safeText(item?.sourceJobRef, 512);
    if (!path || !title || !sourceJobRef || unique.has(`${path}|${sourceJobRef}`)) continue;
    unique.set(`${path}|${sourceJobRef}`, Object.freeze({ title, company: safeText(item?.company, 256) || 'Unknown', location: safeText(item?.location, 256) || 'Unknown', description: safeText(item?.description, MAX_CARD_TEXT), path, sourceJobRef: `boss_${createHash('sha256').update(`${path}|${sourceJobRef}`).digest('hex').slice(0, 32)}` }));
  }
  return Object.freeze({ kind: 'ok', cards: Object.freeze([...unique.values()]) });
}

export async function diagnoseVisibleBossStructure({ cdp, connection }) {
  if (!cdp || connection?.origin !== 'https://www.zhipin.com' || connection?.pathPattern !== '/web/geek/job') {
    return Object.freeze({ kind: 'blocked', reason: 'page_drift' });
  }
  const expression = `(() => {
    if (location.origin !== 'https://www.zhipin.com' || !/^\\/web\\/geek\\/jobs?$/.test(location.pathname)) return { kind: 'blocked', reason: 'page_drift' };
    const prefixes = new Map(); const shapes = new Set(); let anchors = 0;
    for (const node of document.querySelectorAll('a[href]')) { try { const url = new URL(node.href, location.href); if (url.origin !== location.origin) continue; anchors += 1; const prefix = url.pathname.split('/').slice(0, 3).join('/') || '/'; prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1); if (/^\\/c\\d+-p\\d+/.test(url.pathname)) shapes.add(url.pathname.replace(/\\d+/g, ':id').slice(0, 120)); } catch {} }
    return { kind: 'ok', anchors, prefixes: [...prefixes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([path, count]) => ({ path: path.replace(/\\d{4,}/g, ':id'), count })), shapes: [...shapes].slice(0, 12) };
  })()`;
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false, userGesture: false, silent: true });
  const value = result?.result?.value;
  if (!value || typeof value !== 'object' || value.kind !== 'ok' || !Number.isSafeInteger(value.anchors) || !Array.isArray(value.prefixes) || !Array.isArray(value.shapes)) return Object.freeze({ kind: 'blocked', reason: 'site_policy' });
  const prefixes = value.prefixes.filter((entry) => entry && typeof entry.path === 'string' && /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,120}$/.test(entry.path) && Number.isSafeInteger(entry.count) && entry.count >= 0 && entry.count <= 10000).slice(0, 12);
  const shapes = value.shapes.filter((shape) => typeof shape === 'string' && /^\/c:id-p:id(?:\/[A-Za-z._-]{1,60})?\/?$/.test(shape)).slice(0, 12);
  return Object.freeze({ kind: 'ok', anchors: value.anchors, prefixes: Object.freeze(prefixes), shapes: Object.freeze(shapes) });
}

export function discoveryManifest({ observedCount, recordCount, createdCount, refreshedCount }) {
  const counts = { observedCount, recordCount, createdCount, refreshedCount };
  return Object.freeze({ schemaVersion: 1, source: 'boss', mode: 'visible-read-only', counts, digest: createHash('sha256').update(JSON.stringify(counts)).digest('hex') });
}
