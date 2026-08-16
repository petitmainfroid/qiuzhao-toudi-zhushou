#!/usr/bin/env node
import { LocalJobRepository } from './repository.mjs';

function option(args, name, { required = false } = {}) {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (index !== -1 && (!value || value.startsWith('--'))) throw new Error(`${name} requires a value`);
  if (required && value === undefined) throw new Error(`${name} is required`);
  return value;
}
function integer(args, name) {
  const value = option(args, name, { required: true });
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}
function rejectUnknown(args, allowed) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) continue;
    if (!allowed.includes(token)) throw new Error(`Unsupported option: ${token}`);
    index += 1;
  }
}
function usage() {
  return [
    'Usage: qiuzhao jobs <command> [options]', '',
    '  list [--include-deleted]',
    '  get --job-id <id>',
    '  events --job-id <id>',
    '  upsert --source <campus|boss> --url <https-url> --title <title> --company <company> --description <JD>',
    '  transition --job-id <id> --expected-version <n> --next-status <status> --reason <reason-code>',
    '  score --job-id <id> --expected-version <n> --outcome <pass|reject|review|failed> --score <0-100> --reason <reason-code>',
    '  protect --job-id <id> --expected-version <n> --value <true|false>',
    '  delete|restore --job-id <id> --expected-version <n> --reason <reason-code>'
  ].join('\n');
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || ['help', '--help', '-h'].includes(command)) return process.stdout.write(`${usage()}\n`);
  const repo = new LocalJobRepository();
  let result;
  if (command === 'list') { rejectUnknown(args, ['--include-deleted']); result = await repo.list({ includeDeleted: args.includes('--include-deleted') }); }
  else if (command === 'get') { rejectUnknown(args, ['--job-id']); result = await repo.get(option(args, '--job-id', { required: true })); }
  else if (command === 'events') { rejectUnknown(args, ['--job-id']); result = await repo.events(option(args, '--job-id', { required: true })); }
  else if (command === 'upsert') { rejectUnknown(args, ['--source', '--url', '--title', '--company', '--description']); result = await repo.upsert({ source: option(args, '--source', { required: true }), jobUrl: option(args, '--url', { required: true }), title: option(args, '--title', { required: true }), company: option(args, '--company', { required: true }), description: option(args, '--description', { required: true }) }); }
  else if (command === 'transition') { rejectUnknown(args, ['--job-id', '--expected-version', '--next-status', '--reason']); result = await repo.transition({ jobId: option(args, '--job-id', { required: true }), expectedVersion: integer(args, '--expected-version'), nextStatus: option(args, '--next-status', { required: true }), reasonCode: option(args, '--reason', { required: true }) }); }
  else if (command === 'score') {
    rejectUnknown(args, ['--job-id', '--expected-version', '--outcome', '--score', '--reason']);
    const score = Number(option(args, '--score', { required: true }));
    result = await repo.recordScore({ jobId: option(args, '--job-id', { required: true }), expectedVersion: integer(args, '--expected-version'), outcome: option(args, '--outcome', { required: true }), score, reasonCode: option(args, '--reason', { required: true }) });
  } else if (command === 'protect') {
    rejectUnknown(args, ['--job-id', '--expected-version', '--value']);
    const value = option(args, '--value', { required: true });
    if (!['true', 'false'].includes(value)) throw new Error('--value must be true or false');
    result = await repo.setProtected({ jobId: option(args, '--job-id', { required: true }), expectedVersion: integer(args, '--expected-version'), protected: value === 'true' });
  } else if (command === 'delete') { rejectUnknown(args, ['--job-id', '--expected-version', '--reason']); result = await repo.softDelete({ jobId: option(args, '--job-id', { required: true }), expectedVersion: integer(args, '--expected-version'), reasonCode: option(args, '--reason', { required: true }) }); }
  else if (command === 'restore') { rejectUnknown(args, ['--job-id', '--expected-version', '--reason']); result = await repo.restore({ jobId: option(args, '--job-id', { required: true }), expectedVersion: integer(args, '--expected-version'), reasonCode: option(args, '--reason', { required: true }) }); }
  else throw new Error(`Unknown jobs command: ${command}\n\n${usage()}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error?.code ?? 'jobs_failed'}: ${error?.message ?? 'Job command failed'}\n`); process.exitCode = 1; });
