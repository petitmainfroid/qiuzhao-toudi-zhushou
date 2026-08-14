import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const skillRoot = path.join(root, 'skills', 'qiuzhao-recruitment-agent');
const setup = path.join(skillRoot, 'scripts', 'setup.ps1');
const verifier = path.join(skillRoot, 'scripts', 'verify-mcp.mjs');
const entry = path.join(root, 'modules', 'mcp-server', 'cli.mjs');
const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function runSetup(args, env) {
  return spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', setup, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true
  });
}

async function fakeClient(file, stateName) {
  await writeFile(file, `@echo off\r
setlocal\r
set "STATE=%QIUZHAO_FAKE_STATE%\\${stateName}.state"\r
set "LOG=%QIUZHAO_FAKE_STATE%\\${stateName}.log"\r
echo %*>>"%LOG%"\r
if "%1"=="mcp" if "%2"=="get" (\r
  if exist "%STATE%" (\r
    type "%STATE%"\r
    exit /b 0\r
  )\r
  exit /b 1\r
)\r
if "%1"=="mcp" if "%2"=="add" (\r
  echo %*> "%STATE%"\r
  exit /b 0\r
)\r
if "%1"=="mcp" if "%2"=="remove" (\r
  del /q "%STATE%" >nul 2>&1\r
  exit /b 0\r
)\r
exit /b 2\r
`, 'utf8');
}

async function isolatedEnvironment() {
  const directory = await mkdtemp(path.join(tmpdir(), 'qiuzhao-skill-test-'));
  const user = path.join(directory, 'user');
  const bin = path.join(directory, 'bin');
  const state = path.join(directory, 'state');
  await Promise.all([mkdir(user, { recursive: true }), mkdir(bin), mkdir(state)]);
  await Promise.all([
    fakeClient(path.join(bin, 'codex.cmd'), 'codex'),
    fakeClient(path.join(bin, 'claude.cmd'), 'claude')
  ]);
  return {
    directory,
    env: {
      ...process.env,
      USERPROFILE: user,
      LOCALAPPDATA: path.join(user, 'AppData', 'Local'),
      APPDATA: path.join(user, 'AppData', 'Roaming'),
      CODEX_HOME: path.join(user, '.codex'),
      CLAUDE_CONFIG_DIR: path.join(user, '.claude-config'),
      QIUZHAO_CLAUDE_SKILLS_HOME: path.join(user, '.claude', 'skills'),
      QIUZHAO_FAKE_STATE: state,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`
    },
    user,
    state
  };
}

test('cross-client setup installs, registers, reports, and removes without authorization', async () => {
  const isolated = await isolatedEnvironment();
  try {
    const install = runSetup([
      '-Action', 'Install', '-Client', 'All', '-ProjectRoot', root,
      '-SkipDependencies', '-SkipHandshake'
    ], isolated.env);
    assert.equal(install.status, 0, install.stderr || install.stdout);
    const result = JSON.parse(install.stdout);
    assert.equal(result.authorizationGranted, false);
    assert.equal(result.pageWrites, 0);
    assert.deepEqual(result.clients.map((client) => [client.client, client.registered]), [
      ['codex', true], ['claude', true]
    ]);

    const reinstall = runSetup([
      '-Action', 'Install', '-Client', 'All', '-ProjectRoot', root,
      '-SkipDependencies', '-SkipHandshake'
    ], isolated.env);
    assert.equal(reinstall.status, 0, reinstall.stderr || reinstall.stdout);
    const repeated = JSON.parse(reinstall.stdout);
    assert.ok(repeated.clients.every((client) => client.registration === 'already_registered'
      && client.configurationMatches));

    const codexLog = await readFile(path.join(isolated.state, 'codex.log'), 'utf8');
    const claudeLog = await readFile(path.join(isolated.state, 'claude.log'), 'utf8');
    assert.match(codexLog, /mcp add qiuzhao-recruitment-agent -- .*node\.exe"? .*modules\\mcp-server\\cli\.mjs serve/i);
    assert.match(claudeLog, /mcp add --scope user --transport stdio qiuzhao-recruitment-agent -- .*node\.exe"? .*modules\\mcp-server\\cli\.mjs serve/i);
    assert.equal((codexLog.match(/mcp add/g) ?? []).length, 1);
    assert.equal((claudeLog.match(/mcp add/g) ?? []).length, 1);

    const codexSkill = path.join(isolated.user, '.codex', 'skills', 'qiuzhao-recruitment-agent');
    const claudeSkill = path.join(isolated.user, '.claude', 'skills', 'qiuzhao-recruitment-agent');
    await Promise.all([
      readFile(path.join(codexSkill, 'SKILL.md'), 'utf8'),
      readFile(path.join(claudeSkill, 'SKILL.md'), 'utf8')
    ]);

    const remove = runSetup([
      '-Action', 'Remove', '-Client', 'All', '-ProjectRoot', root, '-RemoveSkill'
    ], isolated.env);
    assert.equal(remove.status, 0, remove.stderr || remove.stdout);
    const removed = JSON.parse(remove.stdout);
    assert.ok(removed.clients.every((client) => !client.registered && client.skillRemoved));
  } finally {
    await rm(isolated.directory, { recursive: true, force: true });
  }
});

test('setup refuses to overwrite an unmanaged same-name Skill', async () => {
  const isolated = await isolatedEnvironment();
  try {
    const destination = path.join(isolated.user, '.codex', 'skills', 'qiuzhao-recruitment-agent');
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, 'SKILL.md'), 'user-owned', 'utf8');
    const install = runSetup([
      '-Action', 'Install', '-Client', 'Codex', '-ProjectRoot', root,
      '-SkipDependencies', '-SkipHandshake'
    ], isolated.env);
    assert.notEqual(install.status, 0);
    assert.match(install.stderr, /existing_unmanaged_skill_requires_force/);
    const log = await readFile(path.join(isolated.state, 'codex.log'), 'utf8');
    assert.doesNotMatch(log, /mcp add/);
  } finally {
    await rm(isolated.directory, { recursive: true, force: true });
  }
});

test('setup refuses to overwrite an unknown same-name MCP registration', async () => {
  const isolated = await isolatedEnvironment();
  try {
    await writeFile(path.join(isolated.state, 'codex.state'), 'mcp add qiuzhao-recruitment-agent -- node C:\\unknown\\server.mjs serve', 'utf8');
    const install = runSetup([
      '-Action', 'Install', '-Client', 'Codex', '-ProjectRoot', root,
      '-SkipDependencies', '-SkipHandshake'
    ], isolated.env);
    assert.notEqual(install.status, 0);
    assert.match(install.stderr, /existing_mcp_registration_requires_force/);
    const state = await readFile(path.join(isolated.state, 'codex.state'), 'utf8');
    assert.match(state, /unknown\\server\.mjs/);
  } finally {
    await rm(isolated.directory, { recursive: true, force: true });
  }
});

test('bundled verifier completes a real stdio handshake with exactly six tools', async () => {
  const isolated = await mkdtemp(path.join(tmpdir(), 'qiuzhao-skill-handshake-'));
  try {
    const run = spawnSync(process.execPath, [verifier, entry], {
      cwd: root,
      env: { ...process.env, LOCALAPPDATA: path.join(isolated, 'local') },
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const result = JSON.parse(run.stdout);
    assert.equal(result.toolCount, 6);
    assert.deepEqual(result.tools, [
      'application_audit', 'application_execute', 'application_inspect',
      'application_plan', 'workflow_cancel', 'workspace_status'
    ]);
  } finally {
    await rm(isolated, { recursive: true, force: true });
  }
});
