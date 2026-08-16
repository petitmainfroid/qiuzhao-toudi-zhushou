#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { createProductionJobHuntingAgent } from './runtime-factory.mjs';
import { serveJobHuntingStdio } from './server.mjs';

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || args[0] !== 'serve') throw new Error('usage: job-hunting/cli.mjs serve');
  await serveJobHuntingStdio({ agentService: createProductionJobHuntingAgent() });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error?.code ?? 'job_agent_failed'}: ${error?.message ?? 'Job Agent failed'}\n`);
    process.exitCode = 1;
  });
}
