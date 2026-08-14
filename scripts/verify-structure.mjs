import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  'apps/cli/qiuzhao.mjs',
  'modules/browser-session/index.mjs',
  'modules/browser-kernel/index.mjs',
  'modules/application-service/index.mjs',
  'modules/mcp-server/index.mjs',
  'modules/semantic-planner/src/index.ts',
  'modules/policy-compiler/src/index.ts',
  'modules/real-page-validation/index.mjs',
  'modules/job-contracts/src/index.ts',
  'modules/job-repository/src/index.ts',
  'modules/job-workflow/src/index.ts',
  'modules/job-ranking/src/index.ts',
  'gerenxinxi/profile-service/src/index.ts',
  'gerenxinxi/profile-host/src/index.ts',
  'gerenxinxi/resume-parser/src/index.ts',
  'shared/domain/profile.ts'
];

for (const relative of required) await access(path.join(root, relative));

const forbiddenProductFiles = ['manifest.json', 'background.js', 'content.js', 'sidepanel.html'];
for (const name of forbiddenProductFiles) {
  try {
    await access(path.join(root, name));
    throw new Error(`零扩展项目不应包含根级拓展产物：${name}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const runtimeFactory = await readFile(path.join(root, 'modules/application-service/runtime-factory.mjs'), 'utf8');
for (const expected of ['gerenxinxi/profile-service', 'modules/semantic-planner', 'modules/policy-compiler']) {
  if (!runtimeFactory.includes(expected)) throw new Error(`运行时缺少模块引用：${expected}`);
}

console.log(`结构验证通过：${required.length} 个核心入口，根级浏览器拓展产物 0 个。`);
