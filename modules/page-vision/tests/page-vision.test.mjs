import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { PageVisionObserver, PageVisionStore } from '../index.mjs';

const CONNECTION = Object.freeze({
  launchId: 'launch-vision-test',
  cdpPort: 41700,
  targetId: 'target-private',
  origin: 'https://jobs.example.test',
  pathPattern: '/resume/:id/apply'
});

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl9sAAAAASUVORK5CYII=',
  'base64'
);

class FakeBrowserSession {
  constructor(connections = [CONNECTION, CONNECTION]) {
    this.connections = connections;
    this.calls = 0;
  }

  async connection() {
    const result = this.connections[Math.min(this.calls, this.connections.length - 1)];
    this.calls += 1;
    return structuredClone(result);
  }
}

class FakeCdp {
  constructor(options = {}) {
    this.calls = [];
    this.currentScroll = options.originalScroll ?? 123;
    this.tileBytes = options.tileBytes ?? ONE_PIXEL_PNG;
    this.scrollHeight = options.scrollHeight ?? 1300;
    this.clientHeight = options.clientHeight ?? 500;
    this.closed = false;
  }

  async send(method, params = {}) {
    this.calls.push({ method, params });
    if (method === 'Page.enable') return {};
    if (method === 'Runtime.evaluate' && params.expression.includes('__QIUZHAO_PAGE_VISION_DISCOVER__')) {
      return { result: { value: JSON.stringify({
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        context: {
          kind: 'document', index: -1, scrollTop: this.currentScroll,
          clientWidth: 1280, clientHeight: this.clientHeight, scrollHeight: this.scrollHeight
        }
      }) } };
    }
    if (method === 'Runtime.evaluate' && params.expression.includes('__QIUZHAO_PAGE_VISION_SCROLL__')) {
      const position = Number(params.expression.match(/"position":(\d+)/)?.[1]);
      this.currentScroll = position;
      return { result: { value: position } };
    }
    if (method === 'Page.captureScreenshot') return { data: this.tileBytes.toString('base64') };
    throw new Error(`unexpected_cdp_method:${method}`);
  }

  close() { this.closed = true; }
}

async function fixture(options = {}) {
  const testRoot = path.resolve(import.meta.dirname, '..', '..', '..', '.tmp');
  await mkdir(testRoot, { recursive: true });
  const temporary = await mkdtemp(path.join(testRoot, 'page-vision-test-'));
  let now = options.now ?? Date.UTC(2026, 7, 15, 8, 0, 0);
  const store = new PageVisionStore({ rootDir: path.join(temporary, 'captures'), now: () => now });
  const cdp = options.cdp ?? new FakeCdp(options);
  const browserSession = options.browserSession ?? new FakeBrowserSession();
  const observer = new PageVisionObserver({
    browserSession,
    store,
    cdpFactory: () => cdp,
    delay: async () => undefined,
    now: () => now
  });
  return {
    observer, store, cdp, browserSession, temporary,
    setNow(value) { now = value; },
    async cleanup() { await rm(temporary, { recursive: true, force: true }); }
  };
}

test('captures bounded overlapping tiles, restores scroll, and writes a privacy-safe manifest', async () => {
  const testCase = await fixture();
  try {
    const capture = await testCase.observer.capture({ format: 'png', settleMs: 0, ttlMs: 60_000 });
    assert.equal(capture.tileCount, 3);
    assert.equal(testCase.cdp.currentScroll, 123);
    assert.equal(testCase.cdp.closed, true);
    assert.equal(testCase.browserSession.calls, 2);
    const manifestText = await readFile(capture.manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText);
    assert.deepEqual(manifest.page, { origin: CONNECTION.origin, pathPattern: CONNECTION.pathPattern });
    assert.deepEqual(manifest.tiles.map((tile) => tile.requestedPosition), [0, 440, 800]);
    assert.equal(manifestText.includes(CONNECTION.targetId), false);
    assert.equal(manifestText.includes('cookie'), false);
    for (const file of capture.files) await access(file);
    assert.deepEqual(await testCase.observer.cleanup(capture.captureId), { captureId: capture.captureId, removed: true });
  } finally {
    await testCase.cleanup();
  }
});

test('page drift fails closed and removes all partial screenshots', async () => {
  const browserSession = new FakeBrowserSession([
    CONNECTION,
    { ...CONNECTION, targetId: 'different-target' }
  ]);
  const testCase = await fixture({ browserSession });
  try {
    await assert.rejects(() => testCase.observer.capture({ format: 'png', settleMs: 0 }), /page_identity_changed/);
    assert.deepEqual(await testCase.store.status(), []);
    assert.equal(testCase.cdp.currentScroll, 123);
  } finally {
    await testCase.cleanup();
  }
});

test('tile and total byte limits fail closed without retaining evidence', async () => {
  const testCase = await fixture({ tileBytes: Buffer.alloc(70 * 1024, 1) });
  try {
    await assert.rejects(() => testCase.observer.capture({
      settleMs: 0,
      format: 'png',
      maxTileBytes: 64 * 1024,
      maxTotalBytes: 64 * 1024
    }), /capture_tile_bytes_exceeded/);
    assert.deepEqual(await testCase.store.status(), []);
  } finally {
    await testCase.cleanup();
  }
});

test('withCapture removes private files when the model callback throws', async () => {
  const testCase = await fixture();
  try {
    let directory;
    await assert.rejects(() => testCase.observer.withCapture(async (capture) => {
      directory = capture.directory;
      await access(capture.files[0]);
      throw new Error('model_failed');
    }, { format: 'png', settleMs: 0 }), /model_failed/);
    await assert.rejects(() => access(directory), /ENOENT/);
    assert.deepEqual(await testCase.store.status(), []);
  } finally {
    await testCase.cleanup();
  }
});

test('expired captures are recovered on a later process call', async () => {
  const start = Date.UTC(2026, 7, 15, 8, 0, 0);
  const testCase = await fixture({ now: start });
  try {
    const capture = await testCase.observer.capture({ format: 'png', settleMs: 0, ttlMs: 60_000 });
    testCase.setNow(start + 60_001);
    assert.deepEqual(await testCase.store.cleanupExpired(), { removed: 1 });
    await assert.rejects(() => access(capture.directory), /ENOENT/);
  } finally {
    await testCase.cleanup();
  }
});

test('public options reject arbitrary script, selector, output path, and invalid capture ids', async () => {
  const testCase = await fixture();
  try {
    for (const input of [
      { script: 'document.cookie' },
      { selector: 'input' },
      { output: 'artifacts/private.png' }
    ]) {
      await assert.rejects(() => testCase.observer.capture(input), /invalid_capture_options/);
    }
    await assert.rejects(() => testCase.observer.cleanup('../escape'), /invalid_capture_id/);
    assert.equal(testCase.browserSession.calls, 0);
  } finally {
    await testCase.cleanup();
  }
});
