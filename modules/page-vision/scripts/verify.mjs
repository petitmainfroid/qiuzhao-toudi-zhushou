import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const moduleRoot = path.resolve(import.meta.dirname, '..');
const productFiles = (await readdir(moduleRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
  .map((entry) => path.join(moduleRoot, entry.name));
const source = (await Promise.all(productFiles.map((file) => readFile(file, 'utf8')))).join('\n');

const methods = [...source.matchAll(/\.send\(\s*['"]([A-Za-z]+\.[A-Za-z]+)['"]/g)].map((match) => match[1]);
const expected = ['Page.captureScreenshot', 'Page.enable', 'Runtime.evaluate'];
const actual = [...new Set(methods)].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`page_vision_cdp_surface_changed:${actual.join(',')}`);
}

for (const forbidden of [
  'Network.', 'Storage.', 'Fetch.', 'Input.', 'DOM.set', 'Page.navigate',
  'Browser.getCookies', 'Network.getCookies', 'Runtime.compileScript', 'Runtime.addBinding'
]) {
  if (source.includes(forbidden)) throw new Error(`page_vision_forbidden_protocol:${forbidden}`);
}

const cli = await readFile(path.join(moduleRoot, 'cli.mjs'), 'utf8');
for (const forbiddenOption of ['--script', '--selector', '--url', '--output', '--path']) {
  if (cli.includes(forbiddenOption)) throw new Error(`page_vision_forbidden_cli_option:${forbiddenOption}`);
}

const mcpRegistry = await readFile(path.resolve(moduleRoot, '..', 'mcp-server', 'tool-registry.mjs'), 'utf8');
if (mcpRegistry.includes('page-vision') || mcpRegistry.includes('PageVisionObserver')) {
  throw new Error('page_vision_must_not_be_mcp_tool');
}

console.log(`page-vision 静态验证通过：${productFiles.length} 个模块文件，3 个只读 CDP 方法，MCP 新工具 0。`);
