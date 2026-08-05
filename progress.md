# Progress Log

## Current snapshot

- Product: local-first recruitment form assistant for Chrome/Edge.
- Repository state at start: empty directory, not initialized as a Git repository.
- Current feature: `F017` is complete; `F018` is the next unblocked feature; `F014` remains blocked on real-page non-submitting acceptance.
- Current slice: no feature is left in progress. The next recommended slice is deterministic date-range and complex-control adapters under F018; real-page writes still require an explicit current-page user action.

## Product and architecture decisions

- The MVP is a browser extension, not a native mobile app, because the target workflow occurs on desktop recruitment websites.
- The extension stores one structured profile locally and asks for a user gesture before scanning or filling the active page.
- The initial matcher is deterministic and explainable. AI-based semantic matching is deferred until field coverage and correction data justify it.
- The extension previews proposed values and never submits an application.
- The UI follows the Organic anchor: sand/sage/clay/terracotta/ochre/moss, packaged Epilogue typography, rounded cards, subtle grain, and gentle motion.
- Vite will build React UI pages; esbuild will create isolated Manifest V3 background and content-script bundles.

## 2026-08-03 — Initializer session

### Completed

- Read and applied the `long-running-agent-harness` skill.
- Inspected the workspace and confirmed there were no existing files, tests, repository instructions, or user changes.
- Converted the product plan into stable features `F000`–`F009` with dependencies, acceptance criteria, and verification evidence.
- Added `AGENTS.md`, `feature_list.json`, `progress.md`, and an idempotent PowerShell setup script.

### Environment evidence

- `node --version` → `v24.15.0`
- `npm --version` → `11.12.1`
- `git --version` → `2.54.0.windows.1`
- PowerShell → `5.1.22621.5697`
- Chrome executable found at `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Edge executable found at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`

### Risks to track

- Recruitment systems use dynamic components, iframes, and non-standard controls; coverage must be measured against fixtures before adding AI.
- `activeTab` access can expire after navigation; the panel must explain how to re-authorize instead of requesting broad access silently.
- File upload cannot be implemented as arbitrary local-path assignment and remains user-controlled.
- Personal data requires clear local-storage disclosure and deletion controls even without a server.

### Next action

Implement `F001`, run its four verification checks, record evidence, then advance to `F002`.

## 2026-08-03 — F001 Manifest V3 foundation

### Completed

- Added a Vite + React + TypeScript UI build and separate esbuild bundles for the background service worker and content script.
- Added the Manifest V3 shell, options page, side panel, packaged Epilogue font, Organic theme tokens, and initial local-only product copy.
- Added unit-test, type-check, build, distribution-audit, and packaging scripts.
- Corrected Windows npm child-process handling and separated Vite/Vitest configs after the validation gate exposed versioned Vite type identities.

### Verification evidence

- `npm run validate` → exit 0.
- `tsc --noEmit` → passed.
- `vitest --run` → 1 file passed, 1 test passed.
- Production build → 1,584 modules transformed; `options.html`, `sidepanel.html`, `background.js`, and `content.js` emitted.
- `npm run verify:dist` → 6 required files verified; permission set exactly `activeTab`, `scripting`, `sidePanel`, `storage`; no host permissions.

### Next action

Implement `F002`: versioned profile schema, deterministic completion calculation, and tested local repository with preview fallback.

## 2026-08-03 — F002 profile model and repository

### Completed

- Added schema version 1 for basic information, repeatable education, work experience, projects, job preferences, and reusable answers.
- Added factories for repeatable records without inserting fabricated identity data.
- Added migration from a flat legacy profile and normalization for malformed/missing fields.
- Added deterministic completion calculation: one education baseline is required, while fully blank optional records are excluded until the user starts them.
- Added `chrome.storage.local` persistence with a `localStorage` fallback for browser preview and tests.

### Verification evidence

- `npm run typecheck` → exit 0.
- Focused Vitest run with one fork → 2 files passed, 9 tests passed.
- Tests cover blank data, legacy migration, repeatable-record completion behavior, 100% baseline completion, save timestamps, reload, and deletion.
- The first parallel test attempt exceeded the command window due to Windows worker startup; it left no child process and passed when rerun deterministically with one worker.

### Next action

Implement `F003`: replace the foundation placeholder with the full structured editor and capture browser evidence.

## 2026-08-03 — F003 structured profile editor

### Completed

- Replaced the options placeholder with six editable profile sections: basic information, education, work experience, projects, preferences, and reusable answers.
- Added repeatable record creation/removal, local save/reload, live completion percentage, missing-item summary, dirty/saved states, and phone/email/date validation.
- Added a clear attachment boundary explaining that local file selection remains user-controlled.
- Implemented the Organic design anchor with packaged Epilogue typography, earth-tone tokens, rounded archive cards, subtle grain, gentle motion, and the completion ring as the visible differentiator.
- Adjusted the save footer from fixed to sticky after visual review showed that a fixed control could obscure form fields.

### Verification evidence

- `npm run typecheck` → exit 0.
- Focused editor unit test → 1 file passed, 3 tests passed; covers save, repeatable project add/remove, invalid-email feedback, and save blocking.
- `npm run test:e2e -- --grep "profile editor"` → 1 Chrome test passed.
- Browser screenshot captured at `artifacts/profile-editor.png` and visually inspected for layout, token fidelity, real-information labels, form visibility, and completion feedback.

### Next action

Implement `F004`: canonical field catalog, DOM descriptor extraction, explainable confidence scoring, and sensitive/ambiguous safeguards.

## 2026-08-03 — F004 deterministic discovery and matching

### Completed

- Added a canonical catalog spanning basic details, education, work, projects, preferences, and reusable answers with Chinese/English aliases.
- Added DOM discovery for inputs, textareas, selects, radio controls, and contenteditable controls without reading current field values.
- Added explainable scoring across associated label, ARIA label, placeholder, name, DOM id, autocomplete hint, control type, and section context.
- Added high/medium/low confidence, ambiguity downgrade, confirmation flags, and explicit exclusions for file/password/hidden/button controls, verification fields, and unsupported identity/financial fields.
- Improved wrapped-label extraction after a fixture showed that select options could contaminate label text.

### Verification evidence

- `npm run typecheck` → exit 0.
- Focused matcher run → 2 files passed, 49 tests passed.
- Catalog table validates 40 representative Chinese/English labels; additional tests cover autocomplete evidence, sensitive confirmation, four exclusion classes, unknown labels, DOM discovery, and value non-collection.

### Next action

Implement `F005`: resolve profile values, scan without mutation, fill only explicit selections, dispatch framework-compatible events, and prove that excluded controls and submit buttons remain untouched.

## 2026-08-03 — F005 safe scan and fill engine

### Completed

- Added safe profile-path lookup and value previews without exposing current webpage field values.
- Added page scan summaries for total, fillable, safe-high-confidence, confirmation-required, and excluded fields.
- Added explicit-selection filling that rechecks the live field mapping immediately before writing.
- Added native value/checked setters and `input`, `change`, and `blur` events for text, textarea, select, radio, and contenteditable controls.
- Added hard exclusions for password, file, hidden, button, checkbox, verification, identity, and financial controls; the engine contains no submit action.
- Added the typed content-script message protocol and a real-browser recruitment-form fixture.

### Verification evidence

- `npm run typecheck` → exit 0.
- Focused content/domain run → 2 files passed, 7 tests passed.
- `npm run test:e2e -- --grep "fill fixture"` → 1 Chrome test passed.
- Browser fixture confirmed at least five selected fields filled, page events fired, CAPTCHA/password/file remained empty, and submit count stayed zero.

### Next action

Implement `F006`: connect the side panel to active-tab script injection, show confidence-grouped proposals, default-select only safe high-confidence fields, and require explicit selection for medium/sensitive fields.

## 2026-08-03 — F006 side-panel confirmation workflow

### Completed

- Connected the side panel to active-tab content-script injection without persistent host permissions.
- Added profile readiness, current-page summary, safe-match and confirmation-required groups, explainable match details, excluded-field disclosure, and explicit per-field selection.
- Default selection includes only high-confidence non-sensitive fields; medium and sensitive suggestions remain unchecked.
- Added scan/fill failure guidance and preserved the no-submit boundary in both copy and behavior.
- Added a deterministic browser-preview bridge so the panel can be visually tested outside an installed extension without network services.

### Verification evidence

- `npm run typecheck` → exit 0.
- Focused side-panel test → 1 file passed, 2 tests passed; verifies default selection and explicit confirmation.
- `npm run test:e2e -- --grep "side panel"` → 1 Chrome test passed.
- `artifacts/sidepanel-preview.png` captured at 420×900 and visually inspected: Organic tokens hold, group hierarchy is legible, sensitive state is distinguishable, and there is no submit action.

### Next action

Implement `F007`: persist site-specific mapping corrections, add first-run consent, and add export/import/delete controls for all local data.

## 2026-08-03 — F007 correction memory and privacy controls

### Completed

- Added stable field fingerprints and a local mapping repository keyed by site plus fingerprint.
- Added side-panel field remapping to any non-empty canonical profile field, immediate rescanning, “已记住” feedback, and reuse during both scan and fill revalidation.
- Added first-run disclosure in options and side panel covering local storage, user-triggered page access, sensitive defaults, excluded credentials/verification/files, and no automatic submission.
- Added versioned JSON export/import plus permanent profile and mapping deletion with an explicit confirmation step.
- Open the options page on first extension installation so the disclosure and profile setup appear before normal use.

### Verification evidence

- `npm run typecheck` → exit 0.
- Focused F007 run → 4 files passed, 11 tests passed; covers mapping replacement/isolation/clear, import/export parsing, engine mapping reuse, default selection, explicit confirmation, and remapping UI.
- `npm run test:e2e -- --grep "privacy controls"` → 1 Chrome test passed; verifies first-run gate, export download, cancel delete, permanent delete, and import restoration.
- Side-panel Chrome flow rerun after consent/mapping integration → 1 test passed.

### Next action

Complete `F008`: add dynamic and ambiguous fixture controls, run the entire verification matrix, and refresh visual artifacts.

## 2026-08-03 — F008 representative fixture and full evidence

### Completed

- Expanded the local recruitment-form fixture with ordinary inputs, a custom-looking native select, radio group, contenteditable field, hidden dynamic fields, ambiguous labels, CAPTCHA, password, file input, and submit button.
- Added dynamic discovery coverage and proved that “紧急联系人姓名” and “所在地” are not promoted to safe high-confidence filling.
- Configured Vitest as a deterministic single fork on Windows, reducing the complete validation time and avoiding startup contention.
- Removed the development fixture from production build inputs after the distribution review identified it in `dist/`.
- Rechecked the final profile editor and side-panel screenshots; changed the editor save footer to static so it cannot cover fields.

### Verification evidence

- `npm run validate` → exit 0.
- TypeScript → passed.
- Vitest → 10 files passed, 73 tests passed.
- Production build → 1,599 modules transformed before fixture exclusion; permission audit still exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- `npm run test:e2e` → 5 Chrome tests passed across profile editing, selective fill, dynamic ambiguity, side-panel confirmation, and privacy controls.
- `artifacts/profile-editor.png` and `artifacts/sidepanel-preview.png` visually inspected; both retain the Organic token system and real/test-labeled content.

### Next action

Complete `F009`: README, privacy/limitations guidance, final clean build, package archive audit, unpacked-extension smoke check, and final status handoff.

## 2026-08-03 — F009 package and documentation

### Completed

- Added operator documentation for setup, unpacked installation, user workflow, architecture, verification, troubleshooting, privacy, and known browser/site limitations.
- Added `PRIVACY.md` documenting processed data, local storage, active-tab access, explicit exclusions, deletion, and future-consent requirements.
- Added archive inspection that requires extension entry files and rejects test fixtures, test artifacts, source maps, and persisted personal-data filenames.
- Added a real unpacked-extension smoke test that obtains the generated extension ID and verifies the first-run options page.
- Verified the Harness recovery path through `init.ps1 -SkipInstall`.

### Verification evidence

- `npm run package` → exit 0; it reran type check, 73 unit/component tests, production build, and distribution audit before creating the archive.
- Archive `qiuzhao-profile-assistant.zip` → 36 entries; required files present; no fixture, test output, source map, or personal-data file present.
- Installed Chrome headless and headed modes did not expose the Manifest V3 worker when invoked with automated extension flags. The test was correctly moved to the available Playwright Chromium channel instead of being waived.
- Unpacked-extension smoke → 1 test passed; the extension booted and its first-run privacy/options page rendered.
- Final `npm run test:e2e` → 6 tests passed, including the unpacked extension.
- Final `init.ps1 -SkipInstall` → exit 0; 10 Vitest files and 73 tests passed, build transformed 1,591 modules, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- Final visual evidence: `artifacts/profile-editor.png` no longer has a save bar obscuring fields; `artifacts/sidepanel-preview.png` shows safe vs confirmation-required selection states.

### Handoff

- All required MVP features are complete and unblocked.
- Load `dist/` from `chrome://extensions/` for normal use, or distribute `qiuzhao-profile-assistant.zip` after extracting it.
- Do not add cloud sync, telemetry, AI calls, automatic submission, or broader host permissions without a new product/privacy decision and updated acceptance criteria.

## 2026-08-03 — F010 Xiaomi internship form hardening

### Completed

- Audited the supplied Xiaomi internship application URL from its public `resume_form_schema`, job API, unauthenticated login boundary, and the user-authorized logged-in DOM; captured a normalized 9-group/34-field snapshot and a source-bound audit document.
- Migrated the local profile schema to v2 and added nationality, education type, project link, work samples, awards, language abilities, and self-evaluation. Age is derived from birth date instead of stored as a value that becomes stale.
- Synchronized controlled choices with the real Xiaomi form: gender, degree, education type, language, and language proficiency options now use the observed labels while preserving previously imported custom values.
- Added Feishu ATS field discovery for `.atsx-form-item`, repeat-index inference from DOM ids, structural disambiguation for generic descriptions, and async exact-option handling for regular and searchable custom selects.
- Classified Feishu date-range hidden inputs as unsupported so they are skipped instead of receiving a partial string and being reported as filled.
- Preserved safety boundaries: personal identity fields, files, privacy checkboxes, verification/login controls, and final submission remain outside automated filling.
- Re-enabled the unpacked extension in the dedicated test Chromium after the final build, with developer mode on; the current build opens as `chrome-extension://agofcemdoimkogeggmdobnhgkpklkfhm/options.html`.

### Real-page evidence

- Unauthenticated visit redirects to `/internship/login`; no login, SMS, CAPTCHA, cookie, or consent bypass was attempted.
- Logged-in read-only scan found 40 controls: 28 mapped fields with test profile values, 24 high-confidence non-sensitive suggestions, 4 confirmation-required suggestions, and 12 excluded/unmatched controls.
- Four date ranges were identified as `date-range` and excluded; one personal-certificate field was `sensitive-unsupported`; 14 custom selects were recognized.
- Both project description controls resolved to `projects.0.description` and `projects.1.description` with high confidence.
- The real-page smoke scan did not read current input values and did not fill, clear, upload, or submit. Full filling behavior was exercised on the structurally derived local Xiaomi fixture.

### Verification evidence

- `npm run audit:xiaomi` → exit 0; Xiaomi A96028 schema verified as 9 groups and 34 visible fields with no submission.
- `npm run validate` → exit 0; TypeScript passed, 10 Vitest files passed, 93 tests passed, production build passed, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- `npm run test:e2e` → exit 0; 7 Playwright tests passed, including Xiaomi custom-select fill and explicit no-submit coverage.
- `artifacts/xiaomi-form-regression.png` and the refreshed `artifacts/profile-editor.png` were visually inspected.
- `npm run package` → exit 0; `qiuzhao-profile-assistant.zip` recreated with 36 audited entries and no fixtures, source maps, test output, or persisted personal-data files.
- `.\init.ps1 -SkipInstall` → exit 0; the long-running harness recovery path reran all 93 tests, the build, and the distribution permission audit.

### Handoff

- F010 is complete. The dedicated Chromium session currently retains the Xiaomi pages and has the final unpacked extension enabled.
- The remaining site-specific limitation is compound date-range/cascading geographic selection; those controls stay manual until a separately accepted adapter is implemented.

## 2026-08-04 — F011 resume import (completed)

### Acceptance baseline

- Applied the `long-running-agent-harness` workflow and added `F011` before implementation.
- Confirmed the supplied real Xiaomi application URL still resolves to “投递简历 - 小米实习生招聘” and exposes the expected login boundary; no login or form interaction was attempted.
- `npm run audit:xiaomi` revalidated the public real-page schema as 9 groups and 34 visible fields with no application submission.
- The feature will parse user-selected PDF/DOCX files locally and place evidence-backed values directly in the existing profile form. It will not add a second confirmation page, persist the source file/raw text, invent missing data, or silently replace existing non-empty fields.
- A realistic Chinese campus-recruitment resume and the Xiaomi-derived field inventory define the automated coverage target; live-site validation remains read-only and fill behavior remains on a structurally derived local page.

### Baseline issue

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\\init.ps1 -SkipInstall` reached validation, but the sandboxed Vitest child could not read the repository parent and did not start. The final gate must demonstrate actual Vitest pass counts, not rely only on the wrapper exit code.

### Next action

Implement local PDF/DOCX extraction, deterministic parsing and conflict-safe merging, then connect it to the existing editor before running the F011 verification matrix.

### Completed

- Added a prominent PDF/DOCX upload control to the existing profile editor. The parser runs only after file selection, places results directly in the current form, marks them unsaved, and keeps the original “保存档案” action as the persistence boundary.
- Added browser-local PDF extraction with a packaged PDF.js worker and DOCX extraction limited to `word/document.xml`; file size, PDF page count, extracted text, and DOCX正文 size have explicit limits.
- Added deterministic parsing for labelled basic information, multiple education/work/project records, work samples, awards, languages, job preferences, skills/personal strengths, self-introduction, self-evaluation, and career planning.
- Added conflict-safe merging: blank scalar fields are filled, the blank education placeholder is reused, non-duplicate repeatable records are merged or appended, and different existing non-empty values are preserved and counted in the import summary.
- Kept identity numbers outside the schema and verified that the source filename, an unmapped raw-text marker, and a sample identity number are absent from persisted storage.
- Clarified that profile-page resume parsing is separate from recruitment-site file inputs, which remain manual. Updated README and privacy documentation for formats, local processing, persistence boundaries, and scanned-file limitations.
- Refreshed the production build and `qiuzhao-profile-assistant.zip`.

### Verification evidence

- Live URL through Agent Reach/Jina → “投递简历 - 小米实习生招聘”; unauthenticated content remained at the login boundary, with no login or form interaction.
- `npm run audit:xiaomi` → exit 0; current public Xiaomi A96028 schema verified as 9 groups and 34 visible fields with no application submission.
- `npm test -- --run src/resume src/options/ProfileEditor.test.tsx` → exit 0; 3 files and 10 tests passed.
- `npm run validate` → exit 0; TypeScript passed, 12 Vitest files and 100 tests passed, production build emitted the local PDF worker, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- `npm run test:e2e -- --grep "resume import"` → exit 0; actual generated DOCX and text PDF uploads both passed in Chrome.
- `npm run test:e2e` → exit 0; 9 Playwright tests passed, including DOCX direct form population, PDF parsing, unchanged no-submit safeguards, and PDF parsing inside the unpacked Manifest V3 extension.
- DOCX browser assertions proved an existing city was preserved, values were not persisted before explicit save, no external request occurred during parsing, and the saved profile excluded the source filename, identity number, and unmapped raw text.
- `artifacts/resume-import.png` was captured from the populated existing editor and visually inspected; the upload summary, existing form sections, imported values, and Organic visual system remain legible with no separate result page.
- `npm run package` → exit 0; validation reran with all 100 tests passing and the ZIP audit passed with 38 entries and no test fixture, source map, or persisted personal-data file.
- `npm audit --omit=dev --json` → exit 0; production dependency vulnerabilities: 0. Full audit still reports 5 existing development-tool findings in the Vitest/Vite toolchain; upgrading that toolchain is a separate compatibility task and did not block the production feature.

### Changed files

- Resume pipeline: `src/resume/extractResumeText.ts`, `src/resume/parseResume.ts`, their tests, and `src/vite-env.d.ts`.
- Existing form integration: `src/options/App.tsx`, `src/options/options.css`, and `src/options/ProfileEditor.test.tsx`.
- Browser evidence: `tests/e2e/resume-import.spec.ts`, `tests/e2e/extension-smoke.spec.ts`, and `artifacts/resume-import.png`.
- Dependencies/docs/harness: `package.json`, `package-lock.json`, `README.md`, `PRIVACY.md`, `feature_list.json`, and `progress.md`.

### Handoff

- F011 is complete and unblocked. Load the refreshed `dist/` or extract the refreshed ZIP to use it.
- Supported inputs are text-bearing PDF and DOCX files up to 10 MB. Scanned/image-only PDFs, encrypted PDFs, legacy `.doc`, OCR, and semantic/AI parsing remain intentionally out of scope.
- Next recommended feature: build an opt-in anonymized accuracy corpus and report precision/coverage by resume layout before expanding deterministic rules or deciding whether a local OCR fallback is justified.

## 2026-08-04 — F012 real-resume work/project parsing (in progress)

### Acceptance baseline

- Applied the `long-running-agent-harness` workflow and created `F012` before changing parser behavior.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\\init.ps1 -SkipInstall` → exit 0; baseline TypeScript, 12 Vitest files/100 tests, production build, and least-privilege permission audit passed.
- The Downloads folder contains 80 PDF/DOCX files; filename filtering for resume/CV terms identifies exactly 5 PDF samples. They will be referenced only by short SHA-256 content digest (`4FFDB2FC`, `5A12C901`, `E5A6ADD6`, `BC238C94`, `06B46FDE`).
- The five source files remain in Downloads and will not be copied, renamed, edited, persisted by the extension, or added to tests/artifacts. Diagnostic output must contain counts and structural signals rather than personal field values.
- Completion requires real-sample expected-versus-actual work/project counts plus anonymized regression fixtures for each distinct failed layout.

### Next action

Run a local browser audit over the five digest-identified files, inspect only the extracted section structure needed to diagnose missed records, and record a privacy-safe baseline before implementation.

### Completed

- Audited all five Downloads PDFs by short SHA-256 digest only. Source files stayed in Downloads; filenames, raw resume text, and personal field values were never added to the repository or persistent browser storage. The temporary digest-named page renders and the local-only diagnostic spec were removed after verification.
- Replaced PDF content-stream ordering with coordinate-based row reconstruction, including cross-column splitting and date-aware joining of right-aligned dates to their organization/title row.
- Added packaged PDF.js CMaps and standard fonts. This fixed two PDFs whose visible Chinese text had previously been exposed by the PDF text layer as unrelated Latin glyphs.
- Added a packaged, network-free Chinese OCR fallback for abnormal Latin-only text layers, with an 8-page bound, a production CSP that permits local WASM, and an end-to-end local OCR smoke test. Pure image-only scans remain unsupported.
- Hardened deterministic section recognition for spaced/inline headings, research/project aliases, combined research-and-internship headings, competition/award boundaries, and campus-activity boundaries.
- Hardened work parsing for split date/organization/role rows and organizations without a legal-company suffix. Hardened project parsing for dated research, undated papers, paper prefixes, and undated bullet-list projects.
- Prevented competition awards, campus activities, and neighboring skill/self-evaluation prose from leaking into project records.
- Added anonymized synthetic regression fixtures only; no real resume data is present in source tests or artifacts.
- Updated README and privacy documentation for local font resources, local OCR fallback, unchanged explicit-save behavior, and unsupported scan-only files.

### Real-sample evidence

- Initial parser result for every digest was `work=0, projects=0`.
- Manual visual baseline and final parser result matched exactly: `4FFDB2FC` → `work=0, projects=1`; `5A12C901` → `1/2`; `E5A6ADD6` → `1/5`; `06B46FDE` → `4/4`; `BC238C94` → `0/2`.
- The final privacy-safe browser audit additionally required every parsed work record to have an evidence-backed organization, start date, and description, and every project record to have a name and description. All five samples passed.
- Competition sections remained awards, and the dated campus-activity entry in `06B46FDE` did not become a fifth project.

### Verification evidence

- `npm test -- --run src/resume` → exit 0; 2 files and 10 tests passed, including PDF coordinate reconstruction and anonymized work/project layout regressions.
- Privacy-safe five-PDF Playwright audit → exit 0; expected-versus-actual work/project counts matched all five digests and record-shape assertions passed.
- `npx playwright test tests/e2e/resume-import.spec.ts --reporter=line` → exit 0; 3 tests passed for DOCX import, PDF import, and network-free local Chinese OCR.
- `npm run validate` → exit 0; TypeScript passed, 12 Vitest files and 104 tests passed, production build succeeded, 11 required distribution assets were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- `npm run test:e2e` → exit 0; all 10 Playwright tests passed, including unpacked-extension PDF import, explicit-save behavior, unchanged no-submit coverage, and local OCR without external requests.
- `artifacts/resume-import.png` was refreshed by the passing browser flow and remains the current user-visible milestone screenshot.
- `npm audit --omit=dev --json` → exit 0; production dependency vulnerabilities: 0.
- `npm run package` → exit 0; `qiuzhao-profile-assistant.zip` was recreated and verified with 227 entries, including local PDF/OCR assets and no test fixture, source map, or persisted personal-data file.

### Changed files

- Parsing/extraction: `src/resume/extractResumeText.ts`, `src/resume/parseResume.ts`, and their tests.
- UI/browser verification: `src/options/App.tsx`, `tests/e2e/resume-import.spec.ts`, and `artifacts/resume-import.png`.
- Local runtime assets/build: `package.json`, `package-lock.json`, `public/manifest.json`, `scripts/build.mjs`, and `scripts/verify-dist.mjs`.
- Documentation/harness: `README.md`, `PRIVACY.md`, `feature_list.json`, and `progress.md`.

### Handoff

- F012 is complete with no known blocker. Load the refreshed `dist/` directory or use the refreshed `qiuzhao-profile-assistant.zip`.
- The five local resumes now meet their manually verified internship/project counts. Imported values still appear as unsaved form edits for user review; identity numbers stay outside the profile model, and website passwords/Cookies, CAPTCHA bypass, and final submission remain out of scope.
- Next recommended feature: if scan-only resume support is desired, add an explicit user-visible OCR progress/cancel flow and a synthetic image-only PDF acceptance corpus before expanding the current abnormal-text-layer fallback.

## 2026-08-04 — F013 field-level resume completeness and form placement (completed)

### Acceptance baseline

- The user rejected count-only acceptance: returning the right number of projects or internships does not prove that each record is complete or placed in the correct information-table fields.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\init.ps1 -SkipInstall` → exit 0; baseline TypeScript, 12 Vitest files/104 tests, production build, bundled PDF/OCR assets, and least-privilege permission audit passed.
- F013 requires a field-by-field visual inventory for the five digest-identified PDFs, parser/merge coverage, and actual browser-form assertions for corresponding labelled controls.
- Real filenames, raw text, personal values, and source files remain outside the repository. Audit evidence will use digests, field-presence matrices, normalized equality checks, and aggregate coverage.

### Next action

Run a local field-level audit over the five PDFs to identify missing dates, roles, descriptions, polluted values, and mismatches between parsed profile paths and the existing editor controls before changing parser behavior.

### Completed

- Visually reviewed all nine pages from the five digest-identified local PDFs and defined a field-by-field expected inventory for every visibly present value supported by the profile schema.
- Corrected deterministic extraction and parsing defects covering Unicode compatibility glyphs, spaced Chinese dates, split degree/major metadata, misplaced GPA/ranking, project roles/outcomes, award row reconstruction/grouping, and Latin-name spacing.
- Extended the real upload flow to verify two education, two work, and two project repeat records against their exact labelled controls, including ordering, dates, descriptions, outcome, unsaved state, explicit save, and storage privacy.
- Added `docs/resume-field-coverage-audit.md` as a privacy-safe durable record. It contains only short digests, aggregate counts, structural conclusions, and evidence-bound exclusions; no filenames, raw text, rendered pages, or personal values were committed.

### Real-sample field evidence

- `4FFDB2FC`: 17 expected / 17 parsed / 17 preserved after merge / 17 placed in the labelled UI control / 0 missing / 0 leakage; 2 education, 0 work, 1 project, 1 award.
- `5A12C901`: 32 / 32 / 32 / 32 / 0 / 0; 2 education, 1 work, 2 projects, 3 awards.
- `E5A6ADD6`: 44 / 44 / 44 / 44 / 0 / 0; 1 education, 1 work, 5 projects, 6 awards.
- `06B46FDE`: 56 / 56 / 56 / 56 / 0 / 0; 2 education, 4 work, 4 projects, 2 awards.
- `BC238C94`: 30 / 30 / 30 / 30 / 0 / 0; 2 education, 0 work, 2 projects, 5 awards.
- Aggregate coverage: 179 expected supported fields / 179 parsed / 179 preserved after merge / 179 placed in exact labelled controls, with 0 missing fields and 0 neighboring-section leakage in the final audit.
- Evidence-bound blanks remain intentional: year-month-only birth values do not invent a day, `至今`/`现在` does not invent an end month, and CET scores do not fabricate conversational proficiency.

### Verification evidence

- `npm test -- --run src/resume src/options/ProfileEditor.test.tsx` → exit 0; 3 files and 18 tests passed.
- Privacy-safe five-PDF browser audit → exit 0; every populated parser path matched its exact labelled editor control: `06B46FDE` 56/56, `4FFDB2FC` 17/17, `5A12C901` 32/32, `BC238C94` 30/30, and `E5A6ADD6` 44/44. Aggregate expected/parsed/merged/UI coverage is 179/179/179/179 with leakage 0. The audit-only spec was removed afterward so local paths cannot enter the repository or package.
- `npm run validate` → exit 0; typecheck passed, 12 Vitest files and 108 tests passed, 1,624 modules built, and the 11-file extension distribution passed the permission/security audit.
- `npm run test:e2e` → exit 0; all 10 Playwright tests passed, including actual DOCX/PDF uploads, OCR, explicit-save behavior, no external requests, privacy storage checks, supported-site filling, and no final submission.
- `artifacts/resume-import.png` was refreshed by the passing multi-record browser flow and visually inspected; the existing Organic editor shows the repeated education, work, and project fields populated in order.
- `npm run package` → exit 0; `qiuzhao-profile-assistant.zip` was recreated with 227 audited entries and no fixture, source map, or persisted personal-data file.

### Changed files

- Resume extraction/parsing: `src/resume/extractResumeText.ts`, `src/resume/parseResume.ts`, and their tests.
- Profile placement verification: `src/options/App.tsx`, `src/options/ProfileEditor.test.tsx`, and `tests/e2e/resume-import.spec.ts`.
- Evidence and release: `docs/resume-field-coverage-audit.md`, `artifacts/resume-import.png`, `dist/`, `feature_list.json`, `progress.md`, and `qiuzhao-profile-assistant.zip`.

### Handoff

- F013 is complete with no product blocker. The five audited resumes now meet field-level completeness and destination-control placement acceptance, rather than count-only acceptance.
- Imported values remain editable and unsaved until explicit confirmation. Identity numbers, passwords/Cookies, verification bypass, and final submission remain outside the product behavior.
- Rendered audit pages were written only to `%TEMP%\qiuzhao-field-audit-*` for visual inspection. Repository/package checks confirm they are not included; this session's shell policy blocked recursive temporary-folder cleanup, so those system-temp folders may be removed manually if desired.
- Next recommended feature: add visible OCR progress/cancel behavior and a synthetic image-only PDF corpus before broadening OCR fallback conditions.

## 2026-08-04 — F014 Agent Reach/OpenCLI real-page acceptance (in progress)

### Acceptance baseline

- Applied the user-requested `long-running-agent-harness` workflow and added F014 before implementation.
- Used Agent Reach's GitHub/web routing guidance to verify the current OpenCLI architecture: OpenCLI plugins may expose read/write browser commands, while the Browser Bridge uses a separate Chrome extension and localhost daemon to bind a concrete logged-in tab.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\init.ps1 -SkipInstall` → exit 0; 12 Vitest files/108 tests passed, the production build succeeded, and required permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- `npm run audit:xiaomi` → exit 0; the live public Xiaomi A96028 source still exposes 9 groups and 34 visible fields, and the audit made no application submission.
- Safe local preflight found OpenCLI `1.8.4`, no `agent-reach` CLI, no installed OpenCLI Browser Bridge extension copy in Chrome/Edge profiles, no responding daemon at `127.0.0.1:19825`, and no live extension connection. The check did not start the daemon, install anything, or read cookies/browser data.
- The validation contract distinguishes four evidence tiers: live public schema, authenticated real-tab read-only scan, user-confirmed real-tab selective fill, and Xiaomi-derived local regression. F014 cannot be marked done from a fixture or public schema alone.
- Real write evidence must remain non-submitting: only opaque IDs from the latest scan may be filled after action-time user confirmation; files, credentials, verification, CAPTCHA, identity numbers, arbitrary selectors/values, and final submission remain unavailable.

### Current blocker and next action

- A live bound-tab scan/fill cannot run until the separately permissioned OpenCLI Browser Bridge is installed and connected. Installing a browser extension requires explicit user confirmation and is not implied by creating the validation harness.
- Next implement the read-only preflight command and the capability/session contract with deterministic tests, then run the local agent-bridge E2E flow. After that, request confirmation to install/enable the OpenCLI Bridge for the authenticated real-page gate.

### Implementation started

- Added `docs/agent-opencli-real-page-validation.md` with four non-interchangeable evidence tiers: live public schema, authenticated real-tab read-only scan, user-confirmed real-tab selective fill, and the Xiaomi-derived local regression.
- Added `npm run audit:agent-bridge`. The preflight observes the OpenCLI CLI, Browser Bridge files, existing daemon status, exact Xiaomi URL eligibility, and the extension permission boundary without starting a daemon, installing software, reading cookies/page values, or mutating browser profiles.
- Added an agent protocol that exposes only `status`, `scan`, `preview`, and selective `fill`; it contains no arbitrary selector/value, upload, password, verification, CAPTCHA, cookie, identity-number, privacy-consent, or submit command.
- Added the in-memory `AgentSessionGuard`: a 256-bit capability, explicit-user-gesture creation, exact HTTPS page/tab binding, ten-minute maximum lifetime, one-time request IDs, latest-scan binding, and one-minute single-use fill approvals whose opaque suggestion-ID set must exactly match the user's selection.
- Added `AgentBridgeController`, which reuses the existing deterministic `scanPage`/`fillPage` engine, strips profile value previews from agent-visible results, maps fillable proposals to opaque IDs, rechecks the current page, and cannot expand a user-approved selection.
- The first full validation exposed test DOM leakage from the new controller fixture into `ProfileEditor.test.tsx`; the fixture now clears its manually created DOM after every test. This was a test-isolation defect introduced by F014, not a product regression.

### Verification evidence

- `npm test -- --run src/agent` → exit 0; 2 files and 8 tests passed. Coverage includes required user gesture, HTTPS/exact-page/tab binding, expiry, replay rejection, scan invalidation, exact one-time approval, value-redacted preview, selective fill, no verification fill, and no submit.
- `npm run audit:agent-bridge -- --url <audited Xiaomi URL>` → exit 0 with status `blocked`; OpenCLI `1.8.4` and the exact eligible Xiaomi URL were detected, the required permission boundary remained unchanged, and only the absent Bridge/daemon/connection were blockers.
- `npm run audit:agent-bridge -- --url <audited Xiaomi URL> --require-ready` → expected exit 1 with blockers `opencli-browser-bridge-not-installed`, `opencli-daemon-not-running`, and `opencli-extension-not-connected`. The real-page gate therefore fails closed.
- Final `npm run validate` → exit 0; 14 Vitest files and 116 tests passed, production build succeeded, and required permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage` with no host permission.
- Audited the official OpenCLI `v1.8.6` release without installing it. Asset `opencli-extension-v1.0.22.zip` matched published SHA-256 `9d2e3d053948beab5d97124aa79b1532d2122e33e461eca56cac113afd33207a`.
- The audited OpenCLI Bridge requests `debugger`, `tabs`, `cookies`, `activeTab`, `alarms`, `storage`, `tabGroups`, `downloads`, and `<all_urls>`. These broad permissions remain isolated in the optional companion and are not added to the recruitment extension.

### Changed files and handoff

- Harness/evidence: `feature_list.json`, `progress.md`, `docs/agent-opencli-real-page-validation.md`, and `package.json`.
- Preflight: `scripts/audit-agent-bridge.mjs`.
- Agent contract: `src/agent/protocol.ts`, `src/agent/session.ts`, `src/agent/controller.ts`, and their tests.
- F014 remains `in_progress`. No browser extension was installed, no daemon was started, no logged-in page was read, and no form value was transmitted.
- Next action requires explicit user approval to install the audited OpenCLI Browser Bridge. After installation, run `opencli doctor`, the `--require-ready` preflight, bind the exact authenticated Xiaomi tab, and proceed first with read-only status/scan/preview. Selective filling still requires a separate action-time confirmation.

## 2026-08-05 - F014 live Xiaomi connection resumed (in progress)

### Recovery and pre-install evidence

- Re-read `feature_list.json`, `progress.md`, and the applicable long-running harness and Agent Reach guidance before acting.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\init.ps1 -SkipInstall` -> exit 0; 14 Vitest files/116 tests passed, the production build succeeded, and the extension permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- Agent Reach's GitHub CLI route confirmed that official OpenCLI `v1.8.6` and Browser Bridge `v1.0.22` are still current on 2026-08-05.
- Updated the separately installed global OpenCLI CLI from `1.8.4` to `1.8.6`.
- Downloaded the official Browser Bridge archive to a temporary path, verified SHA-256 `9d2e3d053948beab5d97124aa79b1532d2122e33e461eca56cac113afd33207a`, and extracted it under `%USERPROFILE%\.opencli\browser-bridge\1.0.22`. The Bridge has not yet been loaded into Chrome.
- The safe preflight still reports `blocked`: no installed Bridge profile copy, no daemon response, and no extension connection. It did not read cookies/page values or mutate the Xiaomi page.
- Windows target discovery returned exactly one Chrome window: `算法实习生 - 小米实习生招聘 - Google Chrome`.

### Handoff

- F014 remains `in_progress`. The next UI action is installing/loading the Browser Bridge, which requires an immediate user confirmation because it grants broad browser permissions including `debugger`, `cookies`, and `<all_urls>`.
- After confirmation: load the verified unpacked Bridge, run `opencli doctor`, bind only the current Xiaomi tab, perform a read-only scan/preview comparison, and request a separate action-time confirmation before transmitting any selected profile values. Never invoke final submission.

## 2026-08-05 - F014 live Xiaomi activeTab repair (in progress)

### Live connection and diagnosis

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\init.ps1 -SkipInstall` -> exit 0; 14 Vitest files/116 tests passed, the production build succeeded, and required permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- OpenCLI `1.8.6` and Browser Bridge `1.0.22` connected successfully. A `qiuzhao` session opened the exact audited Xiaomi application URL and verified the title `投递简历 - 小米实习生招聘` without submitting or filling.
- The assistant side panel could open, but `chrome.scripting.executeScript` failed with `Cannot access contents of the page. Extension manifest must request permission to access the respective host.` The same result persisted after stopping the OpenCLI daemon and cancelling its Chrome Debugger attachment, so the failure was not caused by the OpenCLI lease.
- Root cause: the prior `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` path opened the side panel without delivering a usable one-time `activeTab` grant to its scan call in this Chrome build.

### Repair and verification

- Replaced automatic side-panel opening with an explicit `chrome.action.onClicked` handler that opens the panel for the clicked tab. This keeps the open call inside the real user gesture and adds no host permission.
- Added the underlying browser error to the existing safe scan-failure guidance so future permission failures remain diagnosable without exposing page values.
- Added `src/background/index.test.ts` to prove automatic panel opening stays disabled, the clicked tab ID is used, and missing tab IDs do not open a panel.
- `npm test -- --run src/background` -> exit 0; 1 file and 1 test passed.
- Final `npm run validate` -> exit 0; TypeScript passed, 15 Vitest files/117 tests passed, the production build succeeded, and required permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- Reloaded the repaired unpacked assistant in Chrome and restored the exact audited Xiaomi URL. OpenCLI daemon is intentionally stopped and the debugger attachment is cancelled until the next real user click grants `activeTab`.

### Changed files and handoff

- Changed `src/background/index.ts`, added `src/background/index.test.ts`, updated `src/sidepanel/App.tsx`, rebuilt `dist/`, and appended this handoff to `progress.md`.
- F014 remains `in_progress`. No form field, privacy control, upload, verification input, or submit control was changed.
- Next action: the user must physically click the pinned `秋招填表助手` icon on the restored Xiaomi page and click `扫描当前页面`. After a successful preview, restart/rebind OpenCLI, record redacted scan evidence, and request a separate action-time confirmation before filling the default-safe selection only.

## 2026-08-05 - Long-running all-field and PDF workflow initialized

### Plan audit

- Applied the user-requested `long-running-agent-harness` workflow and reviewed the existing schema, matcher, content engine, side panel, resume parser, real-page evidence, privacy documentation, package scripts, `feature_list.json`, and this progress log.
- The requested direction is reasonable after narrowing “all information” to all evidence-backed, technically fillable, permitted fields. Passwords, verification/CAPTCHA, identity numbers, privacy consent, authentication data, and final submission remain permanently outside automation.
- Resume parsing into the structured profile already exists. Attaching a resume PDF to a recruitment page is a separate high-impact action because some sites transmit immediately when a file is selected; it therefore requires a dedicated threat model, an exact file digest, a page-bound single-use approval, and no generic upload command.
- Split the long-running objective into F015 through F022: redacted page/profile comparison, traceable field coverage, repeatable-row creation, complex controls, attachment architecture, guarded PDF attachment, privacy-safe repair feedback, and multi-site acceptance/package.

### Status and baseline

- F014 is now `blocked`, not failed: the activeTab repair and local validation are complete, but the real Xiaomi gate still requires a post-reload physical toolbar click, read-only scan, and separately confirmed selective fill.
- F015 is `in_progress` and deliberately does not depend on F014, so deterministic comparison work can proceed on local fixtures without weakening real-page evidence requirements.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\init.ps1 -SkipInstall` -> exit 0; TypeScript passed, 15 Vitest files/117 tests passed, the production build succeeded, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.

### Next implementation slice

- Add a field-aware comparison status (`empty`, `equal`, `conflict`, `unreadable`) computed inside the content script.
- Do not return or persist the raw current webpage value; only the status may cross into the side panel or agent preview.
- Default-select only empty, high-confidence, non-sensitive fields; equal fields are skipped and conflicts require explicit approval plus live revalidation.

## 2026-08-05 - F015 privacy-safe page/profile comparison complete

### Implementation

- Added deterministic, field-aware comparison for mapped controls: `empty`, `equal`, `conflict`, and `unreadable`. Email comparison is case-insensitive, phone comparison ignores formatting, date-like fields compare normalized digits, and other fields use the existing deterministic text normalizer.
- Kept raw current webpage values inside `src/content/engine.ts`. Scan results, the side panel, the agent protocol, tests, and screenshots receive only the comparison status and, for conflicts, an opaque in-memory token with no page value embedded in it.
- Added exact conflict approval semantics. The side panel and agent bridge can return the opaque token only for a conflict explicitly selected from the latest scan. `fillPage` rereads the control immediately before writing and refuses missing, stale, newly introduced, or changed conflicts with `conflict-requires-rescan`.
- Changed safe defaults so only empty, high-confidence, non-sensitive proposals are preselected. Equal fields are grouped as already consistent and skipped; conflicts and unreadable/ambiguous fields are not selected by default.
- Password, verification/CAPTCHA, identity-sensitive, privacy-consent, file, and submit controls remain excluded. No submission path was added.

### Verification evidence

- `npm test -- --run src/content src/sidepanel src/agent` -> exit 0; 4 files and 19 tests passed at the targeted checkpoint.
- `npm run typecheck` -> exit 0.
- `npm run test:e2e -- --grep "page comparison"` -> exit 0; 2 tests passed. The fixture proved raw conflict text was absent from serialized scan output, equal values were skipped, empty values filled, and a post-scan conflict change was refused.
- Inspected `artifacts/page-comparison.png` (68,755 bytes, generated 2026-08-05 11:26 local time). It visibly separates webpage-empty, conflict, and already-consistent groups, with the conflict unselected until the test's explicit check and no submit control/action.
- Final `npm run validate` -> exit 0; TypeScript passed, 15 Vitest files/119 tests passed, production build succeeded, 11 required distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- Final `npm run test:e2e` -> exit 0; 11/11 tests passed, including the unpacked extension smoke test, fixture comparison, side-panel comparison, Xiaomi-derived non-submitting regression, local PDF/DOCX import, and local OCR.

### Changed files and handoff

- Comparison and guarded filling: `src/content/engine.ts`, `src/content/engine.test.ts`.
- User/agent surfaces: `src/sidepanel/App.tsx`, `src/sidepanel/sidepanel.css`, `src/sidepanel/pageBridge.ts`, `src/sidepanel/SidePanel.test.tsx`, `src/agent/protocol.ts`, `src/agent/controller.ts`.
- Page-level acceptance: `tests/e2e/fill-fixture.spec.ts`, `tests/e2e/sidepanel-preview.spec.ts`, `artifacts/page-comparison.png`.
- Harness state: `feature_list.json`, `progress.md`.
- The workspace is intentionally not a Git repository, so Git status/diff evidence is unavailable; no commit or push was attempted.
- Next recommended feature is F016. It should inventory the union of profile, resume-parser, and audited-page fields before any schema expansion. F019/F020 remain the separate threat-model and guarded implementation work for attaching a user-selected PDF; generic file upload remains unavailable.

## 2026-08-05 - F016 all-source coverage matrix complete

### Implementation and live evidence

- Added `docs/field-coverage-matrix.md`, covering 45 persisted profile leaves plus `derived.age`, their profile/resume/Xiaomi evidence, sensitivity, control kinds, comparison normalization, support state, and explicit unsupported reasons for attachments, identity, verification, privacy consent, recommendation source, and final submission.
- Added `src/matching/catalog-coverage.test.ts`. It proves the canonical catalog contains every supported path exactly once, every entry has aliases and control kinds, the six confirmation-required paths are complete, and all 46 paths use deterministic comparison normalization.
- Added missing deterministic matcher cases for work start/end dates and award descriptions. Exported the existing comparison normalizer for direct contract tests without changing runtime behavior.
- Added the privacy-safe `npm run audit:repeatable-page` harness. On Windows it invokes the resolved OpenCLI Node entry point without shell re-tokenization, enforces an exact origin/path prefix, redacts record IDs and query values, and emits no current form values.
- The bound Xiaomi page at `/internship/resume/:id/apply` was audited read-only. Current structural rows were education 2, internship 1, project 2, language 2, works 0, and awards 0. Every group had exactly one unique, enabled section-local add target after DOM-node deduplication: non-empty groups used `.formOperate-addBtn`; empty groups used `.createFormSection-addBtn`.
- The live site now exposes repeatable paths through `data-cy` aliases such as `education[0]` instead of only the older `data-form-field-name`/`education_list[0]` contract. The audit supports both forms. It did not read input/textarea values and did not click, fill, delete, upload, navigate, or submit.

### Verification evidence

- `npm test -- --run src/matching/catalog-coverage.test.ts src/matching/matcher.test.ts` -> exit 0; 2 files and 113 tests passed.
- `npm run audit:repeatable-page -- --session qiuzhao-audit --expected-origin https://xiaomi.jobs.f.mioffice.cn --expected-path-prefix /internship/resume/` -> exit 0 after the final deduplicated audit; six repeatable groups were found, each with one add candidate, and all safety mutation flags were false.
- `npm test -- --run src/domain src/matching src/options src/resume` -> exit 0; 7 files and 141 tests passed.
- `npm run audit:xiaomi` -> exit 0; 9 groups and 34 visible fields verified, with no application submission.
- `docs/field-coverage-matrix.md` UTF-8 audit -> 0 replacement characters; the live-evidence and F017 safety-protocol sections were present.
- Final `npm run validate` -> exit 0; TypeScript passed, 16 Vitest files and 171 tests passed, production build succeeded, 11 required distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.

### Changed files and handoff

- Harness/state: `feature_list.json`, `progress.md`, `package.json`, `scripts/audit-live-repeatable-page.mjs`.
- Coverage and tests: `docs/field-coverage-matrix.md`, `src/matching/catalog-coverage.test.ts`, `src/matching/matcher.test.ts`, `src/content/engine.ts`.
- F016 is `done`; F017 is now `in_progress`. Implement one verified section-local row increment at a time against local fixtures, rescan after every structural mutation, stop on any fingerprint/count drift, never use a generic text-button click, and never click a real-page add or submit control during development.

## 2026-08-05 - F017 missing repeatable records complete

### Implementation

- Added `src/content/repeatableRecords.ts` with a closed six-group contract for education, internships, work samples, projects, awards, and languages. Callers can pass only a group key and the current profile; they cannot pass selectors, button text, values, or requested counts.
- The Xiaomi adapter is enabled only for the exact production origin/path shape or an explicitly marked loopback fixture. It supports both audited static paths such as `project_list[0]` and current live `data-cy` paths such as `project[0]`.
- Profile counts include only records with at least one non-empty business field. Page counts use distinct structural array indexes and never read input or textarea values.
- Creation is bounded to ten rows per group action. It clicks only a unique enabled `.formOperate-addBtn` or `.createFormSection-addBtn` inside the fixed section class, checks an internal fingerprint, performs one click, waits for mutation, and rescans before another click.
- Each successful increment requires an unchanged URL, no removed indexes, exactly one new index, and row count exactly +1. The operation stops on ambiguity, disabled/missing controls, navigation, timeout, unexpected row changes, or add-control fingerprint change. It never deletes, reorders, uploads, or submits.
- Added the `CREATE_REPEATABLE_RECORDS` content message and a bounded `PageBridge` method; the agent protocol still has no arbitrary click or repeatable-row command.
- `scanPage` now returns the privacy-safe repeatable plan. The side panel shows each missing group with profile/page/missing counts and requires an explicit per-group “创建并重扫” action; after creation it rescans and regenerates normal field proposals before filling.
- Added the Organic-styled `repeatable-fixture.html` and its Xiaomi-shaped dynamic form harness. The regression created 8 rows across the six group types, then filled the newly available fields while keeping delete and submit counters at zero.

### Verification evidence

- `npm test -- --run src/content/repeatableRecords.test.ts` -> exit 0; 7 tests passed. Cases cover count comparison, one-row rescans, empty-to-populated fingerprint change, ambiguous controls, +2 structural drift, the ten-row cap, and site fail-closed behavior.
- `npm test -- --run src/content src/sidepanel` -> exit 0; 4 files and 19 tests passed, including the explicit side-panel group action and post-create rescan.
- `npm test -- --run src/content src/matching` -> exit 0; 5 files and 131 tests passed.
- `npm run test:e2e -- --grep "repeatable records"` -> exit 0; 1 test passed. Projects grew from 1 to 3 in one stable-fingerprint action; an empty internship group created 1 row, stopped on the expected fingerprint change, and required a second group action for row 2. Final missing count was zero for all six groups; add count was 8, delete count 0, submit count 0, and at least 28 new-row values were filled.
- Inspected `artifacts/repeatable-records.png` (167,386 bytes, generated 2026-08-05 12:45 local time). It shows all six group summaries at missing 0 and the filled two education, two internship, one work sample, three project, one award, and one language rows; delete and final-submit controls remain visible but unused.
- Final `npm run validate` -> exit 0; TypeScript passed, 18 Vitest files and 179 tests passed, production build succeeded, 11 required distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- Final `npm run test:e2e` -> exit 0; 12/12 tests passed, including extension load, privacy controls, profile editor, local PDF/DOCX import, local OCR, page comparison, Xiaomi non-submitting regression, and repeatable records.
- Final live `npm run audit:repeatable-page -- --session qiuzhao-audit ...` -> exit 0. The real Xiaomi page still had education 2, internship 1, project 2, language 2, works 0, awards 0, with exactly one enabled add candidate per group and every mutation/click safety flag false. `opencli browser qiuzhao-audit unbind` then returned `unbound: true`.

### Changed files and handoff

- Core: `src/content/repeatableRecords.ts`, `src/content/engine.ts`, `src/content/index.ts`, `src/shared/messages.ts`, `src/sidepanel/pageBridge.ts`.
- UI/tests: `src/sidepanel/App.tsx`, `src/sidepanel/sidepanel.css`, `src/content/repeatableRecords.test.ts`, `src/sidepanel/SidePanel.repeatable.test.tsx`.
- E2E/evidence: `repeatable-fixture.html`, `src/fixture/repeatable-main.ts`, `tests/e2e/repeatable-records.spec.ts`, `artifacts/repeatable-records.png`.
- Harness/docs: `feature_list.json`, `progress.md`, `docs/field-coverage-matrix.md`.
- F017 is `done`; no real recruitment page value or structure was changed. The built extension must be reloaded before manual acceptance. Next recommended feature is F018: support and verify audited date ranges, cascading/searchable selects, multi-selects, radios, and rich text without adding arbitrary execution or final submission.

## 2026-08-05 - Public GitHub publication

### Release preparation

- Renamed the public-facing project title to “秋招投递助手” and added an MIT license.
- Added repository ignores for local Chrome/Chromium profiles, dependencies, build and test artifacts, archives, logs, and environment files. The local profile directories were preserved on disk and were not committed.
- Removed the audited page query token and the developer-specific Windows path from publishable source and documentation. The retained Xiaomi job identifier is a public fixture/audit identifier, not account data.
- A publish-scope privacy scan found no developer username, removed query token, common access-token pattern, or private-key marker in the files selected for Git.

### Verification evidence

- `git diff --cached --check` -> exit 0 before the initial commit.
- `npm run audit:xiaomi` -> exit 0; 9 groups and 34 visible fields verified, with no application submission.
- Final pre-publication `npm run validate` -> exit 0; TypeScript passed, 18 Vitest files and 179 tests passed, production build succeeded, 11 required distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- The latest full `npm run test:e2e` milestone remains exit 0 with 12/12 tests passed and a current repeatable-record screenshot in `artifacts/`; that local evidence directory is intentionally excluded from the public repository.

### Publication and handoff

- Created the public repository at `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou` and pushed `main`.
- Initial source commit: `5059de0` (`Initial release of 秋招投递助手`).
- GitHub normalizes the requested pure-Chinese repository identifier to `-`; because that historical empty repository already exists on the account, the shareable repository slug is `qiuzhao-toudi-zhushou`. The README and product UI retain the requested Chinese name.
- Published source excludes `.chrome-autofill-profile/`, `.chromium-autofill-profile/`, `node_modules/`, `dist/`, `artifacts/`, test reports, environment files, and ZIP archives.
- No product feature state changed: F016 and F017 remain `done`, F018 remains the next recommended feature.

## 2026-08-05 - F023 current local resume corpus (in progress)

### Inventory baseline

- The user prioritized resume-extraction coverage, so F023 was added as an independent unblocked feature after F013/F017; F018 remains `todo` and unchanged.
- A read-only filename and local text-structure scan covered the 84 PDF/DOCX/DOC files currently in Downloads. It identified 11 resume-like files: 10 PDFs and 1 DOCX. Desktop contained no candidate office documents; the broad Documents scan was stopped after its time bound and was not needed because every confirmed candidate is in Downloads.
- The previously audited PDF digests remain `4FFDB2FC`, `5A12C901`, `E5A6ADD6`, `BC238C94`, and `06B46FDE`. Newly discovered layout digests are `317CA5B2`, `74F1E5AC`, `79636754`, `EA62283F`, `2EA7842E`, and DOCX `6EA82132`.
- Repository evidence contains only short content digests, format/count metadata, and structural coverage. Source files, filenames, raw text, rendered pages, and personal values remain local and must not enter Git, screenshots, fixtures, or logs.

### Baseline verification

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\init.ps1 -SkipInstall` -> exit 0; TypeScript passed, 18 Vitest files/179 tests passed, production build succeeded, 11 required distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- The next action is to visually inventory the six newly discovered layouts, run the real browser extraction/parser locally, compare supported-field coverage by digest, and convert only confirmed deterministic failures into anonymized fixtures before changing product code.

### F023 completion

- Visually reviewed all nine pages of the five new PDFs. The DOCX was reviewed through its complete OOXML paragraph/list order and the actual browser DOCX extraction path; Word, LibreOffice, and the packaged visual renderer were unavailable, so original DOCX pagination/layout was not claimed.
- The digest-only browser audit covered all six new layouts without outputting filenames, raw text, or personal values. Non-empty mapped paths increased from 131 to 184 (+53): `2EA7842E` 23->28, `317CA5B2` 40->45, `6EA82132` 20->23, `74F1E5AC` 5->28, `79636754` 14->26, and `EA62283F` 29->34.
- Final record counts matched the source section inventory: `2EA7842E` education 2/work 2/projects 3; `317CA5B2` education 3/projects 5/awards 4/languages 2; `6EA82132` education 2/work 1/projects 1/languages 2; `74F1E5AC` education 3/work 4/awards 5; `79636754` education 2/projects 5; `EA62283F` education 2/work 1/projects 4/languages 1.
- Added deterministic handling for new section boundaries, year-only education/work, expected-admission months, split degree/major lines, undated project boundaries, international phones, inline job preferences, multiple explicit languages/proficiency levels, cross-line award lists, and role/company separation. Year-only dates remain blank rather than receiving fabricated months.
- Added only anonymous synthetic unit/E2E fixtures. The permanent corpus flow parses 3 education, 2 work, 3 project, and 2 language records, creates missing rows, fills 23 recruitment-form controls, and leaves delete/final-submit counters at zero.
- The temporary audit specs and `tmp/pdfs` renders were deleted after use. The original Downloads files were not copied, renamed, edited, or removed; `tmp/` is now ignored to prevent future local review artifacts from entering Git.

### Verification evidence

- Digest-only six-layout browser audit -> exit 0 after final parser changes; aggregate mapped paths 184 and the record counts above matched the visual/structural inventory.
- Focused real award-list audit for `74F1E5AC` -> exit 0; five distinct awards were recovered from a cross-line semicolon/comma/acronym list. The audit-only spec was then deleted.
- `npm test -- --run src/resume/parseResume.test.ts` -> exit 0; 14 tests passed, including three corpus-derived parsing cases and the cross-line award regression.
- `npm run test:e2e -- --grep "resume corpus"` -> exit 0; 1 test passed and generated `artifacts/resume-corpus.png`.
- Inspected `artifacts/resume-corpus.png`; it contains only anonymous synthetic values, shows education/work/project/language rows at missing 0, keeps the final-submit control visible but unused, and contains no real resume data.
- Final `npm run validate` -> exit 0; TypeScript passed, 18 Vitest files/183 tests passed, production build succeeded, 11 required distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- Final `npm run test:e2e` -> exit 0; 13/13 tests passed, including extension PDF import, DOCX/PDF/OCR import, the new resume-to-webpage corpus flow, repeatable-row creation, page comparison, privacy controls, and no-submit regressions.

### Changed files and handoff

- Parser/profile UI: `src/resume/parseResume.ts`, `src/resume/parseResume.test.ts`, `src/options/App.tsx`.
- End-to-end evidence: `tests/e2e/resume-corpus-flow.spec.ts`, local-only `artifacts/resume-corpus.png`.
- Durable evidence/state: `docs/resume-field-coverage-audit.md`, `feature_list.json`, `progress.md`, `.gitignore`.
- F023 is `done` with no known product blocker. F018 remains the next recommended unblocked feature: verified date ranges, cascading/searchable selects, multi-selects, radios, and rich text on recruitment pages. F014 remains separately blocked on the user's physical real-page `activeTab` gesture.

## 2026-08-05 - F024 Chinese guide, installable Skill, and v0.2.0 prerelease complete

### Implementation and distribution

- Rewrote `README.md` as a Chinese end-user entry point with release downloads, Chrome/Edge unpacked loading, local PDF/DOCX import, current-page `activeTab` authorization, repeatable-row creation, selective filling, privacy boundaries, source development, Skill installation, and troubleshooting.
- Added the repository-local `qiuzhao-toudi-assistant` Skill with only `SKILL.md`, generated `agents/openai.yaml`, and a deterministic PowerShell preparation script. It guides build/load/import/scan/compare/fill/recovery flows while explicitly withholding credential, Cookie, verification-bypass, arbitrary-file, arbitrary-click, and final-submit capabilities.
- Added `npm run install:skill`, which copies the Skill to the configured Codex skills directory and refuses to replace an existing installation without `--force`. An isolated temporary-destination test compares the three required installed files byte for byte.
- Added `verify:skill`, `package:skill`, and `package:release`. Release packaging produces the extension ZIP, standalone Skill ZIP, and an all-in-one bundle with an unpacked `extension/`, the Skill, Chinese README, privacy notice, and license. Generated ZIPs remain ignored by Git.
- Raised the package and extension manifest version from 0.1.0 to 0.2.0. No browser permission changed; they remain exactly `activeTab`, `scripting`, `sidePanel`, and `storage`.
- Pushed commit `6da3c4d` to `agent/chinese-readme-skill-release` and opened draft PR #1: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/1`.
- Published public prerelease `v0.2.0-rc.1`: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/releases/tag/v0.2.0-rc.1`. GitHub reports all three assets as uploaded.

### Verification evidence

- Skill Creator `quick_validate.py` under Python UTF-8 mode -> exit 0, `Skill is valid!`. UTF-8 mode was required because the Windows default Python text codec was GBK.
- `npm run verify:skill` -> exit 0; required Skill files, frontmatter, generated UI metadata, privacy guards, `activeTab`, validation, and no-submit contract were verified.
- `npm run test:skill-install` -> exit 0; an isolated destination received byte-identical `SKILL.md`, `agents/openai.yaml`, and `scripts/prepare-extension.ps1`, then the temporary directory was deleted.
- Direct execution of the bundled `prepare-extension.ps1` -> exit 0; it ran the v0.2.0 validation and returned the absolute `dist` directory for manual Chrome/Edge loading.
- Final `npm run package:release` -> exit 0. `npm run validate` passed 18 Vitest files/183 tests, the production build and 11-file distribution audit passed, the extension archive contained 227 entries, the Skill archive contained 3 entries, and the combined archive contained 233 entries.
- Final `npm run test:e2e` -> exit 0; 13/13 tests passed, including the unpacked extension smoke test, PDF/DOCX/OCR import, anonymous resume-corpus form flow, repeatable-row creation, page comparison, privacy controls, and no-submit regressions.
- Inspected the regenerated `artifacts/resume-corpus.png` (166,547 bytes, 2026-08-05 14:26 local time). It contains only anonymous synthetic values, shows missing repeatable records at zero, and labels the final-submit fixture control as never triggered.
- Publish-scope scan covered 20 changed/untracked source files and found no audited resume name, developer username, GitHub token, or private-key marker. Archive scans covered 17 text entries in the 227-entry extension ZIP, all 3 Skill entries, and 22 text entries in the 233-entry bundle with no private marker.
- Local/GitHub SHA-256 values matched: extension `1BD05FD78026D3A2B32F69C1CF1A6D981A6D8B778D2EC76ECCD6807049303055` (5,736,646 bytes), Skill `202CB61FED0BB11D343714EC81BB4D4C76D89BB94EF7647452DA39BD0EC0FA52` (3,857 bytes), bundle `E9355C0DB7C243F42300B9B5CED1B2BB2695A7A417B4962EF1F6A96603BDDE67` (5,891,098 bytes).

### Changed files and handoff

- User documentation/version: `README.md`, `package.json`, `package-lock.json`, `public/manifest.json`.
- Skill: `skills/qiuzhao-toudi-assistant/SKILL.md`, `skills/qiuzhao-toudi-assistant/agents/openai.yaml`, `skills/qiuzhao-toudi-assistant/scripts/prepare-extension.ps1`.
- Install/package automation: `scripts/install-skill.mjs`, `scripts/verify-skill.mjs`, `scripts/test-skill-install.mjs`, `scripts/package-skill.mjs`, `scripts/package-release.mjs`.
- F023 parser/corpus changes and their evidence are included in the same published branch; generated archives and screenshots remain local-only/Release-only and are not committed.
- F024 is `done`. The prerelease is publicly downloadable and PR #1 remains a draft for owner review before merging to `main`. Next recommended product feature remains F018; F014 remains blocked on a physical real-page `activeTab` gesture.

## 2026-08-05 - F019 resume attachment architecture kickoff

- The user explicitly prioritized safe resume attachment after observing that the current product never places the resume into recruitment-site file controls.
- F019 is now `in_progress`. Its obsolete F018 dependency was removed: date ranges, cascading selects, radios, multi-selects, and rich-text adapters are independent of discovering one high-confidence resume file input and transferring one user-selected PDF.
- The acceptance order is intentionally strict: prove the pre-transmission confirmation boundary and immediate-upload behavior on an instrumented local fixture first; implement the product flow only if bytes remain session-only and destination-bound; perform a real recruitment-page transfer only after the user confirms the exact file and HTTPS origin because selection may immediately transmit personal data.
- Baseline `init.ps1 -SkipInstall` -> exit 0; 18 Vitest files/183 tests passed, production build succeeded, 11 required distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.

### F019 completion evidence

- Added `docs/resume-attachment-threat-model.md`. It selects the extension-memory `File` path and defines three distinct gates: instrumented local Chrome, unpacked-extension machine acceptance, and a real authenticated recruitment-page transfer that requires explicit confirmation of the exact PDF and HTTPS Origin.
- Added `src/content/resumeAttachment.ts`. It recognizes only one high-confidence PDF resume input, excludes identity/photo/transcript/portfolio/recommendation/certificate controls, validates filename/MIME/size/SHA-256/PDF signature, binds a 60-second single-use authorization to Origin and element, consumes it on the first attempt, and never stores a path or bytes.
- The instrumented fixture proves the critical network boundary: selecting/preparing a synthetic PDF leaves `files.length`, upload requests, and submit count at zero; setting the file after confirmation fires exactly one `change` and one immediate attachment request, while the identity attachment stays empty and final-submit count stays zero.
- Wrong digest and replay attempts were rejected without a second request. Unit coverage also rejects wrong Origin, non-PDF names/MIME, oversized files, stale confirmation, and ambiguous resume controls.

### F019 verification

- `npm test -- --run src/content/resumeAttachment.test.ts src/content/engine.test.ts` -> exit 0; 2 files/11 tests passed.
- `npm run typecheck` -> exit 0 after explicitly narrowing decoded bytes to an ordinary `ArrayBuffer` for Web Crypto and `File` compatibility.
- `npm run test:e2e -- --grep "resume attachment prototype"` -> exit 0; 1/1 passed in installed Chrome. Network observation recorded zero requests before authorization and exactly one after attachment; submit count remained zero.
- Inspected `artifacts/resume-attachment-prototype.png` (34,249 bytes, 2026-08-05 15:16 local time). It contains only `synthetic-resume.pdf`, shows the resume accepted, the identity attachment empty, and the submit control unused.
- Final `npm run validate` -> exit 0; TypeScript passed, 19 Vitest files/186 tests passed, production build succeeded, 11 required files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- F019 is `done`; F020 is now `in_progress`. The real recruitment-site gate remains intentionally unexecuted until the product UI displays and the user confirms the exact PDF, Origin, and matched control because the site may upload immediately on `change`.

## 2026-08-05 - F020 user-confirmed resume PDF attachment completed

### Product implementation

- Added the complete side-panel flow for one user-selected PDF: local MIME/name/size/PDF-header validation, local SHA-256 calculation, and a confirmation card that exposes the exact filename, size, digest prefix, destination Origin, and matched control before any page file input is changed.
- Added two page-bound content messages. Authorization first re-discovers the unique high-confidence resume control and issues a 60-second single-use token bound to the Origin, element, filename, MIME, size, and digest. Only after authorization does the bridge transfer the in-memory bytes; the token is consumed on the first attempt even when attachment fails.
- Limited real attachment destinations to HTTPS. Plain HTTP fails closed except for `localhost`, `127.0.0.1`, and `::1`, which are reserved for synthetic local acceptance fixtures.
- Identity, passport, photo, transcript, portfolio, recommendation, certificate, ambiguous, multiple, existing-file, non-PDF, changed-page, expired, wrong-digest, and replay cases remain unavailable. The agent protocol still exposes no upload or arbitrary filesystem-path action.
- Added Organic side-panel states for selection, hashing, confirmation, success, failure, and unsupported controls. Success explicitly warns that the recruitment site may already have received the file and that final submission remains the user's action.
- Updated the Chinese README, privacy notice, and repository Skill to distinguish local resume parsing from a user-confirmed recruitment-site attachment. The Skill continues to forbid generic uploads and now requires confirmation of the exact PDF digest, HTTPS Origin, and resume control.

### Browser and verification evidence

- `npm test -- --run src/agent src/content src/sidepanel` -> exit 0; 7 files and 31 tests passed before the final secure-Origin case was added.
- Skill Creator `quick_validate.py` under Python UTF-8 mode -> exit 0, `Skill is valid!`; `npm run verify:skill` -> exit 0.
- `npm run test:e2e -- --grep "resume attachment"` -> exit 0; 2/2 tests passed in installed Chrome. The instrumented page observed zero attachment requests before confirmation, exactly one after confirmation, zero identity attachments, and zero final submits. The side panel withheld its confirmation action until a synthetic PDF was selected and showed the exact synthetic metadata and loopback destination.
- Inspected `artifacts/resume-attachment.png` (76,052 bytes) and `artifacts/resume-attachment-confirmed.png` (78,742 bytes), refreshed at 2026-08-05 15:48 local time. Both contain only synthetic profile/file data; the first proves the pre-transmission confirmation surface and the second shows the non-submitting completion message.
- Final `npm run validate` -> exit 0; TypeScript passed, 19 Vitest files/188 tests passed, the production build succeeded, 11 required distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, and `storage` with no host permission.
- Final `npm run test:e2e` -> exit 0; 15/15 tests passed, including unpacked extension startup, local PDF/DOCX/OCR import, repeatable-row creation, field comparison/fill, both attachment gates, privacy controls, and no-submit regressions.

### Real-machine acceptance boundary and handoff

- Added F025 as the durable real-recruitment-site gate. Passing it requires the user's authenticated HTTPS tab, a physical extension-icon click, an exact local PDF choice, a 30-second pre-confirmation network observation, one confirmation, at most one attachment request, and zero final-submit/application-submit requests. Evidence must contain only structural results and a short digest, never the real filename, path, content, page values, Cookie, or token.
- A read-only OpenCLI preflight found CLI 1.8.6 and Browser Bridge 1.0.22 connected; the audited Xiaomi URL is eligible and the assistant manifest remains least-privilege. The `qiuzhao` session currently resolves to `about:blank`, and profile-copy discovery cannot prove the unpacked bridge installation, so no real page was read or mutated and no live attachment was attempted.
- F020 is `done`; F025 is intentionally `blocked` on the user's action-time choice of the exact PDF and authenticated HTTPS recruitment page. The next safe user step is to load/refresh the current `dist/`, open the desired application page, click the assistant icon, scan, and provide the exact PDF only when ready to let that named site receive it. F018 remains the next unblocked engineering feature if live acceptance is deferred.

### Changed files

- Attachment core and message path: `src/content/resumeAttachment.ts`, `src/content/resumeAttachment.test.ts`, `src/content/engine.ts`, `src/content/index.ts`, `src/shared/messages.ts`, and `src/sidepanel/pageBridge.ts`.
- User flow and browser evidence: `src/sidepanel/App.tsx`, `src/sidepanel/sidepanel.css`, `src/sidepanel/SidePanel.test.tsx`, `tests/e2e/resume-attachment-flow.spec.ts`, and the local-only attachment screenshots under `artifacts/`.
- Documentation and durable state: `README.md`, `PRIVACY.md`, `docs/resume-attachment-threat-model.md`, `skills/qiuzhao-toudi-assistant/SKILL.md`, `feature_list.json`, and `progress.md`.

## 2026-08-05 - F026 fill-quality evolution harness kickoff

- Applied the user-requested `long-running-agent-harness` and the controlled AI-system evolution workflow. The reality to change is not “produce more model commentary”; it is to make recruitment-page filling measurably more accurate while preserving local-first behavior, zero final submission, and deterministic safety boundaries.
- Decision object: choose whether a concrete matcher/control/workflow change should be promoted. The default action without new evidence is to keep the current deterministic implementation. The owner of runtime promotion is the user; AI may build reversible evaluation tooling, collect synthetic evidence, and draft one candidate fix, but cannot promote a rule from one model response.
- Evaluation order is fixed: explicit synthetic ground truth -> actual installed-Chrome observation -> deterministic metrics -> optional DeepSeek shadow diagnosis -> anonymized regression -> candidate comparison -> Human Gate -> promotion or rollback. Critical safety failures override aggregate accuracy.
- The ignored `.env` contains all four expected OpenAI-compatible variables and a configured `bailian/deepseek-v4-flash` model. Neither key nor value was printed. Both configured endpoints use remote plain HTTP; a no-key HTTPS probe failed with `ERR_SSL_PACKET_LENGTH_TOO_LONG`, so sending the API key or any evaluation payload is blocked.
- Official DeepSeek documentation confirms that the current official OpenAI-compatible base URL is HTTPS and that `deepseek-v4-flash` supports JSON output. The configured gateway/model alias is therefore treated as a separate provider and is not silently rewritten because its key may not work against the official service.
- Baseline `./init.ps1 -SkipInstall` -> exit 0; 19 Vitest files/188 tests passed, production build succeeded, 11 required distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, `storage`.
- Added F026-F028 for the evaluation harness, HTTPS model calibration, and one evidence-backed product iteration. F026 is `in_progress`; F027 is blocked on a trusted HTTPS endpoint; F028 remains dependent on reproducible feedback.

### F026 completion and first feedback loop

- Added `evals/fill-quality-suite.json` version `2026-08-05.1` with explicit synthetic ground truth for the generic and Xiaomi-derived forms, repeatable-record counts, attachment targeting, and zero-tolerance safety counters.
- Added a real-Chrome observation test plus deterministic scorer. Artifacts contain only field keys, canonical paths, confidence/exclusion/status codes, booleans, counts, timestamps, and aggregate metrics. A recursive forbidden-key audit found no raw/profile/page value, resume text, HTML, screenshot, file path, Cookie, authorization, API key, or token field.
- The first baseline produced perfect path/value metrics but failed the gate with `duplicateProposalCount: 1`: the two inputs in one `name=gender` radio group became two side-panel suggestions. Changed DOM discovery to emit one logical control per `(form, radio name)` while retaining the full option list and existing group fill behavior.
- The post-fix baseline passed: 35 true-positive mappings, 0 false positives, 0 false negatives, precision/recall/F1 `1.0`; 35/35 exact fills; 6/6 correct exclusions; 8/8 repeatable records created; repeatable coverage `1.0`; attachment targeting `1.0`; duplicate proposals `0`; critical safety violations `0`.
- Added a development-only DeepSeek/OpenAI-compatible adapter with an HTTPS-only endpoint gate, no redirects, bounded timeout/output, JSON mode, disabled thinking, temperature zero, four known calibration cases, sanitized persisted findings, independent model-id/calibration checks, and no extension runtime import. `.env.example` documents the official secure shape without a key.
- The first fail-closed probe exposed an overly verbose data-URL stack containing bundled evaluator source but no key or request payload. The runner now catches configuration errors at its boundary. The final `npm run eval:fill -- --judge --skip-browser` -> expected exit 1 before network transmission with only `Refusing to send the judge key or payload over non-HTTPS transport.` No paid model request was made.

### Verification evidence

- `npm test -- --run src/evaluation` -> exit 0; 2 files/6 tests passed for deterministic metrics, privacy-key rejection, HTTPS configuration, bounded JSON request construction, response sanitization, and judge calibration scoring.
- `npm test -- --run src/matching/dom.test.ts src/content/engine.test.ts src/evaluation` -> exit 0; 4 files/17 tests passed after the radio-group correction.
- `npm run eval:fill -- --offline` -> exit 0; installed Chrome generated the synthetic artifacts and every deterministic quality/safety gate passed with the metrics above.
- Final `npm run validate` -> exit 0; TypeScript passed, 21 Vitest files/194 tests passed, production build succeeded, 11 required distribution files were verified, and permissions stayed exactly `activeTab`, `scripting`, `sidePanel`, and `storage`.
- Final `npm run test:e2e` -> exit 0; 16/16 installed-Chrome tests passed, including the new fill-quality evaluation and all prior profile, resume, repeatable, attachment, privacy, Xiaomi, and zero-submit regressions.
- Inspected ignored `artifacts/fill-quality-observation.json` (16,960 bytes) and `artifacts/fill-quality-report.json` (629 bytes); both are synthetic-only and the forbidden-key scan returned an empty list.

### Changed files and handoff

- Harness and documentation: `feature_list.json`, `progress.md`, `docs/fill-quality-evolution-plan.md`, `.env.example`, `README.md`, and `package.json`.
- Ground truth and scoring: `evals/fill-quality-suite.json`, `src/evaluation/fillQuality.ts`, and `src/evaluation/fillQuality.test.ts`.
- Shadow judge: `src/evaluation/judgePolicy.ts`, `src/evaluation/judgePolicy.test.ts`, and `scripts/run-fill-quality-eval.mjs`.
- Browser observation and first promoted fix: `tests/e2e/fill-quality-eval.spec.ts`, `src/matching/dom.ts`, and `src/matching/dom.test.ts`.
- F026 is `done`. F027 remains `blocked` until the user replaces the remote HTTP endpoint with a trusted HTTPS endpoint and a compatible key/model alias. Do not silently switch the URL to the official DeepSeek service because the existing key may belong to the configured gateway. Once HTTPS is configured, run `npm run eval:fill -- --judge`; only a calibration-perfect, model-matched sanitized report may unblock F028.
- Rollback: revert the F026 checkpoint to remove the evaluator and restore the previous per-radio-input discovery behavior; no storage migration, browser permission, production endpoint, or user data is involved.

## 2026-08-05 - F027 Boyue DeepSeek calibration

- The first requested judge run stopped before transmission because both ignored local URLs still used plain HTTP. Safe metadata inspection confirmed this came from `.env`, not process-variable precedence; the API key was configured but never printed.
- A no-key TLS probe showed port 3888 does not support TLS. The server's public certificate on port 443 identified `api.boyuerichdata.opensphereai.com`; a no-key request to `https://api.boyuerichdata.opensphereai.com/v1/chat/completions` completed certificate validation and returned the expected unauthenticated `401` response.
- Updated only the two ignored local endpoint values to that certificate-verified HTTPS origin. The existing key and configured `bailian/deepseek-v4-flash` alias were preserved. No real resume, recruitment-page value, HTML, filename, path, cookie, or authentication content was sent; the request contained only the versioned synthetic observation and aggregate deterministic report.
- `npm run eval:fill -- --judge` -> exit 0. Installed Chrome passed the synthetic evaluation; deterministic results were 35 TP, 0 FP, 0 FN, F1 `1.0`, 35/35 exact fills, 6/6 exclusions, repeatable coverage `1.0`, attachment targeting `1.0`, 0 duplicate proposals, and 0 safety violations.
- Boyue returned model `deepseek-v4-flash`, which matched the configured family. The shadow judge verdict was `pass`, findings were `0`, and calibration was 4/4: known-good=`pass`; wrong-match, missed-fill, and unsafe-submit=`fail`. Latency was 35,859 ms and usage was 3,407 prompt + 102 completion = 3,509 total tokens.
- Deterministic and judge results agreed, so the documented value-of-information rule stopped after one call; the three-repeat disagreement budget was not consumed. With no reproducible failure or actionable finding, F028 remains `todo` and runtime matching was intentionally left unchanged.

### F027 handoff

- Durable changes in this checkpoint are `feature_list.json` and `progress.md`; `.env` changed locally but remains ignored and must never be committed because it contains the user's key.
- The sanitized local evidence is `artifacts/fill-quality-judge.json`. Re-run `npm run eval:fill -- --offline` freely; run `npm run eval:fill -- --judge` only when new fixture evidence could change a decision.
- F027 is `done`. The next recommended feature is F028 only after a real or anonymized form produces a reproducible deterministic miss; otherwise choose the next unrelated unblocked product feature instead of tuning a perfect synthetic score.
- Final `npm run validate` -> exit 0; TypeScript passed, 21 Vitest files/194 tests passed, the production build succeeded, 11 required distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, and `storage`.
- Inspected `artifacts/fill-quality-judge.json` (838 bytes). A precise recursive audit found no credential, authorization, raw profile/page/resume, HTML, screenshot, filename, or path keys; `promptTokens`, `completionTokens`, and `totalTokens` are aggregate usage counters, not authentication tokens.
