import path from 'node:path';
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
    write: false,
    logLevel: 'silent',
    target: 'node22'
  });
  const url = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
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
