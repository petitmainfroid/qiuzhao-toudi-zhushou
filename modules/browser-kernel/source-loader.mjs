import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const sourceCache = new Map();

export async function loadBundledModule(relativeFile) {
  const key = `module:${relativeFile}`;
  if (sourceCache.has(key)) return sourceCache.get(key);
  const absolute = path.resolve(import.meta.dirname, '..', '..', relativeFile);
  const bundled = await build({
    entryPoints: [absolute],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
    target: 'es2022'
  });
  const url = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
  const promise = import(url);
  sourceCache.set(key, promise);
  return await promise;
}

export async function loadBundledNodeModule(relativeFile) {
  const key = `node-module:${relativeFile}`;
  if (sourceCache.has(key)) return sourceCache.get(key);
  const absolute = path.resolve(import.meta.dirname, '..', '..', relativeFile);
  const bundled = await build({
    entryPoints: [absolute],
    bundle: true,
    format: 'esm',
    platform: 'node',
    external: ['pdfjs-dist/*'],
    write: false,
    logLevel: 'silent',
    target: 'node22'
  });
  const source = bundled.outputFiles[0].text;
  const cacheRoot = path.resolve(import.meta.dirname, '..', '..', 'node_modules', '.cache', 'qiuzhao-node-modules');
  const fileName = `${createHash('sha256').update(source).digest('hex')}.mjs`;
  const cacheFile = path.join(cacheRoot, fileName);
  await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
  try {
    await writeFile(cacheFile, source, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  const url = pathToFileURL(cacheFile).href;
  const promise = import(url);
  sourceCache.set(key, promise);
  return await promise;
}

export async function loadExportedFunctionSource(relativeFile, exportName) {
  const key = `${relativeFile}:${exportName}`;
  if (sourceCache.has(key)) return sourceCache.get(key);
  const module = await loadBundledModule(relativeFile);
  const value = module[exportName];
  if (typeof value !== 'function') throw new Error('kernel_source_export_missing');
  const functionSource = value.toString();
  sourceCache.set(key, functionSource);
  return functionSource;
}
