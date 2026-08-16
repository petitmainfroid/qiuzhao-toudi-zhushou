import { freezeZhilianInventory } from './inventory.mjs';

// Internal-only orchestration: observePage is supplied by the fixed browser adapter,
// never by an MCP/client payload. It may return only already-devalued observations.
export async function observeZhilianInventory(request, { observePage, now = () => Date.now() } = {}) {
  if (typeof observePage !== 'function') throw new Error('zhilian_observer_unavailable');
  const startedAt = now();
  const observations = [];
  for (let page = 0; page < request.maxPages; page += 1) {
    if (now() - startedAt > request.deadlineMs) {
      observations.push({ kind: 'search', state: 'failed' });
      break;
    }
    const batch = await observePage(Object.freeze({ page: page + 1, maxCards: request.maxCards - observations.filter((item) => item.kind === 'search').length, maxDetails: request.maxDetails - observations.filter((item) => item.kind === 'detail').length }));
    if (!Array.isArray(batch)) throw new Error('zhilian_observer_result_invalid');
    observations.push(...batch);
    if (batch.some((item) => ['login_required', 'verification_required', 'page_drift'].includes(item?.state))) break;
    if (observations.filter((item) => item.kind === 'search').length >= request.maxCards) break;
  }
  return freezeZhilianInventory(request, observations);
}
