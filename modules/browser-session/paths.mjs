import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PROFILE_MARKER = '.qiuzhao-profile.json';

export function runtimeRoot(env = process.env) {
  const base = env.LOCALAPPDATA ?? env.TEMP ?? process.cwd();
  return path.join(base, 'QiuzhaoRecruitmentAgent', 'yonghuxinxi', 'browser-session');
}

export function defaultProfileDir(kind, env = process.env) {
  return path.join(runtimeRoot(env), 'profiles', `${kind}-recruitment`);
}

export function defaultSessionFile(env = process.env) {
  return path.join(runtimeRoot(env), 'session.json');
}

export function defaultBrowserDataDirs(env = process.env) {
  if (!env.LOCALAPPDATA) return [];
  return [
    path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data'),
    path.join(env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data')
  ];
}

function comparable(input) {
  const value = path.resolve(input).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function overlaps(left, right) {
  return left === right || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`);
}

export async function prepareDedicatedProfile(profileDir, defaultDirs = defaultBrowserDataDirs()) {
  if (!path.isAbsolute(profileDir)) throw new Error('profile_dir_must_be_absolute');
  await mkdir(profileDir, { recursive: true, mode: 0o700 });
  const canonical = await realpath(profileDir);
  const candidate = comparable(canonical);

  for (const defaultDir of defaultDirs) {
    let resolvedDefault = path.resolve(defaultDir);
    try {
      resolvedDefault = await realpath(defaultDir);
    } catch {
      // A browser that has never been opened may not have a default directory yet.
    }
    if (overlaps(candidate, comparable(resolvedDefault))) throw new Error('default_profile_forbidden');
  }

  const markerFile = path.join(canonical, PROFILE_MARKER);
  try {
    const marker = JSON.parse(await readFile(markerFile, 'utf8'));
    if (marker.schemaVersion !== 1 || typeof marker.profileId !== 'string') {
      throw new Error('invalid_profile_marker');
    }
    return { profileDir: canonical, profileId: marker.profileId };
  } catch (error) {
    if (error instanceof SyntaxError || error?.message === 'invalid_profile_marker') throw error;
    const marker = { schemaVersion: 1, profileId: randomUUID(), createdAt: new Date().toISOString() };
    await writeFile(markerFile, `${JSON.stringify(marker, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { profileDir: canonical, profileId: marker.profileId };
  }
}

export function normalizePage(input) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('https_url_without_credentials_required');
  }
  url.search = '';
  const normalizedPath = url.pathname
    .split('/')
    .map((segment) =>
      /^\d{6,}$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ? ':id' : segment
    )
    .join('/');
  const normalizedHash = url.hash
    ? url.hash.replace(/\d{6,}/g, ':id').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    : '';
  return {
    navigationUrl: url.toString(),
    identity: { origin: url.origin, pathPattern: `${normalizedPath}${normalizedHash}` }
  };
}
