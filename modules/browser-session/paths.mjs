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
  const originalSearch = new URLSearchParams(url.search);
  url.search = '';
  // Recruitment URLs can contain private tracking IDs. BOSS job search is the
  // sole exception: retain only its bounded, user-visible search state so an
  // Agent may open one intentional search rather than repeatedly reopening a
  // generic landing page. Identity and public status still omit the query.
  if (url.origin === 'https://www.zhipin.com') {
    const query = originalSearch.get('query');
    const city = originalSearch.get('city');
    const page = originalSearch.get('page');
    if (query && query.length <= 80 && !/[\u0000-\u001f]/u.test(query)) url.searchParams.set('query', query);
    if (city && /^[0-9]{1,12}$/.test(city)) url.searchParams.set('city', city);
    if (page && /^(?:[1-9][0-9]{0,2}|1000)$/.test(page)) url.searchParams.set('page', page);
  }
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

export function createBossSearchUrl({ query, city, page = 1 }) {
  if (typeof query !== 'string' || !query.trim() || query.trim().length > 80 || /[\u0000-\u001f]/u.test(query)) {
    throw new Error('invalid_boss_search_query');
  }
  if (city !== undefined && (!/^[0-9]{1,12}$/.test(String(city)))) throw new Error('invalid_boss_search_city');
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw new Error('invalid_boss_search_page');
  const url = new URL('https://www.zhipin.com/web/geek/job');
  url.searchParams.set('query', query.trim());
  if (city !== undefined) url.searchParams.set('city', String(city));
  if (page !== 1) url.searchParams.set('page', String(page));
  return url.toString();
}
