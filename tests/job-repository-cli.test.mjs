import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve('.');
async function cli(args) {
  const localAppData = await mkdtemp(path.join(os.tmpdir(), 'qiuzhao-job-cli-'));
  return spawnSync(process.execPath, ['apps/cli/qiuzhao.mjs', 'jobs', ...args], { cwd: root, env: { ...process.env, LOCALAPPDATA: localAppData }, encoding: 'utf8' });
}

test('jobs CLI exposes only closed repository commands', async () => {
  const invalid = await cli(['upsert', '--source', 'campus', '--url', 'https://jobs.example.com/1', '--title', '开发', '--company', '示例', '--description', 'JD', '--selector', '.unsafe']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unsupported option/);
  const known = await cli(['unknown']);
  assert.equal(known.status, 1);
  assert.match(known.stderr, /Unknown jobs command/);
});
