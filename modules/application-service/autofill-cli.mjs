import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createProductionApplicationService } from './runtime-factory.mjs';

function option(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

export async function main(args = process.argv.slice(2)) {
  const unknown = args.filter((value) => value.startsWith('--') && value !== '--request-id');
  if (unknown.length) throw new Error('usage: qiuzhao autofill [--request-id <opaque-id>]');
  const service = await createProductionApplicationService();
  try {
    await service.start();
    const requestId = option(args, '--request-id') ?? `autofill_${randomUUID().replaceAll('-', '')}`;
    process.stdout.write(`${JSON.stringify(await service.autofill({ requestId }), null, 2)}\n`);
  } finally {
    service.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error?.code ?? 'autofill_failed'}: ${error?.message ?? 'autofill_failed'}\n`);
    process.exitCode = 1;
  });
}
