import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserSessionManager } from '../browser-session/index.mjs';
import { ZeroExtensionBrowserKernel } from '../browser-kernel/runtime.mjs';
import { defaultApplicationRoot } from '../application-service/authorization-store.mjs';
import { createLogicalFieldInventory, publicInventoryEvidence } from './logical-inventory.mjs';

function privateDirectory(env = process.env) {
  return path.join(defaultApplicationRoot(env), 'real-page-validation', 'xiaomi-feishu');
}

async function writePrivateCandidate(candidate, env = process.env) {
  const directory = privateDirectory(env);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filePath = path.join(directory, 'annotation-candidate.json');
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(candidate, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await rename(temporary, filePath);
  return filePath;
}

export async function inspectXiaomiE3({ env = process.env } = {}) {
  const profileService = {
    async getAgentSnapshot() {
      return { profileVersion: 'profile_readonly1', catalog: [], completeness: { repeatableRoots: [] } };
    },
    createResolver() { throw new Error('readonly_inventory_has_no_profile_resolver'); }
  };
  const kernel = new ZeroExtensionBrowserKernel({ browserSession: new BrowserSessionManager({ env }), profileService });
  try {
    await kernel.start();
    const before = createLogicalFieldInventory(await kernel.observe());
    const after = createLogicalFieldInventory(await kernel.observe());
    const beforePublic = publicInventoryEvidence(before);
    const afterPublic = publicInventoryEvidence(after);
    if (beforePublic.fieldStructureHash !== afterPublic.fieldStructureHash
      || JSON.stringify(beforePublic.summary) !== JSON.stringify(afterPublic.summary)) {
      throw new Error('xiaomi_page_drift_during_readonly_inventory');
    }
    await writePrivateCandidate(after, env);
    return {
      evidenceLevel: 'E3-candidate',
      siteId: after.siteId,
      page: after.page,
      observations: 2,
      stable: true,
      rawControlCount: after.rawControlCount,
      summary: after.summary,
      fieldStructureHash: afterPublic.fieldStructureHash,
      safety: { pageWrites: 0, profileValueReads: 0, cookieReads: 0, finalSubmissions: 0 },
      status: 'awaiting-independent-human-review'
    };
  } finally {
    kernel.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  inspectXiaomiE3().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(error instanceof Error ? error.message : 'xiaomi_e3_failed');
    process.exitCode = 1;
  });
}
