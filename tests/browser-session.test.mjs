import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BrowserSessionManager } from '../modules/browser-session/browser-session.mjs';
import { openPageTarget } from '../modules/browser-session/cdp.mjs';
import { prepareDedicatedProfile } from '../modules/browser-session/paths.mjs';
import { readSession, writeSession } from '../modules/browser-session/session-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeBrowser = path.join(here, 'fake-browser.mjs');
const xiaomiUrl = 'https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply?tracking=private';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'qiuzhao-yonghuxinxi-'));
  const profileDir = path.join(root, 'profile');
  const sessionFile = path.join(root, 'session.json');
  const manager = new BrowserSessionManager({
    profileDir,
    sessionFile,
    browser: {
      kind: 'chrome',
      executablePath: process.execPath,
      commandPrefix: [fakeBrowser],
      defaultDataDirs: [path.join(root, 'default-profile')]
    },
    startupTimeoutMs: 5000,
    pollIntervalMs: 20,
    detach: false
  });
  return { root, profileDir, sessionFile, manager };
}

async function navigateFake(port, targetId, url) {
  await new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, method: 'PUT', path: `/test/navigate/${targetId}?url=${encodeURIComponent(url)}` },
      (response) => {
        response.resume();
        response.on('end', () => response.statusCode === 200 ? resolve() : reject(new Error(`fake_http_${response.statusCode}`)));
      }
    );
    request.once('error', reject);
    request.end();
  });
}

test('Agent opens a real URL identity in a dedicated persistent profile and reconnects', async () => {
  const context = await fixture();
  try {
    const launched = await context.manager.launch({ targetUrl: xiaomiUrl });
    assert.equal(launched.state, 'login-needed');
    assert.deepEqual(launched.selectedTab, {
      targetId: 'target-1',
      origin: 'https://xiaomi.jobs.f.mioffice.cn',
      pathPattern: '/internship/resume/:id/apply',
      entry: 'agent-opened'
    });
    assert.equal('profileDir' in launched, false);
    const markerBefore = JSON.parse(await readFile(path.join(context.profileDir, '.qiuzhao-profile.json'), 'utf8'));
    assert.equal((await context.manager.confirmReady()).state, 'ready');
    await context.manager.disconnect();
    const restartedApp = new BrowserSessionManager({
      profileDir: context.profileDir,
      sessionFile: context.sessionFile,
      startupTimeoutMs: 5000,
      pollIntervalMs: 20,
      detach: false
    });
    const reconnected = await restartedApp.reconnect();
    assert.equal(reconnected.state, 'ready');
    assert.equal(reconnected.readyConfirmed, true);
    assert.equal(reconnected.profileId, launched.profileId);
    const markerAfter = JSON.parse(await readFile(path.join(context.profileDir, '.qiuzhao-profile.json'), 'utf8'));
    assert.equal(markerAfter.profileId, markerBefore.profileId);
    await restartedApp.stop();
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('user-opened tabs can be listed and explicitly attached through the same session', async () => {
  const context = await fixture();
  try {
    await context.manager.launch();
    const privateSession = await readSession(context.sessionFile);
    const userTarget = await openPageTarget(privateSession.cdpPort, 'https://app.mokahr.com/campus_apply/huya/4112#/candidateHome/resume');
    assert.ok((await context.manager.listTabs()).some((tab) => tab.targetId === userTarget.targetId));
    const attached = await context.manager.attachTab(userTarget.targetId);
    assert.equal(attached.state, 'login-needed');
    assert.equal(attached.selectedTab.entry, 'user-opened');
    assert.equal(attached.selectedTab.origin, 'https://app.mokahr.com');
    assert.equal(attached.selectedTab.pathPattern, '/campus_apply/huya/4112#/candidateHome/resume');
    await assert.rejects(() => context.manager.attachTab('missing'), /target_tab_not_found/);
    await context.manager.stop();
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('login redirects stay login-needed until the selected tab returns to the requested real page', async () => {
  const context = await fixture();
  try {
    const launched = await context.manager.launch({ targetUrl: xiaomiUrl });
    const privateSession = await readSession(context.sessionFile);
    await navigateFake(privateSession.cdpPort, launched.selectedTab.targetId, 'https://xiaomi.jobs.f.mioffice.cn/internship/login');
    const reconnected = await context.manager.reconnect();
    assert.equal(reconnected.state, 'login-needed');
    assert.equal(reconnected.selectedTab.pathPattern, '/internship/login');
    assert.equal(reconnected.requestedPage.pathPattern, '/internship/resume/:id/apply');
    await assert.rejects(() => context.manager.confirmReady(), /selected_page_changed/);
    await navigateFake(privateSession.cdpPort, launched.selectedTab.targetId, xiaomiUrl);
    assert.equal((await context.manager.confirmReady()).state, 'ready');
    await context.manager.stop();
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('a stopped browser relaunches the query-free target with the same persistent profile', async () => {
  const context = await fixture();
  try {
    const first = await context.manager.launch({ targetUrl: xiaomiUrl });
    const firstSession = await readSession(context.sessionFile);
    await context.manager.stop();
    const restartedApp = new BrowserSessionManager({
      profileDir: context.profileDir,
      sessionFile: context.sessionFile,
      startupTimeoutMs: 5000,
      pollIntervalMs: 20,
      detach: false
    });
    const relaunched = await restartedApp.reconnect();
    assert.equal(relaunched.profileId, first.profileId);
    assert.equal(relaunched.state, 'login-needed');
    assert.equal(relaunched.selectedTab.origin, 'https://xiaomi.jobs.f.mioffice.cn');
    assert.equal(relaunched.selectedTab.pathPattern, '/internship/resume/:id/apply');
    const secondSession = await readSession(context.sessionFile);
    assert.equal(secondSession.requestedNavigationUrl.includes('?'), false);
    assert.equal(secondSession.requestedNavigationUrl, firstSession.requestedNavigationUrl);
    await restartedApp.stop();
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('a mismatched CDP endpoint is rejected before tabs are listed or attached', async () => {
  const context = await fixture();
  try {
    await context.manager.launch();
    const session = await readSession(context.sessionFile);
    session.cdpPort = session.cdpPort === 65535 ? 65534 : session.cdpPort + 1;
    await writeSession(context.sessionFile, session);
    await assert.rejects(() => context.manager.listTabs(), /cdp_endpoint_changed/);
    if (session.browserPid) process.kill(session.browserPid);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('public session evidence omits credentials, query strings, and raw profile paths', async () => {
  const context = await fixture();
  try {
    const status = await context.manager.launch({ targetUrl: xiaomiUrl });
    assert.doesNotMatch(JSON.stringify(status), /tracking|cookie|password/i);
    assert.equal('profileDir' in status, false);
    const stored = await readSession(context.sessionFile);
    assert.equal(stored.selectedTab.pathPattern, '/internship/resume/:id/apply');
    assert.equal(JSON.stringify(stored).includes('tracking=private'), false);
    await context.manager.stop();
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('default browser profiles and invalid page targets fail closed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qiuzhao-yonghuxinxi-paths-'));
  try {
    const defaultProfile = path.join(root, 'Default Browser Data');
    await assert.rejects(() => prepareDedicatedProfile(defaultProfile, [defaultProfile]), /default_profile_forbidden/);
    const context = await fixture();
    try {
      await context.manager.launch();
      await assert.rejects(() => context.manager.openUrl('http://example.com/apply'), /https_url_without_credentials_required/);
      await assert.rejects(() => context.manager.openUrl('https://user:secret@example.com/apply'), /https_url_without_credentials_required/);
      await context.manager.stop();
    } finally {
      await rm(context.root, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
