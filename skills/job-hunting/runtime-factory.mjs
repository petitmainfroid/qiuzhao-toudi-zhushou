import { existsSync } from 'node:fs';
import path from 'node:path';
import { BrowserSessionManager } from '../../modules/browser-session/index.mjs';
import { discoverZhilianCandidates } from '../../modules/job-discovery/zhilian-adapter.mjs';
import { ZhilianPageReader } from '../../modules/job-discovery/zhilian-page-reader.mjs';
import { LocalJobRepository } from '../../modules/job-repository/repository.mjs';
import { jobRepositoryDirectory, jobRepositoryPath } from '../../modules/job-repository/paths.mjs';
import { JobWorkflowService } from '../../modules/job-workflow/service.mjs';
import { LocalJobWorkflowStore } from '../../modules/job-workflow/store.mjs';
import { JobHuntingAgentService } from './service.mjs';

export function createProductionJobHuntingAgent({ env = process.env } = {}) {
  const browserSession = new BrowserSessionManager(preferredZhilianSessionOptions(env));
  const repository = new LocalJobRepository({ filePath: jobRepositoryPath(env) });
  const store = new LocalJobWorkflowStore({
    filePath: path.join(jobRepositoryDirectory(env), 'workflows-v1.json')
  });
  const discover = async (request) => {
    let connection;
    try {
      connection = await browserSession.connection();
    } catch (error) {
      return blockerResult(browserBlocker(error));
    }
    let reader;
    try { reader = new ZhilianPageReader({ connection }); }
    catch { return blockerResult('page_drift'); }
    return discoverZhilianCandidates(request, { readPage: (budget) => reader.readPage(budget) });
  };
  const workflow = new JobWorkflowService({ store, repository, discover });
  return new JobHuntingAgentService({ workflow });
}

// Earlier Zhilian validation deliberately created an isolated browser session
// so it would not contend with another command using the normal application
// profile. Reuse that fixed product-owned location when present; neither path is
// accepted from MCP/Agent input or returned to a caller.
function preferredZhilianSessionOptions(env) {
  const base = env.LOCALAPPDATA ?? env.TEMP;
  if (!base) return { env };
  const root = path.join(base, 'qiuzhao-cli');
  const sessionFile = path.join(root, 'sessions', 'zhilian-session.json');
  const profileDir = path.join(root, 'profiles', 'zhilian-recruitment');
  return existsSync(sessionFile) && existsSync(profileDir)
    ? { env, sessionFile, profileDir }
    : { env };
}

function browserBlocker(error) {
  const code = String(error?.message || '');
  if (code === 'browser_login_required') return 'login_required';
  if (code === 'browser_verification_required') return 'verification_required';
  if (['cdp_endpoint_changed', 'cdp_unavailable', 'selected_tab_stale', 'target_tab_not_selected'].includes(code)) return 'browser_disconnected';
  return 'page_drift';
}

function blockerResult(blocker) {
  return Object.freeze({ candidates: Object.freeze([]), blocker, writes: 0, submissions: 0, credentialReads: 0 });
}
