import { parseJobCandidate } from '../job-repository/contracts.mjs';
import { DISCOVERY_BLOCKERS } from './contracts.mjs';

function privatePageResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('zhilian_adapter_result_invalid');
  if (value.blocker !== undefined) {
    if (!DISCOVERY_BLOCKERS.includes(value.blocker)) throw new Error('zhilian_adapter_blocker_invalid');
    return Object.freeze({ blocker: value.blocker, candidates: Object.freeze([]) });
  }
  if (!Array.isArray(value.candidates)) throw new Error('zhilian_adapter_result_invalid');
  return value;
}

function parsePrivateCandidate(value) {
  const candidate = parseJobCandidate({ ...value, source: 'zhilian' });
  const url = new URL(candidate.jobUrl);
  if (url.hostname !== 'www.zhaopin.com') throw new Error('zhilian_adapter_origin_invalid');
  return candidate;
}

function privateErrorBlocker(error) {
  const code = String(error?.message || '');
  if (code === 'page_drift' || code === 'page_identity_changed') return 'page_drift';
  if (['cdp_command_timeout', 'cdp_connect_timeout'].includes(code)) return 'rate_limited';
  if (['cdp_disconnected', 'cdp_connect_failed', 'target_tab_not_found'].includes(code)) return 'browser_disconnected';
  return undefined;
}

function stopped(candidates, blocker) {
  return Object.freeze({ candidates: Object.freeze([...candidates]), blocker, writes: 0, submissions: 0, credentialReads: 0 });
}

// readPage is a fixed private browser adapter dependency. It is deliberately not
// represented in any request/CLI/MCP schema and may never perform a page action.
export async function discoverZhilianCandidates(request, { readPage, now = () => Date.now() } = {}) {
  if (!request || request.source !== 'zhilian') throw new Error('zhilian_discovery_request_invalid');
  if (typeof readPage !== 'function') throw new Error('zhilian_adapter_unavailable');
  const startedAt = now();
  const byIdentity = new Map();
  for (let page = 1; page <= request.maxPages && byIdentity.size < request.maxCards; page += 1) {
    const elapsed = now() - startedAt;
    const deadlineMs = request.deadlineMs - elapsed;
    if (deadlineMs < 50) return stopped(byIdentity.values(), 'rate_limited');
    let rawResult;
    try {
      rawResult = await readPage(Object.freeze({
        page,
        remaining: request.maxCards - byIdentity.size,
        maxDetails: Math.min(request.maxDetails, request.maxCards - byIdentity.size),
        deadlineMs
      }));
    } catch (error) {
      const blocker = privateErrorBlocker(error);
      if (!blocker) throw error;
      return stopped(byIdentity.values(), blocker);
    }
    const result = privatePageResult(rawResult);
    if (now() - startedAt >= request.deadlineMs) return stopped(byIdentity.values(), 'rate_limited');
    if (result.blocker) return Object.freeze({ candidates: Object.freeze([...byIdentity.values()]), blocker: result.blocker, writes: 0, submissions: 0, credentialReads: 0 });
    for (const raw of result.candidates) {
      const candidate = parsePrivateCandidate(raw);
      if (!byIdentity.has(candidate.jobUrl)) byIdentity.set(candidate.jobUrl, candidate);
      if (byIdentity.size >= request.maxCards) break;
    }
    if (result.candidates.length === 0) break;
  }
  return Object.freeze({ candidates: Object.freeze([...byIdentity.values()]), blocker: undefined, writes: 0, submissions: 0, credentialReads: 0 });
}
