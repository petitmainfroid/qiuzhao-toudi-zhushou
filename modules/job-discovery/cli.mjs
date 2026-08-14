import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { BrowserSessionManager } from '../browser-session/index.mjs';
import { CdpTargetSession } from '../browser-kernel/cdp-session.mjs';
import { loadBundledNodeModule } from '../browser-kernel/source-loader.mjs';
import { collectVisibleBossCards, diagnoseVisibleBossStructure, discoveryManifest } from './src/browser-collector.mjs';

function applicationRoot(env = process.env) { return path.join(env.LOCALAPPDATA ?? env.TEMP ?? process.cwd(), 'QiuzhaoRecruitmentAgent', 'yonghuxinxi'); }

function validTargetId(value) { return typeof value === 'string' && /^[A-F0-9]{16,64}$/i.test(value); }

export async function discoverBossVisibleJobs({ env = process.env, targetId } = {}) {
  const browser = new BrowserSessionManager({ env });
  if (targetId !== undefined) {
    if (!validTargetId(targetId)) throw new Error('invalid_target_id');
    const attached = await browser.attachTab(targetId);
    if (attached.requestedPage?.origin !== 'https://www.zhipin.com' || attached.requestedPage?.pathPattern !== '/web/geek/job') throw new Error('boss_result_tab_required');
    await browser.confirmReady();
  }
  const connection = await browser.connection();
  const cdp = new CdpTargetSession({ port: connection.cdpPort, targetId: connection.targetId, expectedOrigin: connection.origin, expectedPath: connection.pathPattern });
  try {
    await cdp.connect();
    const collected = await collectVisibleBossCards({ cdp, connection });
    if (collected.kind !== 'ok') return { state: 'blocked', reason: collected.reason };
    const [discoveryModule, repositoryModule, profileModule] = await Promise.all([
      loadBundledNodeModule('modules/job-discovery/src/index.ts'),
      loadBundledNodeModule('modules/job-repository/src/repository.ts'),
      loadBundledNodeModule('gerenxinxi/profile-service/src/index.ts')
    ]);
    const result = discoveryModule.discoverBossJobs({ origin: connection.origin, loginState: 'ready', cards: collected.cards });
    if (result.kind !== 'discovered') return { state: 'blocked', reason: result.reason };
    const repository = new repositoryModule.FileJobRepository({ filePath: path.join(applicationRoot(env), 'jobs', 'jobs.json'), protector: new profileModule.WindowsDpapiProtector() });
    const snapshot = await repository.list();
    const persisted = await repository.upsertMany(result.records, snapshot.version);
    const { createdCount, refreshedCount } = persisted;
    const manifest = discoveryManifest({ observedCount: collected.cards.length, recordCount: result.records.length, createdCount, refreshedCount });
    return Object.freeze({ state: 'discovered', ...manifest, localRecordSet: createHash('sha256').update(result.records.map((record) => record.jobId).sort().join('|')).digest('hex') });
  } finally { cdp.close(); }
}

export async function diagnoseBossVisibleStructure({ env = process.env, targetId } = {}) {
  const browser = new BrowserSessionManager({ env });
  if (targetId !== undefined) {
    if (!validTargetId(targetId)) throw new Error('invalid_target_id');
    const attached = await browser.attachTab(targetId);
    if (attached.requestedPage?.origin !== 'https://www.zhipin.com' || attached.requestedPage?.pathPattern !== '/web/geek/job') throw new Error('boss_result_tab_required');
    await browser.confirmReady();
  }
  const connection = await browser.connection();
  const cdp = new CdpTargetSession({ port: connection.cdpPort, targetId: connection.targetId, expectedOrigin: connection.origin, expectedPath: connection.pathPattern });
  try { await cdp.connect(); return await diagnoseVisibleBossStructure({ cdp, connection }); } finally { cdp.close(); }
}

export async function main(args = process.argv.slice(2)) {
  const command = args[0];
  if (!['discover-boss', 'diagnose-boss'].includes(command) || args.length > 3 || (args.length === 3 && args[1] !== '--target')) throw new Error('usage: qiuzhao jobs discover-boss [--target <targetId>]');
  const result = command === 'discover-boss' ? await discoverBossVisibleJobs({ targetId: args[2] }) : await diagnoseBossVisibleStructure({ targetId: args[2] });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'boss_discovery_failed'}\n`); process.exitCode = 1; });
