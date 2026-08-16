import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserSessionManager } from '../browser-session/index.mjs';
import { CdpTargetSession } from '../browser-kernel/cdp-session.mjs';
import { normalizeCaptureOptions, samePageConnection } from './contracts.mjs';
import { PageVisionStore } from './capture-store.mjs';
import {
  buildScrollPlan,
  DISCOVER_SCROLL_CONTEXT_SOURCE,
  parseScrollContext,
  scrollExpression
} from './scroll-context.mjs';

function publicPage(connection) {
  return { origin: connection.origin, pathPattern: connection.pathPattern };
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export class PageVisionObserver {
  constructor(options = {}) {
    this.browserSession = options.browserSession ?? new BrowserSessionManager({ sessionFile: options.sessionFile });
    this.store = options.store ?? new PageVisionStore();
    this.cdpFactory = options.cdpFactory ?? ((connection) => new CdpTargetSession({
      port: connection.cdpPort,
      targetId: connection.targetId,
      expectedOrigin: connection.origin,
      expectedPath: connection.pathPattern
    }));
    this.delay = options.delay ?? delay;
    this.now = options.now ?? (() => Date.now());
  }

  async capture(input = {}) {
    const options = normalizeCaptureOptions(input);
    await this.store.cleanupExpired();
    const before = await this.browserSession.connection();
    const cdp = this.cdpFactory(before);
    const draft = await this.store.begin({ page: publicPage(before), options });
    let context;
    let restored = false;
    let captureError;
    try {
      await cdp.send('Page.enable');
      const discovered = await cdp.send('Runtime.evaluate', {
        expression: DISCOVER_SCROLL_CONTEXT_SOURCE,
        returnByValue: true,
        awaitPromise: false,
        silent: true
      });
      const parsed = parseScrollContext(discovered);
      context = parsed.context;
      const plan = buildScrollPlan(context, options);
      for (let index = 0; index < plan.positions.length; index += 1) {
        const requestedPosition = plan.positions[index];
        const scrolled = await cdp.send('Runtime.evaluate', {
          expression: scrollExpression(context, requestedPosition),
          returnByValue: true,
          awaitPromise: false,
          silent: true
        });
        const actualPosition = Number(scrolled?.result?.value);
        if (!Number.isSafeInteger(actualPosition) || actualPosition < 0 || actualPosition > 10_000_000) {
          throw new Error('scroll_position_invalid');
        }
        if (options.settleMs) await this.delay(options.settleMs);
        const parameters = {
          format: options.format,
          fromSurface: true,
          captureBeyondViewport: false,
          optimizeForSpeed: true,
          ...(options.format === 'jpeg' ? { quality: options.quality } : {})
        };
        const screenshot = await cdp.send('Page.captureScreenshot', parameters);
        if (typeof screenshot?.data !== 'string' || screenshot.data.length === 0) throw new Error('capture_data_missing');
        const bytes = Buffer.from(screenshot.data, 'base64');
        if (bytes.length > options.maxTileBytes) throw new Error('capture_tile_bytes_exceeded');
        if (draft.totalBytes + bytes.length > options.maxTotalBytes) throw new Error('capture_total_bytes_exceeded');
        await this.store.writeTile(draft, index, bytes, options.format === 'jpeg' ? 'jpg' : 'png', {
          requestedPosition,
          actualPosition,
          digest: digest(bytes)
        });
      }
      const after = await this.browserSession.connection();
      if (!samePageConnection(before, after)) throw new Error('page_identity_changed');
      const capturedAtMs = this.now();
      return await this.store.finalize(draft, {
        viewport: parsed.viewport,
        scrollContext: {
          kind: context.kind,
          clientWidth: context.clientWidth,
          clientHeight: context.clientHeight,
          scrollHeight: context.scrollHeight,
          originalScrollTop: context.scrollTop
        },
        warnings: plan.sampled ? ['tile_limit_sampling'] : [],
        capturedAt: new Date(capturedAtMs).toISOString(),
        expiresAt: new Date(capturedAtMs + options.ttlMs).toISOString()
      });
    } catch (error) {
      captureError = error;
      throw error;
    } finally {
      if (context) {
        try {
          const result = await cdp.send('Runtime.evaluate', {
            expression: scrollExpression(context, context.scrollTop),
            returnByValue: true,
            awaitPromise: false,
            silent: true
          });
          restored = Number(result?.result?.value) === context.scrollTop;
        } catch {
          restored = false;
        }
      }
      cdp.close();
      if (captureError || (context && !restored)) {
        await this.store.cleanup(draft.captureId).catch(() => undefined);
        if (!captureError && !restored) throw new Error('scroll_restore_failed');
      }
    }
  }

  async withCapture(callback, input = {}) {
    if (typeof callback !== 'function') throw new Error('capture_callback_required');
    const capture = await this.capture(input);
    try {
      return await callback(capture);
    } finally {
      await this.store.cleanup(capture.captureId);
    }
  }

  async status(captureId) {
    await this.store.cleanupExpired();
    return await this.store.status(captureId);
  }

  async cleanup(captureId) {
    return await this.store.cleanup(captureId);
  }
}
