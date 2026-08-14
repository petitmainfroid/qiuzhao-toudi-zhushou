import { createHash } from 'node:crypto';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const bossRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(bossRoot, '..');
const vendorRoot = path.join(bossRoot, 'vendor-bosshunter');
const manifestPath = path.join(bossRoot, 'upstream-snapshot.json');
const expectedCommit = '62d1ccea878932f4e98ff67eaa00d5302c7cdff4';

async function walk(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
    else throw new Error(`vendor snapshot contains a non-file entry: ${absolute}`);
  }
  return files;
}

async function describeFiles() {
  const paths = await walk(vendorRoot);
  return Promise.all(paths.map(async relative => {
    const absolute = path.join(vendorRoot, ...relative.split('/'));
    const bytes = await readFile(absolute);
    return {
      path: relative,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }));
}

async function scanRuntimeImports() {
  const roots = ['apps', 'modules', 'gerenxinxi', 'shared'];
  const offenders = [];
  for (const relativeRoot of roots) {
    const absoluteRoot = path.join(repositoryRoot, relativeRoot);
    const files = await walk(repositoryRoot, absoluteRoot);
    for (const relative of files) {
      if (!/\.(?:[cm]?js|tsx?|json)$/.test(relative)) continue;
      const content = await readFile(path.join(repositoryRoot, ...relative.split('/')), 'utf8');
      if (/vendor-bosshunter|boss\/vendor/i.test(content)) offenders.push(relative);
    }
  }
  return offenders;
}

const required = [
  'LICENSE',
  'README.md',
  'SKILL.md',
  'src/bosshunter/db.py',
  'src/bosshunter/scraper/jobs.py',
  'src/bosshunter/executor/sender.py',
  'src/bosshunter/executor/monitor.py',
  'src/bosshunter/browser/runtime/cdp-proxy.mjs',
  'src/bosshunter/web/tasks.py',
  'tests/test_browser_runtime.py',
];

const files = await describeFiles();
const byPath = new Map(files.map(file => [file.path, file]));
for (const relative of required) {
  if (!byPath.has(relative)) throw new Error(`vendor snapshot is missing required file: ${relative}`);
}

if (process.argv.includes('--write')) {
  const manifest = {
    schemaVersion: 1,
    repository: 'https://github.com/powerycy/BossHunter.git',
    commit: expectedCommit,
    license: 'BossHunter Non-Commercial License',
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.commit !== expectedCommit) throw new Error('snapshot commit does not match the frozen upstream commit');
if (manifest.license !== 'BossHunter Non-Commercial License') throw new Error('snapshot license marker is missing');
if (manifest.fileCount !== files.length) throw new Error(`snapshot file count drifted: ${manifest.fileCount} != ${files.length}`);
if (manifest.totalBytes !== files.reduce((sum, file) => sum + file.bytes, 0)) throw new Error('snapshot byte count drifted');

const recorded = new Map(manifest.files.map(file => [file.path, file]));
if (recorded.size !== byPath.size) throw new Error('snapshot path set drifted');
for (const [relative, actual] of byPath) {
  const expected = recorded.get(relative);
  if (!expected || expected.bytes !== actual.bytes || expected.sha256 !== actual.sha256) {
    throw new Error(`snapshot content drifted: ${relative}`);
  }
}

const license = await readFile(path.join(vendorRoot, 'LICENSE'), 'utf8');
if (!license.startsWith('BossHunter Non-Commercial License')) throw new Error('unexpected upstream LICENSE content');

const moduleMap = JSON.parse(await readFile(path.join(bossRoot, 'module-map.json'), 'utf8'));
if (moduleMap.upstreamCommit !== expectedCommit) throw new Error('module map uses a different upstream commit');
if (moduleMap.runtimeImportsVendor !== false) throw new Error('module map must prohibit runtime vendor imports');
if (!Array.isArray(moduleMap.modules) || moduleMap.modules.length !== 7) throw new Error('module map must contain seven target modules');
const moduleIds = new Set();
for (const module of moduleMap.modules) {
  if (!module.id || moduleIds.has(module.id)) throw new Error(`invalid or duplicate module id: ${module.id}`);
  moduleIds.add(module.id);
  await access(path.join(repositoryRoot, module.target, 'README.md'));
  for (const reference of module.upstreamReferences || []) {
    const found = byPath.has(reference) || files.some(file => file.path.startsWith(`${reference}/`));
    if (!found) throw new Error(`module ${module.id} references a missing upstream path: ${reference}`);
  }
}
for (const rejected of moduleMap.rejectedRuntimeReuse || []) {
  if (!byPath.has(rejected.path)) throw new Error(`rejected runtime reference is missing: ${rejected.path}`);
}
await access(path.join(bossRoot, 'REAL_OPERATION_ACCEPTANCE.md'));

const runtimeOffenders = await scanRuntimeImports();
if (runtimeOffenders.length) throw new Error(`product runtime imports or names vendor snapshot: ${runtimeOffenders.join(', ')}`);

console.log(`BossHunter 快照验证通过：${files.length} 个文件，提交 ${expectedCommit.slice(0, 8)}，正式运行引用 0 个。`);
