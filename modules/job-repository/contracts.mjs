import { JOB_SOURCES, JOB_STATUSES, requireBoundedText, requireEnum, requireExactKeys, requireExpectedVersion, requireHttpsJobUrl, requireIdentifier } from '../job-contracts/index.mjs';

export function parseJobCandidate(input) {
  requireExactKeys(input, ['source', 'jobUrl', 'title', 'company', 'description'], 'jobCandidate');
  return Object.freeze({
    source: requireEnum(input.source, JOB_SOURCES, 'jobCandidate.source'),
    jobUrl: requireHttpsJobUrl(input.jobUrl),
    title: requireBoundedText(input.title, 'jobCandidate.title', { max: 200 }),
    company: requireBoundedText(input.company, 'jobCandidate.company', { max: 200 }),
    description: requireBoundedText(input.description, 'jobCandidate.description', { max: 30_000 })
  });
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
