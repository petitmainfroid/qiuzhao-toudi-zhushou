import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_LEASE_MS = 30 * 60_000;

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,160}$/.test(value);
}

function exactOrigin(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.origin === value && (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function defaultApplicationRoot(env = process.env) {
  const base = env.LOCALAPPDATA ?? env.TEMP ?? process.cwd();
  return path.join(base, 'QiuzhaoRecruitmentAgent', 'yonghuxinxi');
}

export function defaultAuthorizationFile(env = process.env) {
  return path.join(defaultApplicationRoot(env), 'application-service', 'ordinary-lease.json');
}

export function parseOrdinaryLease(value, now = Date.now()) {
  if (!exactKeys(value, ['schemaVersion', 'leaseId', 'origin', 'profileVersion', 'scope', 'issuedAt', 'expiresAt'])
    || value.schemaVersion !== 1 || value.scope !== 'ordinary' || !validId(value.leaseId)
    || !exactOrigin(value.origin) || !validId(value.profileVersion)
    || !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt)
    || value.expiresAt <= now || value.expiresAt <= value.issuedAt
    || value.expiresAt - value.issuedAt > MAX_LEASE_MS) {
    throw new Error('invalid_authorization_lease');
  }
  return Object.freeze({ ...value });
}

export class OrdinaryAuthorizationStore {
  constructor({ filePath = defaultAuthorizationFile(), now = () => Date.now(), createId = () => randomUUID() } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.createId = createId;
  }

  async grant({ origin, profileVersion, ttlMs }) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > MAX_LEASE_MS || !exactOrigin(origin) || !validId(profileVersion)) {
      throw new Error('invalid_authorization_request');
    }
    const issuedAt = this.now();
    const lease = parseOrdinaryLease({
      schemaVersion: 1,
      leaseId: `lease_${this.createId().replaceAll('-', '')}`,
      origin,
      profileVersion,
      scope: 'ordinary',
      issuedAt,
      expiresAt: issuedAt + ttlMs
    }, issuedAt - 1);
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.${process.pid}.${this.createId().replaceAll('-', '')}.tmp`;
    await writeFile(temporary, `${JSON.stringify(lease)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, this.filePath);
    return lease;
  }

  async current() {
    let value;
    try {
      value = JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch {
      return undefined;
    }
    try {
      return parseOrdinaryLease(value, this.now());
    } catch {
      await this.revoke();
      return undefined;
    }
  }

  async revoke() {
    await unlink(this.filePath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}
