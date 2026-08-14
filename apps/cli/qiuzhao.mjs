#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const commands = Object.freeze({
  browser: path.join(root, 'modules', 'browser-session', 'cli.mjs'),
  jobs: path.join(root, 'modules', 'job-discovery', 'cli.mjs'),
  profile: path.join(root, 'modules', 'profile-page', 'cli.mjs'),
  agent: path.join(root, 'modules', 'mcp-server', 'cli.mjs'),
  'xiaomi-e3': path.join(root, 'modules', 'real-page-validation', 'xiaomi-e3.mjs')
});

function usage() {
  return [
    '用法：qiuzhao <命令> [参数]',
    '',
    '  browser <launch|reconnect|open|search|tabs|attach|confirm-ready|status|disconnect|stop>',
    '  jobs <discover-boss [--target <targetId>]|diagnose-boss>',
    '  profile <serve|status|stop>',
    '  agent <serve|status|authorize|revoke>',
    '  xiaomi-e3',
    '',
    '示例：qiuzhao browser launch --browser chrome --url "https://example.com/apply"'
  ].join('\n');
}

async function main() {
  const command = process.argv[2];
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const entry = commands[command];
  if (!entry) throw new Error(`未知命令：${command}\n\n${usage()}`);
  const child = spawn(process.execPath, [entry, ...process.argv.slice(3)], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (value, signal) => signal ? reject(new Error(`子进程被 ${signal} 中止`)) : resolve(value ?? 1));
  });
  process.exitCode = code;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'qiuzhao_cli_failed'}\n`);
  process.exitCode = 1;
});
