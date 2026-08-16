import { requireExactKeys, requireEnum } from '../job-contracts/index.mjs';

const INVENTORY_STATES = Object.freeze([
  'candidate', 'login_required', 'verification_required', 'page_drift', 'manual_required', 'failed'
]);
const INVENTORY_KINDS = Object.freeze(['search', 'detail']);

function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) throw new Error(`${name} must be a bounded count`);
  return value;
}

// This fixed result boundary deliberately accepts no titles, URLs, DOM, screenshots,
// selectors, browser identifiers or values. Those remain private to the observer session.
export function parseZhilianInventoryObservation(input) {
  requireExactKeys(input, ['kind', 'state'], 'zhilianInventoryObservation');
  return Object.freeze({
    kind: requireEnum(input.kind, INVENTORY_KINDS, 'zhilianInventoryObservation.kind'),
    state: requireEnum(input.state, INVENTORY_STATES, 'zhilianInventoryObservation.state')
  });
}

export function freezeZhilianInventory(request, rawObservations) {
  if (!request || request.source !== 'zhilian') throw new Error('zhilian_inventory_request_invalid');
  if (!Array.isArray(rawObservations) || rawObservations.length > request.maxCards + request.maxDetails) {
    throw new Error('zhilian_inventory_budget_exceeded');
  }
  const observations = rawObservations.map(parseZhilianInventoryObservation);
  const searchCount = observations.filter((item) => item.kind === 'search').length;
  const detailCount = observations.filter((item) => item.kind === 'detail').length;
  if (searchCount > request.maxCards || detailCount > request.maxDetails) throw new Error('zhilian_inventory_budget_exceeded');
  const terminal = Object.fromEntries(INVENTORY_STATES.map((state) => [state, 0]));
  for (const item of observations) terminal[item.state] += 1;
  const annotated = observations.length;
  return Object.freeze({
    source: 'zhilian',
    annotated,
    searchCount,
    detailCount,
    terminal: Object.freeze(terminal),
    complete: Object.values(terminal).reduce((sum, value) => sum + value, 0) === annotated,
    writes: 0,
    submissions: 0,
    credentialReads: 0
  });
}
