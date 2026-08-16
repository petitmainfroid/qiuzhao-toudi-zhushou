import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { DefaultResumeAsset } from '../modules/resume-asset/index.mjs';

function savedResume(bytes = new Uint8Array(Buffer.from('%PDF-1.7\nsynthetic resume'))) {
  return {
    name: 'default-resume.pdf',
    mimeType: 'application/pdf',
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    savedAt: '2026-08-14T00:00:00.000Z',
    bytes
  };
}

test('default resume snapshot exposes availability without filename, digest, path, or bytes', async () => {
  const stored = savedResume();
  const asset = new DefaultResumeAsset({
    resumeStore: {
      async loadMetadata() { const { bytes, ...metadata } = stored; return metadata; },
      async load() { return { ...stored, bytes: stored.bytes.slice() }; }
    }
  });
  const snapshot = await asset.getAgentSnapshot();
  assert.deepEqual(snapshot, { hasValue: true, mimeType: 'application/pdf' });
  assert.doesNotMatch(JSON.stringify(snapshot), /name|sha|path|byte|default-resume/i);
});

test('default resume materializes only inside a private temporary directory and always cleans it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qiuzhao-resume-asset-test-'));
  const stored = savedResume();
  const asset = new DefaultResumeAsset({
    temporaryRoot: root,
    resumeStore: {
      async loadMetadata() { const { bytes, ...metadata } = stored; return metadata; },
      async load() { return { ...stored, bytes: stored.bytes.slice() }; }
    }
  });
  try {
    const trustedRoot = await realpath(root);
    const result = await asset.withMaterializedFile(async ({ filePath, metadata }) => {
      assert.equal(path.dirname(filePath).startsWith(trustedRoot), true);
      assert.deepEqual(metadata, { name: stored.name, mimeType: stored.mimeType, size: stored.size });
      assert.deepEqual(new Uint8Array(await readFile(filePath)), stored.bytes);
      return 'verified';
    });
    assert.equal(result, 'verified');
    assert.deepEqual(await readdir(root), []);
    await assert.rejects(
      () => asset.withMaterializedFile(async () => { throw new Error('synthetic_callback_failure'); }),
      /resume_materialization_failed/
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('default resume rejects a missing or invalid saved asset before creating plaintext files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qiuzhao-resume-asset-missing-'));
  try {
    const missing = new DefaultResumeAsset({
      temporaryRoot: root,
      resumeStore: { async loadMetadata() { return null; }, async load() { return null; } }
    });
    await assert.rejects(() => missing.withMaterializedFile(async () => undefined), /resume_missing/);
    const invalid = savedResume();
    invalid.sha256 = '0'.repeat(64);
    const corrupted = new DefaultResumeAsset({
      temporaryRoot: root,
      resumeStore: {
        async loadMetadata() { const { bytes, ...metadata } = invalid; return metadata; },
        async load() { return { ...invalid, bytes: invalid.bytes.slice() }; }
      }
    });
    assert.deepEqual(await corrupted.getAgentSnapshot(), { hasValue: true, mimeType: 'application/pdf' });
    await assert.rejects(() => corrupted.withMaterializedFile(async () => undefined), /invalid_resume/);
    const invalidMetadata = new DefaultResumeAsset({
      temporaryRoot: root,
      resumeStore: { async loadMetadata() { return { ...invalid, name: '../resume.pdf' }; }, async load() { return null; } }
    });
    await assert.rejects(() => invalidMetadata.getAgentSnapshot(), /invalid_resume/);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stale materializations are removed while a recent concurrent directory is preserved', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qiuzhao-resume-asset-stale-'));
  const stale = path.join(root, 'qiuzhao-resume-upload-stale01');
  const recent = path.join(root, 'qiuzhao-resume-upload-recent01');
  await mkdir(stale);
  await mkdir(recent);
  await writeFile(path.join(stale, 'resume.pdf'), '%PDF-stale');
  const old = new Date(Date.now() - 120_000);
  await utimes(stale, old, old);
  const asset = new DefaultResumeAsset({
    temporaryRoot: root,
    resumeStore: { async loadMetadata() { return null; }, async load() { return null; } }
  });
  try {
    assert.equal(await asset.cleanupStaleMaterializations(), 1);
    assert.deepEqual(await readdir(root), ['qiuzhao-resume-upload-recent01']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
