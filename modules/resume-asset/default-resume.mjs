import { createHash } from 'node:crypto';
import { mkdtemp, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const TEMPORARY_DIRECTORY_PREFIX = 'qiuzhao-resume-upload-';
const STALE_MATERIALIZATION_AGE_MS = 60_000;

export class DefaultResumeAssetError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DefaultResumeAssetError';
    this.code = code;
  }
}

function safeMetadata(value) {
  return Boolean(value
    && typeof value.name === 'string'
    && value.name.length > 0
    && value.name.length <= 180
    && value.name.toLowerCase().endsWith('.pdf')
    && !/[\\/\0]/.test(value.name)
    && value.mimeType === 'application/pdf'
    && Number.isSafeInteger(value.size)
    && value.size > 0
    && value.size <= MAX_RESUME_BYTES
    && typeof value.sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(value.sha256));
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export class DefaultResumeAsset {
  constructor({ resumeStore, temporaryRoot = tmpdir() }) {
    if (!resumeStore?.loadMetadata || !resumeStore?.load || !path.isAbsolute(temporaryRoot)) {
      throw new DefaultResumeAssetError('invalid_resume_asset');
    }
    this.resumeStore = resumeStore;
    this.temporaryRoot = path.resolve(temporaryRoot);
  }

  async getAgentSnapshot() {
    const metadata = await this.resumeStore.loadMetadata();
    if (metadata && !safeMetadata(metadata)) throw new DefaultResumeAssetError('invalid_resume');
    return Object.freeze({
      hasValue: Boolean(metadata),
      mimeType: 'application/pdf'
    });
  }

  async cleanupStaleMaterializations() {
    const trustedRoot = await realpath(this.temporaryRoot);
    const entries = await readdir(trustedRoot, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^qiuzhao-resume-upload-[A-Za-z0-9_-]{6,80}$/.test(entry.name)) continue;
      const candidate = path.join(trustedRoot, entry.name);
      let resolved;
      try {
        resolved = await realpath(candidate);
        const metadata = await stat(resolved);
        if (Date.now() - metadata.mtimeMs < STALE_MATERIALIZATION_AGE_MS) continue;
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        throw new DefaultResumeAssetError('resume_cleanup_failed');
      }
      if (!inside(trustedRoot, resolved)) throw new DefaultResumeAssetError('resume_cleanup_failed');
      try {
        await rm(resolved, { recursive: true, force: true, maxRetries: 30, retryDelay: 500 });
        removed += 1;
      } catch {
        throw new DefaultResumeAssetError('resume_cleanup_failed');
      }
    }
    return removed;
  }

  async withMaterializedFile(callback) {
    if (typeof callback !== 'function') throw new DefaultResumeAssetError('invalid_resume_callback');
    const saved = await this.resumeStore.load();
    if (!saved) throw new DefaultResumeAssetError('resume_missing');
    const bytesArePdf = saved?.bytes instanceof Uint8Array
      && saved.bytes.byteLength >= 5
      && String.fromCharCode(...saved.bytes.subarray(0, 5)) === '%PDF-';
    const digestMatches = saved?.bytes instanceof Uint8Array
      && createHash('sha256').update(saved.bytes).digest('hex') === saved.sha256;
    if (!safeMetadata(saved) || !(saved.bytes instanceof Uint8Array) || saved.bytes.byteLength !== saved.size
      || !bytesArePdf || !digestMatches) {
      saved.bytes?.fill?.(0);
      throw new DefaultResumeAssetError('invalid_resume');
    }

    let directory;
    try {
      const trustedRoot = await realpath(this.temporaryRoot);
      await this.cleanupStaleMaterializations();
      directory = await mkdtemp(path.join(trustedRoot, TEMPORARY_DIRECTORY_PREFIX));
      const trustedDirectory = await realpath(directory);
      if (!inside(trustedRoot, trustedDirectory)) throw new DefaultResumeAssetError('unsafe_temporary_path');
      const filePath = path.join(trustedDirectory, saved.name);
      await writeFile(filePath, saved.bytes, { flag: 'wx', mode: 0o600 });
      saved.bytes.fill(0);
      return await callback(Object.freeze({
        filePath,
        metadata: Object.freeze({ name: saved.name, mimeType: saved.mimeType, size: saved.size })
      }));
    } catch (error) {
      if (error instanceof DefaultResumeAssetError) throw error;
      throw new DefaultResumeAssetError('resume_materialization_failed');
    } finally {
      saved.bytes.fill(0);
      if (directory) {
        try {
          const trustedRoot = await realpath(this.temporaryRoot);
          const resolvedDirectory = path.resolve(directory);
          if (!inside(trustedRoot, resolvedDirectory)) throw new Error('unsafe_cleanup_path');
          await rm(resolvedDirectory, { recursive: true, force: true, maxRetries: 30, retryDelay: 500 });
        } catch {
          throw new DefaultResumeAssetError('resume_cleanup_failed');
        }
      }
    }
  }
}
