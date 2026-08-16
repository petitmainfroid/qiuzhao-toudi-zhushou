# Job discovery contracts

This module owns the closed request and evidence contracts for job discovery.
It does not connect to a browser, make a network request, read a page, or
perform any page action.

`parseZhilianInventoryRequest()` is the Z001 entry contract. It permits only a
keyword/city pair and explicit bounded observation budgets. URLs, selectors,
scripts, browser target IDs, cookies, credentials and page text are rejected by
the exact-key boundary.

`parseVisualComparisonOutcome()` records aggregate A/B/C evidence only. A
field is `verified` only when both Boolean readback and the private screenshot
comparison agree; screenshots, OCR text, paths and form values never enter the
durable record.

`freezeZhilianInventory()` is the fixed, devalued Z001 handoff from a private
observer. It accepts only search/detail kinds and terminal states, freezes the
annotated denominator, enforces the request budget, and emits zero write,
submission and credential-read counters.

`observeZhilianInventory()` owns page/deadline stopping rules, but accepts its
observer only through an internal dependency injection point. It is not an MCP
or CLI control surface.

`discoverZhilianCandidates()` is the Z002 source-isolated adapter boundary.
Only its fixed private `readPage` dependency may observe a retained page. The
public result is normalized Zhilian candidates, one typed blocker and zero
write/submission/credential-read counters; duplicate normalized links collapse
within a run.

`ZhilianPageReader` is the fixed Z002 retained-page collector. It binds one
already-selected `https://www.zhaopin.com/sou/` page, performs one bounded
read-only evaluation, rechecks page identity before and after, and exposes no
selector, script, URL, target ID, navigation, click, storage, Cookie or form
value input. When the closed request grants a detail budget, it replaces the
search summary with the bounded public detail node through same-origin GETs
using `credentials: omit`; a missing detail fails closed instead of being
misreported as a JD. The adapter passes the exact remaining request deadline
to this private reader, caps its CDP wait, rechecks elapsed time afterward and
maps known timeout/disconnection/drift failures to typed blockers.
