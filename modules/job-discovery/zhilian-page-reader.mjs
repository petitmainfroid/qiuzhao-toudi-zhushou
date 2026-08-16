import { findPageTarget } from '../browser-session/cdp.mjs';
import { CdpTargetSession } from '../browser-kernel/cdp-session.mjs';

const MAX_PRIVATE_CARDS = 30;
const MAX_FIELD_LENGTH = 12_000;

// Serialized as fixed product code. It has no caller-provided selector/script and
// reads only public job-card presentation fields, never form values or storage.
export async function collectZhilianSearchCards(maxCards, maxDetails = 0) {
  const bounded = Number.isSafeInteger(maxCards) ? Math.max(1, Math.min(30, maxCards)) : 1;
  const detailBudget = Number.isSafeInteger(maxDetails) ? Math.max(0, Math.min(10, maxDetails, bounded)) : 0;
  const text = (value, maximum = 2000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximum);
  const visible = (element) => {
    if (!(element instanceof Element) || element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const allText = text(document.body?.innerText, 5000).toLowerCase();
  if (/(?:验证码|人机验证|安全验证|captcha|verification)/i.test(allText)) return { blocker: 'verification_required', candidates: [] };
  if (/\/(?:login|signin|passport)(?:\/|$)/i.test(location.pathname)) return { blocker: 'login_required', candidates: [] };
  const seen = new Set();
  const candidates = [];
  const links = Array.from(document.querySelectorAll('a[href]')).filter((link) => visible(link));
  for (const link of links) {
    let url;
    try { url = new URL(link.getAttribute('href'), location.origin); } catch { continue; }
    if (url.hostname !== 'www.zhaopin.com' || !/^\/jobdetail\/[^/]+\.htm$/i.test(url.pathname)) continue;
    url.protocol = 'https:';
    url.search = '';
    url.hash = '';
    if (seen.has(url.href)) continue;
    let card = link.closest('.joblist-box__item');
    if (!card) {
      card = link;
      for (let depth = 0; depth < 8 && card.parentElement; depth += 1) {
        card = card.parentElement;
        if (card.querySelectorAll('a[href*="/jobdetail/"]').length === 1
          && card.querySelector('a[href*="/companydetail/"]')) break;
      }
    }
    const title = text(link.innerText || link.textContent, 200);
    const companyLink = Array.from(card.querySelectorAll('a[href]')).find((item) => {
      const href = String(item.getAttribute('href') || '');
      return /company/i.test(href) && visible(item) && text(item.textContent, 200);
    });
    const company = text(companyLink?.innerText || companyLink?.textContent, 200);
    const summaryNodes = Array.from(card.querySelectorAll('.jobinfo__tag, .jobinfo__other-info'))
      .filter(visible).map((item) => text(item.textContent, 500)).filter(Boolean);
    const description = text([...new Set(summaryNodes)].join(' | '), 2000);
    if (!title || !company || !description) continue;
    seen.add(url.href);
    candidates.push({ jobUrl: url.href, title, company, description });
    if (candidates.length >= bounded) break;
  }
  try {
    const details = await Promise.all(candidates.slice(0, detailBudget).map(async (candidate) => {
      const response = await fetch(candidate.jobUrl, { credentials: 'omit', redirect: 'follow' });
      if (!response.ok) throw new Error('rate_limited');
      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const detail = text(parsed.querySelector('.describtion-card__detail-content')?.textContent, 12000);
      if (!detail) throw new Error('page_drift');
      return detail;
    }));
    for (let index = 0; index < details.length; index += 1) candidates[index].description = details[index];
  } catch (error) {
    return { blocker: error?.message === 'page_drift' ? 'page_drift' : 'rate_limited', candidates: [] };
  }
  return { candidates };
}

function parsePrivateResult(value, maximum) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('zhilian_reader_result_invalid');
  const keys = Object.keys(value).sort().join('|');
  if (keys === 'blocker|candidates') {
    if (!['login_required', 'verification_required'].includes(value.blocker) || !Array.isArray(value.candidates) || value.candidates.length) {
      throw new Error('zhilian_reader_result_invalid');
    }
    return Object.freeze({ blocker: value.blocker, candidates: Object.freeze([]) });
  }
  if (keys !== 'candidates' || !Array.isArray(value.candidates) || value.candidates.length > maximum) throw new Error('zhilian_reader_result_invalid');
  const candidates = value.candidates.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
      || Object.keys(candidate).sort().join('|') !== 'company|description|jobUrl|title') throw new Error('zhilian_reader_result_invalid');
    for (const key of ['jobUrl', 'title', 'company', 'description']) {
      if (typeof candidate[key] !== 'string' || !candidate[key].trim() || candidate[key].length > (key === 'description' ? MAX_FIELD_LENGTH : 2048)) {
        throw new Error('zhilian_reader_result_invalid');
      }
    }
    return Object.freeze({ ...candidate });
  });
  return Object.freeze({ candidates: Object.freeze(candidates) });
}

export class ZhilianPageReader {
  constructor({ connection, cdpFactory = (target) => new CdpTargetSession({
    port: target.cdpPort, targetId: target.targetId,
    expectedOrigin: target.origin, expectedPath: target.pathPattern
  }), findTarget = findPageTarget } = {}) {
    if (!connection || connection.origin !== 'https://www.zhaopin.com' || !/^\/sou\//.test(connection.pathPattern)) {
      throw new Error('zhilian_reader_page_invalid');
    }
    this.connection = connection;
    this.cdp = cdpFactory(connection);
    this.findTarget = findTarget;
  }

  async readPage({ page, remaining, maxDetails = 0, deadlineMs = 10_000 }) {
    if (page !== 1) return Object.freeze({ candidates: Object.freeze([]) });
    if (!Number.isSafeInteger(remaining) || remaining < 1 || remaining > MAX_PRIVATE_CARDS) throw new Error('zhilian_reader_budget_invalid');
    if (!Number.isSafeInteger(maxDetails) || maxDetails < 0 || maxDetails > 10 || maxDetails > remaining) throw new Error('zhilian_reader_budget_invalid');
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 50 || deadlineMs > 120_000) throw new Error('zhilian_reader_budget_invalid');
    const before = await this.findTarget(this.connection.cdpPort, this.connection.targetId);
    if (before.origin !== this.connection.origin || before.pathPattern !== this.connection.pathPattern) throw new Error('page_drift');
    try {
      const response = await this.cdp.send('Runtime.evaluate', {
        expression: `(${collectZhilianSearchCards.toString()})(${remaining}, ${maxDetails})`,
        returnByValue: true,
        awaitPromise: true
      }, Math.min(10_000, deadlineMs));
      const result = parsePrivateResult(response?.result?.value, remaining);
      const after = await this.findTarget(this.connection.cdpPort, this.connection.targetId);
      if (after.origin !== before.origin || after.pathPattern !== before.pathPattern) throw new Error('page_drift');
      return result;
    } finally {
      this.cdp.close();
    }
  }
}
