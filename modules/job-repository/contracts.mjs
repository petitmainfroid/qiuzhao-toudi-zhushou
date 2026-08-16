import { JOB_SOURCES, JOB_STATUSES, JobDomainError, requireBoundedText, requireEnum, requireExactKeys, requireExpectedVersion, requireHttpsJobUrl, requireIdentifier } from '../job-contracts/index.mjs';

const forbiddenValuePatterns = Object.freeze([
  ['secret_assignment', /(?:password|passwd|authorization|bearer|captcha|otp|sms_?code|verification_?code)\s*[:=]\s*[^\s,;]{4,}/i],
  ['html_payload', /<(?:!doctype|html|body|script|form|input|div|span|p|a)\b/i],
  ['data_url_payload', /data:(?:image|application)\/[a-z0-9.+-]+;base64,/i],
  ['local_user_path_payload', /(?:[a-z]:\\users\\|\/users\/|\/home\/)[^\s/\\]+/i]
]);

export function parseJobCandidate(input) {
  requireExactKeys(input, ['source', 'jobUrl', 'title', 'company', 'description'], 'jobCandidate');
  const candidate = Object.freeze({
    source: requireEnum(input.source, JOB_SOURCES, 'jobCandidate.source'),
    jobUrl: requireHttpsJobUrl(input.jobUrl),
    title: requireBoundedText(input.title, 'jobCandidate.title', { max: 200 }),
    company: requireBoundedText(input.company, 'jobCandidate.company', { max: 200 }),
    description: requireBoundedText(input.description, 'jobCandidate.description', { max: 30_000 })
  });
  const categories = new Set([
    ...sensitiveJobTextCategories(candidate.title),
    ...sensitiveJobTextCategories(candidate.company),
    ...sensitiveJobTextCategories(candidate.description)
  ]);
  if (categories.size > 0) {
    throw new JobDomainError('sensitive_payload', 'The job candidate contains data that cannot be persisted');
  }
  return candidate;
}

export function sensitiveJobTextCategories(value) {
  if (typeof value !== 'string') return Object.freeze([]);
  return Object.freeze(forbiddenValuePatterns
    .filter(([, pattern]) => pattern.test(value))
    .map(([category]) => category));
}

export function parseStatusTransition(input) {
  requireExactKeys(input, ['jobId', 'expectedVersion', 'nextStatus', 'reasonCode'], 'statusTransition');
  return Object.freeze({
    jobId: requireIdentifier(input.jobId, 'statusTransition.jobId'),
    expectedVersion: requireExpectedVersion(input.expectedVersion),
    nextStatus: requireEnum(input.nextStatus, JOB_STATUSES, 'statusTransition.nextStatus'),
    reasonCode: requireBoundedText(input.reasonCode, 'statusTransition.reasonCode', { max: 80 })
  });
}
