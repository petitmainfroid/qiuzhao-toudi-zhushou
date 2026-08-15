const identifier = /^[a-z][a-z0-9_-]{2,80}$/;

export const JOB_SOURCES = Object.freeze(['campus', 'boss']);
export const JOB_STATUSES = Object.freeze([
  'discovered', 'scored', 'review_required', 'approved', 'filling', 'filled_pending_review', 'submitted_by_user', 'rejected', 'closed', 'failed'
]);
export const WORKFLOW_STAGES = Object.freeze(['discover', 'deduplicate', 'rank', 'review', 'communicate', 'fill', 'audit']);

export class JobDomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'JobDomainError';
    this.code = code;
  }
}

export function requirePlainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new JobDomainError('invalid_input', `${name} must be a plain object`);
  }
  return value;
}

export function requireExactKeys(value, allowed, name) {
  requirePlainObject(value, name);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new JobDomainError('unknown_input', `${name}.${key} is not supported`);
  }
  return value;
}

export function requireIdentifier(value, name) {
  if (typeof value !== 'string' || !identifier.test(value)) {
    throw new JobDomainError('invalid_input', `${name} must be a stable identifier`);
  }
  return value;
}

export function requireBoundedText(value, name, { max = 500, optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new JobDomainError('invalid_input', `${name} must be non-empty text within ${max} characters`);
  }
  return value.trim();
}

export function requireEnum(value, values, name) {
  if (!values.includes(value)) throw new JobDomainError('invalid_input', `${name} is not supported`);
  return value;
}

export function requireHttpsJobUrl(value, name = 'jobUrl') {
  if (typeof value !== 'string' || value.length > 2048) throw new JobDomainError('invalid_input', `${name} must be an HTTPS URL`);
  let url;
  try { url = new URL(value); } catch { throw new JobDomainError('invalid_input', `${name} must be an HTTPS URL`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new JobDomainError('invalid_input', `${name} must be an HTTPS URL without credentials`);
  url.hash = '';
  url.search = '';
  return url.toString();
}

export function requireExpectedVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new JobDomainError('invalid_input', 'expectedVersion must be a non-negative integer');
  return value;
}

export function publicError(error) {
  if (error instanceof JobDomainError) return { code: error.code, message: error.message };
  return { code: 'internal_error', message: 'The job operation could not be completed' };
}
