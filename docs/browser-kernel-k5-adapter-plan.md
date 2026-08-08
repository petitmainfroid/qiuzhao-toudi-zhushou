# K5 recruitment-adapter boundary

## Goal

Expose one typed, privacy-safe kernel boundary over the pinned K4 session. ATS family packages describe recognition and canonical intent; the kernel alone performs state, find, action, wait, and saved-resume upload operations.

K5 does not add company-specific branches and does not claim that a live recruitment site works. Live, user-authorized, non-submitting acceptance remains F043.

## Ownership boundary

The kernel owns `src/bridge`, `src/background`, browser action execution, user authorization, profile-value resolution, readback verification, retries, idempotency, uploads, and typed errors.

ATS work owns family manifests, field semantic mappings, repeatable-section descriptions, Ground Truth, anonymous structural fixtures, and non-submitting family regression cases.

The shared SDK is owned by K5. ATS packages consume it but do not modify browser execution code.

## Contract rules

An adapter is declarative data, not executable page code. It may provide:

- HTTPS host/path and semantic-marker detection rules;
- semantic field keys mapped to canonical profile-path patterns;
- generic control capabilities such as text, searchable combobox, month range, choice, and file upload;
- confirmation/exclusion policy that can only make the kernel more conservative;
- repeatable collection intent, section semantic keys, add/save labels, and a bounded creation limit.

An adapter may not provide:

- CSS or XPath selectors;
- arbitrary page values or profile values;
- JavaScript, CDP methods, DOM/backend-node/object ids, or browser commands;
- callbacks that call `querySelector`, `.click()`, `chrome.debugger`, `chrome.scripting`, or `chrome.tabs`;
- final-submit, consent, identity verification, credential, CAPTCHA, SMS, destructive, or cookie operations.

The runtime rejects unknown manifest properties and invalid canonical profile paths before detection or planning.

## Serial increments

### K5-A — freeze SDK and compliance gate

- Define a versioned declarative ATS manifest.
- Define the single typed kernel API over K4 state/find/action/wait/upload primitives.
- Add exact-key runtime validation and prohibited-property tests.
- Prove an anonymous manifest can describe text, select, date-range, repeatable, and saved-resume intent without selectors or values.

### K5-B — planning runtime

- Evaluate family detection against a privacy-safe page summary.
- Convert semantic matches into canonical field intents and generic capability requirements.
- Return only snapshot-scoped control keys, profile paths, confidence, confirmation state, and typed skip reasons.
- Keep unknown/custom questions manual by default.

### K5-C — pinned-session orchestration parity

- Route scan and selected fill through the K4 kernel API.
- Route custom controls through find/open/wait/refind/action.
- Route repeatable creation/save through semantic plans and bounded waits.
- Route saved PDF attachment through the existing K4 user-confirmed upload gate.
- Record parity evidence before removing any old direct mutation path.

Current checkpoint: `AdapterPageBridge` converts a matched K5 plan into the existing side-panel
view model. Because K1 deliberately does not expose current page values, every fillable proposal
is shown as unreadable and confirmation-required; none is preselected. The bridge ignores legacy
saved remaps, sends only canonical profile paths to kernel actions, and routes repeatable creation
and saved PDF upload through their K5/K4 authorization gates.

The anonymous three-family evaluator now passes in real Chrome. Its 14 planned Ground Truth
fields map correctly and all 14 supported actions verify by page readback. Coverage includes text,
textarea, contenteditable, native and searchable selects, radio, a profile-presence checkbox,
single dates, a two-input date range, same-origin iframe, open Shadow DOM, repeatable add/save,
and the saved-resume gate. Wrong-control writes and final-submit actions are both zero.

The bridge remains injectable rather than the production default because production ATS manifests
are owned by the separate ATS/GT branch and are not registered here. Anonymous parity removes the
evaluation blocker; it does not justify a resolver with no production rules. After those declarative
assets merge, switch the installed resolver, rerun the same evaluator plus full regression, and only
then remove the legacy direct mutation path.

Migration checkpoint: the selector-free portion of the reviewed Feishu family assets now exists as
`src/ats/adapters/feishu/manifest.ts`. K1 also inherits strictly formatted
`data-form-field-name`/`data-form-field-i18n-name` metadata from nearby form containers and redacts
uploaded document names/timestamps from public semantics. A real-Chrome anonymous Feishu canary
proves read-only detection and planning with zero submit actions. See
[`k5-feishu-manifest-migration.md`](k5-feishu-manifest-migration.md). Production resolver registration
remains pending until write parity covers the family-specific composite controls.

### K5-D — removal and acceptance

- [done] Run three anonymous ATS-family E2E fixtures covering the complete F042 control denominator.
- [done] Produce and inspect an anonymous aggregate report and Organic screenshot.
- [done] Run full validation/E2E and privacy inspection for the anonymous evaluator node.
- [pending] Register the production ATS declarations from the separate ATS/GT branch.
- [pending] Switch the installed resolver and remove the old `chrome.scripting`/`tabs.sendMessage`
  mutation route only after production-rule parity passes.
- [pending] Run the final full regression and publish the F042 completion checkpoint.

## Fixed gates

- Manifest schema validation: 100% accepted valid cases and 100% rejected prohibited/unknown-property cases.
- Known anonymous-family detection: 100%; lookalike or unrelated-family false positives: 0.
- Supported Ground Truth mapping precision: at least 95% in adapter-only fixtures; wrong automatic mapping of unknown custom questions: 0.
- Every successful write has kernel readback verification: 100%.
- Unsupported controls fail closed without blind fallback: 100%.
- Restricted-control mutation, wrong-control mutation, duplicate side effect, cross-Origin continuation, and final-submit action: all 0.
- Repeatable records are never deleted or reordered.

## Required evidence

- `npm run eval:kernel-adapters`
- adapter contract and three anonymous ATS-family E2E fixtures
- `npm run validate`
- `npm run test:e2e`
- `artifacts/kernel-adapters-report.json`
- `artifacts/kernel-adapters.png`

Real values, filenames, resumes, cookies, authentication data, request/response bodies, selectors, and filled-page screenshots must not enter committed evidence.
