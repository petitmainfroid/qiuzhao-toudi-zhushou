import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function readSession(file) {
  const session = JSON.parse(await readFile(file, 'utf8'));
  if (
    session.schemaVersion !== 1 ||
    typeof session.launchId !== 'string' ||
    typeof session.profileId !== 'string' ||
    typeof session.profileDir !== 'string' ||
    !Number.isInteger(session.cdpPort)
  ) {
    throw new Error('invalid_browser_session');
  }
  return session;
}

export async function writeSession(file, session) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
}
