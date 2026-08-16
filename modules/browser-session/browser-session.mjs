import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { selectBrowser } from './browser-discovery.mjs';
import { activatePageTarget, closeBrowserViaCdp, listPageTargets, openPageTarget, probeCdp } from './cdp.mjs';
import { defaultProfileDir, defaultSessionFile, normalizePage, prepareDedicatedProfile } from './paths.mjs';
import { readSession, writeSession } from './session-store.mjs';
import { assessPageReadiness, isPageReadinessState } from '../page-readiness/index.mjs';

function processExists(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function browserVersion(value) {
  return value.match(/\/(\d+(?:\.\d+){2,3})/)?.[1];
}

function publicStatus(session) {
  return {
    launchId: session.launchId,
    state: session.state,
    browser: session.browser,
    browserVersion: session.browserVersion,
    profileId: session.profileId,
    requestedPage: session.requestedPage,
    selectedTab: session.selectedTab,
    readyConfirmed: Boolean(session.readyConfirmedAt),
    pageReadiness: session.pageReadiness,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    errorCode: session.errorCode
  };
}

function identityMatches(left, right) {
  return Boolean(left && right && left.origin === right.origin && left.pathPattern === right.pathPattern);
}

function safeReadinessAssessment(value) {
  if (!value || typeof value !== 'object' || !isPageReadinessState(value.state)) {
    return { state: 'unknown', evidence: undefined };
  }
  const evidence = value.evidence && typeof value.evidence === 'object' && !Array.isArray(value.evidence)
    ? structuredClone(value.evidence)
    : undefined;
  return { state: value.state, evidence };
}

function selectedTab(target, entry) {
  return {
    targetId: target.targetId,
    origin: target.origin,
    pathPattern: target.pathPattern,
    entry
  };
}

function isMissingFile(error) {
  return error && typeof error === 'object' && error.code === 'ENOENT';
}

export class BrowserSessionManager {
  constructor(options = {}) {
    this.env = options.env ?? process.env;
    this.sessionFile = options.sessionFile ?? defaultSessionFile(this.env);
    this.startupTimeoutMs = options.startupTimeoutMs ?? 20000;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.detach = options.detach ?? true;
    this.explicitBrowser = options.browser;
    this.explicitProfileDir = options.profileDir;
    this.assessReadiness = options.assessReadiness ?? assessPageReadiness;
  }

  async launch({ browserKind, targetUrl } = {}) {
    const browser = this.explicitBrowser ?? (await selectBrowser(browserKind, this.env));
    const prepared = await prepareDedicatedProfile(
      this.explicitProfileDir ?? defaultProfileDir(browser.kind, this.env),
      browser.defaultDataDirs
    );
    await this.#removeStaleActivePort(prepared.profileDir);
    const page = targetUrl ? normalizePage(targetUrl) : undefined;
    const args = [
      ...(browser.commandPrefix ?? []),
      `--user-data-dir=${prepared.profileDir}`,
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-mode',
      '--new-window',
      page?.navigationUrl ?? 'about:blank'
    ];
    const child = spawn(browser.executablePath, args, {
      stdio: 'ignore',
      windowsHide: false,
      detached: this.detach
    });
    const session = {
      schemaVersion: 1,
      launchId: randomUUID(),
      state: 'starting',
      browser: browser.kind,
      executablePath: browser.executablePath,
      commandPrefix: browser.commandPrefix,
      browserPid: child.pid,
      profileDir: prepared.profileDir,
      profileId: prepared.profileId,
      cdpPort: 0,
      selectedTab: undefined,
      requestedPage: page?.identity,
      requestedNavigationUrl: page?.navigationUrl,
      readyConfirmedAt: undefined,
      pageReadiness: undefined,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await writeSession(this.sessionFile, session);

    try {
      const ready = await this.#waitForCdp(session, child, page?.identity);
      if (this.detach) child.unref();
      return publicStatus(ready);
    } catch (error) {
      session.state = 'disconnected';
      session.errorCode = error instanceof Error ? error.message : 'browser_startup_failed';
      session.updatedAt = new Date().toISOString();
      await writeSession(this.sessionFile, session);
      try {
        await this.#terminateBrowser(session);
      } catch {
        // The browser may already have exited.
      }
      throw error;
    }
  }

  async reconnect({ targetUrl } = {}) {
    const previous = await readSession(this.sessionFile);
    const prepared = await prepareDedicatedProfile(previous.profileDir);
    if (prepared.profileId !== previous.profileId) throw new Error('profile_identity_mismatch');

    let currentPort;
    try {
      currentPort = await this.#readActivePort(previous.profileDir);
    } catch {
      currentPort = undefined;
    }
    if (currentPort) {
      let endpointIsLive = false;
      try {
        await probeCdp(currentPort);
        endpointIsLive = true;
      } catch {
        currentPort = undefined;
      }
      if (endpointIsLive && currentPort !== previous.cdpPort) throw new Error('cdp_endpoint_changed');
    }

    if (!currentPort) {
      return await new BrowserSessionManager({
        env: this.env,
        sessionFile: this.sessionFile,
        profileDir: previous.profileDir,
        browser: {
          kind: previous.browser,
          executablePath: previous.executablePath,
          commandPrefix: previous.commandPrefix
        },
        startupTimeoutMs: this.startupTimeoutMs,
        pollIntervalMs: this.pollIntervalMs,
        detach: this.detach,
        assessReadiness: this.assessReadiness
      }).launch({ targetUrl: targetUrl ?? previous.requestedNavigationUrl });
    }

    const activePort = currentPort;
    const info = await probeCdp(activePort);
    previous.browserVersion = browserVersion(info.browser);
    if (previous.selectedTab) {
      const current = (await listPageTargets(activePort)).find(
        (tab) => tab.targetId === previous.selectedTab.targetId
      );
      if (!current) throw new Error('selected_tab_stale');
      await this.#refreshReadiness(previous, current, previous.selectedTab.entry);
    } else {
      previous.state = 'ready';
    }
    previous.errorCode = undefined;
    previous.updatedAt = new Date().toISOString();
    await writeSession(this.sessionFile, previous);
    if (targetUrl) return await this.openUrl(targetUrl);
    return publicStatus(previous);
  }

  async openUrl(url) {
    const session = await this.#connectedSession();
    const normalized = normalizePage(url);
    const target = await openPageTarget(session.cdpPort, normalized.navigationUrl);
    session.requestedPage = normalized.identity;
    session.requestedNavigationUrl = normalized.navigationUrl;
    session.selectedTab = selectedTab(target, 'agent-opened');
    session.readyConfirmedAt = undefined;
    session.pageReadiness = undefined;
    await this.#refreshReadiness(session, target, 'agent-opened');
    session.updatedAt = new Date().toISOString();
    await writeSession(this.sessionFile, session);
    return publicStatus(session);
  }

  async listTabs() {
    const session = await this.#connectedSession();
    const tabs = await listPageTargets(session.cdpPort);
    return tabs.map((tab) => ({
      targetId: tab.targetId,
      origin: tab.origin,
      pathPattern: tab.pathPattern,
      selected: tab.targetId === session.selectedTab?.targetId
    }));
  }

  async attachTab(targetId) {
    const session = await this.#connectedSession();
    if (!(await listPageTargets(session.cdpPort)).some((tab) => tab.targetId === targetId)) {
      throw new Error('target_tab_not_found');
    }
    const target = await activatePageTarget(session.cdpPort, targetId);
    session.selectedTab = selectedTab(target, 'user-opened');
    session.requestedPage = { origin: target.origin, pathPattern: target.pathPattern };
    session.requestedNavigationUrl = target.navigationUrl;
    session.readyConfirmedAt = undefined;
    session.pageReadiness = undefined;
    await this.#refreshReadiness(session, target, 'user-opened');
    session.updatedAt = new Date().toISOString();
    await writeSession(this.sessionFile, session);
    return publicStatus(session);
  }

  async confirmReady() {
    const session = await this.#connectedSession();
    if (!session.selectedTab) throw new Error('target_tab_not_selected');
    const current = (await listPageTargets(session.cdpPort)).find(
      (tab) => tab.targetId === session.selectedTab.targetId
    );
    if (!current) throw new Error('selected_tab_stale');
    if (
      session.requestedPage &&
      (current.origin !== session.requestedPage.origin || current.pathPattern !== session.requestedPage.pathPattern)
    ) {
      throw new Error('selected_page_changed');
    }
    const assessed = await this.#assess(current, session.cdpPort);
    if (assessed.state === 'login_required' || assessed.state === 'verification_required') {
      throw new Error('page_not_ready_for_confirmation');
    }
    if (assessed.state === 'application_ready') {
      await this.#applyReadiness(session, current, session.selectedTab.entry, assessed, 'automatic');
      await writeSession(this.sessionFile, session);
      return publicStatus(session);
    }
    session.selectedTab = selectedTab(current, session.selectedTab.entry);
    session.state = 'ready';
    session.readyConfirmedAt = new Date().toISOString();
    session.pageReadiness = {
      state: 'application_ready', source: 'manual', checkedAt: session.readyConfirmedAt,
      evidence: assessed.evidence
    };
    session.updatedAt = new Date().toISOString();
    await writeSession(this.sessionFile, session);
    return publicStatus(session);
  }

  async connection() {
    const session = await this.#connectedSession();
    if (!session.selectedTab) throw new Error('target_tab_not_selected');
    const current = (await listPageTargets(session.cdpPort)).find(
      (tab) => tab.targetId === session.selectedTab.targetId
    );
    if (!current) throw new Error('selected_tab_stale');
    if (
      current.origin !== session.selectedTab.origin
      || current.pathPattern !== session.selectedTab.pathPattern
      || (session.requestedPage
        && (current.origin !== session.requestedPage.origin
          || current.pathPattern !== session.requestedPage.pathPattern))
    ) {
      throw new Error('selected_page_changed');
    }
    await this.#refreshReadiness(session, current, session.selectedTab.entry);
    await writeSession(this.sessionFile, session);
    if (session.state !== 'ready') {
      throw new Error(session.state === 'login-needed' ? 'browser_login_required'
        : session.state === 'verification-needed' ? 'browser_verification_required'
          : 'browser_confirmation_required');
    }
    return {
      launchId: session.launchId,
      cdpPort: session.cdpPort,
      targetId: current.targetId,
      origin: current.origin,
      pathPattern: current.pathPattern
    };
  }

  async status() {
    try {
      const session = await readSession(this.sessionFile);
      try {
        const activePort = await this.#readActivePort(session.profileDir);
        if (activePort !== session.cdpPort) throw new Error('cdp_endpoint_changed');
        await probeCdp(session.cdpPort);
        if (session.selectedTab) {
          const current = (await listPageTargets(session.cdpPort)).find(
            (tab) => tab.targetId === session.selectedTab.targetId
          );
          if (!current) throw new Error('selected_tab_stale');
          await this.#refreshReadiness(session, current, session.selectedTab.entry);
          await writeSession(this.sessionFile, session);
        }
      } catch {
        session.state = session.state === 'stopped' ? 'stopped' : 'disconnected';
        session.errorCode = session.state === 'stopped' ? undefined : 'cdp_unavailable';
      }
      return publicStatus(session);
    } catch {
      return { state: 'stopped', errorCode: 'session_missing' };
    }
  }

  async disconnect() {
    const session = await readSession(this.sessionFile);
    session.state = 'disconnected';
    session.errorCode = 'application_disconnected';
    session.updatedAt = new Date().toISOString();
    await writeSession(this.sessionFile, session);
    return publicStatus(session);
  }

  async stop() {
    const session = await readSession(this.sessionFile);
    await this.#terminateBrowser(session);
    session.state = 'stopped';
    session.errorCode = undefined;
    session.updatedAt = new Date().toISOString();
    await writeSession(this.sessionFile, session);
    return publicStatus(session);
  }

  async #connectedSession() {
    const session = await readSession(this.sessionFile);
    const activePort = await this.#readActivePort(session.profileDir);
    if (activePort !== session.cdpPort) throw new Error('cdp_endpoint_changed');
    await probeCdp(session.cdpPort);
    return session;
  }

  async #readActivePort(profileDir) {
    const firstLine = (await readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/, 1)[0];
    const port = Number(firstLine);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid_cdp_port');
    return port;
  }

  async #removeStaleActivePort(profileDir) {
    const activePortFile = path.join(profileDir, 'DevToolsActivePort');
    let original;
    try {
      const metadata = await lstat(activePortFile);
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('unsafe_cdp_port_file');
      original = await readFile(activePortFile, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return;
      throw error;
    }

    const port = Number(original.split(/\r?\n/, 1)[0]);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await probeCdp(port);
          throw new Error('profile_browser_already_running');
        } catch (error) {
          if (error instanceof Error && error.message === 'profile_browser_already_running') throw error;
          if (attempt === 0) await delay(100);
        }
      }
    }

    let latest;
    try {
      latest = await readFile(activePortFile, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return;
      throw error;
    }
    if (latest !== original) throw new Error('cdp_endpoint_changed');
    try {
      await unlink(activePortFile);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  async #terminateBrowser(session) {
    if (session.cdpPort) {
      try {
        await closeBrowserViaCdp(session.cdpPort);
      } catch {
        // Fall through to the process-id fallback.
      }
    }
    if (processExists(session.browserPid)) {
      try {
        process.kill(session.browserPid);
      } catch {
        // It may have exited after the existence check.
      }
    }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        await probeCdp(session.cdpPort);
        await delay(100);
      } catch {
        break;
      }
    }
    await delay(300);
  }

  async #waitForCdp(session, child, requestedIdentity) {
    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const port = await this.#readActivePort(session.profileDir);
        const info = await probeCdp(port);
        const tabs = await listPageTargets(port);
        let selected;
        if (requestedIdentity) {
          selected = tabs.find(
            (tab) => tab.origin === requestedIdentity.origin && tab.pathPattern === requestedIdentity.pathPattern
          );
          if (!selected) throw new Error('target_page_not_identified');
        }
        session.cdpPort = port;
        session.browserPid = processExists(child.pid) ? child.pid : undefined;
        session.browserVersion = browserVersion(info.browser);
        session.selectedTab = selected ? selectedTab(selected, 'agent-opened') : undefined;
        session.requestedPage = requestedIdentity;
        session.readyConfirmedAt = undefined;
        session.pageReadiness = undefined;
        if (selected) await this.#refreshReadiness(session, selected, 'agent-opened');
        else session.state = 'ready';
        session.updatedAt = new Date().toISOString();
        await writeSession(this.sessionFile, session);
        return session;
      } catch {
        await delay(this.pollIntervalMs);
      }
    }
    throw new Error('browser_startup_timeout');
  }

  async #assess(target, cdpPort) {
    try {
      return safeReadinessAssessment(await this.assessReadiness({
        port: cdpPort,
        targetId: target.targetId,
        origin: target.origin,
        pathPattern: target.pathPattern
      }));
    } catch {
      return { state: 'unknown', evidence: undefined };
    }
  }

  async #applyReadiness(session, target, entry, assessment, source = 'automatic') {
    const checkedAt = new Date().toISOString();
    const atRequestedPage = !session.requestedPage || identityMatches(target, session.requestedPage);
    let state = assessment.state;
    if (state === 'application_ready' && !atRequestedPage) state = 'unknown';
    session.selectedTab = selectedTab(target, entry);
    session.readyConfirmedAt = source === 'manual' && state === 'application_ready' ? checkedAt : undefined;
    session.pageReadiness = {
      state,
      source,
      checkedAt,
      evidence: assessment.evidence
    };
    session.updatedAt = checkedAt;
    session.state = state === 'application_ready' ? 'ready'
      : state === 'login_required' ? 'login-needed'
        : state === 'verification_required' ? 'verification-needed'
          : 'confirmation-needed';
  }

  async #refreshReadiness(session, target, entry) {
    const assessment = await this.#assess(target, session.cdpPort);
    const current = (await listPageTargets(session.cdpPort)).find((tab) => tab.targetId === target.targetId);
    if (!current) throw new Error('selected_tab_stale');
    if (!identityMatches(current, target)) throw new Error('selected_page_changed');
    if (assessment.state === 'unknown' && session.pageReadiness?.source === 'manual'
      && session.pageReadiness?.state === 'application_ready'
      && identityMatches(current, session.selectedTab)
      && (!session.requestedPage || identityMatches(current, session.requestedPage))) {
      session.selectedTab = selectedTab(current, entry);
      session.state = 'ready';
      return;
    }
    await this.#applyReadiness(session, current, entry, assessment);
  }
}
