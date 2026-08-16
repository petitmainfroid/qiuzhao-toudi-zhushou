import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { defaultProfileApplicationRoot } from '../modules/application-service/runtime-factory.mjs';

test('profile page and Agent runtime share one local application profile root', () => {
  const env = { LOCALAPPDATA: path.join('C:\\', 'local-app-data') };
  assert.equal(
    defaultProfileApplicationRoot(env),
    path.join(env.LOCALAPPDATA, 'QiuzhaoRecruitmentAgent', 'yonghuxinxi', 'profile-data')
  );
});

test('profile-page status artifact contains process metadata only', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'qiuzhao-profile-page-'));
  const state = { schemaVersion: 1, pid: process.pid, port: 43210, origin: 'http://127.0.0.1:43210', startedAt: new Date(0).toISOString() };
  const filePath = path.join(directory, 'host.json');
  await writeFile(filePath, JSON.stringify(state));
  const serialized = await readFile(filePath, 'utf8');
  assert.equal(serialized.includes('profileValue'), false);
  assert.equal(serialized.includes('cookie'), false);
  assert.equal(serialized.includes('password'), false);
});
