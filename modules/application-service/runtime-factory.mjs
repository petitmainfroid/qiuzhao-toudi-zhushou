import path from 'node:path';
import { BrowserSessionManager } from '../browser-session/index.mjs';
import { ZeroExtensionBrowserKernel } from '../browser-kernel/runtime.mjs';
import { loadBundledNodeModule } from '../browser-kernel/source-loader.mjs';
import { DefaultResumeAsset } from '../resume-asset/index.mjs';
import { OrdinaryAuthorizationStore, defaultApplicationRoot } from './authorization-store.mjs';
import { RecruitmentApplicationService } from './application-service.mjs';
import { WorkflowLedger } from './workflow-ledger.mjs';

export function defaultProfileApplicationRoot(env = process.env) {
  return path.join(defaultApplicationRoot(env), 'profile-data');
}

export async function createProductionApplicationService({ env = process.env } = {}) {
  const [profileModule, profileHostModule, plannerModule, compilerModule] = await Promise.all([
    loadBundledNodeModule('gerenxinxi/profile-service/src/index.ts'),
    loadBundledNodeModule('gerenxinxi/profile-host/src/resumeStore.ts'),
    loadBundledNodeModule('modules/semantic-planner/src/index.ts'),
    loadBundledNodeModule('modules/policy-compiler/src/index.ts')
  ]);
  const filePath = path.join(defaultProfileApplicationRoot(env), 'profile', 'profile.json');
  const repository = new profileModule.FileProfileRepository({
    filePath,
    protector: new profileModule.WindowsDpapiProtector()
  });
  const profileService = new profileModule.ProfileService(repository);
  const resumeStore = new profileHostModule.FileResumeStore({
    filePath: path.join(path.dirname(filePath), 'resume.json'),
    protector: new profileModule.WindowsDpapiProtector({
      maxPlaintextBytes: 10 * 1024 * 1024,
      maxCiphertextBytes: 12 * 1024 * 1024,
      timeoutMs: 60_000
    })
  });
  const resumeAsset = new DefaultResumeAsset({ resumeStore });
  const browserSession = new BrowserSessionManager({ env });
  const kernel = new ZeroExtensionBrowserKernel({ browserSession, profileService, resumeAsset });
  return new RecruitmentApplicationService({
    kernel,
    profileService,
    resumeAsset,
    authorizationStore: new OrdinaryAuthorizationStore({ env }),
    ledger: new WorkflowLedger(),
    createPlannerRequest: plannerModule.createAiPlannerRequest,
    compilePlan: compilerModule.compilePlan
  });
}
