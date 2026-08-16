export const PREFILTER_REASON_CODES = Object.freeze([
  'excluded_term', 'role_mismatch', 'city_mismatch', 'job_type_mismatch',
  'salary_below_minimum', 'city_unknown', 'job_type_unknown',
  'salary_unknown', 'prefilter_pass'
]);

export function evaluateDeterministicPrefilter(job, policy, facts) {
  const title = normalized(job.title);
  const semanticText = normalized(`${job.title} ${job.description}`);

  if (policy.excludedTerms.some((term) => semanticText.includes(normalized(term)))) {
    return terminal('reject', 'excluded_term', true);
  }
  if (!policy.targetRoleTerms.some((term) => title.includes(normalized(term)))) {
    return terminal('reject', 'role_mismatch', true);
  }
  if (policy.acceptedCities.length > 0 && facts.city !== null
    && !policy.acceptedCities.some((city) => normalized(city) === normalized(facts.city))) {
    return terminal('reject', 'city_mismatch', true);
  }
  if (policy.acceptedJobTypes.length > 0 && facts.jobType !== 'unknown'
    && !policy.acceptedJobTypes.includes(facts.jobType)) {
    return terminal('reject', 'job_type_mismatch', true);
  }
  if (policy.minimumMonthlySalaryK > 0 && facts.monthlySalaryMinK !== null
    && facts.monthlySalaryMinK < policy.minimumMonthlySalaryK) {
    return terminal('reject', 'salary_below_minimum', true);
  }
  if (policy.acceptedCities.length > 0 && facts.city === null) return terminal('review', 'city_unknown', false);
  if (policy.acceptedJobTypes.length > 0 && facts.jobType === 'unknown') return terminal('review', 'job_type_unknown', false);
  if (policy.minimumMonthlySalaryK > 0 && facts.monthlySalaryMinK === null) return terminal('review', 'salary_unknown', false);
  return terminal('pass', 'prefilter_pass', false);
}

function terminal(outcome, reasonCode, hardReject) {
  return Object.freeze({ outcome, reasonCode, hardReject });
}

function normalized(value) {
  return String(value).normalize('NFKC').toLowerCase();
}
