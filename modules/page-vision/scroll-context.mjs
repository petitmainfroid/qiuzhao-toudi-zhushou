const MAX_SCROLL_DIMENSION = 10_000_000;

export const DISCOVER_SCROLL_CONTEXT_SOURCE = `(() => {
  /* __QIUZHAO_PAGE_VISION_DISCOVER__ */
  const viewport = {
    width: Math.max(1, Math.round(window.innerWidth || document.documentElement.clientWidth || 1)),
    height: Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || 1)),
    deviceScaleFactor: Math.max(1, Number(window.devicePixelRatio) || 1)
  };
  const nodes = Array.from(document.querySelectorAll('*'));
  const root = document.scrollingElement || document.documentElement;
  const describe = (element, kind, index) => ({
    kind,
    index,
    scrollTop: Math.max(0, Math.round(kind === 'document' ? window.scrollY : element.scrollTop || 0)),
    clientWidth: Math.max(1, Math.round(element.clientWidth || viewport.width)),
    clientHeight: Math.max(1, Math.round(element.clientHeight || viewport.height)),
    scrollHeight: Math.max(1, Math.round(element.scrollHeight || viewport.height))
  });
  const documentContext = describe(root, 'document', -1);
  const candidates = nodes.flatMap((element, index) => {
    if (element === root || element.scrollHeight <= element.clientHeight + 80 || element.clientHeight < 160) return [];
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0
      || rect.width < 240 || rect.height < 160 || rect.bottom <= 0 || rect.top >= viewport.height) return [];
    const context = describe(element, 'element', index);
    const range = context.scrollHeight - context.clientHeight;
    const score = range * Math.min(context.clientWidth, viewport.width);
    return [{ ...context, score }];
  }).sort((left, right) => right.score - left.score);
  const nested = candidates[0];
  const documentRange = documentContext.scrollHeight - documentContext.clientHeight;
  const nestedRange = nested ? nested.scrollHeight - nested.clientHeight : 0;
  const context = documentRange > 80 && (!nested || documentRange >= nestedRange * 0.6)
    ? documentContext
    : (nested || documentContext);
  return JSON.stringify({ viewport, context });
})()`;

function boundedInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(code);
  return value;
}

export function parseScrollContext(result) {
  let value;
  try {
    value = JSON.parse(result?.result?.value);
  } catch {
    throw new Error('scroll_context_invalid');
  }
  if (!value || typeof value !== 'object' || !value.viewport || !value.context) {
    throw new Error('scroll_context_invalid');
  }
  const viewport = {
    width: boundedInteger(value.viewport.width, 1, 8192, 'viewport_dimensions_invalid'),
    height: boundedInteger(value.viewport.height, 1, 8192, 'viewport_dimensions_invalid'),
    deviceScaleFactor: Number(value.viewport.deviceScaleFactor)
  };
  if (!Number.isFinite(viewport.deviceScaleFactor) || viewport.deviceScaleFactor < 1 || viewport.deviceScaleFactor > 4
    || viewport.width * viewport.deviceScaleFactor > 8192
    || viewport.height * viewport.deviceScaleFactor > 8192) {
    throw new Error('viewport_dimensions_invalid');
  }
  const context = {
    kind: value.context.kind,
    index: value.context.index,
    scrollTop: boundedInteger(value.context.scrollTop, 0, MAX_SCROLL_DIMENSION, 'scroll_context_invalid'),
    clientWidth: boundedInteger(value.context.clientWidth, 1, 8192, 'scroll_context_invalid'),
    clientHeight: boundedInteger(value.context.clientHeight, 1, 8192, 'scroll_context_invalid'),
    scrollHeight: boundedInteger(value.context.scrollHeight, 1, MAX_SCROLL_DIMENSION, 'scroll_context_invalid')
  };
  if (!['document', 'element'].includes(context.kind)
    || !Number.isSafeInteger(context.index) || context.index < -1 || context.index > 2_000_000
    || context.scrollHeight < context.clientHeight) {
    throw new Error('scroll_context_invalid');
  }
  return { viewport, context };
}

export function buildScrollPlan(context, { maxTiles, overlapRatio }) {
  const last = Math.max(0, context.scrollHeight - context.clientHeight);
  if (last === 0) return { positions: [0], sampled: false };
  const step = Math.max(160, Math.floor(context.clientHeight * (1 - overlapRatio)));
  const natural = [];
  for (let position = 0; position < last; position += step) natural.push(position);
  natural.push(last);
  const unique = [...new Set(natural)];
  if (unique.length <= maxTiles) return { positions: unique, sampled: false };
  const sampled = Array.from({ length: maxTiles }, (_, index) => Math.round(last * index / (maxTiles - 1)));
  return { positions: [...new Set(sampled)], sampled: true };
}

export function scrollExpression(context, position) {
  const payload = JSON.stringify({ kind: context.kind, index: context.index, position });
  return `(() => {
    /* __QIUZHAO_PAGE_VISION_SCROLL__ */
    const request = ${payload};
    const nodes = Array.from(document.querySelectorAll('*'));
    const target = request.kind === 'document'
      ? (document.scrollingElement || document.documentElement)
      : nodes[request.index];
    if (!target) throw new Error('scroll_context_stale');
    if (request.kind === 'document') window.scrollTo(0, request.position);
    else target.scrollTop = request.position;
    return request.kind === 'document' ? Math.round(window.scrollY) : Math.round(target.scrollTop || 0);
  })()`;
}
