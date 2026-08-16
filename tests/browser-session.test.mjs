import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BrowserSessionManager } from '../modules/browser-session/browser-session.mjs';
import { activatePageTarget, listPageTargets, openPageTarget } from '../modules/browser-session/cdp.mjs';
import { prepareDedicatedProfile } from '../modules/browser-session/paths.mjs';
import { readSession, writeSession } from '../modules/browser-session/session-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeBrowser = path.join(here, 'fake-browser.mjs');
const xiaomiUrl = 'https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply?tracking=private';

async function fixture({ failOnStaleActivePort = false, assessReadiness } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'qiuzhao-yonghuxinxi-'));
  const profileDir = path.join(root, 'profile');
  const sessionFile = path.join(root, 'session.json');
  const manager = new BrowserSessionManager({
    profileDir,
    sessionFile,
    browser: {
      kind: 'chrome',
      executablePath: process.execPath,
      commandPrefix: [fakeBrowser, ...(failOnStaleActivePort ? ['--fail-if-active-port-exists'] : [])],
      defaultDataDirs: [path.join(root, 'default-profile')]
    },
    startupTimeoutMs: 5000,
    pollIntervalMs: 20,
    detach: false,
    assessReadiness: assessReadiness ?? (async ({ port, targetId }) => {
      const target = (await listPageTargets(port)).find((candidate) => candidate.targetId === targetId);
      const state = /(?:^|\/)login(?:\/|$)/i.test(target?.pathPattern ?? '')
        ? 'login_required'
        : /(?:^|\/)verify(?:\/|$)/i.test(target?.pathPattern ?? '')
          ? 'verification_required'
          : 'application_ready';
      return { state, evidence: { visibleControls: state === 'application_ready' ? 8 : 1 } };
    })
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
    assert.equal(launched.state, 'ready');
    assert.equal(launched.readyConfirmed, false);
    assert.equal(launched.pageReadiness.state, 'application_ready');
    assert.equal(launched.pageReadiness.source, 'automatic');
    assert.deepEqual(launched.selectedTab, {
      targetId: 'target-1',
      origin: 'https://xiaomi.jobs.f.mioffice.cn',
      pathPattern: '/internship/resume/:id/apply',
      entry: 'agent-opened'
    });
    assert.equal('profileDir' in launched, false);
    const markerBefore = JSON.parse(await readFile(path.join(context.profileDir, '.qiuzhao-profile.json'), 'utf8'));
    assert.equal((await context.manager.connection()).origin, 'https://xiaomi.jobs.f.mioffice.cn');
    await context.manager.disconnect();
    const restartedApp = new BrowserSessionManager({
      profileDir: context.profileDir,
      sessionFile: context.sessionFile,
      startupTimeoutMs: 5000,
      pollIntervalMs: 20,
      detach: false,
      assessReadiness: context.manager.assessReadiness
    });
    const reconnected = await restartedApp.reconnect();
    assert.equal(reconnected.state, 'ready');
    assert.equal(reconnected.readyConfirmed, false);
    assert.equal(reconnected.pageReadiness.state, 'application_ready');
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
    assert.equal(attached.state, 'ready');
    assert.equal(attached.pageReadiness.state, 'application_ready');
    assert.equal(attached.selectedTab.entry, 'user-opened');
    assert.equal(attached.selectedTab.origin, 'https://app.mokahr.com');
    assert.equal(attached.selectedTab.pathPattern, '/campus_apply/huya/4112#/candidateHome/resume');
    await assert.rejects(() => context.manager.attachTab('missing'), /target_tab_not_found/);
    await context.manager.stop();
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('tab activation accepts an empty success response and fails closed if the target disappears', async () => {
  let targetExists = true;
  const server = http.createServer((request, response) => {
    if (request.url === '/json/activate/target-empty') {
      response.statusCode = 200;
      return response.end();
    }
    if (request.url === '/json/list') {
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify(targetExists
        ? [{ id: 'target-empty', type: 'page', url: 'https://job.ctrip.com/#/experienced/jobList' }]
        : []));
    }
    response.statusCode = 404;
    return response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const activated = await activatePageTarget(address.port, 'target-empty');
    assert.equal(activated.origin, 'https://job.ctrip.com');
    assert.equal(activated.pathPattern, '/#/experienced/jobList');
    targetExists = false;
    await assert.rejects(() => activatePageTarget(address.port, 'target-empty'), /target_tab_not_found/);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
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
    assert.equal(reconnected.pageReadiness.state, 'login_required');
    await assert.rejects(() => context.manager.confirmReady(), /selected_page_changed/);
    await navigateFake(privateSession.cdpPort, launched.selectedTab.targetId, xiaomiUrl);
    const ready = await context.manager.reconnect();
    assert.equal(ready.state, 'ready');
    assert.equal(ready.pageReadiness.state, 'application_ready');
    await context.manager.stop();
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('only an unknown page can use manual confirmation as a persistent fallback', async () => {
  const unknown = await fixture({ assessReadiness: async () => ({ state: 'unknown', evidence: { visibleControls: 0 } }) });
  try {
    const launched = await unknown.manager.launch({ targetUrl: xiaomiUrl });
    assert.equal(launched.state, 'confirmation-needed');
    assert.equal(launched.pageReadiness.state, 'unknown');
    const confirmed = await unknown.manager.confirmReady();
    assert.equal(confirmed.state, 'ready');
    assert.equal(confirmed.readyConfirmed, true);
    assert.equal(confirmed.pageReadiness.source, 'manual');
    assert.equal((await unknown.manager.connection()).origin, 'https://xiaomi.jobs.f.mioffice.cn');
    await unknown.manager.stop();
  } finally {
    await rm(unknown.root, { recursive: true, force: true });
  }

  for (const blockedState of ['login_required', 'verification_required']) {
    const blocked = await fixture({ assessReadiness: async () => ({ state: blockedState, evidence: { visibleControls: 1 } }) });
    try {
      const launched = await blocked.manager.launch({ targetUrl: xiaomiUrl });
      assert.equal(launched.state, blockedState === 'login_required' ? 'login-needed' : 'verification-needed');
      await assert.rejects(() => blocked.manager.confirmReady(), /page_not_ready_for_confirmation/);
      await assert.rejects(() => blocked.manager.connection(), /browser_(?:login|verification)_required/);
      await blocked.manager.stop();
    } finally {
      await rm(blocked.root, { recursive: true, force: true });
    }
  }
});

test('connection exposes an automatically ready selected target and rejects identity drift', async () => {
  const context = await fixture();
  try {
    const launched = await context.manager.launch({ targetUrl: xiaomiUrl });
    const privateSession = await readSession(context.sessionFile);
    assert.deepEqual(await context.manager.connection(), {
      launchId: launched.launchId,
      cdpPort: privateSession.cdpPort,
      targetId: launched.selectedTab.targetId,
      origin: 'https://xiaomi.jobs.f.mioffice.cn',
      pathPattern: '/internship/resume/:id/apply'
    });
    await navigateFake(
      privateSession.cdpPort,
      launched.selectedTab.targetId,
      'https://xiaomi.jobs.f.mioffice.cn/internship/resume/1234567890123456/other'
    );
    await assert.rejects(() => context.manager.connection(), /selected_page_changed/);
    await context.manager.stop();
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('a stopped browser relaunches the query-free target with the same persistent profile', async () => {
  const context = await fixture({ failOnStaleActivePort: true });
  try {
    const first = await context.manager.launch({ targetUrl: xiaomiUrl });
    const firstSession = await readSession(context.sessionFile);
    await context.manager.stop();
    assert.equal((await readFile(path.join(context.profileDir, 'DevToolsActivePort'), 'utf8')).length > 0, true);
    const restartedApp = new BrowserSessionManager({
      profileDir: context.profileDir,
      sessionFile: context.sessionFile,
      startupTimeoutMs: 5000,
      pollIntervalMs: 20,
      detach: false,
      assessReadiness: context.manager.assessReadiness
    });
    const relaunched = await restartedApp.reconnect();
    assert.equal(relaunched.profileId, first.profileId);
    assert.equal(relaunched.state, 'ready');
    assert.equal(relaunched.pageReadiness.state, 'application_ready');
    assert.equal(relaunched.selectedTab.origin, 'https://xiaomi.jobs.f.mioffice.cn');
    assert.equal(relaunched.selectedTab.pathPattern, '/internship/resume/:id/apply');
    const secondSession = await readSession(context.sessionFile);
    assert.notEqual(secondSession.cdpPort, 0);
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
    await assert.rejects(() => context.manager.reconnect(), /cdp_endpoint_changed/);
    if (session.browserPid) process.kill(session.browserPid);
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('launch refuses to remove a live endpoint owned by the dedicated profile', async () => {
  const context = await fixture();
  try {
    await context.manager.launch();
    const competingManager = new BrowserSessionManager({
      profileDir: context.profileDir,
      sessionFile: path.join(context.root, 'competing-session.json'),
      browser: {
        kind: 'chrome',
        executablePath: process.execPath,
        commandPrefix: [fakeBrowser],
        defaultDataDirs: [path.join(context.root, 'default-profile')]
      },
      startupTimeoutMs: 5000,
      pollIntervalMs: 20,
      detach: false
    });
    await assert.rejects(() => competingManager.launch(), /profile_browser_already_running/);
    assert.equal((await context.manager.status()).state, 'ready');
    await context.manager.stop();
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test('launch refuses cleanup when the endpoint file changes during stale probing', async () => {
  const context = await fixture();
  try {
    await prepareDedicatedProfile(context.profileDir, [path.join(context.root, 'default-profile')]);
    const activePortFile = path.join(context.profileDir, 'DevToolsActivePort');
    await writeFile(activePortFile, '65534\n/devtools/browser/stale\n');
    const changed = new Promise((resolve, reject) => {
      setTimeout(() => {
        writeFile(activePortFile, '65533\n/devtools/browser/concurrent\n').then(resolve, reject);
      }, 50);
    });
    await assert.rejects(() => context.manager.launch(), /cdp_endpoint_changed/);
    await changed;
    assert.match(await readFile(activePortFile, 'utf8'), /^65533\n/);
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
