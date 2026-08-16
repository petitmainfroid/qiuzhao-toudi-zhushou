export const PAGE_VISION_SCHEMA_VERSION = 1;

export const PAGE_VISION_CDP_METHODS = Object.freeze([
  'Page.enable',
  'Runtime.evaluate',
  'Page.captureScreenshot'
]);

export const DEFAULT_CAPTURE_OPTIONS = Object.freeze({
  format: 'png',
  quality: 84,
  maxTiles: 24,
  maxTileBytes: 4 * 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  overlapRatio: 0.12,
  settleMs: 180,
  ttlMs: 15 * 60 * 1000
});

const OPTION_KEYS = new Set([
  'format',
  'quality',
  'maxTiles',
  'maxTileBytes',
  'maxTotalBytes',
  'overlapRatio',
  'settleMs',
  'ttlMs'
]);

function integer(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(code);
  return value;
}

export function normalizeCaptureOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_capture_options');
  if (Object.keys(input).some((key) => !OPTION_KEYS.has(key))) throw new Error('invalid_capture_options');
  const options = { ...DEFAULT_CAPTURE_OPTIONS, ...input };
  if (!['jpeg', 'png'].includes(options.format)) throw new Error('invalid_capture_format');
  integer(options.quality, 40, 95, 'invalid_capture_quality');
  integer(options.maxTiles, 1, 40, 'invalid_capture_tile_limit');
  integer(options.maxTileBytes, 64 * 1024, 6 * 1024 * 1024, 'invalid_capture_tile_bytes');
  integer(options.maxTotalBytes, options.maxTileBytes, 96 * 1024 * 1024, 'invalid_capture_total_bytes');
  integer(options.settleMs, 0, 1000, 'invalid_capture_settle_time');
  integer(options.ttlMs, 60 * 1000, 60 * 60 * 1000, 'invalid_capture_ttl');
  if (!Number.isFinite(options.overlapRatio) || options.overlapRatio < 0 || options.overlapRatio > 0.4) {
    throw new Error('invalid_capture_overlap');
  }
  if (options.format === 'png') delete options.quality;
  return Object.freeze(options);
}

export function samePageConnection(left, right) {
  return Boolean(
    left && right
    && left.launchId === right.launchId
    && left.cdpPort === right.cdpPort
    && left.targetId === right.targetId
    && left.origin === right.origin
    && left.pathPattern === right.pathPattern
  );
}
