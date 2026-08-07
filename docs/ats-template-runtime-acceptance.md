# Deterministic ATS template runtime acceptance

## Scope

The one-click workflow may select a local, reviewed ATS family template before generic semantic matching. A template contains only stable family field keys, canonical local-profile paths, section behavior, control-driver hints, repeatable lifecycle labels and explicit final-submit exclusions.

The first concrete template is deliberately limited to the reviewed Xiaomi deployment at `xiaomi.jobs.f.mioffice.cn`. It must not be presented as a general Feishu-recruitment template until multiple independently reviewed sites exist.

## Precedence

1. Hard safety exclusions for password, verification, hidden, file, disabled/read-only and submit-like controls.
2. A saved local site correction for the current origin and field fingerprint.
3. An exact reviewed ATS family-template rule.
4. The generic deterministic matcher.

The fill pass resolves the family again and revalidates the selected mapping before writing, so a stale page or changed mapping fails closed.

## Privacy and safety audit

- Template validation rejects raw HTML, URL-like configuration values, email-like text, long digit sequences, invalid paths, unbounded rules and duplicate identifiers.
- Detection input contains origin, a parameterized path, stable semantic field names and no query values, current form values, cookies, credentials, authentication state or raw HTML.
- Templates execute no remote code and have no fetch, storage, cookie, message or submission capability.
- Every registered template has explicit final-submit exclusion labels.
- Sensitive canonical fields remain confirmation-required even if a family rule is exact.
- Concrete mappings originate from repository-owned Xiaomi ground truth and synthetic regressions, not from OfferLink code or configuration.

## Verification

- `npm test -- --run src/ats src/sidepanel/autoFillWorkflow.test.ts`
- `npm run validate`
- `rg -n "fetch\\(|XMLHttpRequest|WebSocket|eval\\(|document\\.cookie|localStorage|sessionStorage|chrome\\." src/ats/defaultTemplates.ts src/ats/matchingRuntime.ts src/ats/templateContracts.ts src/ats/templateRegistry.ts` must return no match.
- Parse `feature_list.json`, run `git diff --check`, and confirm the production manifest permission set is unchanged.
