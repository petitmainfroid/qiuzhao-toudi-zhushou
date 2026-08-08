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

The selector-free portion of the reviewed Feishu family assets now exists as
`src/ats/adapters/feishu/manifest.ts`. K1 inherits strictly formatted
`data-form-field-name`/`data-form-field-i18n-name` metadata from nearby form containers and redacts
uploaded document names/timestamps from public semantics. Its write-parity fixture now covers a
unique composite date-range reference, searchable combobox, section-scoped repeatable add/save and
saved PDF. The installed resolver routes only exact reviewed Feishu HTTPS application URLs to K5;
an unmatched or ambiguous Feishu adapter fails closed without fallback. During migration the other
families retained the old bridge; K5-D removed that bridge after all four family parity nodes. See
[`k5-feishu-manifest-migration.md`](k5-feishu-manifest-migration.md).

The second registered production family is the conservative Moka standard-resume manifest. It is
derived from the public 9-group/41-field contract and maps only 27 fields that fit the current
profile without conflating Moka's separate work and internship collections. It declares no
attachment or repeatable lifecycle because the public evidence does not prove those logged-in DOM
controls. Multi-combobox parity also hardened the orchestrator: every structural selection now
rescans and uniquely rebinds remaining fields with the exact indexed technical key. See
[`k5-moka-manifest-migration.md`](k5-moka-manifest-migration.md).

The third registered family is Lenovo Talent's exact PC resume route. Its public component
contract contains 7 groups and 55 logical fields; the K5 declaration records all 55 decisions but
automates only 15 fields supported without name splitting, radio-group inference, date-format
guessing, remote search, conditional creation, or multi-value coercion. Fourteen profile fields
and one saved PDF pass anonymous installed-side-panel parity. The other 40 fields and repeatable
lifecycle remain manual. See
[`k5-lenovo-manifest-migration.md`](k5-lenovo-manifest-migration.md).

The fourth registered family is Ctrip's company-owned experienced-candidate editor. All 28 public
bundle controls have a decision; 14 profile fields pass anonymous parity. Both file inputs remain
manual because one triggers draft-replacing parsing and the other is a portfolio target, while SMS
verification, full-date precision, current-job sentinels, remote school mode and five repeatable
lifecycles remain outside current evidence. The root route declaration also hardened generic path
detection so `/` no longer matches every same-origin path. See
[`k5-ctrip-manifest-migration.md`](k5-ctrip-manifest-migration.md).

### K5-D — removal and acceptance

- [done] Run three anonymous ATS-family E2E fixtures covering the complete F042 control denominator.
- [done] Produce and inspect an anonymous aggregate report and Organic screenshot.
- [done] Run full validation/E2E and privacy inspection for the anonymous evaluator node.
- [done] Register the selector-free production Feishu declaration after anonymous write parity.
- [done] Route exact reviewed Feishu application URLs through K5 in the installed side panel, with
  no fallback when the Feishu adapter fails.
- [done] Register the conservative Moka standard-resume declaration and prove 27/27 anonymous
  installed-side-panel writes with zero save or submit actions.
- [done] Register the conservative Lenovo Talent declaration, record all 55 public field
  decisions, and prove 14/14 profile writes plus one saved-PDF upload with zero save or submit.
- [done] Register the Ctrip custom-family declaration, record all 28 public control decisions,
  and prove 14/14 writes with zero attachment, verification, save or submit actions.
- [done] Remove the remaining non-K5 `chrome.scripting`/`tabs.sendMessage` mutation route after
  all four production-family parity nodes pass.
- [done] Reject unknown ATS URLs before page scanning, prove zero input/change/submit events in an
  installed-extension Chrome regression, and show the user an explicit unsupported-page result.
- [done] Remove the legacy content-script entry point and bundle, drop the `scripting` permission,
  run the final full regression and publish the F042 completion checkpoint.

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
