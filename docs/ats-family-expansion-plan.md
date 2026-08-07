# ATS family expansion plan

## Objective

Build an evidence-derived recruitment-form compatibility layer for Feishu, Zhiye, Moka, and Hotjob. One shared family implementation should cover common controls; bounded host overrides should handle verified differences. The product must never claim that every company on a shared ATS works merely because its hostname matches.

This is a clean-room design informed by public product behavior and the repository's own Xiaomi, MetaApp, and Lenovo evidence. No third-party extension code, selector pack, private API, branding, or ratings may enter the repository.

## Product boundary

The default workflow stays local and deterministic:

1. A user explicitly starts filling the active page.
2. The scanner creates a privacy-safe structural description without current values.
3. The family detector chooses a reviewed family only when bounded evidence is sufficient.
4. Matching precedence is saved user correction, host override, family template, then generic semantics.
5. A verified control adapter writes one selected value and reads it back.
6. Sensitive or conflicting values require concentrated confirmation.
7. Passwords, CAPTCHA, OTP, cookies, identity checks, delete controls, and final application submission are never automated.

AI is a later opt-in proposal source. It cannot operate the page, bypass verification, or receive raw HTML/current page values.

## Architecture

### Layer 1: canonical profile and generic semantics

The existing canonical field catalog remains the source of truth. Generic matching covers ordinary labelled HTML without claiming an ATS family.

### Layer 2: ATS family packages

Each family owns:

- an evidence-backed detector;
- semantic field and section rules;
- driver hints for existing control adapters;
- repeatable add/edit/save metadata;
- explicit exclusions and known limitations;
- a family fixture and independent ground truth.

Planned order:

1. Feishu: generalize the existing Xiaomi template with MetaApp evidence.
2. Zhiye: cover old/new Phoenix-style variants.
3. Moka: combine shared host, route template, and structural evidence.
4. Hotjob: build on the existing Ant/native control primitives.

### Layer 3: host overrides

Host overrides are versioned, schema-validated data. They may narrow paths, add bounded aliases, select driver hints, and describe repeatable containers. They cannot include executable code, remote script URLs, credentials, page values, final-submit controls, or permissions.

### Layer 4: optional AI proposal fallback

Unknown pages may be sent to a user-configured model only after a fresh per-page opt-in. The request allowlist is limited to normalized labels, technical names, roles, control types, option labels, section names, and anonymous structural ids. The output is an untrusted proposal that passes schema validation, safety checks, user confirmation when applicable, adapter writes, and readback.

### Layer 5: evidence-derived support catalog

The support catalog is generated from evidence records. It reports family, support level, covered control kinds, last verification, limitations, and evidence count. A catalog count or hostname suffix is prioritization information, never acceptance evidence.

## Durable feature sequence

| Feature | Outcome | Promotion condition |
| --- | --- | --- |
| F061 | Typed support policy and this validation plan | Policy tests and full validation pass |
| F062 | General Feishu family | Xiaomi + MetaApp fixtures pass; real status remains gated |
| F063 | Zhiye family | Three ground truths plus fixtures; real status remains gated |
| F064 | Moka family | Three route-specific ground truths plus fixtures |
| F065 | Hotjob family | Three ground truths plus fixtures |
| F066 | Local host overrides | Precedence, isolation, schema and safety tests pass |
| F067 | Privacy-safe AI proposals | Captured requests prove the allowlist and malicious outputs fail closed |
| F068 | Evidence-derived catalog | UI displays only computed support levels |
| F069 | Twelve-page release gate | All real-page metrics and safety invariants pass |

## Support levels

### planned

No qualifying evidence exists. A public catalog entry, vendor name, hostname suffix, or implementation plan is not evidence.

### observed

At least one independent public ground truth or value-redacted real-page observation exists. Read/write compatibility is not claimed.

### fixture-verified

At least one synthetic family fixture passes the same detection, matching, writing, readback, privacy, and safety path used by production. This does not claim a real company page works.

### real-page-verified

At least three distinct company sites in the family pass the real-page gate. A shared hostname with different tenant paths still counts as distinct sites only when each has independent ground truth and a separate result.

Any privacy leak, incorrect write, unsafe action, final-submit activation, or unexplained navigation blocks promotion.

## Quantitative acceptance

For one site:

- Eligible-field coverage = correctly mapped profile-backed fields / independent eligible-field denominator. Required: at least 90%.
- Verified-write success = readback-verified writes / attempted safe writes. Required: at least 95%.
- Incorrect writes = writes to the wrong field or wrong semantic path. Required: zero.
- Sensitive writes without confirmation. Required: zero.
- Unsafe actions, final-submit activations, delete actions, CAPTCHA/OTP/password operations, and unexpected navigations. Required: zero.
- Duplicate repeatable records on a second identical run. Required: zero.
- Standard-mode matching/filling network requests. Required: zero.

The aggregate across a family cannot hide a failing site. Every site must pass individually.

## Real-page matrix

Private real-page evidence is kept outside the repository. Only aggregate results and value-redacted structural evidence may be committed.

| Family | Site A | Site B | Site C | Minimum controls |
| --- | --- | --- | --- | --- |
| Feishu | Xiaomi | MetaApp | To review | text, select, date range, repeatable |
| Zhiye | To review | To review | To review | native/Phoenix, date, repeatable |
| Moka | To review | To review | To review | text, select, address/date, repeatable |
| Hotjob | To review | To review | To review | Ant/native, asynchronous choice, repeatable |

Selection rules:

- Use distinct companies and more than one form shape where the family has variants.
- Include at least one page with repeatable education/work/project records per family.
- Include upload discovery, but file attachment requires its existing user confirmation and is scored separately.
- Never click final submission.

## Verification ladder

Every implementation feature runs:

1. Contract/unit tests for detector, template, policy, and privacy.
2. Synthetic DOM tests for matching and adapter writes.
3. Focused Chrome E2E for the family fixture.
4. Full npm run validate.
5. Full npm run test:e2e for user-visible or shared-runtime changes.
6. JSON parsing, git diff --check, and static forbidden-capability searches.

Real-page promotion additionally requires:

1. An independent field denominator.
2. A user-started, non-submitting run in an authorized browser session.
3. Value-redacted aggregate metrics.
4. A second identical run proving idempotency.
5. Manual confirmation that no final-submit, delete, verification, or identity action occurred.

## Evidence record rules

Allowed:

- stable family id and opaque site key;
- evidence kind and date;
- ground-truth field counts;
- aggregate match/write/safety metrics;
- reviewed control-kind coverage;
- repository-relative synthetic artifact or private external evidence reference;
- known limitations.

Forbidden:

- user profile or current page values;
- raw HTML or complete DOM snapshots;
- cookies, tokens, headers, passwords, CAPTCHA, or OTP;
- URL query values or raw job/application ids;
- local filenames or uploaded file metadata;
- private selectors or identifiers taken from an authenticated observation;
- screenshots containing real personal data.

## Failure policy

- Unknown or ambiguous family: use generic matching and report the limitation.
- Unsupported control: leave unchanged and return a typed reason.
- Missing option or failed readback: stop that field; do not guess.
- Structure changes during a repeatable lifecycle: stop that record and rescan only within the bounded workflow.
- Privacy audit failure: reject the evidence and block support promotion.
- Real-page metric failure: retain the lower support level and create a regression fixture before changing runtime code.

## First execution node

F061 implements the support-level policy as a pure module. It does not alter page detection, matching, writing, permissions, network behavior, or the user interface. This keeps the first checkpoint independently verifiable before any family is generalized.
