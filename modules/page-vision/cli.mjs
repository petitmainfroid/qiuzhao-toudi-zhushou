#!/usr/bin/env node
import { PageVisionObserver } from './index.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function numberOption(name, transform = Number) {
  const value = option(name);
  return value === undefined ? undefined : transform(value);
}

function captureOptions() {
  return Object.fromEntries(Object.entries({
    format: option('--format'),
    quality: numberOption('--quality'),
    maxTiles: numberOption('--max-tiles'),
    ttlMs: numberOption('--ttl-minutes', (value) => Number(value) * 60 * 1000)
  }).filter(([, value]) => value !== undefined));
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  return [
    'usage: qiuzhao vision <capture|status|cleanup|cleanup-expired>',
    '',
    '  capture [--format jpeg|png] [--quality 40..95] [--max-tiles 1..40] [--ttl-minutes 1..60]',
    '  status [--capture vis_...]',
    '  cleanup --capture vis_...',
    '  cleanup-expired',
    '',
    'Screenshots are private temporary files. Run cleanup after the local model finishes reading them.'
  ].join('\n');
}

async function main() {
  const command = process.argv[2];
  if (!command || ['help', '--help', '-h'].includes(command)) return process.stdout.write(`${usage()}\n`);
  const observer = new PageVisionObserver({ sessionFile: option('--session') });
  if (command === 'capture') return print(await observer.capture(captureOptions()));
  if (command === 'status') return print(await observer.status(option('--capture')));
  if (command === 'cleanup') {
    const captureId = option('--capture');
    if (!captureId) throw new Error('capture_id_required');
    return print(await observer.cleanup(captureId));
  }
  if (command === 'cleanup-expired') return print(await observer.store.cleanupExpired());
  throw new Error(usage());
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'page_vision_failed'}\n`);
  process.exitCode = 1;
});
