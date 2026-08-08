# Progress Log

## Current snapshot

- Product: local-first recruitment form assistant for Chrome/Edge.
- Repository state at start: empty directory, not initialized as a Git repository.
- Current feature: `F018` is complete; `F021` is the next unblocked feature; `F014`, `F025`, and `F036` remain blocked on explicit real-page user actions.
- Current slice: no feature is left in progress. The next recommended slice is converting additional privacy-safe real-page failures into deterministic regressions under F021; real-page writes and PDF attachment still require an explicit current-page user action.

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

## 2026-08-05 - F029 resume completeness audit kickoff

- Applied the user-requested `long-running-agent-harness`. The durable objective is to maximize evidence-backed information extracted from the local resume corpus while distinguishing source absence, unsupported schema facts, parser omissions, incorrect placement, merge loss, and webpage-fill gaps.
- Added F029 for a privacy-redacted DeepSeek source-versus-profile audit and F030 for one reversible deterministic improvement. F029 is `in_progress`; F030 must not start until model calibration, identifier redaction, and bounded canonical-path findings are proven.
- Baseline `.\\init.ps1 -SkipInstall` -> exit 0; TypeScript passed, 21 Vitest files/194 tests passed, production build succeeded, 11 distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, and `storage`.
- Existing evidence covers ten PDFs and one DOCX and previously increased six newly discovered layouts from 131 to 184 populated schema paths. That count does not prove that every source-supported value was extracted correctly, so the new decision object is field-level status, not raw path count.
- Privacy boundary: the local browser may read explicitly scoped Downloads resumes for this development audit, but only numbered text after removal of names, phones, emails, identity numbers, URLs, street addresses, filenames, and paths may leave the machine through the already verified Boyue HTTPS endpoint. Model responses may reference canonical paths and line ids but must not persist source excerpts.

### F029 completion evidence

- Added the short-digest corpus allowlist, installed-Chrome observation, direct-identifier redaction, canonical path/value inventory, four-case calibration, HTTPS-only Boyue request policy, response sanitizer, resumable per-sample checkpoint, retry budget, full and `--sample=<DIGEST>` targeted modes, and Chinese operating documentation.
- `npm run eval:resume -- --offline` -> exit 0. All 11 historical samples (10 PDF + 1 DOCX) were found by digest without using filenames, locally extracted in Chrome, and reduced to 668 numbered lines, 61 redactions, 370 populated schema facts, 370 web-fillable facts, and 0 parser warnings.
- Artifact audit: `artifacts/resume-completeness-observation.json` contained no forbidden persistence key and no email, URL, domestic/international phone, or identity-number pattern. The largest per-sample payload was about 12.4k characters. Raw files, paths, filenames, API key, cookies, and unredacted text were not logged or committed.
- The first parallel model run exposed a durability defect: one timeout discarded five successful responses. The runner now writes every sanitized success to an ignored checkpoint, runs serially, retries only a bounded timeout/5xx/malformed response once, and resumes only matching suite/model/sample ids.
- Full v1 judge -> exit 0 after one retry; all 11 calls returned `deepseek-v4-flash`, matched the configured family, and classified all four calibration cases correctly. It reported 18 missing, 87 incorrect, and 22 unsupported candidates; 59,849 total tokens; 236,552 ms summed successful-call latency.
- Privacy/prompt v2 additionally replaced populated sensitive basic values with matching placeholders and stated the no-fabrication rules for `至今`, bare CET scores, publication years, normalization, and description/outcome partitioning. Full v2 judge -> exit 0 after three bounded retries; all model/calibration checks again passed. It reported 47 missing, 79 incorrect, and 26 unsupported candidates; 62,485 total tokens; 515,374 ms summed successful-call latency and 773.2 s wall time.
- The supported-defect estimate changed from 105 to 126 despite identical source facts and perfect synthetic calibration. Therefore the model score is not a product accuracy metric. Stable use is candidate generation followed by local path/source consistency, policy-exception filtering, anonymous fixtures, and deterministic tests.
- Local inspection confirmed both false positives (`至今` as a required end date, CET score as proficiency, publication year as project duration, and one allegedly missing populated path) and real defects (current-date text prefixed to a school, school repeated inside major, award prose creating an education record, body text used as project name, and contact header used as work-sample description).
- `npm test -- --run src/evaluation/resumeCompletenessPolicy.test.ts` -> exit 0; 3 privacy, request, and sanitizer tests passed. Final `npm run validate` -> exit 0; TypeScript passed, 22 Vitest files/197 tests passed, production build succeeded, 11 distribution files were verified, and permissions remained `activeTab`, `scripting`, `sidePanel`, and `storage`.

### F029 handoff / F030 start

- F029 is `done`; F030 is `in_progress`. The first promoted candidate is deliberately narrow: a date-first education row ending in `至今` must extract the school without the current-date marker and must not duplicate the school inside the major.
- Baseline evidence for digest `5A12C901`: `education.0.school` was `至今` plus the evidenced school and `education.0.major` included the school plus the evidenced major. The anonymous regression will use a synthetic date-first doctoral education row and will continue leaving `endDate` empty.
- After the deterministic fix, bump the observation suite, rerun the resume unit suite and offline corpus, then use `npm run eval:resume -- --judge --skip-browser --sample=5A12C901`; do not pay for another full-corpus judgment unless the changed helper affects additional digest structures.

## 2026-08-05 - F030 current-date education extraction completed

- Added an anonymous regression for `2023.09 - 至今 + school + degree + major`. Baseline real evidence for digest `5A12C901` had `education.0.school` prefixed with the current marker and repeated the school inside `education.0.major`; the empty `education.0.endDate` was correct and had to remain empty.
- Changed only `extractSchool`: before compacting adjacent Chinese glyphs, it removes a current marker when that marker directly precedes a school-like value. This prevents `至今`/`Present`/`Current` from becoming part of a school without altering the date-range parser or inventing an end date.
- `npm test -- --run src/resume/parseResume.test.ts` -> exit 0; 15/15 passed. The anonymous regression produced school `厦门大学`, degree `博士`, major `健康医疗大数据`, start `2023-09`, and an empty end date.
- Bumped the corpus suite to `2026-08-05.3`. `npm run eval:resume -- --offline` -> exit 0; all 11 samples remained readable with 668 lines, 61 redactions, 370 parsed/web-fillable facts, and 0 warnings. The affected real digest now has the evidenced school and major, retains 32 populated facts, and still has no end-date fact.
- `npm run eval:resume -- --judge --skip-browser --sample=5A12C901` -> exit 0 in 10.1 s. Boyue returned `deepseek-v4-flash`, calibration 4/4, 4,714 tokens, and 6,405 ms model latency. Findings dropped from 9 in v2 to 4 in v3; the school and major errors disappeared. The remaining end-date and bare-CET proficiency findings contradict explicit no-inference policy and were rejected; an award candidate remains for a later scoped iteration.
- `npm test -- --run src/resume src/evaluation` -> exit 0; 5 files/28 tests passed. `npm run eval:fill -- --offline` -> exit 0 with 35 TP, 0 FP/FN, 35/35 exact fills, 6/6 exclusions, full repeatable/attachment coverage, 0 duplicates, and 0 safety violations.
- Final `npm run validate` -> exit 0; TypeScript passed, 22 Vitest files/198 tests passed, build and 11-file distribution verification succeeded, and permissions remained `activeTab`, `scripting`, `sidePanel`, and `storage`.
- Final `npm run test:e2e` -> exit 0; 17/17 installed-Chrome tests passed, including the digest-allowlisted completeness audit, resume import/OCR, missing-row creation, exact filling, attachment gates, privacy, Xiaomi, and zero-submit regressions.
- Inspected the refreshed `artifacts/resume-corpus.png` (166,547 bytes, 2026-08-05 22:10 local). It contains only synthetic values and visibly shows three education, two internship, three project, and two language records created without using the final-submit control.
- Final `resume-completeness-observation.json` v3 was 192,122 bytes; recursive/pattern audit found no email, URL, domestic/international phone, identity number, credential, filename, or path evidence.

### F030 changed files and handoff

- Resume completeness harness: `evals/resume-corpus-manifest.json`, `src/evaluation/resumeCompletenessPolicy.ts`, its unit test, `tests/e2e/resume-completeness-eval.spec.ts`, `scripts/run-resume-completeness-eval.mjs`, and `package.json`.
- Product improvement: `src/resume/parseResume.ts` and `src/resume/parseResume.test.ts`.
- Documentation/state: `README.md`, `docs/resume-completeness-evolution-plan.md`, `feature_list.json`, and `progress.md`.
- F029 and F030 are `done`. F031 is the next recommended feature: prevent a redacted contact header from becoming `workSamples.0.description`, then address activity/award leakage. F032 and F033 retain the project-title and education-metric candidate clusters for later one-change iterations.
- Rollback: revert the F030 checkpoint to restore the previous school extraction; no schema migration, browser permission, storage data, external deployment, or final-submission behavior is involved. Ignored observations, checkpoints, judge reports, screenshots, and `.env` remain local and must not be committed.
## 2026-08-06 - F034 reusable local PDF kickoff

- User-visible defect: a selected PDF currently lives only in side-panel React state, so closing the panel forces the user to open the operating-system file picker again. The options-page copy also promises that the source file is never saved.
- F034 is scoped to one replaceable primary PDF stored in extension-local IndexedDB. The record contains the exact PDF bytes plus filename, MIME type, size, SHA-256 digest, and save time; no filesystem path, extracted text, website credential, cookie, or network synchronization is involved.
- Safety boundary remains unchanged: restoring a local PDF prepares it only as a source. Attaching it to a recruitment page still requires the existing user-triggered scan, a unique PDF resume control, visible destination origin/control, and a fresh single-use 60-second confirmation. The extension still never clicks final submission.
- Baseline `./init.ps1 -SkipInstall` -> exit 0; 22 Vitest files / 198 tests passed, the production build succeeded, distribution files were verified, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, and `storage`.

### F034 implementation and verification

- Added `SavedResumeRepository`, backed by extension-Origin IndexedDB. It stores only one `primary` record and validates filename, exact `application/pdf` MIME, 1 byte–10 MiB size, `%PDF-` signature, exact byte length, and SHA-256 before saving. Every load revalidates signature, length, and digest; an invalid record is deleted and never offered to the page.
- Selecting a PDF in the profile editor now both parses it and saves the original as the reusable PDF. Selecting a PDF from the side panel replaces the same local record. DOCX remains extraction-only. Both surfaces show local-only status, filename, size, and digest; the options page supports individual PDF deletion.
- The side panel restores the saved PDF across reload without reopening the operating-system picker. Restoration does not attach automatically: a user-triggered page scan must still identify one safe resume control, and the existing visible Origin/control plus single-use 60-second confirmation remains mandatory.
- “Delete all local data” now clears the profile, field mappings, and IndexedDB PDF. The JSON backup schema was intentionally left unchanged, so it cannot contain PDF bytes; README, privacy disclosure, onboarding copy, and the attachment threat model now state the persistence and deletion behavior.
- Targeted `npm test -- --run src/storage/savedResumeRepository.test.ts src/options/ProfileEditor.test.tsx src/sidepanel/SidePanel.test.tsx` -> exit 0; 3 files / 14 tests passed. `npm run typecheck` -> exit 0.
- `npm run test:e2e -- --grep "saved resume"` -> exit 0; the Chrome flow saved a synthetic PDF, reloaded the side panel, attached it without another file selection, then verified delete-all removed it.
- Final `npm run validate` -> exit 0; TypeScript passed, 23 Vitest files / 204 tests passed, production build and 11-file distribution verification succeeded, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, and `storage`.
- Final `npm run test:e2e` -> exit 0; 18/18 Chrome tests passed, including existing attachment authorization, privacy deletion, local OCR, real local corpus audit, Xiaomi fixtures, and zero-submit regressions.
- Inspected `artifacts/saved-resume-reuse.png` (77,521 bytes). It visibly shows the restored synthetic filename, local persistence badge, exact local destination, unique resume control, digest prefix, and explicit confirmation button; it contains no real resume or personal data.

### F034 changed files and handoff

- Storage and tests: `src/storage/savedResumeRepository.ts`, `src/storage/savedResumeRepository.test.ts`.
- Product UI and component tests: `src/options/App.tsx`, `src/options/options.css`, `src/options/ProfileEditor.test.tsx`, `src/sidepanel/App.tsx`, `src/sidepanel/sidepanel.css`, `src/sidepanel/SidePanel.test.tsx`.
- Browser acceptance and documentation: `tests/e2e/resume-attachment-flow.spec.ts`, `README.md`, `PRIVACY.md`, `docs/resume-attachment-threat-model.md`, `feature_list.json`, and `progress.md`.
- F034 is `done`; there are no implementation blockers. The next recommended unblocked feature remains F031, the privacy-relevant contact-header/activity parsing boundary. A future multi-resume library should be a separate feature with explicit selection semantics rather than silently expanding this single-primary record.
- Rollback: revert the F034 changes. Existing profiles and mappings are unaffected; an already stored `qiuzhao-resume-vault` IndexedDB record becomes orphaned unless the rollback also includes a one-time database deletion path, so rollback should preserve the current delete control until local cleanup is complete.

## 2026-08-06 - F035 real-page saved-resume acceptance kickoff

- Applied the user-requested `long-running-agent-harness`; the durable goal is not merely to prove that a local fixture accepts a file, but to distinguish a real ATS structural observation, installed-extension preflight, explicit real attachment, and stable synthetic regression without letting a lower evidence level stand in for a higher one.
- `computer-use` could not initialize because its Windows native pipe was unavailable. OpenCLI 1.8.6 remained available with daemon PID 3268, Browser Bridge v1.0.22 connected, and a user Chrome profile present. The existing agent-bridge preflight reported only `opencli-browser-bridge-not-installed` because it found zero standard-profile copies despite the live connection; it did not read cookies/values or mutate the browser.
- Bound the existing active tab as `qiuzhao-live`. Exact live evidence: HTTPS Xiaomi internship application path, authenticated page title, one enabled non-multiple file input, accept tokens `.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.html,.htm`, one submit-like control, and no `attachment_resume`/label/name/id/ARIA metadata on the input. Only boolean structural inspection showed a resume signal in the nearest `.atsx-upload-btn`/`.atsx-upload-drag` ancestor and no identity/photo/portfolio/transcript signal.
- Reproducing the current `nearbyText` algorithm against that live DOM returned `formItemFound=false`, `containerFound=false`, `contextLength=0`, `resumeSignal=false`, and `forbiddenSignal=false`. This is a deterministic real-page defect: the saved PDF cannot be offered because the actual target is not discovered. No page values, filename, PDF data, cookies, authentication data, upload action, control mutation, or submission was read or attempted.
- Baseline `./init.ps1 -SkipInstall` -> exit 0; TypeScript passed, 23 Vitest files / 204 tests passed, production build and distribution verification succeeded, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, and `storage`.
- F035 is `in_progress` for the narrow wrapper-context fix and durable read-only audit. F036 is reserved for the separately confirmed live attachment; OpenCLI `browser upload` must not be used because it bypasses the extension and would produce invalid evidence.

### F035 implementation and live evidence

- Added `npm run audit:resume-attachment-live`. It requires a pre-bound OpenCLI session plus exact expected HTTPS Origin/path prefix and fails closed on a wrong destination. Output is limited to a numeric-ID-redacted path, query key names, file-control/candidate/submit counts, accept tokens, non-personal metadata presence, normalized wrapper class categories, signal booleans, blockers, and explicit zero-action safety flags.
- The bound `qiuzhao-live` session passed: path `/internship/resume/:id/apply`, query key `spread`, one file control, one safe resume candidate, PDF accepted, `multiple=false`, `disabled=false`, one submit-like control, wrapper resume signal true, forbidden signal false, and no blocker. Every read-value/read-filename/Cookie/mutation/upload/submit safety flag remained false. A deliberately wrong Origin failed before page evaluation as expected.
- Changed `nearbyText` only for file inputs with recognized ATS upload wrappers (`.atsx-upload-btn`, `.atsx-upload-drag`, `.ud-upload`, `.ant-upload`, `.el-upload`). The nearest wrapper is considered only after a normal form item and before a generic group. The existing resume/forbidden/PDF/multiple/disabled/ambiguity gates remain the source of truth.
- Added anonymous unit regressions for the exact live Xiaomi shape and a same-family identity wrapper. The real shape now yields one `上传简历` candidate; the identity attachment remains unsupported. Added the exact wrapper to the Xiaomi-derived browser fixture; scan reports one candidate, neither the resume nor work attachment receives a file, and submit count stays zero.
- `npm test -- --run src/matching/dom.test.ts src/content/resumeAttachment.test.ts` -> exit 0; 2 files / 10 tests passed. `npm run audit:xiaomi` -> exit 0; the live public contract retained 9 groups and 34 visible fields with no submission.
- Final `npm run validate` -> exit 0; TypeScript passed, 23 Vitest files / 207 tests passed, the production build and 11-file distribution audit succeeded, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, and `storage`.
- Final `npm run test:e2e` -> exit 0; 18/18 Chrome tests passed. A post-copy `npm run test:e2e -- --grep "Xiaomi-derived fixture"` also passed and refreshed `artifacts/xiaomi-form-regression.png`; visual inspection confirmed the upload wrapper, empty resume/other attachment controls, manual-confirmation notice, and untouched final button.

### F035 changed files and F036 handoff

- Live harness: `scripts/audit-live-resume-attachment.mjs`, `docs/saved-resume-real-page-acceptance.md`, `package.json`, `README.md`, `feature_list.json`, and `progress.md`.
- Product fix and regressions: `src/matching/dom.ts`, `src/matching/dom.test.ts`, `src/content/resumeAttachment.test.ts`, `xiaomi-fixture.html`, and `tests/e2e/xiaomi-fixture.spec.ts`.
- Supporting documentation: `docs/field-coverage-matrix.md` and `docs/xiaomi-internship-field-audit.md`.
- F035 is `done`. F036 is `blocked` only on a browser-enforced user gesture. The installed unpacked extension was found at the current repository `dist` under Chrome Default profile, but the freshly built code must be reloaded from `chrome://extensions/`; then the user must return to the exact Xiaomi tab, click the 秋招助手 toolbar icon, scan, and report that the private saved-PDF confirmation card is visible without clicking it yet.
- `computer-use` could not connect to its native Windows pipe. OpenCLI remained bound to the Xiaomi tab for sanitized before/after observation but cannot click Chrome toolbar or side-panel controls. Do not use `opencli browser upload`: it would bypass IndexedDB restoration, activeTab, candidate discovery, digest authorization, and the user's confirmation, so it cannot unblock F036.
- Once the user reports the L2 card is visible, start sanitized network/state observation, obtain explicit confirmation for the exact real PDF and Xiaomi Origin, let the user click the extension's attachment confirmation, and record only result/status shapes plus zero-submit counters. Never persist the real filename, digest, page values, Cookie, request authorization, body, or response content.

## 2026-08-06 - F018 verified page-driver kickoff

- The user requested finding the OpenCLI open-source project, decomposing its page-view/page-operation module, and rewriting the relevant behavior into the assistant. The installed package is `@jackwener/opencli@1.8.6`; its package metadata and GitHub release both identify `jackwener/OpenCLI` v1.8.6 under Apache-2.0.
- Source audit at upstream commit `399c0de2a76eb979aee3a3836cf2d24fd247780f` showed a CLI-to-local-daemon-to-WebSocket-to-Bridge-extension-to-CDP architecture. The Bridge requests `debugger`, `tabs`, `cookies`, `activeTab`, `alarms`, `storage`, `tabGroups`, `downloads`, and `<all_urls>`, so its transport and permission model are explicitly out of scope for the store extension.
- The clean-room rewrite is limited to observable behavior patterns: opaque DOM references, action-time re-resolution, structural safety checks, scroll/focus preparation, framework-compatible events, exact option selection, DOM-settle waits, bounded retry, and boolean write verification. It must never expose page values outside the content script or add arbitrary selector/value, JavaScript evaluation, navigation, cookie, network-capture, local-path upload, CAPTCHA, credential, identity, or final-submit actions.
- A read-only structural query on the already-bound authenticated Xiaomi tab reported 29 custom selects, 44 date-related containers, zero native multiple selects, zero ARIA multi-selects, zero contenteditable controls, and two iframes. It read no values or page text, touched no cookies, and made no page mutation. The real date-period input has no name, placeholder, or ARIA label and is distinguished only by its position inside the parent form item, reproducing the current `date-range` exclusion gap.
- Baseline `./init.ps1 -SkipInstall` -> exit 0; TypeScript passed, 23 Vitest files / 207 tests passed, production build and 11-file distribution verification succeeded, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, and `storage`.
- F018 is now `in_progress`. F036 remains separately blocked on the user-confirmed real PDF attachment and is not weakened or bypassed by this driver work.

### F018 OpenCLI decomposition and clean-room implementation

- Audited `jackwener/OpenCLI` v1.8.6 at commit `399c0de2a76eb979aee3a3836cf2d24fd247780f`. Its page-control path is CLI -> localhost daemon -> WebSocket Browser Bridge -> `chrome.debugger`/CDP. The useful behavior patterns were stable references, scroll/focus, native framework events, exact option resolution, DOM-settle waits, bounded retry, and read-after-write verification. The daemon, CDP transport, raw evaluation, navigation, tabs, cookies, network capture, screenshots, downloads, filesystem-path upload, and broad permissions were not copied.
- Added `src/content/pageDriver.ts` as a typed, recruitment-scoped driver. It refuses detached, hidden, disabled, read-only, file, password, hidden, submit, reset, button, image, and checkbox controls; supports native text/select/multi-select, radio, contenteditable, ATS searchable/multi-select structures, and composite month ranges; retries no more than twice; and returns only status, attempts, and reason rather than the page value.
- Refactored the fill engine to use the same safe reader for comparisons and verification. A field is now reported as filled only after its in-page state matches the expected profile value. Framework rejection, missing exact options, ambiguous structures, and controls whose visible date state does not update fail closed. Saved mappings cannot override a structurally identified two-path date range.
- Added structural date-range pairing for education, internship/career, and project records. The real Xiaomi control is one hidden JSON range input rather than two normal inputs, so one proposal now carries both `startDate` and `endDate`; verification requires both the hidden `{start,end}` state and visible start/end year-month labels in order.
- The stricter verification exposed an older normalization defect: the substring `age` inside `languages` made language values normalize as dates/ages. The rule now recognizes only complete path segments, with a regression proving language/proficiency text remains textual while real date and age segments remain digit-normalized.
- Added privacy-safe `fillReason` evidence to the synthetic fill-quality artifact so future regressions identify a driver failure category without recording the current or attempted page value.

### F018 real structure and acceptance evidence

- The authenticated, already-bound Xiaomi application tab was inspected read-only: four exact top-level `.atsx-date-picker.atsx-date-picker-period-month` controls were found, each with one hidden text input and no name, placeholder, or ARIA label. Nearest-record sibling IDs deterministically identified two education and two project ranges. No form value, personal text, cookie, filename, PDF byte, request, mutation, upload, or submit action was read or performed.
- Anonymous browser coverage exercises a remote school -> major cascade, exact custom degree selection, one composite education range, native multiple roles, radio gender, accepted rich text, framework-rejected rich text, and an untouched submit control. The current `artifacts/complex-controls.png` shows seven verified writes, one safe skip, and zero final submissions; visual inspection confirmed the visible start/end range, selected options/radio, unchanged rejected field, and untouched submit button.
- Targeted Vitest -> exit 0, 5 files / 90 tests. Targeted Playwright -> exit 0, 3/3 complex-control, fill-quality, and resume-corpus tests. The final fill-quality report returned matching precision 1, recall 1, fill exactness 1, exclusion correctness 1, repeatable coverage 1, attachment targeting 1, and a passing safety gate.
- Final `npm run validate` -> exit 0: TypeScript passed, 24 Vitest files / 218 tests passed, production build succeeded, 11 required distribution files passed, and permissions remained exactly `activeTab`, `scripting`, `sidePanel`, and `storage`.
- Final `npm run test:e2e` -> exit 0: 19/19 Chrome tests passed. `npm run audit:xiaomi` -> exit 0: 9 groups, 34 visible fields, and no application submission.

### F018 changed files and handoff

- Driver and engine: `src/content/pageDriver.ts`, `src/content/pageDriver.test.ts`, `src/content/engine.ts`, `src/content/engine.test.ts`.
- Structural matching: `src/matching/dom.ts`, `src/matching/dom.test.ts`, `src/matching/catalog.ts`, `src/matching/matcher.ts`, `src/matching/types.ts`, and `src/mapping/fingerprint.ts`.
- Browser acceptance: `complex-controls.html`, `src/fixture/complex-controls-main.ts`, `tests/e2e/complex-controls.spec.ts`, `tests/e2e/fill-quality-eval.spec.ts`, `tests/e2e/resume-corpus-flow.spec.ts`, `src/evaluation/fillQuality.ts`, and `artifacts/complex-controls.png`.
- Documentation: `docs/opencli-page-driver-rewrite.md`, `docs/xiaomi-internship-field-audit.md`, `docs/field-coverage-matrix.md`, `README.md`, `feature_list.json`, and `progress.md`.
- F018 is `done` with no code blocker. F021 is the next recommended unblocked feature. F036 remains separately blocked on reloading the built unpacked extension, clicking its toolbar icon on the exact authenticated page, scanning, and explicitly confirming the saved PDF destination; this driver work does not authorize or bypass that action.

## 2026-08-06 - F037 embedded OpenCLI bridge kickoff

- The user explicitly rejected a separate OpenCLI installation and requested that the corresponding browser-control module live inside the autumn-recruitment assistant. F037 therefore targets one installable extension with an embedded, debugger-backed session; it does not package the Node CLI, localhost daemon, or a second Browser Bridge extension.
- Baseline `./init.ps1 -SkipInstall` -> exit 0: TypeScript passed, 24 Vitest files / 218 tests passed, the production build and 11-file distribution audit succeeded, and the pre-change permissions remained `activeTab`, `scripting`, `sidePanel`, and `storage`.
- The local upstream is `@jackwener/opencli@1.8.6`, Apache-2.0. Portable source is concentrated in `extension/src/cdp.ts`, `identity.ts`, and `journal.ts`; `extension/src/background.ts` is coupled to the daemon, WebSocket reconnect, broad raw command protocol, cookies, network capture, downloads, and tab containers and will not be copied wholesale.
- The embedded design will directly adapt the bounded `chrome.debugger.sendCommand`, attach/detach recovery, structural CDP state, and exactly-once request journal patterns. It will exclude raw `Runtime.evaluate`, Cookie commands, arbitrary filesystem paths, network bodies/headers, password/CAPTCHA/identity automation, and final submission.
- F037 is `in_progress`. Existing dirty work for F034-F036 and F018 is preserved; this slice is limited to the embedded bridge, exact permission/test/documentation updates, and its visible session control.

### F037 harness split and acceptance contract

- Applied the user-requested `long-running-agent-harness`. The broad “build an OpenCLI-like foundation” goal is now split into K0–K5 in `docs/browser-kernel-acceptance.md`: F037 session kernel, F038 privacy-safe `state/find`, F039 verified actions, F040 waits/navigation/idempotency, F041 upload/screenshots/logs/errors, and F042 the recruitment-adapter contract. This prevents fixture-level evidence or one working command from being mistaken for a complete browser platform.
- Each layer has positive capability checks, mandatory safety counterexamples, anonymous ground-truth metrics, and an L0–L3 evidence ladder. Real recruitment pages remain user-authorized, non-submitting evidence; lower-level fixtures cannot claim real-page acceptance.
- The initial `./init.ps1 -SkipInstall` in this resumed F037 session exited 1 because the previously isolated `src/bridge/opencliCdp.ts` skeleton had an unfinished recursive frame-tree type. No prior completed test regressed; the K0 implementation closed that type error before feature verification.

### F037 K0 implementation

- Added an embedded CDP transport adapted from `jackwener/OpenCLI` 1.8.6 at commit `399c0de2a76eb979aee3a3836cf2d24fd247780f`. It supports only bounded attach/detach, `DOM.getDocument`, `DOM.querySelectorAll`, and `Page.getFrameTree`. It does not expose raw `Runtime.evaluate`, Cookie, network, download, arbitrary filesystem-path upload, tab-container, daemon, WebSocket, or second-extension behavior.
- Added a 10-minute session manager stored in `chrome.storage.session`. A user-interface request pins one credential-free HTTPS tab and one Origin; same-Origin navigation retains the session and clears stale structure, while cross-Origin navigation, expiry, tab close, and debugger detach stop or pause safely. A second start for the same live target is idempotent.
- Added a background-only typed protocol and sender check. Lifecycle requests are accepted only from this extension's own pages. Background listeners cover top-frame navigation, tab removal, alarm expiry, and debugger detach.
- Added the Organic side-panel K0 card. The user clicks `连接当前招聘页`, sees only Origin, path, interactive-control count and frame count, and can refresh or detach. The UI explicitly states that it does not read Cookie, passwords or input values and does not submit applications.
- Expanded the exact Manifest surface to `activeTab`, `alarms`, `debugger`, `scripting`, `sidePanel`, `storage`, `tabs`, and `webNavigation`, plus `<all_urls>`. Unit and distribution checks prohibit `cookies`, `downloads`, `nativeMessaging`, `tabGroups`, `webRequest`, and `webRequestBlocking`. README, onboarding copy, privacy notice, and troubleshooting now disclose the stronger browser warning and the user-gesture/HTTPS/Origin/TTL boundary.
- Added Apache-2.0 compliance files `THIRD_PARTY_NOTICES.md` and `third_party/opencli/LICENSE`; production builds and extension ZIPs include both. The root project license remains unchanged.

### F037 verification evidence

- Targeted K0 unit/component run -> exit 0; 5 files / 14 tests passed. A later CDP-specific run -> exit 0; 3 debugger-conflict, privacy-safe state, and unsupported-URL tests passed.
- Anonymous HTTPS extension E2E -> exit 0. A real unpacked Chrome extension attached through `chrome.debugger`, reported five interactive controls and one frame, kept the same session across `/apply/1` to `/apply/2`, omitted query strings from status, paused after an Origin change, and left the synthetic final-submit counter at zero before and after every navigation.
- Final `npm run validate` -> exit 0: TypeScript passed, 28 Vitest files / 233 tests passed, production build succeeded, and 13 required distribution files were verified. Permissions matched the exact eight-item allowlist plus `<all_urls>`; all forbidden permissions were absent.
- Final `npm run test:e2e` -> exit 0; 20/20 Chrome tests passed, including the embedded bridge plus all existing profile, resume, comparison, repeatable-record, attachment, OCR, fill-safety, and Xiaomi-derived regressions.
- `npm run package` -> exit 0; generated `qiuzhao-profile-assistant.zip`, verified 229 archive entries, included the third-party notice/license, and found no test fixture, source map, or persisted personal-data file.
- Visually inspected `artifacts/embedded-bridge.png`: it shows the connected anonymous Origin, path, five-control/one-frame counts and detach controls; no query parameter, field value, credential, Cookie, resume data, or final-submit action is visible.
- Static forbidden-capability scan of `src/bridge`, `src/background`, and the Manifest found no executable `Runtime.evaluate`, Network, Cookie, Authorization, WebSocket/daemon, filesystem upload, download, native messaging, tab group, or webRequest path. The only match was explanatory text documenting omitted upstream abilities.

### F037 changed files and handoff

- Harness and documentation: `docs/browser-kernel-acceptance.md`, `feature_list.json`, `progress.md`, `README.md`, `PRIVACY.md`, `docs/opencli-page-driver-rewrite.md`, `THIRD_PARTY_NOTICES.md`, and `third_party/opencli/LICENSE`.
- Kernel: `src/bridge/protocol.ts`, `src/bridge/opencliCdp.ts`, `src/bridge/opencliCdp.test.ts`, `src/bridge/powerSession.ts`, and `src/bridge/powerSession.test.ts`.
- Background and permissions: `src/background/bridgeRuntime.ts`, `src/background/bridgeRuntime.test.ts`, `src/background/index.ts`, `src/background/index.test.ts`, `public/manifest.json`, `src/foundation.test.ts`, `scripts/build.mjs`, `scripts/verify-dist.mjs`, and `scripts/verify-package.mjs`.
- UI and browser evidence: `src/sidepanel/powerSessionBridge.ts`, `src/sidepanel/PowerSessionCard.tsx`, `src/sidepanel/PowerSessionCard.test.tsx`, `src/sidepanel/App.tsx`, `src/sidepanel/sidepanel.css`, `src/options/App.tsx`, `tests/e2e/embedded-bridge.spec.ts`, and `artifacts/embedded-bridge.png`.
- F037 is `done` with no K0 code blocker. F038 is the next recommended feature: implement privacy-safe structural `state/find` with opaque stable references and an anonymous ground-truth recall/stability evaluator. Do not begin site-specific recruitment adapters until F042. F036 remains separately blocked on the user's real-page PDF confirmation; K0 does not authorize that upload.

## 2026-08-06 - F038 privacy-safe state/find kickoff

- Baseline `./init.ps1 -SkipInstall` -> exit 0: TypeScript passed, 28 Vitest files / 233 tests passed, production build succeeded, 13 distribution files passed, and the exact K0 permission audit remained unchanged.
- F038 is `in_progress`. Scope is read-only K1: a filtered control structure, session-scoped opaque stable references, semantic find, same-origin frame/open-shadow discovery, and an anonymous ground-truth evaluator. It does not add click, type, select, file upload, navigation, arbitrary selector/XPath, raw CDP passthrough, `Runtime.evaluate`, cookies, network capture, page mutation, or final submission.
- Privacy contract: input `value`, checked/selected state, DOM id/class/style, CSS selectors, CDP node IDs, query strings, cookies, credentials, and resume bytes must never appear in the public state/find response or visible evidence. Only allowlisted semantic metadata such as role, label, placeholder, technical name, bounded nearby label text, option captions, boolean capabilities, boundary kind, and typed safety classification may leave the bridge.

### F038 K1 implementation

- Added `POWER_PAGE_STATE` and `POWER_PAGE_FIND` to the extension-internal typed protocol. Find requests accept only 1–120 characters, an allowlisted control role set, and a result limit from 1–20; arbitrary selectors, XPath, CDP IDs, methods and script are not accepted.
- Added a background-only page-state service over the bounded K0 debugger transport. It reads `DOM.getDocument` with finite 50,000-node/1,000-control caps, traverses the main document, same-origin content documents and open Shadow DOM, and rejects inactive, non-HTTPS, credential-bearing or changed-Origin sessions.
- Added session-scoped opaque control references. Backend node IDs stay inside the registry; unchanged controls retain the same opaque reference across repeated snapshots, while a new snapshot ID is issued for each read. The reverse registry is private groundwork for K2 and is not exposed to the UI or caller.
- Public controls contain only role/tag, allowlisted input type, bounded sanitized label/ARIA/placeholder/technical-name/nearby text, option captions, boolean capabilities, boundary kind and a safety classification. Input values, checked/selected state, DOM id/class/style, selectors, query strings and CDP IDs are never emitted. Unknown input types normalize to `text` so an attribute cannot become an exfiltration channel.
- Deterministic find scores label, ARIA label, placeholder, nearby text, technical name and option captions, with optional role filtering. Password, verification, identity, file and final-submit controls are classified as restricted metadata; K1 performs no click, type, select, upload, navigation or page mutation.
- Added an Organic `State / Find` section to the connected side-panel card. A user can explicitly read the structure and search by semantic field text; the UI displays counts, labels, roles, scores, restrictions and opaque references only.

### F038 verification evidence

- `npm test -- --run src/bridge` -> exit 0; 4 files / 15 tests passed. Coverage includes allowlisted extraction, main/frame/open-shadow boundaries, stable references, option matching, malicious input-type normalization, protocol validation and K0 regressions.
- `npm run eval:kernel-state` -> exit 0 after the final startup-race fix; 1/1 real-Chrome test passed. The anonymous HTTPS fixture returned 24/24 expected labels (100% recall), 100% repeated-reference stability, three CDP frame keys, one open Shadow root, five first-ranked find results, zero forbidden leaks and zero final submissions.
- The first full E2E run passed 20/21 and exposed a test-only race where the extension's asynchronous first-install options page interrupted the newly created fixture tab. The evaluator now waits for that documented one-time navigation before creating its target; its targeted rerun passed.
- Final `npm run test:e2e` -> exit 0; 21/21 Chrome tests passed, including all existing profile, resume import/OCR, comparison, repeatable-record, attachment, fill-safety, Xiaomi-derived and K0 bridge regressions plus K1 state/find.
- Final `npm run validate` -> exit 0; TypeScript passed, 30 Vitest files / 239 tests passed, production build succeeded, 13 required distribution files passed, and permissions remained exactly `activeTab`, `alarms`, `debugger`, `scripting`, `sidePanel`, `storage`, `tabs`, `webNavigation` plus `<all_urls>` with forbidden permissions absent.
- `artifacts/page-state-find-report.json` contains only aggregate anonymous metrics and field labels. `artifacts/page-state-find.png` was visually inspected: it shows the anonymous Origin/path, 24-control/3-frame/1-open-shadow summary and a `毕业院校` result with an opaque reference; no field value, query parameter, credential, Cookie, resume data or submission action is visible.
- Static forbidden-capability inspection found no executable raw Runtime evaluation, network/Cookie/Authorization capture, WebSocket/daemon, arbitrary upload, navigation or expanded Manifest path in K1. Matches were limited to explanatory text documenting excluded behavior.

### F038 changed files and handoff

- Kernel and tests: `src/bridge/pageState.ts`, `src/bridge/pageState.test.ts`, `src/bridge/protocol.ts`, and `src/bridge/protocol.test.ts`.
- Background and UI: `src/background/bridgeRuntime.ts`, `src/background/bridgeRuntime.test.ts`, `src/sidepanel/powerSessionBridge.ts`, `src/sidepanel/PowerSessionCard.tsx`, `src/sidepanel/PowerSessionCard.test.tsx`, and `src/sidepanel/sidepanel.css`.
- Evaluator and evidence: `tests/e2e/page-state-find.spec.ts`, `package.json`, `artifacts/page-state-find-report.json`, and `artifacts/page-state-find.png`.
- Documentation: `README.md`, `docs/browser-kernel-acceptance.md`, `feature_list.json`, and `progress.md`.
- F038 is complete with no code blocker. F039 is the next recommended unblocked feature: verified click/type/select/check/fill primitives that accept only current opaque references, reread after writes, never log values, and block passwords, verification, identity, destructive and final-submit controls. Do not add AI matching or site-specific adapters at K2. F036's separate real saved-PDF user-confirmation requirement is unchanged.

## 2026-08-06 - K2–K5 long-running harness and GitHub checkpoint plan

### Scope and architecture decisions

- The user explicitly requested `long-running-agent-harness`, real-page operation standards, and a separate GitHub branch for every completed node. The work is now split into F039 K2 actions, F040 K3 waits/workflow, F041 K4 file/evidence, F042 K5 adapter convergence, and F043 three-family live acceptance. F039 is `in_progress`; later nodes remain dependency-ordered `todo`.
- Added `branch` and `pr_base` to F039–F043. The stacked sequence is `agent/browser-kernel-k1-baseline` -> `agent/browser-kernel-k2-actions` -> `agent/browser-kernel-k3-workflows` -> `agent/browser-kernel-k4-evidence` -> `agent/browser-kernel-k5-adapters` -> `agent/browser-kernel-real-site-acceptance`. Each completed branch must open a draft PR against the previous node and record branch/commit/PR evidence before the next node begins.
- K2 commands bind session + snapshot + opaque ref + allowlisted profile path/answer intent. Public callers cannot supply arbitrary values, selectors, script, or CDP methods. The fixed action registry must dispatch framework-compatible browser events, verify in-page with a boolean result, and return only typed status/strategy/attempt evidence.
- Automatic clipboard fallback is explicitly rejected because it would expose personal data outside the page, overwrite the user's clipboard, and require a broader permission. A primary strategy may have one bounded keyboard/fixed-setter fallback; failed verification must not move to a nearby control.
- K5 must retire the old direct mutation path after parity rather than retain two write engines. AI semantic mapping and job discovery remain outside K2–K5; deterministic actions and safety gates must be complete first.

### Real-page acceptance design

- Added `docs/browser-kernel-delivery-plan.md` with L0 unit, L1 anonymous HTTPS/real Chrome, L2 live read-only, and L3 user-authorized live non-submit gates. Fixtures remain the reproducible percentage source; real sites provide separate user-authorized evidence.
- F043 requires at least three live application pages from three different ATS families. Three companies sharing one ATS count as one. 牛客、实习僧 and an enterprise-owned portal are candidates only; they are not pre-authorized or guaranteed and may be replaced if terms, login, CAPTCHA, identity, or control coverage makes safe L3 impossible.
- L3 explicitly warns that a recruitment site may autosave a server-side draft before final submission. Only the user's confirmed real profile may be written; the agent will not insert fake data, erase an existing draft, clear fields for test cleanup, bypass login/verification, or click final submission.
- The per-site denominator is every reachable, user-approved, supported ordinary field with profile ground truth. Primary-strategy verified success must be `>90%` on each site; aggregate success after at most one fallback must be `>=98%`; mapping precision must be `>=98%`; verification coverage and safety blocking must be 100%; wrong-control writes, third attempts, sensitive actions, final submissions, and public evidence leaks must be zero.
- GitHub evidence is allowlisted to site/ATS identity, credential-free Origin/path pattern, versions, branch/commit, aggregate counts/rates, typed failures, blockers, and zero-action flags. Real page values, profile values, resume data, filenames/digests, cookies, headers, bodies, query strings, traces/HAR, and screenshots containing filled values are prohibited. Real screenshots remain private; committed screenshots come from anonymous fixtures or a value-free extension summary.
- Every reproducible real-site defect must first become an anonymous failing fixture, then receive a fix and anonymous regression, and only then may the user authorize a live recheck.

### Planning checkpoint verification and handoff

- `./init.ps1 -SkipInstall` -> exit 0 before edits: TypeScript passed, 30 Vitest files / 239 tests passed, production build succeeded, 13 distribution files passed, exact browser-kernel permissions remained unchanged, and forbidden permissions were absent.
- Feature-plan check -> exit 0: `feature_list.json` parsed; F039–F043 each had a status, exact branch, and exact `pr_base`; delivery-plan branch rows, success-rate formulas, GitHub evidence denylist, and AGENTS checkpoint protocol were present. `git diff --check` reported no whitespace error (only existing Windows LF/CRLF notices).
- Final `npm run validate` -> exit 0: TypeScript passed, 30 Vitest files / 239 tests passed, production build and 13-file distribution verification succeeded, and the exact permission/forbidden-permission audit passed.
- Final `npm run test:e2e` -> exit 0: 21/21 real-Chrome tests passed, including K0 session, K1 state/find, profile, parsing/OCR, comparison, complex writes, repeatable records, saved PDF gates, privacy controls, fill-quality and Xiaomi-derived regressions; no application submission occurred.
- Planning files: `AGENTS.md`, `feature_list.json`, `docs/browser-kernel-acceptance.md`, `docs/browser-kernel-delivery-plan.md`, and this handoff. The baseline branch also consolidates the already completed, validated F018/F034–F038 work that was still uncommitted on `agent/resume-attachment-acceptance`; no unrelated external file is intentionally included.
- No live recruitment mutation was performed in this planning node. F043 remains blocked in practice on future per-site user login/authorization but stays `todo` until K2–K5 dependencies are complete. The next implementation action is to create `agent/browser-kernel-k2-actions` from the published K1 baseline and implement only F039.

### N0 GitHub publication

- Published branch `agent/browser-kernel-k1-baseline` at baseline commit `99b0d454e9ffa12fedbb0eb64e6b96ff11c154b6`.
- Opened draft PR #3, `建立浏览器内核 K1 基线与 K2–K5 交付计划`, against `agent/resume-attachment-acceptance`: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/3`.
- The staged scope contained 66 repository files. Pre-push audits found zero suspicious staged paths and zero potential embedded-secret files; `git diff --cached --check` reported no whitespace errors.
- N0 is a published baseline/checkpoint, not a claim that F039 is complete. F039 remains `in_progress`; its implementation and completion evidence belong on `agent/browser-kernel-k2-actions`, stacked on this branch.

## 2026-08-06 - F039 multi-Agent harness and acceptance freeze

### Session baseline and branch

- Applied the user-requested `long-running-agent-harness` to F039. Read `AGENTS.md`, `feature_list.json`, `progress.md`, the K2–K5 delivery plan and the skill instructions before changing the harness.
- Main-agent `./init.ps1 -SkipInstall` -> exit 0: TypeScript passed, 30 Vitest files / 239 tests passed, production build succeeded, 13 distribution files were verified, the exact eight browser-kernel permissions plus `<all_urls>` matched, and forbidden permissions were absent.
- Created the required feature branch `agent/browser-kernel-k2-actions` from `agent/browser-kernel-k1-baseline`. F039 remains `in_progress`; no K2 implementation or completion claim was made in this checkpoint.

### Parallel read-only audits

- Three child Agents inspected the repository without editing files: protocol/reference/action architecture; anonymous HTTPS real-Chrome ground truth; and safety/integration boundaries. The root Agent remains the only integrator and Git owner.
- All audits identified the same K2 prerequisite: the current registry resolves `sessionId + ref` but does not bind the ref to the current `snapshotId` and an internal semantic fingerprint. K2 must add current-snapshot membership and fail closed after navigation, DOM replacement, semantic drift, detach, expiry or worker restart.
- The current frame traversal marks a `contentDocument` as same-origin without a separate action-time Origin proof. K2 must prove the frame Origin before writing; unknown, OOPIF and cross-Origin frames are blocked.
- Safety classification must add consent/destructive cases and cover default submit buttons, reset/delete/withdraw actions, OTP/password autocomplete, identity synonyms and fake upload buttons. Generic button/link click is outside K2; fixed click intent may only open an ordinary compatible control.
- The old `complex-controls` E2E remains a useful legacy-driver regression but cannot be K2 evidence because it bypasses the extension action protocol, HTTPS debugger session, snapshot and opaque reference. The K2 authority will be a new real-Chrome evaluator using the installed extension path.
- One independent Agent initializer overlapped another shared build and temporarily observed a missing `dist/background.js`, while the main baseline and another serial initializer passed. This is recorded as shared-artifact contention, not a product regression: child Agents may run targeted Vitest only; build, validate, Chrome E2E, screenshots and package commands are serialized by the root integrator.

### Frozen workstreams and evidence

- Added `docs/browser-kernel-k2-multi-agent-plan.md`. Agent A owns protocol/registry/safety files; Agent B owns the fixed page driver/action executor; Agent C owns anonymous fixture/E2E files. Runtime wiring, CDP wrapper, UI, package scripts, harness/status files, artifacts and Git remain integrator-only.
- Added the same ownership boundary to `AGENTS.md` and the machine-readable `parallel_workstreams` field on F039. Child Agents may not run Git, global formatters, `init.ps1`, full build/validate/E2E/package or edit across their lane.
- Fixed the positive denominator at 24 actions: 12 main/native, 4 React/Vue-style, 4 explicitly same-origin iframe and 4 open-shadow cases. Primary verified success must be at least 23/24; after at most one non-clipboard fallback it must be 24/24, with correct-target, event and readback coverage all 24/24.
- Fixed negative denominators at 8 restricted controls, 8 integrity fail-closed cases and 2 typed rejections. Wrong-control writes, sensitive/destructive/final actions, cross-Origin actions, third attempts, clipboard calls, final submissions and evidence leaks must all be zero. Any nonzero result is a RED gate that stops integration and keeps F039 incomplete.
- `artifacts/kernel-actions-report.json` and `artifacts/kernel-actions.png` are specified as anonymous aggregate evidence only. They must not contain refs, snapshots, authorization capabilities, profile paths/revisions, requested/old/current values, real semantics, selectors, DOM/CDP ids, query strings, cookies, headers, bodies, files, HAR, trace or video.

### Handoff

- Harness files changed in this checkpoint: `AGENTS.md`, `feature_list.json`, `docs/browser-kernel-k2-multi-agent-plan.md`, and `progress.md`.
- Harness consistency check -> exit 0: `feature_list.json` parsed; F039 remained `in_progress` on the exact K2 branch; three workstreams contained ten unique, non-overlapping owned paths; all fixed thresholds, RED gates and serial commands were present; `git diff --check` reported no whitespace error.
- Final serialized `npm run validate` -> exit 0 after all child Agents had stopped: TypeScript passed, 30 Vitest files / 239 tests passed, production build succeeded, 13 distribution files passed, exact permissions remained unchanged and forbidden permissions were absent.
- Next action: publish this validated in-progress K2 checkpoint to the feature branch/Draft PR, then freeze the concrete TypeScript action types and launch Agents A/B/C on their mutually exclusive implementation files. Do not mark F039 done until the full targeted, evaluator, validate, E2E, privacy review and GitHub evidence gates pass.

### F039 harness publication

- Published the in-progress harness checkpoint on `agent/browser-kernel-k2-actions` at commit `bbd47a6c807951171a7fdf6c6ae162c7259e65c5`.
- Opened Draft PR #4, `F039：建立 K2 多 Agent 验收与并行开发门`, against `agent/browser-kernel-k1-baseline`: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/4`.
- The staged checkpoint contained exactly five harness/documentation files. Pre-push audits found zero suspicious staged paths, zero potential embedded-secret files and no whitespace error.
- The PR explicitly remains Draft and F039 remains `in_progress`; it will receive the A/B/C implementation and final K2 evidence before any completion decision.

## 2026-08-06 - F039 K2 verified browser actions complete

### Serial execution and implementation

- The user chose serial execution after the multi-Agent harness checkpoint. No child Agent edited or verified this implementation slice; one root operator performed protocol, executor, runtime, UI, evaluator, integration and Git work in order. The frozen 24/8/8/2 denominator and RED gates were unchanged.
- Added an exact-property action protocol for `fill`, `type`, `select`, `check` and restricted `click`. Every request binds a recent user-created authorization, active session, current snapshot membership, opaque reference, internal semantic fingerprint and local profile revision. Public callers cannot supply selectors, DOM/CDP IDs, JavaScript or an arbitrary value.
- The reference registry now retains only current-snapshot membership and invalidates on stop, navigation, tab removal, expiry and debugger detach. Action-time inspection rechecks backend-node identity, fingerprint, disabled/read-only state, frame boundary, path and exact Origin before mutation.
- Added a fixed internal action executor for input/textarea/contenteditable, native select including multiple selection, exact radio/checkbox, date/month and compatible combobox/listbox opening. It uses native setters and browser-compatible events, rereads inside the page and returns only typed status/strategy/attempt metadata. Text controls alone may use one `Input.insertText` fallback; clipboard and third attempts are absent.
- Added destructive and consent safety classes and strengthened credential, OTP/CAPTCHA, identity, file and default/final-submit classification. The real-Chrome run also exposed a privacy defect where a wrapping label could include a textarea's old text; label extraction now skips descendant interactive controls and has a regression proving textarea values and select captions do not contaminate the label.
- Added a 60-second Organic side-panel authorization control. It warns that a recruitment site may autosave a draft and clears on inactive sessions. K2 does not yet expose a field-planning/orchestration UI; F040–F042 will compose these verified primitives into waits and recruitment workflows.

### Fixed anonymous HTTPS / real-Chrome evidence

- `npm run eval:kernel-actions` -> exit 0; 1/1 unpacked-extension test passed in real Chromium over anonymous HTTPS. The positive denominator was 24: 12 main/native, 4 React/Vue-style, 4 proven same-Origin frame and 4 open-shadow controls.
- Primary verified writes were 23/24 (95.83%). The single intentional first-strategy rejection used one keyboard fallback, producing 24/24 final verified writes. Readback, precondition and event-contract checks were 24/24.
- Restricted controls were 8/8 blocked with zero mutation: credential, OTP/CAPTCHA, identity, file, final submit, destructive action and consent. Integrity cases were 8/8 fail-closed: disabled, read-only, hidden-after-scan, stale snapshot, replaced node, forged reference, prior session and incompatible button. Typed rejections were 2/2: persistent framework rejection after two attempts and missing select option after one attempt.
- RED-gate counts were all zero: wrong-control mutation, final submission, third attempt, clipboard call, cross-Origin action and forbidden evidence leak.
- `artifacts/kernel-actions-report.json` contains only anonymous aggregate/case metadata. `artifacts/kernel-actions.png` was visually inspected and shows the Organic 24/24, 23/24, 8/8, 8/8, 2/2 and zero-count summary plus anonymous Origin/path; it shows no page value, profile value, authorization, ref, query string, credential, Cookie or submission action.

### Verification and deterministic E2E operation

- Final targeted command `npm test -- --run src/bridge src/background src/content/pageDriver.test.ts src/sidepanel/PowerSessionCard.test.tsx` -> exit 0; 9 files / 44 tests passed.
- Final `npm run validate` -> exit 0; TypeScript passed, 31 Vitest files / 255 tests passed, the production build succeeded, 13 distribution files passed, exact browser-kernel permissions remained unchanged and forbidden permissions were absent.
- The first full E2E run exposed an existing extension-install race: `embedded-bridge` created a recruitment tab before the asynchronous first-install options page completed. It now waits for that one-time page, matching the K1/K2 evaluators; the isolated test passed.
- Two CDP-heavy evaluator files proved nondeterministic only when four independent Chrome debugger profiles competed concurrently: both passed alone. The release `test:e2e` command now uses one Playwright worker so debugger-backed extension evidence is reproducible. Final post-review `npm run test:e2e` -> exit 0; 22/22 Chrome tests passed in 1.9 minutes, including K0, K1, K2 and every existing resume, PDF, repeatable-record, privacy and fill regression.

### Files and handoff

- Protocol, registry and safety: `src/bridge/protocol.ts`, `src/bridge/protocol.test.ts`, `src/bridge/pageState.ts`, and `src/bridge/pageState.test.ts`.
- Executor and integration: `src/bridge/pageActions.ts`, `src/bridge/pageActions.test.ts`, `src/content/pageDriver.ts`, `src/content/pageDriver.test.ts`, `src/background/bridgeRuntime.ts`, and `src/background/bridgeRuntime.test.ts`.
- UI and evaluator: `src/sidepanel/powerSessionBridge.ts`, `src/sidepanel/PowerSessionCard.tsx`, `src/sidepanel/PowerSessionCard.test.tsx`, `src/sidepanel/sidepanel.css`, `tests/fixtures/kernel-actions-ground-truth.ts`, `tests/e2e/kernel-actions.spec.ts`, and `tests/e2e/embedded-bridge.spec.ts`.
- Harness and documentation: `package.json`, `README.md`, `PRIVACY.md`, `docs/browser-kernel-acceptance.md`, `docs/browser-kernel-delivery-plan.md`, `feature_list.json`, and this handoff.
- F039 is `done` with no implementation blocker. The next dependency-unblocked feature is F040 on `agent/browser-kernel-k3-workflows`: bounded waits, same-Origin workflow transitions and request idempotency. Do not start F040 on the K2 branch. F043 real-site L2/L3 evidence remains future user-authorized work, so K2 completion is not a claim that every real recruitment site is already supported.

### F039 publication

- Committed the verified implementation on `agent/browser-kernel-k2-actions` as `8b6985fa68f91fbf887d5ed3d094f4b02370b80a` (`完成 K2 可验证浏览器动作`) and pushed it to `origin/agent/browser-kernel-k2-actions`.
- Updated existing Draft PR #4 against `agent/browser-kernel-k1-baseline`: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/4`. It remains Draft for review and was not merged or marked ready.
- The isolated K2 worktree contained exactly the 24 intended implementation/test/documentation paths at the implementation commit. Staged whitespace check passed; suspicious staged paths and secret-pattern matches were zero. Anonymous fixture literals were test-only, and no `.env`, real resume, local PDF, credential, Cookie, HAR, trace or real filled-page screenshot was committed.
- The original `C:\Users\jiangbingjian\qiuzhaozhushou` worktree and its separate F044/ATS-observation edits were not staged, rewritten or included in the K2 branch.

## 2026-08-07 - F040 K3 workflow harness kickoff

- Applied the user-requested `long-running-agent-harness`. Recovered the already published K2 worktree instead of duplicating F039, created `agent/browser-kernel-k3-workflows` from the exact recorded base `agent/browser-kernel-k2-actions`, and left the separate dirty ATS/GT worktree untouched.
- The first `./init.ps1 -SkipInstall` correctly exposed that a new worktree had no dependency directory. Full `./init.ps1` installed the lockfile dependencies and the clean K2 baseline passed with TypeScript, 31 test files / 255 tests, production build, 13 distribution files, exact permissions, and forbidden-permission absence. npm reported five dependency advisories; no unreviewed forced upgrade was applied.
- Froze `docs/browser-kernel-k3-workflow-plan.md`: four serial increments, 12 positive waits/workflows, 6 bounded failure cases, 4 idempotency cases, and zero-tolerance RED gates. F040 is now `in_progress`; no real recruitment page, login state, candidate value, upload, save, or final submission is part of this node.

## 2026-08-07 - F040 K3 implementation verified before publication

### Implementation

- Added the exact-property `POWER_PAGE_WAIT` protocol with five bounded conditions: semantic find, boolean control state, option-list appearance, same-Origin navigation, and DOM-settle. Timeout is restricted to 100–10,000 ms and polling to 50–500 ms; arbitrary selectors, XPath, script, CDP methods, node IDs and unbounded waits are rejected by the protocol guard.
- Added the fixed workflow executor. It rereads only K1 privacy-safe structure, returns typed timeout/session/Origin failures, refinds after dynamic rendering, observes `aria-expanded` as volatile state, and preserves the session across document and SPA history navigation while navigation listeners invalidate action authorization and old snapshots.
- Added a SHA-256 request ledger in `chrome.storage.session`. It persists `in-flight` before mutation, replays only an identical completed result, rejects a reused request ID with a different digest/session, and returns a zero-attempt uncertain result for concurrent or worker-recovered in-flight requests. Raw action requests and profile values are not stored in the ledger.
- Real Chrome exposed two recovery/integrity interactions. A fixed `DOM.enable`/`Page.enable` probe now recovers an extension-owned debugger attachment after MV3 worker restart. `aria-expanded` remains observable for waits and DOM-settle but is excluded from immutable node identity because a valid open-control action changes it; K2 open-control regression then passed again.

### Fixed real-Chrome evidence

- `npm run eval:kernel-workflows` -> exit 0. The anonymous HTTPS unpacked-extension evaluator passed 12/12 positive workflows, 6/6 bounded failures, and 4/4 idempotency cases. Positives include document + SPA navigation and `find -> open async dropdown -> wait options -> refind -> verified action`.
- Failure evidence includes typed timeout, stale-reference zero-mutation, non-settling DOM, absent option/state, and immediate Origin-change pause. Idempotency evidence includes same-worker replay, conflicting digest rejection, concurrent duplicate suppression, persisted in-flight recovery, and completed replay after forcibly terminating/restarting the MV3 worker.
- RED counts were all zero: duplicate mutation, cross-Origin continuation, final submission, unbounded wait and forbidden evidence leak. Malformed selector-bearing wait input was rejected. `artifacts/kernel-workflows-report.json` contains only anonymous case/status aggregates; `artifacts/kernel-workflows.png` was visually inspected and contains only the Organic extension summary.

### Verification and handoff

- Targeted command `npm test -- --run src/bridge src/background src/content/pageDriver.test.ts` -> exit 0: 10 files / 57 tests passed.
- Final `npm run validate` -> exit 0: TypeScript passed, 33 Vitest files / 270 tests passed, production build succeeded, 13 required distribution files and the exact permission/forbidden-permission audit passed.
- Final serialized `npm run test:e2e` -> exit 0: 23/23 real-Chrome tests passed in 3.0 minutes, including K0–K3 and every existing profile, PDF, OCR, privacy, repeatable-record and Xiaomi-derived regression.
- `git diff --check` reported no whitespace error. Secret-pattern review found only existing policy/test placeholders and no credential. No `.env`, real profile/resume/PDF, Cookie, header/body, HAR, trace, real filled-page screenshot, selector, ref or authorization capability is included in publishable evidence.
- F040 remains `in_progress` only until this verified implementation is committed, pushed to `agent/browser-kernel-k3-workflows`, and attached to a Draft PR based on `agent/browser-kernel-k2-actions`. The next feature after publication is F041; F043 live-site mutation remains future user-authorized work.

### F040 publication

- Committed the verified K3 implementation as `4294bf8e8515a70859d7f015a723a85a840f3447` (`完成 K3 有界工作流与幂等恢复`) and pushed `agent/browser-kernel-k3-workflows` to origin.
- Opened Draft PR #5, `F040：完成 K3 有界工作流与幂等恢复`, against the exact stacked base `agent/browser-kernel-k2-actions`: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/5`.
- The implementation commit contains 19 intended protocol/runtime/test/documentation files. Staged whitespace, suspicious-path and secret-pattern audits passed. The separate original ATS/GT worktree was not staged, rewritten or included.
- F040 is now `done`. The next unblocked feature is F041 on `agent/browser-kernel-k4-evidence`; do not start it on the K3 branch. The ignored local aggregate report and screenshot remain current under `artifacts/` and contain no real recruitment data.

## 2026-08-07 F041 K4 kickoff

- Created isolated worktree `C:\Users\jiangbingjian\qiuzhaozhushou-k4` on the exact feature branch `agent/browser-kernel-k4-evidence` from K3 evidence commit `f760551`; the original ATS/GT worktree remains untouched.
- Ran `./init.ps1` because this new worktree had no dependencies. Dependency installation completed and the baseline `npm run validate` passed with 33 test files / 270 tests, production build, 13-file distribution verification, and exact permission audit.
- Froze the K4 protocol, privacy boundary, 8 positive / 8 bounded-failure L1 denominators, RED gates, evidence format, and stacked publication rule in `docs/browser-kernel-k4-evidence-plan.md` before implementation.
- Set F041 to `in_progress`. The implementation remains scoped to user-confirmed primary-PDF upload, ephemeral screenshots, sanitized command logs, typed failures, and idempotent replay; no arbitrary filesystem-path upload, final submission, cookies, passwords, CAPTCHA, selector, script, or generic CDP method is allowed.

## 2026-08-07 F041 K4 implementation and verification

- Added strict K4 runtime messages for upload confirmation/execution/cancellation, ephemeral screenshots, and privacy-safe log reads. Requests accept only session/snapshot/opaque-ref capabilities; path, filename, digest, bytes, selector, script and arbitrary CDP method fields fail exact-key validation.
- Added the fixed `File/DataTransfer` upload executor and bound its 60-second authorization to the active HTTPS session, Origin, path, snapshot, one opaque file ref, and the revision of the locally saved `primary` PDF. The persistent K3 request ledger makes completed upload replay side-effect free and closes conflicting or uncertain duplicates.
- Migrated the installed Chrome side-panel attachment button to the pinned kernel target while retaining the existing local private summary and explicit destination confirmation. Added a removable screenshot preview whose image bytes exist only in React state and never enter storage, command logs or reports.
- Added typed upload failures for inactive sessions, debugger conflicts, stale references, timeouts, blocked controls, page changes, verification failures, cancellation, invalid resumes and duplicate requests. The existing CDP transport test verifies real Chrome API conflict text maps to `debugger-busy`; the upload service maps that code to `debugger-conflict`.
- `npm run eval:kernel-evidence` passed in real Chromium with unpacked extensions and an anonymous HTTPS fixture: 8/8 positive cases and 8/8 bounded failures. The current ignored report has zero duplicate upload, unconfirmed upload, arbitrary path/file, cross-Origin continuation, screenshot persistence, forbidden log field and final-submission counts.
- `npm run validate` passed: 36 test files / 285 tests, TypeScript, production build, 13 required distribution files and exact browser permission audit. `npm run test:e2e` passed 24/24 serial browser tests, including all previous attachment, parsing, filling, repeatable-record and K1–K3 regressions.
- Visually inspected `artifacts/kernel-evidence.png` (85,226 bytes): it contains only the anonymous Organic side-panel aggregate, 8/8 counts and zero red-line counts; it does not contain a filled recruitment page, PDF content, filename or profile value. `artifacts/kernel-evidence-report.json` also passed the forbidden-field inspection.

## 2026-08-07 F041 K4 publication handoff

- Committed the scoped K4 implementation as `cb2f4e07b02fcb9e5152d1a92d9c41879ecf1bdd` (`完成 K4 简历上传与隐私证据层`) after staged whitespace, suspicious-path and secret-pattern audits passed. No `artifacts/`, `.env`, credential, real resume or original ATS/GT worktree file was staged.
- Pushed `agent/browser-kernel-k4-evidence` and opened Draft PR #6, `F041：完成 K4 简历上传与隐私证据层`, against the exact stacked base `agent/browser-kernel-k3-workflows`: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/6`.
- F041 is now `done`. The next dependency-unblocked feature is F042 on `agent/browser-kernel-k5-adapters`, based on `agent/browser-kernel-k4-evidence`; it should remove the remaining direct mutation paths only after adapter parity evidence, not combine K5 with this PR.
- Handoff has no implementation blocker. The ignored local `artifacts/kernel-evidence-report.json` and `artifacts/kernel-evidence.png` remain current and privacy-inspected for review; the repository intentionally does not commit them.

## 2026-08-07 F042 K5 kickoff and cross-worktree boundary

- Reviewed the separate dirty ATS/GT worktree and confirmed that its F079–F081 Feishu family detector, semantic mappings, Ground Truth, anonymous fixtures, and family regression evidence are reusable adaptation assets. Its content-script control adapters, raw repeatable selectors, direct `.click()` lifecycle, active-tab `chrome.scripting` bridge, and legacy attachment path overlap or conflict with K4 and will not be copied into K5.
- Created isolated worktree `C:\Users\jiangbingjian\qiuzhaozhushou-k5` on `agent/browser-kernel-k5-adapters` from published K4 branch `agent/browser-kernel-k4-evidence` at `29776d7`. The original ATS/GT worktree and its uncommitted files remain untouched.
- Ran `./init.ps1`. Dependency installation completed; baseline `npm run validate` passed with TypeScript, 36 test files / 285 tests, production build, 13 required distribution files, exact browser-kernel permissions, and forbidden-permission absence. npm reported five dependency advisories; no forced upgrade was applied.
- Froze the ownership and serial migration plan in `docs/browser-kernel-k5-adapter-plan.md`. F042 is now `in_progress`; K5-A is limited to a declarative adapter SDK, one typed state/find/action/wait/upload boundary, exact-key validation, and compliance tests. No Feishu company rules, real page mutation, final submission, cookies, credentials, or personal values are in scope for this increment.

### F042 K5-A/B verified checkpoint

- Added a versioned declarative SDK under `src/adapter-sdk/`. An adapter can declare HTTPS family detection, technical semantic keys, canonical profile-field/range/saved-resume intent, generic control capabilities, confirmation/exclusion decisions, verification requirements, and bounded repeatable-section semantics. It cannot provide selectors, arbitrary page/profile values, scripts, CDP/DOM ids, callbacks, or browser commands.
- Added exact-key runtime validation. The validator rejects unknown properties, wildcard hosts, non-canonical profile paths, duplicate ids, automatic writes to sensitive profile paths, file operations outside the saved-resume confirmation gate, and non-verifying automatic writes. The anonymous contract fixture covers text, sensitive select, date range, repeatable education, saved PDF, and an explicitly manual custom question.
- Added `RecruitmentKernelApi`, a single typed state/find/action/wait/upload boundary over K4. `ChromeRecruitmentKernelApi` checks the caller's pinned session both before and after every operation, including K4 state/find/action-authorization messages that do not carry a session id themselves, so a session replacement cannot return an accepted result.
- Added a declarative registry and planner. Three anonymous ATS families are detected from trusted HTTPS host/path/marker evidence; suffix lookalikes do not match and tied detection fails closed. Planning returns only opaque control keys, canonical profile intent, confirmation state, capability, and typed skip reasons. Unknown custom questions, unavailable controls, identity/credential/consent/destructive controls, final-submit controls, and incompatible roles never enter the action plan.
- Added `RecruitmentAdapterOrchestrator`. It scans only through the pinned kernel, executes only user-selected planned fields, requires a separate confirmation bit for `confirm` fields, resolves no arbitrary value, suppresses duplicate selection, and routes PDF exclusively through K4 upload authorization. Current unsupported capabilities (`profile-range`, searchable combobox, toggle, and repeatable actions) return typed skips rather than using the legacy content engine or a blind fallback.
- Focused `npm test -- --run src/adapter-sdk` passed with 4 files / 19 tests; `npm run typecheck` and `git diff --check` passed, with only line-ending warnings for existing harness files.
- Full `npm run validate` passed with TypeScript, 40 test files / 304 tests, production build, 13 required distribution files, exact browser-kernel permissions, and forbidden-permission absence. This checkpoint changes no user-visible runtime path, so E2E and a new screenshot were not required.

### F042 checkpoint handoff

- Changed harness/docs: `feature_list.json`, `progress.md`, and `docs/browser-kernel-k5-adapter-plan.md`.
- Added SDK/runtime files: `src/adapter-sdk/{contracts,kernelApi,chromeKernelApi,manifestValidation,adapterRuntime,orchestrator,index}.ts` and four focused test files.
- F042 remains `in_progress`. The old content-script scan/fill/repeatable engine remains present because parity has not been proved. The next increment must add kernel-owned searchable-combobox/date-range/repeatable capabilities without accepting raw selectors or values, then route the installed side-panel flow through the orchestrator before legacy removal.
- The separate dirty ATS/GT worktree remains untouched; no Feishu company rules or real candidate data were copied into K5.

### F042 K5-C searchable-combobox increment

- Extended the fixed K4 action registry with a `custom-select` strategy for ordinary `combobox`/`listbox` targets. The internal executor uses a fixed option locator set, requires one exact normalized option, clicks only that option, and accepts success only after synchronous selected-state/value readback. Missing or duplicate captions fail closed; adapters still cannot provide a selector or candidate value.
- Added portal-option discovery through allowlisted `aria-controls` and `aria-owns` relationships. The privacy-safe page state exposes only option captions, not `value`/`data-value`, DOM ids, selectors, or existing candidate input values.
- Added the orchestrated searchable-combobox workflow: open the planned opaque ref, wait for an option list using only the field's technical semantic key, refind exactly one control in a new snapshot, then issue a profile-backed `select`. The wait request never contains the profile value or `optionText`; timeout and ambiguous/missing refind have typed failures.
- Focused verification passed with 7 files / 44 tests, including SDK contracts, pinned API, planner, orchestrator, page state, fixed action service, and the page-world driver. TypeScript and `git diff --check` passed; line-ending warnings were informational.
- Final `npm run validate` passed with TypeScript, 40 test files / 307 tests, production build, 13 required distribution files, exact permissions, and forbidden-permission absence.
- Final serialized `npm run test:e2e` passed 24/24 real-Chrome tests in 2.3 minutes. It covered K1 state/find, K2 fixed actions, K3 workflows, K4 saved-resume/evidence, existing complex controls, repeatable records, resume flows, privacy, and Xiaomi-derived no-submit regression. No real recruitment site or personal value was used.
- F042 remains `in_progress`: date ranges, kernel-owned repeatable add/save capability, installed side-panel migration, three-family K5 evaluator, and legacy-path removal are still pending. GitHub publication is also pending because `gh auth status` reports that the active `petitmainfroid` keyring token is invalid; no files were staged, committed, or pushed after that failed prerequisite check.

## 2026-08-08 F042 resume and checkpoint publication preflight

- Re-read the repository operating guide, F042 ledger, progress handoff, and the complete long-running harness and GitHub publication instructions. The branch remains `agent/browser-kernel-k5-adapters`; F042 remains `in_progress`.
- `./init.ps1 -SkipInstall` exited 0 with TypeScript, 40 test files / 307 tests, production build, 13 required distribution files, exact permissions, and forbidden-permission absence.
- GitHub CLI authentication for `petitmainfroid` is now valid again. The intended checkpoint scope is limited to the K5 harness/plan, `src/adapter-sdk`, and the fixed custom-select/page-state changes listed in the prior handoff. The separate ATS/GT worktree remains excluded.

## 2026-08-08 F042 K5-A/C checkpoint publication

- Staged and audited only the 20 K5-owned harness, SDK, protocol, page-state, page-action, and page-driver files. `git diff --cached --check` passed; suspicious-path and credential-pattern scans reported zero findings. No `.env`, artifact, real resume, profile value, ATS Ground Truth, or separate-worktree file was included.
- Committed the verified checkpoint as `21d8bdfc312ce768223d2edbcb4c5a9e8583805f` (`建立 K5 适配器 SDK 与自定义下拉内核`) and pushed `agent/browser-kernel-k5-adapters` to origin.
- Opened Draft PR #7, `F042：建立 K5 适配器 SDK 与自定义下拉内核`, against the exact stacked base `agent/browser-kernel-k4-evidence`: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/7`.
- F042 remains `in_progress`. The next scoped increment is kernel-owned profile date-range filling with exact protocol validation, local profile resolution, fixed page-driver behavior, and readback verification; repeatable add/save, side-panel migration, three-family evaluation, and legacy removal remain later nodes.

## 2026-08-08 F042 K5-C profile date-range increment

### Implementation

- Added the exact `fill-range` action intent. It accepts only a `profile-range` source whose canonical `startDate` and `endDate` paths belong to the same indexed education, work-experience, or project record. Raw dates, selectors, scripts, and arbitrary properties remain invalid at the bridge boundary.
- The action service resolves both dates from the locally stored profile under the existing user-gesture authorization and pinned-session checks. Empty, malformed, mixed-precision, or reverse-ordered ranges fail before page mutation. Neither paths nor dates appear in action results or evidence logs.
- Added the fixed `native-date-range` page strategy. It operates only on a recognized date-range group containing exactly two enabled, visible date/month/text inputs, dispatches cancellable `beforeinput` plus framework-compatible committed events, verifies both values, and restores both previous values when either readback is rejected. Ambiguous or unsupported structures fail closed and do not use keyboard fallback.
- The adapter orchestrator now translates a declarative `date-range`/`profile-range` field into the kernel action. Adapters still receive no candidate values and cannot supply selectors or executable behavior.

### Verification and handoff

- Focused tests passed: 4 files / 35 tests covering exact protocol validation, local two-path resolution, adapter translation, successful two-input writing, ambiguity rejection, cancellation atomicity, readback rollback, and privacy-safe results.
- `npm run validate` exited 0: TypeScript, 40 test files / 313 tests, production build, 13 required distribution files, exact permissions, and forbidden-permission absence all passed.
- `npm run test:e2e` exited 0: 24/24 serial real-Chromium regressions passed in 2.3 minutes, including K1-K4, complex controls, saved-resume upload, repeatable records, privacy, and Xiaomi-derived no-submit coverage. This is a full regression result; the dedicated three-family K5 evaluator has not yet been implemented.
- No installed side-panel behavior changed in this increment, so no new user-visible milestone screenshot was created. F042 remains `in_progress`; the next node is kernel-owned bounded repeatable-section add/save, followed by side-panel migration, three-family K5 evidence, and legacy-path removal.

## 2026-08-08 F042 K5-C bounded repeatable add/save increment

### Implementation

- The adapter planner now converts repeatable declarations into snapshot-scoped evidence: sorted record indexes, safe add-control refs, per-record save-control refs, and the manifest's bounded creation limit. It derives indexes only from declared technical semantic prefixes and excludes unavailable, unsafe, and final-submit controls.
- Added exact repeatable click intents. An add click carries only an allowlisted collection and bounded record index; the action service permits it only when that exact locally stored profile record exists and contains meaningful data. Save clicks carry no profile value. Raw labels, selectors, scripts, values, or DOM ids remain outside the request protocol.
- The fixed page driver permits repeatable clicks only on non-submit button controls whose visible/accessibility label matches the kernel-owned add/save vocabulary. Labels containing submit/apply/delete/remove equivalents fail closed. A click is honestly returned as `performed`, not `verified`; the privacy-safe evidence log now supports that intermediate state and also accepts the prior increment's `invalid-profile-range` failure category.
- Added orchestrated create/save verification. Creation proceeds one record at a time, rescans through the pinned kernel after each click, and accepts only the exact next contiguous index with no removal or multi-row jump. It stops at the adapter limit, missing local profile record, ambiguity, family change, or structure change. Save succeeds only when record indexes are unchanged and the exact save control leaves the active save plan.

### Verification and handoff

- Focused kernel/SDK tests passed: 15 files / 95 tests. Coverage includes strict repeatable protocol bounds, local-record binding, fixed add/save label safety, intermediate `performed` evidence, planned record/control refs, one-at-a-time rescan, empty-profile termination, ambiguous controls, multi-row mutation rejection, and save readback.
- `npm run validate` exited 0: TypeScript, 40 test files / 318 tests, production build, 13 required distribution files, exact permissions, and forbidden-permission absence all passed.
- `npm run test:e2e` exited 0: 24/24 serial real-Chromium regressions passed in 2.2 minutes. Existing repeatable, privacy, K1-K4, PDF upload, Xiaomi-derived, and no-submit behavior remained intact.
- This increment exposes the repeatable capability through the K5 orchestrator but does not yet switch the installed side-panel from the legacy content path. No new user-visible screenshot was required. F042 remains `in_progress`; next is side-panel scan/fill migration, then the three-family `eval:kernel-adapters` evidence and legacy-path removal.

## 2026-08-08 F042 K5-C side-panel compatibility seam

### Implementation

- Added `src/sidepanel/adapterPageBridge.ts`, an injectable compatibility bridge from the existing `PageBridge` UI contract to `RecruitmentAdapterOrchestrator`. Scan uses only the active pinned session and privacy-safe K1 state; local profile values are joined in side-panel memory after planning and are never passed into browser discovery.
- Extended the adapter plan with the destination origin, templated path, and privacy-safe field label needed to render a side-panel plan and bind the saved-resume target without a second content-script scan.
- Because K1 intentionally does not expose existing page values, every K5 fill proposal is marked `unreadable` and `requiresConfirmation`; the existing UI therefore preselects zero K5 fields. Legacy saved-field remaps are ignored so they cannot override an ATS family's declarative canonical intent.
- Selected fills require a fresh action authorization and accept only the exact control ref/profile path pair from the active plan. Profile changes, session changes, unknown refs, and remapped paths fail closed. Results count only kernel `verified` writes as filled.
- Repeatable UI state is derived from planned record indexes plus meaningful local records. Creation routes through the bounded K5 add/rescan loop. Saved PDF candidates are bound to the plan's sole file control and route only through the K4 upload authorization; the bridge never supplies a filesystem path or performs a direct DOM upload.
- Generalized the legacy UI-only `RepeatableRecordsScan.adapterId` type from the Xiaomi literal to a family id string. The installed `resolvePageBridge()` default was deliberately not changed because this branch has no production ATS manifests; the old path remains until three-family parity evidence exists.

### Verification and handoff

- Added `src/sidepanel/adapterPageBridge.test.ts` with four compatibility tests covering privacy-safe plan rendering, zero-default confirmation behavior, saved-remap rejection, exact canonical fill routing, repeatable create/rescan, and K4 resume authorization. Focused verification passed: 3 files / 14 tests; `npm run typecheck` also passed.
- `npm run validate` exited 0: TypeScript, 41 test files / 322 tests, production build, 13 required distribution files, exact kernel permissions, and forbidden-permission absence all passed.
- No installed or user-visible behavior changed, so this checkpoint did not require a new screenshot or another E2E run; the immediately preceding K5 repeatable checkpoint already recorded 24/24 serialized real-Chromium regressions. No live recruitment site, real profile value, resume, `.env`, cookie, or ATS Ground Truth entered this change.
- Changed files: `src/adapter-sdk/{contracts,adapterRuntime,adapterRuntime.test}.ts`, `src/content/repeatableRecords.ts`, `src/sidepanel/{adapterPageBridge,adapterPageBridge.test}.ts`, `docs/browser-kernel-k5-adapter-plan.md`, `feature_list.json`, and `progress.md`.
- F042 remains `in_progress`. Next: register three anonymous ATS manifests/fixtures, add `npm run eval:kernel-adapters` plus allowlisted report/screenshot evidence, then switch the installed resolver and remove the legacy content path only after parity passes.

### Publication evidence

- Scoped diff and credential-pattern audits found only the nine intended K5 files and no secret material. `git diff --cached --check` passed; the only diagnostics were the repository's existing LF-to-CRLF checkout warnings.
- Committed the compatibility checkpoint as `734ed426ac357b7759d6d82304387244bb956fe2` (`接入 K5 侧边栏兼容桥`) and pushed `agent/browser-kernel-k5-adapters` to origin.
- Draft PR #7 remains open against `agent/browser-kernel-k4-evidence` and now contains this checkpoint: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/7`.

## 2026-08-08 F042 K5-D anonymous three-family evaluator

### Implementation

- Added three synthetic ATS Ground Truth families and real-Chrome pages in `tests/fixtures/kernel-adapters-ground-truth.ts`. Alpha covers text, textarea, native select and date; beta covers contenteditable, searchable combobox, radio, a profile-presence checkbox and a same-origin iframe; gamma covers a two-input date range, open Shadow DOM, bounded repeatable add/save and the saved-resume PDF gate.
- Added exact `check` protocol support for `profile-presence`. The bridge resolves only whether a canonical local profile path is non-empty, sends no raw value to the adapter, and rejects unknown properties or invalid paths.
- Extended planned-field evidence with role, tag and boundary so the evaluator can prove its control-family denominator without exposing selectors, DOM ids, existing page values or candidate values.
- Corrected saved-resume planning to treat the actual K1 `<input type="file">` role as `textbox`, while the upload still routes exclusively through K4's explicit destination authorization and local saved-file gate.
- Fixed a real-Chrome repeatable lifecycle defect: after a pre-inspected allowlisted add/save button successfully clicks, the executor no longer converts the action to `stale-reference` merely because the framework replaced or removed that button. The orchestrator still requires a bounded rescan and structural verification before accepting create/save success.
- Added `tests/e2e/kernel-adapters.spec.ts` and `npm run eval:kernel-adapters`. The evaluator loads the real unpacked extension on routed anonymous HTTPS pages, uses `ChromeRecruitmentKernelApi` plus the registry/orchestrator, performs only user-authorized canonical actions, reads back the page in the test harness, and writes an allowlisted JSON report plus Organic summary screenshot.

### Exact evidence

- `npm run eval:kernel-adapters` exited 0: 3/3 synthetic ATS families passed. Planned/mapping fields were 14/14; supported, primary-verified and final-verified writes were 14/14; mapping precision, primary success and final success were each 100%. Wrong-control writes and final-submit actions were 0. Repeatable create/save were 1/1 and saved-resume upload was 1/1.
- `npm run validate` exited 0 in 39.1 seconds: TypeScript passed, 41 test files / 325 tests passed, production build completed, 13 required distribution files were present, exact browser-kernel permissions passed, and forbidden permissions were absent.
- The first full E2E attempt reached the outer 120-second command limit and exited 124 without an assertion failure. It was rerun with a 300-second command window. `npm run test:e2e` then exited 0: 25/25 serial real-Chrome tests passed in 2.3 minutes, including the new K5 adapter evaluator and all K1-K4, privacy, resume, repeatable and Xiaomi-derived no-submit regressions.
- Inspected `artifacts/kernel-adapters-report.json` (3,034 bytes) and `artifacts/kernel-adapters.png` (72,431 bytes), generated 2026-08-08 14:41 Asia/Shanghai. The report declares `syntheticOnly: true`, contains only anonymous family/capability/count/rate/safety fields, and records `gate.pass: true`. The screenshot follows the Organic palette and shows aggregate/family counts only; it contains no profile value, page value, resume filename, cookie, query string or filled recruitment page.

### Handoff

- Changed implementation/tests: `package.json`, `scripts/run-kernel-adapter-eval.mjs`, `src/adapter-sdk/{contracts,adapterRuntime,orchestrator}.ts` and tests, `src/bridge/{protocol,pageActions}.ts` and tests, `src/sidepanel/adapterPageBridge.test.ts`, `tests/fixtures/kernel-adapters-ground-truth.ts`, and `tests/e2e/kernel-adapters.spec.ts`.
- Changed evidence/harness: `artifacts/kernel-adapters-report.json`, `artifacts/kernel-adapters.png`, `docs/browser-kernel-k5-adapter-plan.md`, `docs/browser-kernel-acceptance.md`, `feature_list.json`, and `progress.md`.
- F042 remains `in_progress`. The evaluator completes anonymous three-family parity, but this branch still has no production ATS manifests. Next merge only the declarative ATS assets from the separate ATS/GT branch, register them in the production resolver, switch the installed side panel to `AdapterPageBridge`, prove parity again, and then remove the legacy direct mutation path. Do not claim a live recruitment-site result before F043.

### Publication evidence

- Staged only the 20 intended K5 evaluator files. `git diff --cached --check` passed; staged credential-pattern, suspicious-path, and report forbidden-term scans each found zero issues. The two committed artifacts are the inspected anonymous aggregate JSON and screenshot, not a real filled page.
- Committed the implementation and evidence as `ba48545d9b72a829bece5d292452ab0f82147c4d` (`完成 K5 三家族匿名验收`) and pushed `agent/browser-kernel-k5-adapters` to origin.
- Draft PR #7 remains open against the exact stacked base `agent/browser-kernel-k4-evidence`: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/7`.
- This publication does not complete F042. The next safe node is production ATS declaration integration and installed-resolver parity; legacy removal must remain last.

## 2026-08-08 F042 Feishu declaration migration checkpoint

### Audit and implementation

- Read the clean `agent/ats-observation-core` worktree at `6042c9e` without modifying it. Its Feishu detector/template covers one family across 小米、MetaApp、蔚来、安克创新 and 禾赛科技, but the repeatable rules include CSS selectors and its old execution path includes direct page operations. Only host/path evidence, stable technical keys, canonical mappings, labels and bounds were re-authored for K5.
- Added the selector-free production declaration at `src/ats/adapters/feishu/manifest.ts`. Exact detection requires HTTPS, a trusted Feishu/mioffice host suffix, a reviewed resume-application path, and at least two technical markers. Sensitive gender/nationality/hometown fields remain confirmation-required; identity and unsupported multi-city questions are manual; saved resume uses the K4 attachment gate; final submit remains excluded.
- Found a real integration gap while comparing the K5 K1 contract with the stored ATS observations: Feishu controls often carry no own `name`, while the stable key and label live on an ancestor `data-form-field-name` / `data-form-field-i18n-name`. K1 now inherits only strictly formatted technical keys from at most eight ancestor levels. It does not expose selectors, raw attributes, DOM ids/classes or page values.
- Found a privacy defect in the historical observation shape: an uploaded-file button could expose a filename and upload time through its text label. K1 semantic sanitization now replaces common document filenames and associated timestamps with `[文件]` and `[时间]`. No historical observation or personal text was copied to this branch.
- Added a real-Chrome anonymous Feishu canary using a routed `synthetic.jobs.feishu.cn` page. It checks inherited technical metadata, current-value/file-metadata/query redaction, one-family planning, custom-question skipping and zero final submit without performing a write.

### Verification and handoff

- Focused unit verification passed: 2 files / 17 tests for K1 metadata/privacy behavior and the production Feishu manifest's exact contract, five reviewed tenant shapes, canonical mappings, sensitive confirmation, PDF gate, custom-field skip, final-submit skip, and untrusted-location rejection.
- The first E2E attempt exposed a test-only navigation race with the extension's first-install options tab. After reusing the installed options tab, the second attempt correctly stopped at the product's privacy disclosure because the test had not acknowledged it. The final test adds the same local consent setup used by the existing suite; the product gates were not weakened.
- `npx playwright test tests/e2e/feishu-manifest.spec.ts --workers=1` then exited 0: 1/1 real-Chrome read-only canary passed in 12.1 seconds, with the test body completing in 5.4 seconds.
- Final `npm run validate` exited 0 in 66.2 seconds: TypeScript, 42 test files / 336 tests, production build, 13 required distribution files, exact browser-kernel permissions and forbidden-permission absence all passed.
- Final serialized `npm run test:e2e` exited 0: 26/26 real-Chrome tests passed in 2.8 minutes, including the new Feishu canary and all prior K1–K5, privacy, resume, repeatable, saved-PDF and no-submit regressions.
- The full suite regenerated `artifacts/kernel-adapters-report.json` at 2026-08-08 15:01 Asia/Shanghai without changing its 3/3 family, 14/14 mapping/write, or zero-submit result. A forbidden-term scan passed, and the current Organic screenshot was visually re-inspected; both remain synthetic aggregate evidence only.
- Changed files: `src/bridge/{pageState,pageState.test}.ts`, `src/ats/adapters/feishu/{manifest,index,manifest.test}.ts`, `tests/fixtures/feishu-manifest-page.ts`, `tests/e2e/feishu-manifest.spec.ts`, `docs/k5-feishu-manifest-migration.md`, `docs/browser-kernel-k5-adapter-plan.md`, `feature_list.json`, and `progress.md`.
- F042 remains `in_progress`. Next add a Feishu write-parity fixture for searchable selects, unique composite date-range targeting, bounded repeatable add/save and saved PDF. Register the manifest in the installed resolver only after that passes; do not delete the legacy path until other production ATS families are migrated.

### Publication evidence

- Staged only the 13 intended K1/Feishu declaration, anonymous canary, documentation, harness and regenerated aggregate-report files. `git diff --cached --check`, credential-pattern and suspicious-path scans passed; no `.env`, real observation, personal profile, resume, cookie, trace or `test-results` file was included.
- Committed the verified checkpoint as `bc8ff36cd8ddb02f6366f51602bf211be8e24bcf` (`迁移 K5 飞书声明与隐私语义`) and pushed `agent/browser-kernel-k5-adapters` to origin.
- Draft PR #7 remains open against `agent/browser-kernel-k4-evidence`: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/7`.
- This commit deliberately does not register the production manifest or change installed side-panel filling. The next checkpoint must provide write parity first.

## 2026-08-08 F042 Feishu write parity and installed resolver checkpoint

### Implementation

- Added one K1 composite control for a recognized Feishu-style two-input date range. The public state now emits only the container's opaque ref and technical semantic key, suppresses its two child inputs, and exposes no start/end values. Post-action inspection resolves the same composite for fixed two-value readback.
- Tightened repeatable planning so add controls must match both an exact collection-specific label and the declared section semantic key. Save controls must belong to the current record prefix; a no-key save label is accepted only for a manifest with one repeatable collection. Removed generic “新增/添加” labels from the Feishu declaration.
- The first real-Chrome write-parity run verified five earlier fields, then exposed a false `stale-reference` after opening the gender combobox: the click correctly changed `aria-expanded`, but the generic post-click fingerprint check treated that expected structural mutation as replacement. `open-control` now uses the same structural-click completion rule as repeatable add/save; the orchestrator still requires bounded wait, refind and selected-option readback before success.
- Expanded the anonymous Feishu fixture to cover ordinary text, a portal-style searchable combobox, one composite date range, section-scoped project add/save, saved PDF, an unknown enterprise question and final submit. The Ground Truth readback contains only anonymous test values and counters.
- Added a narrow production URL predicate and `RoutedPageBridge`. Exact trusted Feishu/mioffice HTTPS application URLs use `AdapterPageBridge` with the production manifest. If that K5 scan is unmatched, ambiguous or otherwise fails, the route is cleared and the legacy bridge is never invoked. Non-Feishu pages retain `ChromePageBridge` during the remaining migration.
- The installed side-panel E2E now connects the anonymous Feishu page, scans through the production resolver, confirms every K5 proposal is initially unselected, performs one user-selected write through the UI, and then verifies the full custom-select/date/repeatable/PDF parity through the same kernel. Final submit remains untouched.

### Exact verification

- Focused unit verification passed 4 files / 33 tests for K1 composite state, repeatable scoping, Feishu route/manifest safety and fail-closed bridge routing. `npm run typecheck` and `npm run build` passed.
- After the `open-control` fix, `npx playwright test tests/e2e/feishu-manifest.spec.ts tests/e2e/kernel-adapters.spec.ts --workers=1` passed 2/2 in 27.6 seconds. The Feishu case verifies text, searchable selection, composite date range, project create/save, one saved-PDF upload, no custom-question write and zero submit.
- `npm run eval:kernel-adapters` exited 0 in 15.7 seconds: 3/3 anonymous ATS families, 14/14 correct mappings, 14/14 verified writes, one repeatable create/save, one saved-resume upload, zero wrong-control writes and zero final-submit actions.
- Final `npm run validate` exited 0 in 60.8 seconds: TypeScript passed, 43 test files / 349 tests passed, production build completed, 13 required distribution files were present, exact permissions passed and forbidden permissions remained absent.
- `npm run test:e2e` exited 0: 26/26 serial real-Chrome tests passed in 2.1 minutes, including the installed Feishu K5 side-panel route and all prior K1–K5, privacy, repeatable, saved-resume, resume-import and Xiaomi-derived no-submit regressions.
- Generated and visually inspected `artifacts/feishu-k5-sidepanel.png`. It follows the Organic interface direction and contains only the synthetic Feishu origin plus anonymous profile/file values. The screen shows six confirmation-required proposals, zero default selections and no final-submit control. The regenerated `artifacts/kernel-adapters-report.json` retains 3/3 anonymous families, 14/14 mappings/writes and zero final submits.

### Handoff

- Changed kernel/adapter files: `src/bridge/{pageState,pageState.test,pageActions}.ts`, `src/adapter-sdk/{adapterRuntime,adapterRuntime.test}.ts`, and `src/ats/adapters/feishu/{manifest,manifest.test,index}.ts`.
- Changed production UI routing: `src/sidepanel/App.tsx`, `src/sidepanel/pageBridge.ts`, `src/sidepanel/routedPageBridge.ts`, and `src/sidepanel/routedPageBridge.test.ts`. The new data attribute contains only a canonical profile path and exists to make the installed side-panel acceptance deterministic.
- Changed fixtures/evidence/docs: `tests/fixtures/feishu-manifest-page.ts`, `tests/e2e/feishu-manifest.spec.ts`, `artifacts/feishu-k5-sidepanel.png`, `artifacts/kernel-adapters-report.json`, `docs/k5-feishu-manifest-migration.md`, `docs/browser-kernel-k5-adapter-plan.md`, `docs/browser-kernel-acceptance.md`, `feature_list.json`, and `progress.md`.
- F042 remains `in_progress`. The next recommended feature increment is a second production ATS-family declarative migration and the same anonymous installed-resolver parity. Do not delete `ChromePageBridge` until all intended non-Feishu families have equivalent evidence; do not claim a real company page result before F043.

### Publication evidence

- Staged exactly 21 implementation, test, documentation and anonymous evidence files. `git diff --cached --check` passed; suspicious-path, credential-pattern and aggregate-report forbidden-term scans each found zero issues. The new side-panel screenshot was explicitly allowlisted only after visual privacy inspection.
- Committed this checkpoint as `dde34d6` (`接入飞书 K5 写入与生产路由`) and pushed `agent/browser-kernel-k5-adapters` to origin.
- Draft PR #7 remains open against `agent/browser-kernel-k4-evidence`: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/7`.
- This publication is a transitional resolver milestone, not F042 completion: Feishu uses K5, while non-Feishu sites still use the legacy bridge pending their own family parity.

## 2026-08-08 F042 Moka declaration and installed-resolver parity checkpoint

### Evidence boundary and implementation

- Audited the public Moka/Huya contract in the separate `agent/ats-observation-core` worktree without modifying it. The available evidence proves the public candidate-resume route, bundle-level technical field names and the 9-group/41-logical-field schema, but not an authenticated rendered DOM. This checkpoint is therefore L1 anonymous parity evidence, not a claim that a real Huya or Moka application was filled.
- Added the selector-free Moka declaration at `src/ats/adapters/moka/manifest.ts` and registered it alongside Feishu. Exact routing requires HTTPS, the exact `app.mokahr.com` host, a reviewed `/campus_apply/<tenant>/<siteId>` path and `#/candidateHome/resume` hash. Userinfo, non-default ports, lookalike hosts and unrelated routes fail closed.
- Conservatively mapped 27 unambiguous fields across basic information, preferences, education, internship, projects, languages, self-evaluation and awards. Moka `practiceInfo` is bound to profile internships. The separate work-experience group, citizen ID, salary fields, summary-only education/company fields, project responsibilities and four-axis language ratings remain manual to avoid guessing or duplicating records.
- The public Moka evidence says the standard resume page has no attachment block and does not prove the authenticated repeatable add/save control lifecycle. The declaration therefore exposes neither saved-resume upload nor repeatable actions. Page save and final application submit are excluded.
- Added an anonymous real-Chrome Moka fixture with 27 supported fields, three portal-style searchable comboboxes and explicit traps for work history, identity, custom questions, page save and final submit. The installed side-panel production resolver now selects K5 for exact reviewed Moka routes while retaining the legacy bridge only for not-yet-migrated ATS families.

### Defects found and fixed

- The first manifest test correctly rejected birth date as an ordinary field under the sensitive-decision policy. It was changed to confirmation-required before any browser write evidence was accepted.
- The first Moka browser run verified 25/27 fields; the degree and language-level controls failed with `stale-reference`. Opening the earlier structural combobox had legitimately changed the page snapshot, while `executeSelected` still reused all refs from the original plan. The orchestrator now rescans after each searchable-combobox workflow and uniquely rebinds later selected fields by rule id, exact semantic key and resolved intent. Ambiguous or missing rebinding fails closed as `workflow-refind-failed`.
- After that fix, the same two controls timed out because manifest matching intentionally normalizes repeatable indexes while K1 `find` requires the exact indexed technical key. Planning now preserves the exact lowercased semantic key for kernel refind while retaining the normalized key only for rule matching. A focused regression proves two consecutive structural comboboxes and an indexed `candidate.locations[0].current_city` refind.

### Exact verification and handoff

- Focused SDK/Moka verification passed: 3 files / 25 tests. The broader Moka/Feishu/router selection passed 3 files / 35 tests. `npm run typecheck` and `npm run build` passed after the multi-combobox fixes.
- `npx playwright test tests/e2e/moka-manifest.spec.ts --workers=1` exited 0: 1/1 installed-extension real-Chrome anonymous Moka case passed, with the test body completing in 13.0 seconds. All 27 declared fields were written and read back; unsupported work/identity/custom controls were unchanged; page-save clicks and final-submit clicks were both 0.
- Final `npm run validate` exited 0 in 39.9 seconds: TypeScript passed, 44 test files / 363 tests passed, the production build completed, required distribution files were present, exact permissions passed and forbidden permissions remained absent.
- Final serialized `npm run test:e2e` exited 0: 27/27 real-Chrome tests passed in 2.4 minutes, including Feishu and Moka installed-resolver parity, the anonymous three-family evaluator and all existing K1-K4, privacy, repeatable, PDF and no-submit regressions.
- Generated and visually inspected `artifacts/moka-k5-sidepanel.png`. It follows the Organic interface direction and contains only anonymous Moka values. The screen shows 27 confirmation-required proposals, zero default selections and no submission action. The regenerated aggregate report remains synthetic-only and records the unchanged three-family 14/14 write gate with zero final submissions.
- Changed runtime/SDK files: `src/adapter-sdk/{adapterRuntime,orchestrator,orchestrator.test}.ts`, `src/ats/adapters/index.ts`, `src/ats/adapters/moka/{manifest,index,manifest.test}.ts`, and `src/sidepanel/pageBridge.ts`.
- Changed fixture/evidence/docs: `tests/fixtures/moka-manifest-page.ts`, `tests/e2e/moka-manifest.spec.ts`, `artifacts/{moka-k5-sidepanel.png,feishu-k5-sidepanel.png,kernel-adapters-report.json}`, `docs/k5-moka-manifest-migration.md`, `docs/browser-kernel-k5-adapter-plan.md`, `docs/browser-kernel-acceptance.md`, `feature_list.json`, and `progress.md`.
- F042 remains `in_progress`. Next migrate Lenovo conservatively because its public evidence contains exact technical component names, then evaluate Ctrip. Do not remove the legacy bridge until every intended production family has equivalent declaration, installed-resolver and anonymous write evidence; real-site acceptance remains F043.

### Publication evidence

- Staged exactly the 18 intended Moka/runtime, test, documentation and anonymous-evidence files. `git diff --cached --check` passed; suspicious-path, credential-pattern and aggregate-report forbidden-term scans each found zero issues. The current Moka screenshot was explicitly force-added only after visual privacy inspection.
- Committed the checkpoint as `e4d573c122c24205665ecc2c4b8c3dd006abc6b7` (`迁移 Moka K5 声明与多下拉重绑`) and pushed `agent/browser-kernel-k5-adapters` to origin.
- Draft PR #7 remains open against the exact stacked base `agent/browser-kernel-k4-evidence` and now contains this checkpoint: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/7`.

## 2026-08-08 F042 Lenovo Talent declaration and installed-resolver parity checkpoint

### Evidence audit and implementation

- Audited the Lenovo Talent public-component Ground Truth in the separate `agent/ats-observation-core` worktree without modifying it. The source proves the exact `https://talent.lenovo.com.cn/account/resume` PC route, Element Plus component contract, 7 groups, 55 logical fields, 2 workflow controls and 15 remote dictionaries. It explicitly does not prove authenticated rendered DOM, candidate values, page writes, upload, save or submission.
- Added `src/ats/adapters/lenovo/manifest.ts` as a clean-room, selector-free declaration and registered it as the third exact production K5 route. URL routing rejects HTTP, lookalike hosts, userinfo, non-default ports, unrelated paths and SPA hashes; semantic detection then requires at least three public technical markers. An unmatched or ambiguous Lenovo page cannot fall back to the legacy writer.
- Recorded an explicit decision for all 55 public fields. Fifteen enter the K5 plan: email, phone, four education values, three existing internship values, three existing project values, strengths, self-evaluation and the saved resume. Forty remain manual because the current schema/kernel cannot safely perform full-name splitting, radio-group selection, `YYYY/MM` conversion, remote school search, multi-city selection, conditional record creation, identity/avatar handling or Lenovo-specific answers.
- Kept `repeatables` empty. Public API families do not prove authenticated add/save button references or state transitions. The anonymous fixture fills only an already-present index 0 record and never clicks the page-level save. The PDF target is the unique `resumeAttachment` file input and still requires the existing local saved-file and K4 destination authorization gates.
- Added an anonymous Lenovo real-page fixture with Element Plus-style structural comboboxes, private page-value sentinels, a separate image input and explicit save/final-submit traps. The installed side panel routes the exact Lenovo URL to K5, exposes 14 profile suggestions with zero default selections, and presents the saved PDF in its separate confirmation area.

### Exact verification and handoff

- `npx vitest run src/ats/adapters/lenovo/manifest.test.ts` passed 1 file / 14 tests. The combined Feishu/Moka/Lenovo manifest run passed 3 files / 46 tests. `npm run typecheck` and `npm run build` both exited 0.
- `npx playwright test tests/e2e/lenovo-manifest.spec.ts --workers=1` exited 0: 1/1 installed-extension anonymous Lenovo case passed in 14.6 seconds, with the test body completing in 8.9 seconds. Fourteen profile fields verified by page readback and the saved PDF uploaded once.
- The same browser readback proved surname, given name, birthday, certificate number, WeChat, remote school, education start month, avatar and enterprise custom question were unchanged. Page-level save clicks and final-submit clicks were both 0. K1 state contained technical keys but none of the private sentinel values or URL query string.
- Final `npm run validate` exited 0 in 31.7 seconds: TypeScript passed, 45 test files / 377 tests passed, production build and required-file checks passed, exact browser permissions passed and forbidden permissions remained absent.
- Final serialized `npm run test:e2e` exited 0: 28/28 real-Chrome tests passed in 2.4 minutes, including installed Feishu, Moka and Lenovo routes, the anonymous three-family evaluator and all K1-K4, privacy, repeatable, PDF, resume and zero-submit regressions.
- Generated and visually inspected `artifacts/lenovo-k5-sidepanel.png`. It follows the Organic palette, contains only anonymous profile/PDF values, shows 14 confirmation-required profile suggestions with zero selected, and displays PDF as a separately confirmed action. Full E2E also regenerated the existing anonymous aggregate report and Feishu screenshot.
- Changed adapter/runtime files: `src/ats/adapters/index.ts` and `src/ats/adapters/lenovo/{manifest,index,manifest.test}.ts`.
- Changed fixture/evidence/docs: `tests/fixtures/lenovo-manifest-page.ts`, `tests/e2e/lenovo-manifest.spec.ts`, `artifacts/{lenovo-k5-sidepanel.png,feishu-k5-sidepanel.png,kernel-adapters-report.json}`, `docs/k5-lenovo-manifest-migration.md`, `docs/browser-kernel-k5-adapter-plan.md`, `docs/browser-kernel-acceptance.md`, `feature_list.json`, and `progress.md`.
- F042 remains `in_progress`. Next audit and conservatively migrate the Ctrip custom family. Do not remove the legacy bridge until every intended Ground Truth family has equivalent exact routing and anonymous parity; real-site read/write acceptance remains F043.

### Publication evidence

- Staged exactly the 14 intended Lenovo adapter, anonymous fixture/E2E, documentation and evidence files. `git diff --cached --check` passed; suspicious-path, credential-pattern and aggregate-report forbidden-term scans each found zero issues. The current Lenovo side-panel screenshot was force-added only after visual privacy inspection.
- Committed the checkpoint as `48e268d6fb8bcb909c65c33d4f0772668e1de71b` (`迁移 Lenovo Talent K5 声明与 PDF 验收`) and pushed `agent/browser-kernel-k5-adapters` to origin.
- Draft PR #7 remains open against the exact stacked base `agent/browser-kernel-k4-evidence` and now contains the Lenovo checkpoint: `https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/pull/7`.
