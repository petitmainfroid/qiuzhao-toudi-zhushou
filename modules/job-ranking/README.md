# Job ranking

This module owns Z004 deterministic prefiltering, bounded semantic scoring and
the local review queue. It is independent of the recruitment-form semantic
planner and imports no BossHunter runtime code.

Every run freezes a unique list of repository job IDs before any write. City,
job type, minimum salary, target-role terms and exclusion terms are evaluated
deterministically before semantic scoring. An explicit mismatch is a hard
reject. If a configured fact is unknown, the result cannot be promoted beyond
`review`; the implementation never guesses a missing city, job type or salary
from prose.

The private semantic scorer receives only the normalized public job semantic
package and a bounded `{ capabilityId, hasValue }` catalog. It receives no
profile scalar, resume text, browser state, Cookie, credential, selector,
script, URL action, upload or authorization capability. Its closed output is
validated for score/outcome/reason consistency before persistence.

Each annotated job receives exactly one current terminal outcome: `pass`,
`reject`, `review`, `failed` or `budget_exhausted`. Malformed model output,
timeouts, quota failures and exhausted local budgets remain in the frozen
denominator. Completed repository outcomes are reused after restart and are
not sent to the scorer again. Deterministic rejects do not consume semantic
budget.

Ranking persistence is an atomic expected-version mutation. It writes one
reason-code-only event and moves eligible results to `review_required`; neither
the scorer nor this module can approve a job, authorize an external action,
write a page or submit an application.
