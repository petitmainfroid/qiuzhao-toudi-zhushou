import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PAGE_VISION_SCHEMA_VERSION } from './contracts.mjs';

const CAPTURE_ID = /^vis_[0-9a-f-]{36}$/;

function manifestSummary(manifest, directory) {
  return {
    schemaVersion: manifest.schemaVersion,
    captureId: manifest.captureId,
    page: manifest.page,
    capturedAt: manifest.capturedAt,
    expiresAt: manifest.expiresAt,
    tileCount: manifest.tiles.length,
    totalBytes: manifest.totalBytes,
    warnings: manifest.warnings,
    directory,
    manifestPath: path.join(directory, 'manifest.json'),
    files: manifest.tiles.map((tile) => path.join(directory, tile.fileName))
  };
}

export class PageVisionStore {
  constructor(options = {}) {
    this.rootDir = path.resolve(options.rootDir ?? path.join(os.tmpdir(), 'qiuzhao-page-vision'));
    this.now = options.now ?? (() => Date.now());
  }

  async initialize() {
    await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const info = await lstat(this.rootDir);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('vision_temp_root_unsafe');
  }

  async begin({ page, options }) {
    await this.initialize();
    const captureId = `vis_${randomUUID()}`;
    const directory = this.#directory(captureId);
    await mkdir(directory, { mode: 0o700 });
    return { captureId, directory, page: structuredClone(page), options, tiles: [], totalBytes: 0 };
  }

  async writeTile(draft, index, bytes, extension, metadata) {
    if (!Buffer.isBuffer(bytes)) throw new Error('capture_bytes_invalid');
    const fileName = `tile-${String(index + 1).padStart(3, '0')}.${extension}`;
    writeFileSync(path.join(draft.directory, fileName), bytes, { flag: 'wx', mode: 0o600 });
    draft.tiles.push({ fileName, ...metadata, bytes: bytes.length });
    draft.totalBytes += bytes.length;
  }

  async finalize(draft, { viewport, scrollContext, warnings, capturedAt, expiresAt }) {
    const manifest = {
      schemaVersion: PAGE_VISION_SCHEMA_VERSION,
      captureId: draft.captureId,
      page: draft.page,
      capturedAt,
      expiresAt,
      format: draft.options.format,
      viewport,
      scrollContext,
      tiles: draft.tiles,
      totalBytes: draft.totalBytes,
      warnings
    };
    const temporary = path.join(draft.directory, 'manifest.json.tmp');
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, path.join(draft.directory, 'manifest.json'));
    return manifestSummary(manifest, draft.directory);
  }

  async status(captureId) {
    await this.initialize();
    if (captureId) return await this.#readSummary(captureId);
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    const captures = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !CAPTURE_ID.test(entry.name)) continue;
      try { captures.push(await this.#readSummary(entry.name)); } catch { /* Incomplete captures are private and omitted. */ }
    }
    return captures.sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
  }

  async cleanup(captureId) {
    const directory = this.#directory(captureId);
    let info;
    try { info = await lstat(directory); } catch (error) {
      if (error?.code === 'ENOENT') return { captureId, removed: false };
      throw error;
    }
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('capture_directory_unsafe');
    await rm(directory, { recursive: true, force: false });
    return { captureId, removed: true };
  }

  async cleanupExpired() {
    await this.initialize();
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !CAPTURE_ID.test(entry.name)) continue;
      const directory = this.#directory(entry.name);
      const info = await lstat(directory);
      if (info.isSymbolicLink()) continue;
      let expired = this.now() - info.mtimeMs > 60 * 60 * 1000;
      try {
        const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
        expired = Date.parse(manifest.expiresAt) <= this.now();
      } catch {
        // Incomplete captures receive a bounded one-hour recovery window.
      }
      if (expired) {
        await rm(directory, { recursive: true, force: false });
        removed += 1;
      }
    }
    return { removed };
  }

  async #readSummary(captureId) {
    const directory = this.#directory(captureId);
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('capture_directory_unsafe');
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    if (manifest.captureId !== captureId || manifest.schemaVersion !== PAGE_VISION_SCHEMA_VERSION
      || !Array.isArray(manifest.tiles)) throw new Error('capture_manifest_invalid');
    return manifestSummary(manifest, directory);
  }

  #directory(captureId) {
    if (!CAPTURE_ID.test(captureId)) throw new Error('invalid_capture_id');
    const directory = path.resolve(this.rootDir, captureId);
    if (path.dirname(directory) !== this.rootDir) throw new Error('invalid_capture_id');
    return directory;
  }
}
