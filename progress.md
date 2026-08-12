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

## 2026-08-06 - F044 ATS observation core kickoff

- Applied the user-requested `long-running-agent-harness` and restored the repository from `AGENTS.md`, `feature_list.json`, `progress.md`, and the existing browser-kernel checkpoint plan before changing code.
- The initial `./init.ps1 -SkipInstall` baseline on `agent/browser-kernel-k2-actions` exited 0: TypeScript passed, 30 Vitest files / 239 tests passed, the production build and 13-file distribution audit succeeded, exact browser-kernel permissions remained unchanged, and forbidden permissions were absent.
- F039 is already in progress on its required K2 branch and explicitly excludes ATS adapter work. To avoid contaminating Draft PR #4, created `agent/ats-observation-core` from `agent/browser-kernel-k1-baseline` and registered independent F044 with that baseline as `pr_base`.
- F044 is intentionally narrower than F042: it provides a read-only `src/ats` observation contract, generic detector registry, normalization/redaction, shareability audit, and ground-truth types. It adds no concrete ATS family, UI, page action, arbitrary selector, network call, permission, telemetry, upload, or submission capability.
- Privacy gate: shareable output must omit session snapshots and opaque references, template path identifiers, bound semantic text and options, and fail closed on values, selected/checked state, raw HTML, selectors, DOM/CDP IDs, query values, credentials, file metadata, local paths, encoded payloads, or personal identifiers.
- F044 is `in_progress`. Next action: implement only the isolated module and its unit tests, then run targeted tests, type checking, full validation, feature-plan parsing, and whitespace/privacy review before deciding completion.

### F044 implementation and acceptance evidence

- Added the independent `src/ats` module with versioned observation and human-ground-truth contracts, a deterministic detector registry, bounded normalization/redaction, a fail-closed shareability audit, and a single conversion entry point from `PrivacySafePageState`. The production module removes snapshot IDs and opaque control references and emits sequential anonymous control keys instead.
- Added `docs/ats-observation-acceptance.md` as the executable acceptance boundary. The module intentionally contains no concrete ATS-family adapter, user interface, extension storage, Chrome/debugger call, DOM selector, network/telemetry path, page action, upload, or submission behavior.
- The first targeted test run exposed missing explicit Vitest imports in the three new test files (`describe is not defined`). This was test scaffolding only; adding the imports resolved it. The final targeted run `npm test -- --run src/ats` exited 0 with 3 files / 8 tests passed.
- `npm run typecheck` exited 0. The final `npm run validate` exited 0: TypeScript passed, 33 Vitest files / 247 tests passed, the production build succeeded, 13 required distribution files were verified, permissions remained unchanged, and forbidden permissions were absent.
- The tests cover anonymous observation export, malicious email/phone/URL/query/local-path redaction, path templating, snapshot/reference removal, unsafe source rejection, forbidden-key and personal-data rejection, duplicate control keys, inconsistent summaries, invalid union members, deterministic family selection, tie resolution, sanitized evidence, invalid detector registration, and the generic fallback.
- A production-only static capability review covered `audit.ts`, `contracts.ts`, `familyRegistry.ts`, `index.ts`, `observation.ts`, and `sanitize.ts`. It found zero executable references to Chrome APIs, debugger commands, DOM querying, `fetch`, XHR, WebSocket, click/dispatch, `DataTransfer`, extension messaging, local storage, or IndexedDB. Production imports are local except for type-only `PrivacySafePageState`/`PrivacySafeControl` imports from `src/bridge/protocol.ts`.
- Harness audit passed: `feature_list.json` parsed with 45 features and the expected F044 branch/base metadata; `git diff --check` reported no whitespace errors (only Windows LF/CRLF notices on existing tracked files).

### F044 changed files and handoff

- Module: `src/ats/contracts.ts`, `src/ats/sanitize.ts`, `src/ats/familyRegistry.ts`, `src/ats/audit.ts`, `src/ats/observation.ts`, `src/ats/index.ts`, and `src/ats/README.md`.
- Tests: `src/ats/familyRegistry.test.ts`, `src/ats/observation.test.ts`, and `src/ats/audit.test.ts`.
- Harness and acceptance: `docs/ats-observation-acceptance.md`, `feature_list.json`, and `progress.md`.
- F044 is complete with no code blocker. The next logical ATS-corpus node is a separately accepted, user-reviewed local export workflow followed by concrete family detectors and anonymous regression fixtures; those are not implemented here. F039 remains isolated on `agent/browser-kernel-k2-actions`, and its branch was not modified by this work.

## 2026-08-06 - F045 privacy-safe ATS corpus kickoff

- Applied the user-requested `long-running-agent-harness`, reread the repository operating guide and durable state, and selected independent F045 after completed F044. No commit or push is authorized, so the node continues on `agent/ats-observation-core`; the separate F039 browser-action work remains untouched.
- Baseline `./init.ps1 -SkipInstall` exited 0 before F045 edits: TypeScript passed, 33 Vitest files / 247 tests passed, production build succeeded, 13 required distribution files passed, exact permissions remained unchanged, and forbidden permissions were absent.
- F045 is `in_progress`. Scope is limited to a versioned repository corpus contract, developer annotations, a bounded fail-closed local importer, deterministic naming/deduplication, whole-corpus verification, tests, and operator documentation.
- The importer may write only a validated anonymous sample beneath the repository-owned `ats-corpus/samples/<family>/` hierarchy. It must not overwrite conflicts or collect from a browser. F045 adds no UI, live ATS data, detector/template, network/telemetry path, browser permission, page action, file upload, or final submission behavior.
- Next action: implement the exact schema and safe import/verification core, then run the listed targeted and full checks before recording completion evidence.

### F045 implementation and acceptance evidence

- Added the repository-owned `ats-corpus/` hierarchy with an exact JSON Schema 2020-12 contract. The envelope contains the complete F044 observation plus bounded annotations for review state/time, reviewed family, canonical profile field, section, allowlisted control behaviors, expected action, fixed driver, verification method, and notes. Empty `samples`, `fixtures`, and `templates` areas are documented; no live ATS sample or template was added.
- Added `scripts/ats-corpus/core.mjs`, `import.mjs`, and `verify.mjs`. The importer accepts one explicit JSON file up to 1,000,000 bytes, wraps a raw F044 observation as unreviewed, validates through Ajv, rechecks privacy and cross-field invariants, computes an anonymous structural SHA-256, searches the bounded corpus for duplicates, and only then writes with exclusive `wx` semantics beneath `samples/<family>/`. Capture time/tool version do not create duplicates; an annotation conflict or existing target is never overwritten.
- Added `npm run corpus:import -- <file> [--dry-run]` and `npm run verify:corpus`. Whole-corpus verification checks at most 2,000 JSON samples / 20,000,000 bytes for schema, privacy, one-to-one annotations, summary consistency, deterministic placement, structural duplicates, unexpected family contents, nested directories, and symbolic links. `npm run validate` now includes this gate.
- Added `docs/ats-corpus-acceptance.md` and corpus operator READMEs. They define the collect-download-import-review lifecycle and prohibit personal/page values, credentials, Cookie/header/body data, query values, local paths, filenames, resume content, raw HTML, selectors, DOM/CDP/session identifiers, encoded payloads, automatic upload, and final submission.
- Targeted final run `npm test -- --run src/ats/corpusImport.test.ts` exited 0 with 1 file / 8 tests passed. Coverage proves raw wrapping, reviewed annotations, the non-writing CLI dry run, deterministic duplicate handling across capture time/tool versions, malformed/schema-invalid rejection, annotation mismatch rejection, personal/local-path rejection, conflict refusal, and placement verification.
- Final `npm run verify:corpus` exited 0 with `samples=0 bytes=0 families=none`; this node intentionally seeds no real or fabricated ATS corpus record. Final `npm run typecheck` exited 0.
- Ajv 8.17.1 was initially selected, then `npm audit` identified its `$data` ReDoS advisory range. The dependency was upgraded to Ajv 8.20.0 before final acceptance; the Ajv finding disappeared. The remaining five audit findings are in the repository's existing Vitest/Vite/esbuild development toolchain and require a separate major-version maintenance decision; F045 does not run the affected Vitest UI server.
- The first full validation after the dependency upgrade reached 34/34 test files, 255/255 tests, corpus verification, and a successful production build, then exited 1 before printing the distribution step. Standalone `npm run verify:dist` immediately exited 0. A clean full rerun of `npm run validate` then exited 0 end to end: TypeScript passed, 34 Vitest files / 255 tests passed, the empty corpus verified, production build succeeded, 13 required distribution files passed, exact permissions remained unchanged, and forbidden permissions were absent.
- Final static gates passed: `feature_list.json` parsed with 46 features; `git diff --check` reported no whitespace errors (only Windows LF/CRLF notices); production source has no import of corpus tooling; the built `dist` contains no corpus/import/collector marker; Manifest has no diff; and corpus executables contain no Chrome/debugger, DOM query, browser messaging, network/telemetry, click/dispatch, upload, or submit capability.

### F045 changed files and handoff

- Corpus contract and guidance: `ats-corpus/schema/ats-corpus-sample-v1.schema.json`, `ats-corpus/README.md`, `ats-corpus/samples/README.md`, `ats-corpus/fixtures/README.md`, and `ats-corpus/templates/README.md`.
- Import/verification tooling: `scripts/ats-corpus/core.mjs`, `scripts/ats-corpus/core.d.mts`, `scripts/ats-corpus/import.mjs`, `scripts/ats-corpus/verify.mjs`, and `scripts/validate.mjs`.
- Tests and documentation: `src/ats/corpusImport.test.ts`, `src/ats/README.md`, and `docs/ats-corpus-acceptance.md`.
- Harness/dependencies: `feature_list.json`, `progress.md`, `package.json`, and `package-lock.json`; Ajv 8.20.0 is development-only.
- F045 is complete with no code blocker and no user-visible milestone, so no E2E screenshot was required. No commit or push was performed. The next recommended feature is F046: a development-build-only collector with an explicit gesture, privacy preview, JSON download, and a distribution proof that the collector is absent from production. Moka/Beisen samples and detectors remain later nodes.

## 2026-08-06 - F046 Xiaomi-based developer collector kickoff

- Applied the user-requested `long-running-agent-harness` and the required `agent-reach` internet-routing skill. The `agent-reach` executable was unavailable and the documented Exa MCP backend was not configured, so research followed the skill's Jina Reader fallback plus the repository's existing direct read-only Xiaomi schema audit; no external file was written during research.
- Baseline `./init.ps1 -SkipInstall` exited 0 before F046 edits: TypeScript passed, 34 Vitest files / 255 tests passed, the empty ATS corpus verified, production build succeeded, 13 required distribution files passed, exact permissions remained unchanged, and forbidden permissions were absent.
- Current public evidence on 2026-08-06: Jina Reader returned the Xiaomi internship site at `xiaomi.jobs.f.mioffice.cn` and the application title/login boundary; `npm run audit:xiaomi` exited 0 and confirmed the existing public application schema still has 9 groups / 34 visible fields with no application submission. Unauthenticated application rendering exposes the login route, so F046 will not attempt login or authenticated collection.
- F046 is `in_progress`. It will add one compile-time-isolated collector build, an explicit-gesture privacy preview/download flow, production exclusion checks, focused tests, and a real-Chrome anonymous Xiaomi-derived acceptance artifact. It will not add a Xiaomi/Feishu family detector, real corpus sample, page write, upload, network feedback, permission, or submission capability.
- The anonymous fixture, not the live page, owns reproducible field and privacy denominators. Live Xiaomi evidence remains read-only schema freshness only; any future authenticated capture requires a separate user-authorized node and must never commit real values or filled screenshots.

### F046 implementation and Xiaomi acceptance evidence

- Added a developer-only ATS collector card behind a compile-time Vite alias. `npm run build:collector` emits `dist-collector`, while the normal development/production entry resolves to an empty developer-tools component. The collector marker, UI strings, CSS, and implementation are absent from the production dependency graph and distribution.
- The collector performs no work before the developer clicks `采集匿名结构`. That gesture starts or reuses the bounded K0/K1 session, reads one `PrivacySafePageState`, and passes it only through the audited F044 observation conversion. It displays the anonymous result before a separate `下载匿名 JSON` click creates a local Blob download.
- The collector has no extension storage, filesystem, clipboard, telemetry, network-upload, polling, login, CAPTCHA/SMS, page mutation, form-fill, file-upload, navigation, or submit path. The Manifest is unchanged; the collector build retains exactly `activeTab`, `alarms`, `debugger`, `scripting`, `sidePanel`, `storage`, `tabs`, and `webNavigation` plus the existing `<all_urls>` host permission, without a `downloads` permission.
- Added a Xiaomi-derived anonymous HTTPS browser fixture covering the nine current public schema groups and 38 controls. It exercises ordinary text/number controls, native and custom selects/multi-selects, textareas, month ranges, repeatable records, resume-file gates, identity restrictions, and a final-submit control.
- The E2E proves the exported path is templated as `/internship/resume/:id/apply`; values, synthetic name/email/phone/identity data, query token, raw job ID, snapshots, opaque refs, DOM/CDP IDs, selectors, raw HTML, file metadata, Cookie text, and encoded page payloads are absent. The real fixture submit counter remains zero, and the downloaded observation passes the F045 corpus importer with `dryRun: true`.

### F046 verification results

- `npm test -- --run src/devtools/ats-collector src/foundation.test.ts` -> exit 0; 2 files / 3 tests passed. The tests prove explicit gesture ordering, preview-before-download, anonymous conversion, safe generic failure text, and no download on an inactive/error path.
- `npm run typecheck` -> exit 0. `npm run build:collector` -> exit 0. `npm run verify:collector` -> exit 0 and proved the collector marker/UI are present only in `dist-collector` with the exact unchanged permission set.
- The first collector-build verifier run correctly failed because an HTML transform did not actually change the Vite entry and the marker was missing. The final design uses a compile-time `@developer-tools` alias instead; the developer build contains the collector and the production build resolves to a null component.
- Focused `npx playwright test tests/e2e/ats-collector.spec.ts` -> final exit 0; 1/1 real-Chrome test passed. The initial full parallel suite exposed the extension's documented first-install options-page navigation racing the fixture navigation. The test now waits for and reuses the completed install page; the focused rerun passed.
- `npm run audit:xiaomi` -> exit 0: the current public Xiaomi A96028 schema remains 9 groups / 34 visible fields, with no application submission. The unauthenticated application still presents a login boundary; F046 did not authenticate or collect a live sample.
- Final `npm run validate` -> exit 0: TypeScript passed, 35 Vitest files / 257 tests passed, the empty corpus verified, production built successfully, 13 distribution files passed, exact permissions remained unchanged, forbidden permissions were absent, and production collector-absence verification passed.
- Final `npm run test:e2e` -> exit 0; 22/22 real-Chrome tests passed in four workers, including the Xiaomi collector, existing Xiaomi fill fixture, K0/K1 bridge, profile, resume import/OCR, privacy, attachment, repeatable-record, complex-control, and fill-quality regressions.
- `artifacts/xiaomi-ats-collector.png` was visually inspected. It contains only the anonymous fixture origin/path, generic-family result, 38-control / 5-restricted summary, structural field labels, and the download control; it contains no personal value or filled recruitment screenshot.
- Final static gates: `feature_list.json` parsed with 47 features; `git diff --check` found no whitespace errors (only Windows LF/CRLF notices); production source/distribution contain no collector marker or direct collector import; the Manifest has no diff; and collector source has no executable network, storage, clipboard, DOM selector, raw Runtime evaluation, upload, or submission capability.

### F046 changed files and handoff

- Collector module: `src/devtools/entry.tsx`, `src/devtools/ats-collector/entry.tsx`, `AtsCollectorCard.tsx`, `AtsCollectorCard.test.tsx`, and `collector.css`.
- Compile-time isolation and packaging: `src/sidepanel/main.tsx`, `src/sidepanel/App.tsx`, `vite.config.ts`, `tsconfig.json`, `scripts/build.mjs`, `scripts/verify-collector-build.mjs`, `scripts/verify-dist.mjs`, `package.json`, and `.gitignore`.
- Acceptance and browser evidence: `docs/xiaomi-ats-collector-acceptance.md`, `ats-corpus/README.md`, `tests/e2e/ats-collector.spec.ts`, and `artifacts/xiaomi-ats-collector.png`.
- Harness state: `feature_list.json` and this handoff. No real Xiaomi sample, Xiaomi/Feishu detector, family template, commit, or push was added.
- F046 is complete with no code blocker. The next recommended node is a developer-operated, user-authorized real Xiaomi capture: load `dist-collector`, manually complete any login/verification, explicitly collect one value-free observation, review it locally, and run the F045 importer. After two or three independently reviewed Feishu-recruitment structures exist, implement the family detector and default template from evidence rather than from one site.

## 2026-08-07 - F047 real Xiaomi ground-truth and privacy hardening kickoff

- Reapplied `long-running-agent-harness`, reread `AGENTS.md`, `feature_list.json`, and `progress.md`, and ran `./init.ps1 -SkipInstall` before edits. Baseline exited 0: TypeScript passed, 35 Vitest files / 257 tests passed, the empty corpus verified, production built, 13 distribution files passed, exact permissions remained unchanged, and the production collector-absence check passed.
- Attempted the applicable `computer-use` initialization to inspect the already-authenticated Chrome tab independently. Its required native Windows pipe was unavailable (`os error 2`), so no browser UI action occurred. The current private download and repository public-schema snapshot are the only real evidence used in this node; the live file will not be copied into the repository.
- Private diagnostic comparison: K1 reported 57 controls / 4 frames and the JSON contained 57 controls, proving export preservation only. It did not independently prove page completeness. The observation had 19 controls without any label/ARIA/placeholder/name/nearby text, all 57 controls reported `required=false`, custom comboboxes lacked observed options, frame-bound control count was zero, and the final `提交简历` control was incorrectly ordinary.
- The private file also contained the uploaded resume filename/status timestamp and selected date display text. `npm run corpus:import -- <private-file> --dry-run` incorrectly exited 0, proving that F044/F045 privacy checks missed filename and current-display patterns. The filename/value text is intentionally not repeated here and the private observation remains only in the user's Downloads directory.
- Registered F047 as `in_progress`. The independent denominator is the existing current public Xiaomi snapshot: 9 logical groups / 34 visible schema fields. K1 raw-node preservation, logical field recall, section recall, semantic naming, required/options evidence, safety classification, and privacy are separate metrics; none may validate itself using only the scanner's own count.

### F047 implementation and verification evidence

- Added the repository-owned, value-free ground truth `ats-corpus/ground-truth/xiaomi-internship-application-v1.json`. It contains only the Xiaomi internship application path template, nine public group labels, and 34 public logical field definitions; it contains no job ID, application ID, capture timestamp, company-specific filled value, or live observation.
- Extended K1 page state and the ATS observation contract with bounded `sections` and `sectionCount`. Extraction now reads only allowlisted `data-form-field-name`, `data-form-field-i18n-name`, native/ARIA required markers, stable section headings, and known Feishu resume section class/technical prefixes. It normalizes repeatable indices and does not add selectors, raw HTML, current values, cookies, credentials, or DOM/CDP identifiers.
- Added fail-closed semantic filtering for filename-like text, upload-status text, timestamps, and date-only/date-range display values in both page-state conversion and shareable observation conversion. The observation audit and corpus importer independently reject those patterns. Final labels including `提交简历` and `投递简历` are now required to carry `final-submit` safety.
- Added `npm run audit:xiaomi-observation -- <file> --k1-controls <count> --dry-run`. It validates the privacy/schema contract before computing aggregate-only evidence and reports K1/export/summary raw counts separately from 9-section coverage, 34-field logical coverage, semantic naming coverage, and final-submit protection. It never prints captured semantic values on rejection.
- The developer-only collector now shows the independent section, logical-field, semantic-naming, and final-submit metrics. On a Xiaomi application page it hides the download control when any section is missing, raw counts disagree, fewer than 75% of controls have field semantics, or the final-submit boundary is not proven. Missing logical fields remain visible as public-schema gaps because collapsed optional repeatable groups may legitimately have no current controls.
- Added synthetic failure-shape regression coverage for Feishu metadata-backed custom comboboxes, inherited required markers, nine section roots including empty optional groups, upload filename/status text, selected date text, file inputs, and an ordinary-looking `提交简历` button. No private value from the developer's real sample was copied into a fixture or source file.
- The old private observation was checked only in place. `npm run audit:xiaomi-observation -- <private-file> --k1-controls 57 --dry-run` exited 1 with `schema-invalid`, and `npm run corpus:import -- <private-file> --dry-run` exited 1 with `schema-invalid`; neither command printed captured field values. The live file remains outside the repository.
- `npm run audit:xiaomi` exited 0 and reconfirmed the current public Xiaomi application schema at 9 groups / 34 visible fields with no application submission. `npm run build:collector` and `npm run verify:collector` exited 0 with the exact unchanged permission set.
- Targeted `npm run typecheck` exited 0. Targeted `npm test -- --run src/bridge/pageState.test.ts src/ats src/devtools/ats-collector` exited 0 with 7 files / 28 tests passed.
- Final `npm run validate` exited 0: TypeScript passed, 36 Vitest files / 264 tests passed, the empty corpus verified, production built, 13 required distribution files passed, exact permissions remained unchanged, forbidden permissions were absent, and the developer collector remained absent from production.
- The first full E2E run after integrating the independent audit had 21/22 passes; the collector case correctly returned `passed=false` because the synthetic page used a non-Xiaomi test Origin while the local audit accepts the real Xiaomi Origin only. The route was changed to intercept the real Origin with local synthetic HTML. Focused rerun passed, and the final `npm run test:e2e` exited 0 with 22/22 browser tests passed.
- The final collector browser regression proves 9/9 sections, 34/34 logical fields, consistent K1/export raw counts, privacy-audit acceptance, protected final submit, successful dry-run corpus import, zero fixture submission, and absence of synthetic name/email/phone/identity/file/timestamp/query/DOM data. `artifacts/xiaomi-ats-collector.png` was refreshed and visually inspected; it shows 38 controls, 9/9 sections, 34/34 logical fields, 37/38 semantic labels, and final-submit protection with no filled personal value.
- Static gates passed: `feature_list.json` parses with 48 features and F047 remains `in_progress`; `git diff --check` found no whitespace errors (only Windows LF/CRLF notices); no downloaded `ats-observation*.json` exists in the repository; the Manifest has no diff; collector markers are absent from production `dist`; and the new local audit/quality modules contain no network, extension-storage/message, or submission path.

### F047 changed files and handoff

- Ground truth and acceptance: `ats-corpus/ground-truth/xiaomi-internship-application-v1.json`, `docs/xiaomi-observation-ground-truth-acceptance.md`, `feature_list.json`, and `progress.md`.
- K1 and observation contract: `src/bridge/protocol.ts`, `src/bridge/pageState.ts`, `src/ats/contracts.ts`, `src/ats/sanitize.ts`, `src/ats/observation.ts`, `src/ats/audit.ts`, and the ATS corpus JSON Schema/core validator.
- Developer quality gate and audit: `src/devtools/ats-collector/xiaomiQuality.ts`, `AtsCollectorCard.tsx`, `collector.css`, `scripts/ats-corpus/xiaomi-observation-audit.mjs`, its type declaration, `scripts/audit-xiaomi-observation.mjs`, and `package.json`.
- Regressions and evidence: page-state/observation/audit/importer/collector tests, `src/ats/xiaomiObservationAudit.test.ts`, `tests/e2e/ats-collector.spec.ts`, updated protocol fixture tests, and `artifacts/xiaomi-ats-collector.png`.
- F047 remains `in_progress` by design. The only unmet acceptance item is one new private authenticated Xiaomi recapture. Next action: reload the freshly built `dist-collector`, reconnect the real application tab, click `采集匿名结构`, confirm the collector shows `分组 9 / 9` and `最终投递 已识别并保护`, download the new JSON, note the K1 control count, and run `npm run audit:xiaomi-observation -- <new-json> --k1-controls <count> --dry-run`. Do not commit the downloaded JSON. If the audit passes, record only aggregate results and then mark F047 done; if the download button remains hidden, report the public missing-section names and aggregate counts without sharing values.
- No commit or push was performed.

## 2026-08-07 - F078 kickoff: move remaining downloaded ATS JSON

- Set `F078` to `in_progress` and inventoried the Downloads root plus recursively named `ats-observation-*.json` files.
- Exactly nine project observation exports were identified by schema: one Xiaomi, one MetaApp, one NIO, and six Huya files. All expose the observation schema rather than arbitrary JSON shapes.
- Explicitly excluded unrelated Downloads JSON, including FinQA/CFLUE datasets, tool/settings files, malformed large JSONL-like files, and a Google OAuth client-secret file; none will be copied, renamed, inspected for values, or moved into this repository.
- Planned organization: retain the four existing company-explicit representatives, remove their hash-identical generic-named Downloads copies only after verification, and move the five redundant Huya exports into a clearly excluded duplicate-download archive with readable names so no data is lost or counted as independent corpus evidence.

## 2026-08-07 - F078 completed: remaining ATS JSON moved and classified

- Verified the generic Downloads sources against the four existing representative destinations before moving: Xiaomi SHA-256 `1c8173e03f10eaea0cff6b6ef8eec45ebb058e8c8fe54a55212c8bc4495aa0c9`, MetaApp `8a86994740f2cf5a3814371e62ae181aaf25e25b60ff6c5deb2f12b1c5071fb7`, NIO `592f2c6d455927d38182f701a8581ef1925a281607aa7ec16c642fe0ca0e0cb1`, and Huya `e1becd7004fc4b564b0135c82273c19bcf82fd17c2227841446444888f8898bb`; source and destination bytes matched in every case.
- Moved all nine generic-named exports out of Downloads. The active staging index retains four representatives under explicit Feishu-family or Moka family/company paths. Five redundant Huya files moved to `ats-corpus/observations/_duplicate-downloads/moka/huya/` with normalized company/ATS/page/timestamp/duplicate names.
- Added `_duplicate-downloads/README.md` with hashes and exclusion rules. These files are preserved for auditability but cannot be counted as sites, observations, training samples, coverage, or corpus inputs. All six Huya payloads still resolve to exactly one semantic structure after `capturedAt` is excluded.
- Updated the main observation index to reflect that the generic Downloads sources were moved rather than retained, while preserving the original byte-provenance evidence and the Xiaomi legacy-schema boundary.
- Final inventory: zero `ats-observation-*.json` files remain in the Downloads root, 11 unrelated root JSON files remain untouched, four active representatives exist, and five duplicate files are archived. No unrelated dataset, configuration, credential, or malformed JSON file was moved into the repository.
- All nine moved observation JSON files parse, all four privacy declarations are false in each, and the prohibited-key scan passed. Eight current-schema observations passed corpus-import dry-run; Xiaomi remains intentionally blocked because its legacy export lacks top-level `sections` and `summary.sectionCount`.
- `npm run verify:corpus` exited 0. The first concurrent full validation and the first focused retry hit the existing 5-second timing limit in one ProfileEditor UI test without an assertion failure. The isolated test then passed in 3.16 seconds without code or timeout changes, and the required final isolated `npm run validate` exited 0 with 44 test files / 381 tests, corpus verification, production build, distribution checks, permission checks, and developer-collector exclusion.

### F078 changed files and handoff

- Moved/retained representatives: the existing Xiaomi, MetaApp, NIO, and Huya files indexed by `ats-corpus/observations/README.md`.
- Added duplicate archive: `ats-corpus/observations/_duplicate-downloads/README.md` and five normalized Huya JSON files below `_duplicate-downloads/moka/huya/`.
- Updated index and harness state: `ats-corpus/observations/README.md`, `feature_list.json`, and `progress.md`.
- F078 is complete. This is developer-data organization only, with no user-visible extension change, so E2E and a new screenshot were not required. No commit or push was performed.

### 2026-08-07 - F047 first real recapture rejection and second hardening pass

- The developer reloaded the first hardened collector and reported only its aggregate fail-closed message: two of nine page groups were missing and fewer than 75% of controls had identifying field semantics. No JSON was downloaded, no personal value was shared, and the gate correctly prevented an incomplete sample from entering the corpus.
- Added exact synthetic regressions for the remaining structural shapes: collapsed section names rendered only as nested ordinary `div/span` text with no recognized section class, and a custom combobox nested 12 levels below its stable form-item label, required marker, and sibling hidden technical field name.
- K1 now recognizes section evidence only when direct text exactly matches one of the nine public Xiaomi section labels. This allowlist can recover empty/collapsed groups without exporting arbitrary nearby page text. Form-item context lookup is bounded to 20 ancestors and reads only stable label classes, `data-form-field-*` metadata, native `name`, and required/ARIA markers; it still does not read `value`, filenames, cookies, raw HTML, selectors, or DOM/CDP IDs.
- Final targeted `npm test -- --run src/bridge/pageState.test.ts src/devtools/ats-collector` exited 0 with 2 files / 7 tests passed; `npm run typecheck` exited 0. The freshly rebuilt `dist-collector` and `npm run verify:collector` exited 0 with unchanged permissions.
- Final `npm run validate` exited 0 with 36 test files / 264 tests passed, empty-corpus verification, production build, 13 distribution files, exact permission checks, forbidden-permission absence, and production collector isolation. Final `npm run test:e2e` exited 0 with 22/22 browser tests passed; submission protections remained intact.
- F047 remains `in_progress`. Next live check: reload the newly rebuilt `dist-collector` once, rescan the already-open Xiaomi application, and report only `缺少分组`, `分组 x / 9`, and `语义命名 x / y`. Download is expected to remain hidden unless the independent gates pass. No commit or push was performed.

## 2026-08-07 - F048 conservative repository cleanup kickoff

- The user authorized deletion after a read-only inventory. Registered F048 as `in_progress` with a deliberately narrow scope: three stale ignored release ZIPs, ignored Playwright `test-results`, one zero-reference ATS barrel, and one TypeScript-confirmed unused import.
- Baseline `./init.ps1 -SkipInstall` exited 0 before deletion: TypeScript passed, 36 Vitest files / 264 tests passed, the empty ATS corpus verified, production built, 13 distribution files passed, exact permissions remained unchanged, forbidden permissions were absent, and the developer collector remained absent from production.
- Protected from this cleanup: `dist-collector` needed for the current Xiaomi recapture, `dist`, `node_modules`, `artifacts`, `.env`, both browser profiles, corpus/evaluation/package tooling, the current ATS worktree, old OpenCLI validators, and the test-only `src/agent` prototype. The latter two groups need an explicit architecture decision rather than being inferred as disposable.

### F048 cleanup and acceptance evidence

- Sent the three ignored stale release archives to the Windows Recycle Bin: `qiuzhao-profile-assistant.zip`, `qiuzhao-toudi-assistant-bundle.zip`, and `qiuzhao-toudi-assistant-skill.zip`. They totaled 11.11 MiB and predated the active ATS/F047 code. Removed ignored `test-results`; after E2E regenerated its 45-byte last-run marker, sent that directory to the Recycle Bin again.
- Deleted the zero-reference `src/ats/index.ts` barrel and removed the unused `describeControl` import from `src/content/resumeAttachment.ts`. A repository reference search found no remaining reference to the barrel path. `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` exited 0 with no unused declaration diagnostics.
- Preserved every scoped protection target: `dist`, `dist-collector`, `node_modules`, `artifacts`, `.env`, `.chrome-autofill-profile`, `.chromium-autofill-profile`, `src/agent`, and `ats-corpus` all remained present. No old OpenCLI audit, Agent prototype, current corpus/evaluation/package script, private environment file, browser login state, screenshot, or active ATS file was deleted.
- `npm run validate` exited 0 after cleanup: TypeScript passed, 36 test files / 264 tests passed, empty-corpus verification passed, production built, 13 distribution files passed, exact permissions remained unchanged, forbidden permissions were absent, and the collector remained excluded from production.
- The first default full E2E run had 21/22 passes because the embedded-bridge status refresh missed its five-second assertion window; its focused rerun passed. A second default full run again had 21/22 passes because the extension's first-install `options.html` navigation interrupted the synthetic recruitment navigation. This was an existing parallel initialization race unrelated to deleted code.
- Stabilized only the E2E harness in `tests/e2e/embedded-bridge.spec.ts`: it now waits for and reuses the first-install options page, matching the already proven collector test pattern, and waits for the synthetic `/apply/2` page before refreshing status. The focused rerun passed 1/1 and the final default `npm run test:e2e` passed 22/22 in four workers; no production source or submission behavior changed.
- F048 is `done`. Cleanup targets are absent, protected targets are present, and all deleted generated artifacts remain recoverable from the Windows Recycle Bin. No commit or push was performed. F047 remains independently `in_progress` pending the next user-click Xiaomi recapture.

## 2026-08-07 - F049 reusable personal-information editor completion

- Followed the repository resume protocol: read `feature_list.json` and `progress.md`, then ran `./init.ps1 -SkipInstall`. The pre-change baseline exited 0 with TypeScript, 36 Vitest files / 264 tests, corpus verification, production build, distribution verification, unchanged permissions, and production collector isolation all passing.
- Reviewed the public OfferLink `myResume` inventory read-only and recorded the source-bound comparison in `docs/profile-field-reference-comparison.md`. The implementation uses only public field labels as product evidence; it does not copy the reference implementation, authenticated data, or visual design.
- Expanded schema v3 and migration coverage for detailed basic information, education, internship, project, campus leadership/activity, family contacts, awards, languages, certificates, publications, patents, job preferences, and reusable answers. Existing v1/v2 data migrates forward, blank optional records do not lower the baseline completion score, and resume merges preserve the new arrays.
- Added deterministic canonical field metadata and bounded aliases for all new fillable values. Emergency/family data and other sensitive demographic/contact values are marked confirmation-required. Identity-document numbers, passwords, verification codes, CAPTCHA data, cookies, recruitment authentication, certificate attachments, and final application submission remain unsupported.
- Expanded the Organic options interface with locally saved repeatable sections, a scrollable section navigator, and a visible third-party privacy warning. Renamed the always-present emergency-contact label to avoid an accessible-name collision with the primary name field discovered by browser E2E.
- Focused tests passed: `npm test -- --run src/domain/profile.test.ts src/matching/catalog-coverage.test.ts src/options/ProfileEditor.test.tsx` exited 0 with 3 files / 131 tests. Broader matching/profile/parser checks also passed after removing an overly broad family birth-date alias.
- Final `npm run validate` exited 0: TypeScript passed, 36 test files / 335 tests passed, the corpus verified, production built, all 13 required distribution files verified, exact permissions remained unchanged, forbidden permissions were absent, and the development collector remained excluded from production.
- The first full E2E run exposed the accessible-name collision and an obsolete expectation that emergency-contact name was unknown. After the scoped fixes and rebuilding the unpacked extension, final `npm run test:e2e` exited 0 with 22/22 browser tests passing.
- `artifacts/profile-editor.png` was refreshed at 2026-08-07 14:08 local time and visually inspected. It shows all new sections in the Organic layout, the sensitive-data warning, and synthetic values only; no real personal information is present.
- Static gates passed: `feature_list.json` parses, `git diff --check` reports no whitespace errors (only Windows LF/CRLF notices), and F049 is `done`.

### F049 changed files and handoff

- Profile/domain/import: `src/domain/profile.ts`, `src/domain/profile.test.ts`, `src/resume/parseResume.ts`, `src/storage/profileRepository.test.ts`, and schema-version literals in five E2E fixtures.
- Deterministic matching: `src/matching/catalog.ts`, `src/matching/supplementalCatalog.ts`, and `src/matching/catalog-coverage.test.ts`.
- Interface and browser evidence: `src/options/App.tsx`, `src/options/SupplementalProfileSections.tsx`, `src/options/options.css`, `src/options/ProfileEditor.test.tsx`, `tests/e2e/profile-editor.spec.ts`, `tests/e2e/fill-fixture.spec.ts`, and `artifacts/profile-editor.png`.
- Product evidence/harness: `docs/profile-field-reference-comparison.md`, `feature_list.json`, and this handoff.
- No code blocker remains for F049, and no commit or push was performed. The next recommended profile node is to add source-bound extraction rules and fixtures for the newly modeled optional fields; F047 remains independently `in_progress` pending the separate user-click real Xiaomi recapture.

## 2026-08-07 - F050 local identity-document persistence and confirmed fill

- Followed the repository resume protocol, reread `feature_list.json` and `progress.md`, and ran `./init.ps1 -SkipInstall`. Baseline exited 0 with TypeScript, 36 test files / 335 tests, corpus verification, production build, distribution verification, unchanged permissions, and production collector isolation passing.
- Scoped the user's zero-repeat-entry request to reusable identity-document profile data. Recruitment-site passwords, SMS/email/OTP codes, CAPTCHA values, authentication cookies/tokens, identity attachments, and final submission remain unpersisted and unsupported. Identity writes still require a user selection under the repository safety contract.
- Upgraded the profile to schema v4 with optional `basic.identityDocumentType` and `basic.identityDocumentNumber`. v1/v2/v3 migration initializes the fields without losing prior values; paired-field and bounded-length validation prevents incomplete records.
- Added an Organic basic-information warning that the current local identity storage is not yet encrypted. The number uses a masked editor control, JSON-export copy warns that backups contain the original value, and the existing delete-all flow clears the number. `PRIVACY.md`, `README.md`, the field matrix, and OfferLink comparison now describe the actual behavior.
- Resume parsing imports only explicitly labelled identity values such as `身份证号` or `护照号码`, infers a bounded document type from that label, and never promotes an unlabelled long number. Parsed values enter the editable draft and are persisted only after the existing explicit save action.
- Deterministic matching now maps document type/number through bounded aliases and marks both sensitive. The full number is replaced by a fixed masked preview ending in four characters. Scan does not mutate the page; default safe selection excludes identity, while an explicitly selected identity proposal writes and verifies successfully without submission.
- Extended the fill-quality contract with an explicit `confirm` ground-truth action. Xiaomi `identification` is now evaluated as a correct deterministic match that must remain unwritten until confirmation, rather than as either an unsafe automatic fill or an unsupported field.
- Focused model/matcher/parser/editor/engine tests exited 0 with 8 files / 236 tests before final integration. A focused identity browser fixture proved the field was blank before confirmation, displayed only `••••••0042` in preview, then filled `TEST-ID-000042` after explicit selection; the submit counter stayed zero.
- During integration, an independent one-click sidepanel worktree update completed between test starts. Two existing tests needed only integration-safe typing/shape tolerance: `FillSelection` annotations in `SidePanel.test.tsx` and `toMatchObject` for the expanded embedded page-state object. No sidepanel product behavior was changed by F050.
- Final `npm run validate` exited 0: TypeScript passed, 37 test files / 348 tests passed, the corpus verified, production built, 13 required distribution files verified, exact permissions remained unchanged, forbidden permissions were absent, and the development collector remained absent from production.
- Final `npm run test:e2e` exited 0 with 22/22 real-Chrome tests passing. A subsequent focused privacy E2E passed 1/1 and proved cancellation preserves the saved synthetic identity number while permanent local-data deletion clears it.
- `artifacts/profile-editor.png` was refreshed and visually inspected. It shows the unencrypted-local-storage warning and a masked synthetic password-style identity input; it contains no real personal data. The fill-quality artifacts report matching, filling, exclusions, confirmation handling, repeatable coverage, attachment targeting, and safety at their passing gates.

### F050 changed files and handoff

- Profile and storage behavior: `src/domain/profile.ts`, `src/domain/profile.test.ts`, `src/storage/profileRepository.test.ts`, `src/privacy/localData.test.ts`, and `src/privacy/sensitivePreview.ts`.
- Interface and policy: `src/options/App.tsx`, `src/options/SupplementalProfileSections.tsx`, `src/options/options.css`, `src/options/ProfileEditor.test.tsx`, `README.md`, `PRIVACY.md`, `docs/profile-field-reference-comparison.md`, `docs/field-coverage-matrix.md`, and `docs/xiaomi-internship-field-audit.md`.
- Extraction/matching/fill: `src/resume/parseResume.ts`, `src/resume/parseResume.test.ts`, `src/matching/supplementalCatalog.ts`, `src/matching/matcher.ts`, matcher/catalog tests, `src/content/engine.ts`, `src/content/engine.test.ts`, and `src/sidepanel/pageBridge.ts`.
- Evaluation/browser evidence: `src/evaluation/fillQuality.ts`, its unit test, `evals/fill-quality-suite.json`, relevant E2E schema fixtures, `fixture.html`, `tests/e2e/fill-fixture.spec.ts`, `profile-editor.spec.ts`, `privacy-controls.spec.ts`, `resume-import.spec.ts`, `xiaomi-fixture.spec.ts`, `fill-quality-eval.spec.ts`, and current artifacts.
- F050 is `done` with no code blocker. The next security node should add authenticated at-rest encryption plus recovery/key-rotation semantics before marketing identity storage as encrypted. No commit or push was performed; F047 remains independently `in_progress` pending its user-click Xiaomi recapture.

## 2026-08-07 - F051 one-click automatic-fill migration kickoff

- Applied the user-requested `long-running-agent-harness`, reread `AGENTS.md`, `feature_list.json`, `progress.md`, and the complete skill instructions, then ran `./init.ps1 -SkipInstall` before edits. The baseline exited 0: TypeScript passed, 36 Vitest files / 335 tests passed, the ATS corpus verified, production built, 13 distribution files passed, exact permissions remained unchanged, forbidden permissions were absent, and the development collector remained excluded from production.
- Registered F051-F055 as the durable clean-room migration sequence derived from a read-only review of the locally installed OfferLink 1.8.1 distribution. The sequence covers the one-click orchestrator, ATS template runtime, modular control adapters, repeatable add-fill-save-verify lifecycles, and focused-field recovery. No OfferLink bundle, first-party code, selector object, brand asset, private API, cloud/account/quota module, or application-tracker implementation will be copied.
- F051 is the only new implementation scope in progress for this node. It removes the user-visible scan/State/Find/per-safe-field funnel while retaining deterministic scanning internally, folds safe repeatable creation and verified filling behind one explicit gesture, pauses once for concentrated exception confirmation, keeps resume attachment separately confirmed, and never submits an application.
- Existing unrelated worktree changes and the independently in-progress F039, F047, and F050 streams are preserved. No commit or push is authorized.
- Next action: implement and unit-test a side-panel `startAutoFill` workflow module, replace the production primary panel interaction, update the affected browser tests and acceptance documentation, then run the full user-visible verification contract before deciding F051 completion.

### F051 implementation and acceptance evidence

- Added `src/sidepanel/autoFillWorkflow.ts` as a clean-room orchestration boundary. One user-started operation now performs the internal scan, attempts each uniquely supported missing repeatable group once, rescans after every attempted page mutation, builds a deterministic safe/exception plan, and uses the existing verified fill gateway. Safe high-confidence empty fields fill immediately when no exception exists.
- Replaced the production scan-preview-select-fill funnel in `src/sidepanel/App.tsx` with the single `自动填写当前页面` action and bounded analyzing/preparing/filling stages. Sensitive, conflicting, unreadable, and non-high-confidence proposals pause in one centralized sheet, start unselected, and only explicitly selected exceptions join the safe plan. Saved field corrections rerun the same workflow.
- Kept resume PDF attachment behind its existing separate filename/digest/destination confirmation. Unsupported and already-equal controls remain in progressive disclosure, the result reports filled/skipped/equal/unsupported/repeatable-created counts, and all completion copy tells the user to inspect and submit personally.
- Removed the K0/K1 connection and State/Find card from the ordinary production panel without deleting its underlying privacy-safe developer/browser-kernel services. Their E2E checks now start and inspect the extension session directly through the typed internal protocol, so backend privacy and origin-pinning regressions remain covered without reintroducing a user-facing connection step.
- Added the acceptance contract `docs/one-click-autofill-acceptance.md`, four workflow unit tests, an updated six-case side-panel component suite, repeatable-record orchestration coverage, and a browser scenario proving one-click planning plus concentrated exception confirmation. Updated the saved-resume browser flow to enter through the same one-click action.
- Focused verification `npm test -- --run src/sidepanel/autoFillWorkflow.test.ts src/sidepanel/SidePanel.test.tsx src/sidepanel/SidePanel.repeatable.test.tsx` exited 0 with 3 files / 11 tests passed. `npm run typecheck` exited 0.
- `npm run validate` exited 0: TypeScript passed, 37 test files / 348 tests passed, the ATS corpus verified, production built, all 13 required distribution files passed, the exact existing permission set remained unchanged, forbidden permissions were absent, and the developer collector remained excluded from production.
- The first full browser run exposed an overly exact page-state object assertion and a transient parallel fill-quality observation. The assertion was narrowed to the intended count fields; both affected E2E files then passed 2/2 in isolation. The final complete `npm run test:e2e` exited 0 with 22/22 Chrome tests passed, including browser-kernel privacy, complex controls, repeatable records, Xiaomi-derived filling, attachment authorization, and zero final submission.
- `artifacts/one-click-autofill.png` was refreshed on 2026-08-07 and visually inspected. It contains synthetic data only and shows the Organic sand/sage/clay interface, one concentrated two-exception confirmation surface with exceptions unselected by default, one explicitly selected conflict, separate PDF authorization, progressive details, and no scan/State/Find/connection/final-submit action.
- Static gates passed: `feature_list.json` parses; `git diff --check` found no whitespace error (only Windows LF/CRLF notices); production `App.tsx` contains no user-facing scan/State/Find/connection action; production verification found no added permission; and implementation files contain no OfferLink bundle path, private API, branding asset, selector data, remote call, or final-submit action.

### F051 changed files and handoff

- Workflow and UI: `src/sidepanel/autoFillWorkflow.ts`, `src/sidepanel/App.tsx`, and `src/sidepanel/sidepanel.css`.
- Tests: `src/sidepanel/autoFillWorkflow.test.ts`, `src/sidepanel/SidePanel.test.tsx`, `src/sidepanel/SidePanel.repeatable.test.tsx`, `tests/e2e/sidepanel-preview.spec.ts`, `tests/e2e/resume-attachment-flow.spec.ts`, `tests/e2e/embedded-bridge.spec.ts`, and `tests/e2e/page-state-find.spec.ts`.
- Harness and evidence: `docs/one-click-autofill-acceptance.md`, `feature_list.json`, this `progress.md` handoff, and ignored `artifacts/one-click-autofill.png`.
- F051 is complete. F052-F055 remain intentionally separate: ATS family template loading, framework control-driver modularization, full add-fill-save-verify repeatable lifecycles, and focused-field manual recovery. The next unblocked module is F052, using independently reviewed ATS evidence rather than reference-extension configuration. No commit or push was performed.

## 2026-08-07 - F052 deterministic ATS template runtime kickoff

- Continued the accepted `long-running-agent-harness` feature graph after F051 passed. Marked only F052 `in_progress`; F053-F055 remain pending.
- Scope: define a typed local family-template contract, select it from independently owned family detection, apply reviewed default mappings before generic matching, and preserve saved site mappings as the highest-priority local override.
- Privacy boundary: templates may contain stable ATS-family evidence, canonical paths, labels, control hints, repeatable behavior, and explicit final-submit exclusions only. They may not contain profile values, raw HTML, credentials, cookies, authenticated state, remote code/endpoints, or copied reference-extension configuration.

### F052 implementation and acceptance evidence

- Added a typed and fail-closed family-template contract for exact semantic field rules, actions, canonical path patterns, optional date-range companions, framework driver hints, readback modes, sections, repeatable lifecycle metadata, and mandatory final-submit exclusions. The registry rejects duplicate ids, invalid/unbounded rules, raw HTML, URL-like configuration values, email-like text, and long digit sequences.
- Added a local matching runtime that parameterizes path identifiers, builds detection markers only from stable field names, selects a reviewed template, maps repeatable indices, and falls back to the generic deterministic matcher. It sends no query value, current field value, Cookie, credential, raw HTML, or DOM selector into detection.
- Integrated the runtime into both `scanPage` and the pre-write `fillPage` revalidation. Hard safety exclusions remain first; saved origin/fingerprint corrections remain higher priority than a family rule; an exact template mapping is next; generic deterministic matching remains the fallback. Scan results expose only bounded family/template metadata.
- Added one concrete `xiaomi-feishu` deployment detector/template from repository-owned Xiaomi ground truth and synthetic regressions. It is restricted to the exact Xiaomi jobs origin and reviewed internship application path/semantic markers. Its mapping inventory covers the reviewed basic, education, internship, works, project, award, language and self-evaluation keys, including confirm-only identity/demographic values and explicit attachment/final-submit exclusions. It is deliberately not labeled as a general Feishu family template.
- Added `docs/ats-template-runtime-acceptance.md`, template validation tests, runtime detection/indexing/safety/fallback tests, a complete no-profile-data mapping audit over every Xiaomi rule, and an engine test proving a saved site correction overrides a family rule through verified fill.
- Focused `npm test -- --run src/ats src/sidepanel/autoFillWorkflow.test.ts` exited 0 with 8 files / 31 tests. The final template/runtime focus exited 0 with 2 files / 7 tests, and the forbidden capability search returned no match for fetch, XHR, WebSocket, eval, Cookie, browser storage, or Chrome API access in template/runtime modules.
- Final `npm run validate` exited 0: TypeScript passed, 39 test files / 355 tests passed, corpus verification passed, production built, 13 distribution files passed, exact existing permissions remained unchanged, forbidden permissions were absent, and the developer collector remained absent from production.
- Focused browser regression `npm run test:e2e -- --grep "fill quality evaluation|Xiaomi-derived fixture|complex controls"` exited 0 with 3/3 Chrome tests. Deterministic matching/filling remained exact and no submission occurred.

### F052 changed files and handoff

- Contracts/registry/templates: `src/ats/templateContracts.ts`, `src/ats/templateRegistry.ts`, and `src/ats/defaultTemplates.ts`.
- Runtime integration: `src/ats/matchingRuntime.ts`, `src/matching/types.ts`, and `src/content/engine.ts`.
- Verification: `src/ats/templateRegistry.test.ts`, `src/ats/matchingRuntime.test.ts`, and `docs/ats-template-runtime-acceptance.md`.
- F052 is complete. The next migration node is F053, which will route existing native, Feishu/UD, Ant, Element and generic ARIA writes through explicit canHandle/read/write/verify adapters without changing the public one-click flow. No commit or push was performed.

## 2026-08-07 - F053 verified control-adapter modularization kickoff

- Marked only F053 `in_progress` after F052 passed. The public one-click workflow and content-message protocol remain unchanged.
- Scope: reorganize the existing verified page-driver behavior behind deterministic adapters with explicit `canHandle`, `read`, `write`, and `verify` boundaries; add framework-specific routing and isolated fixtures while preserving bounded waits and fail-closed outcomes.
- Safety boundary: no adapter may accept password, hidden, file, CAPTCHA/verification, disabled/read-only, or submit-like controls; no adapter may weaken readback verification, navigate, delete data, or trigger final application submission.

### F053 implementation and acceptance evidence

- Replaced the monolithic page-write branching with a deterministic adapter registry. Every adapter now exposes `canHandle`, `read`, `write`, and `verify`; routing order is Feishu date range, Feishu/UD select, Ant select, Element select, generic ARIA combobox, then native controls.
- Moved shared bounded waits, native setter/event dispatch, exact option matching, multi-value normalization, visibility checks and pre-routing safety checks into dedicated adapter support modules. The public `readControlCandidates` and `writeControlVerified` API remains compatible with the content engine.
- Added fail-closed pre-routing rejection for detached, hidden, disabled/read-only, password, file, hidden-input, checkbox, submit/reset/button/image, button-contained, ARIA-disabled and semantic final-submit controls. Missing options return `option-not-found`; rejected page values are never included in results.
- Framework selection requires an exact normalized option and an explicit selected marker/ARIA selected value. Typed search text alone is not accepted as success. Date ranges still require both the hidden structured value and visible start/end months. All writes remain limited to two attempts with bounded option and verification waits.
- Added isolated routing and verified-write fixtures for ATSX, UD, Ant, Element and generic ARIA selects, plus missing-option and pre-routing safety tests. Existing native text/select/multi-select/radio/contenteditable, framework rejection and date-range verification tests remain passing.
- `npm test -- --run src/content` exited 0 with 4 files / 38 tests. The page-driver/engine focus exited 0 with 2 files / 25 tests.
- Final `npm run validate` exited 0: TypeScript passed, 39 test files / 362 tests passed, corpus verification passed, production built, all 13 distribution files passed, exact permissions remained unchanged, forbidden permissions were absent, and the developer collector remained absent from production.
- `npm run test:e2e -- --grep "complex controls|Xiaomi"` exited 0 with 3/3 Chrome tests: complex verified writes, Xiaomi-derived form filling, and the developer collector all passed with zero final submission.

### F053 changed files and handoff

- Adapter contract and registry: `src/content/controlAdapters/contracts.ts` and `registry.ts`.
- Implementations/support: `shared.ts`, `nativeAdapter.ts`, `frameworkSelectAdapters.ts`, and `dateRangeAdapter.ts` in the same directory.
- Integration and verification: `src/content/pageDriver.ts`, `src/content/pageDriver.test.ts`, and `docs/control-adapter-acceptance.md`.
- F053 is complete. F054 can now build the repeatable add-fill-save-verify lifecycle on top of explicit template metadata and verified control adapters. No OfferLink handler, selector configuration, private API, asset, commit, or push was added.

## 2026-08-07 - F054 repeatable add-fill-save-verify lifecycle

- Marked F054 in progress only after F052/F053 were complete, then extended the existing reviewed Xiaomi repeatable adapter without changing the ordinary one-click entry point.
- Added `repeatableLifecycle.ts`: successful education, internship/work and project writes are grouped by record-local root, read back, and allowed to resolve at most one exact local `保存` or `完成` control. The lifecycle fingerprints the control/record structure, clicks once, waits for a bounded saved-state mutation, checks navigation, and reads every field again.
- The lifecycle refuses ambiguous, disabled, changed, submit-type, final-container, page-global or submit/application/delivery-labeled controls. Generic sites do not enter the lifecycle; only the real reviewed Xiaomi page shape and its explicitly marked local synthetic fixture can activate it.
- Added typed statuses and stop reasons for no-save-required, ambiguous/changed/disabled save, navigation change, mutation timeout and failed readback. `FillResult` carries per-record results, and the side panel summarizes saved records or records requiring manual save inspection without exposing page values.
- Preserved the existing add side of the state machine: missing cards are created one at a time, count/index/fingerprint/navigation guarded, and rescanned before field planning. A second workflow sees equal values and does not write or save again.
- Added four lifecycle unit tests for successful save/readback, idempotent no-save pages, ambiguous/final-submit rejection and bounded timeout. Moved comparable-value normalization into a cycle-free shared module. Enhanced the synthetic repeatable fixture with record-local saves and counters for the three supported groups.
- Focused `npm test -- --run src/content/repeatableRecords.test.ts src/content/repeatableLifecycle.test.ts src/content/engine.test.ts` exited 0 with 3 files / 23 tests. `npm run typecheck` passed.
- `npm run test:e2e -- --grep "repeatable records"` exited 0. One Chrome scenario added eight missing cards, filled at least 28 fields, saved exactly seven education/internship/project cards, reran idempotently with zero second-pass fills/saves, and kept delete and final-submit counters at zero.
- `artifacts/repeatable-records.png` was refreshed and visually inspected. It shows filled education, internship and project cards marked `已保存`, the untouched visible final-submit control, and only synthetic values.
- Final `npm run validate` exited 0: TypeScript passed, 40 test files / 366 tests passed, corpus verification passed, production built, all 13 distribution files passed, exact permissions remained unchanged, forbidden permissions were absent, and the developer collector remained absent from production.

### F054 changed files and handoff

- Lifecycle/runtime: `src/content/repeatableLifecycle.ts`, `src/content/valueNormalization.ts`, `src/content/engine.ts`, `src/content/repeatableRecords.ts`, and `src/sidepanel/App.tsx`.
- Verification/fixture: `src/content/repeatableLifecycle.test.ts`, `src/fixture/repeatable-main.ts`, `tests/e2e/repeatable-records.spec.ts`, `docs/repeatable-lifecycle-acceptance.md`, and ignored `artifacts/repeatable-records.png`.
- F054 is complete. The final migration node is F055: a secondary, user-gesture-driven focused-field recovery path for ordinary missed fields, with explicit refusal of sensitive or unsafe targets. No commit or push was performed.

## 2026-08-07 - F056 five Organic profile-editor design directions

- Followed the repository resume protocol for this user-visible design exploration: reviewed `feature_list.json` and `progress.md`, ran `./init.ps1 -SkipInstall`, and confirmed the starting validation passed before changing any files.
- Used the `frontend-design` skill to keep the repository's single Organic anchor while producing five genuinely different interaction directions: a numbered dossier, a visual bento overview, a one-section-at-a-time guide, a low-noise quiet canvas, and a high-density application workbench.
- Used the `agent-reach` public-page reader plus a temporary local Chrome screenshot to inspect `https://offerlink.tech/index` and `https://offerlink.tech/myResume` read-only. Only the information-architecture pattern was retained: a fixed top navigation, section directory, primary editor, profile-status dock, and persistent save area. No OfferLink source, bundle, brand, asset, blue palette, selector, private API, or implementation code entered the repository.
- Added `design-prototypes/profile-editor/index.html` as the comparison entry and five independent HTML pages. They share one realistic 13-section blank field inventory covering reusable resume, basic information, job preferences, education, work, projects, campus experience, family contacts, awards, languages, certificates, research outputs, and common answers.
- Added prototype-only local draft persistence under `qiuzhao.profile-design-prototype.v1`. Values and repeatable record counts survive switching designs, while the production extension profile is never read or modified. The selected resume file name is displayed for interaction review but file bytes and file metadata are not serialized.
- Kept identity-number inputs masked by default, marked identity and family-contact controls as confirmation-required, provided no recruitment-site submission action, and made all five directions responsive with a narrow-screen horizontal section navigator. Three local Epilogue font files keep the standalone HTML previews visually stable without a network dependency.
- The first screenshot review found and fixed a false 1% completion state from a default identity type, initial guided-view auto-scrolling, low contrast in the dark workbench, and repeatable-record restoration. The final gallery and six desktop/mobile screenshots contain only blank UI; synthetic persistence values are cleared inside the test before completion.
- Focused `npm run test:e2e -- tests/e2e/profile-design-prototypes.spec.ts` exited 0 with 4/4 Chrome checks. It proves all five pages render the same 13 sections, no submit control exists, ordinary and newly added education records persist across directions, the guided flow advances one section at a time, and all five have no horizontal overflow at 390px.
- Final `npm run validate` exited 0 with TypeScript, 39 test files / 362 tests, corpus verification, production build, 13 required distribution files, unchanged permissions, forbidden-permission absence, and collector exclusion all passing. Final `npm run test:e2e` exited 0 with 26/26 Chrome tests, including the four prototype checks and all existing extension safety/fill/PDF scenarios.
- `git diff --check` exited 0 with only the repository's existing LF-to-CRLF notices. `feature_list.json` parses with 57 features and F056 is `done`. No commit or push was performed, and the production options page remains unchanged until the user selects a direction.

### F056 changed files and handoff

- Comparison and variants: `design-prototypes/profile-editor/index.html`, `01-dossier.html`, `02-bento.html`, `03-guided.html`, `04-quiet.html`, and `05-compact.html`.
- Shared prototype implementation: `design-prototypes/profile-editor/prototype.css`, `prototype.js`, and `assets/epilogue-{400,600,700}.woff2`.
- Browser verification: `tests/e2e/profile-design-prototypes.spec.ts`; current ignored screenshots are `artifacts/profile-design-gallery.png`, `profile-design-01-dossier.png` through `profile-design-05-compact.png`, and `profile-design-mobile-guided.png`.
- Harness state: `feature_list.json` and this `progress.md` handoff. F056 is complete; the next design action is intentionally user-selected refinement of one direction, followed by a separate feature that ports the chosen structure into the production React options editor.

## 2026-08-07 - F055 focused-field manual recovery kickoff

- Marked only F055 `in_progress` after F051 and F053 were complete. This remains a secondary escape hatch after the normal one-click workflow; it does not add a scan button or replace automatic filling.
- Scope: remember the last explicitly focused ordinary recruitment control, expose only its bounded structural label, let the user select one non-sensitive local profile field by label, then revalidate and write that one value with the existing verified control adapters.
- Safety boundary: reject stale focus, page navigation, changed structure, non-empty controls, sensitive profile paths or sensitive targets, password/file/hidden/CAPTCHA/OTP/disabled/read-only/submit-like controls, and never expose unrelated profile values or activate final application submission.

### F055 implementation and acceptance evidence

- Added a content-side, single-use focused-field authorization. Only a trusted pointer focus or keyboard Tab focus is remembered; programmatic focus from the automatic writer is not accepted as the user's recovery gesture. The snapshot retains an element reference, opaque id, bounded structural fingerprint, page URL and timestamp, but never reads or stores the field's raw value.
- Target inspection fails closed for missing/expired focus, navigation, detached or changed controls, existing page content, unsupported adapters, date ranges, password/file/hidden/button/checkbox, disabled/read-only/hidden, CAPTCHA/SMS/OTP, sensitive target semantics and submit-like controls. A successful authorization expires after 60 seconds and can be consumed once.
- The recovery message carries only `{ token, profilePath, value }` for the one user-selected field, not `CandidateProfile` or unrelated values. Content rechecks the target immediately before writing, refuses unknown/empty/sensitive profile fields, uses the existing bounded control adapters, and returns only labels plus status after readback verification.
- Added the secondary “某个字段没填上？” fold below the normal one-click result. It is absent before automatic filling, explains the required page click, lists only non-sensitive non-empty profile field labels, never previews their values, and reports localized actionable failure reasons. The primary automatic-fill and concentrated-confirmation surfaces remain unchanged.
- Added `docs/focused-recovery-acceptance.md`, three content safety/lifecycle tests, a side-panel privacy/protocol test, a real DOM browser write/refusal scenario, and a user-visible side-panel browser scenario.
- Focused `npm test -- --run src/sidepanel src/content` exited 0 with 10 files / 59 tests. `npm run test:e2e -- --grep "manual recovery"` exited 0 with 2/2 Chrome scenarios.
- Final `npm run validate` exited 0: TypeScript passed, 41 test files / 370 tests passed, corpus verification passed, production built, all 13 required distribution files passed, exact permissions remained unchanged, forbidden permissions were absent, and the developer collector remained absent from production.
- Final complete `npm run test:e2e` exited 0 with 28/28 Chrome scenarios, including one-click filling, concentrated confirmation, verified complex controls, repeatable saves, attachment authorization, browser privacy, focused recovery and zero final submission.
- `artifacts/manual-recovery.png` was refreshed and visually inspected. It contains synthetic data only and shows the Organic secondary recovery card, one locked field, labels-only selector, intact concentrated-confirmation flow, and no submission action.
- Static gates passed: `feature_list.json` parses; `git diff --check` reported no whitespace error (only Windows LF/CRLF notices); the focused request contract contains no full profile; focused runtime/bridge contain no fetch, XHR, WebSocket, Cookie or eval capability; production permissions did not change.

### F055 changed files and handoff

- Runtime/protocol: `src/content/focusedRecovery.ts`, `src/content/index.ts`, `src/shared/messages.ts`, and `src/sidepanel/pageBridge.ts`.
- Interface: `src/sidepanel/App.tsx` and `src/sidepanel/sidepanel.css`.
- Verification: `src/content/focusedRecovery.test.ts`, `src/sidepanel/SidePanel.test.tsx`, `src/fixture/main.ts`, `tests/e2e/manual-recovery.spec.ts`, `docs/focused-recovery-acceptance.md`, and ignored `artifacts/manual-recovery.png`.
- F051-F055 are now complete: one-click automatic filling, deterministic ATS templates, modular verified control adapters, repeatable add-fill-save-verify lifecycles, and a secondary focused-field recovery path. No OfferLink code, bundle, private endpoint, brand asset, selector configuration, commit or push was added or performed.

## 2026-08-07 - F057 selected dossier information-model refinement

- Followed the repository resume protocol, retained the user-selected numbered dossier as the Organic visual anchor, and limited the implementation to the isolated HTML prototypes plus their browser test. No production profile data or recruitment page was read or changed.
- Added design-prototypes/profile-editor/profile-schema.js as the shared, explicit field inventory for all five prototype directions. The schema now has 14 top-level sections while related distinctions remain nested, so the navigation stays manageable.
- Split language ability from language examinations. One language record stores language and four proficiency dimensions; independent examination records store the corresponding language, exam type, score, exam date, validity date, and certificate number. CET, IELTS and TOEFL are no longer presented as languages.
- Split internships from formal employment, campus leadership from campus activities, and publications from patents. Added dedicated work samples plus reviewed missing education, location, compensation, award, certificate, family-contact and reusable-answer fields.
- Split “设置常用简历 PDF” from “从简历导入档案信息” into two independent file actions. Prototype file inputs only display the current selection; neither filename nor file bytes enter the local draft JSON.
- Reused production field paths where the current CandidateProfile already supports them and named prototype-only future candidates explicitly. Context-specific fields are marked “投递时确认”; sensitive fields retain confirmation markers and masked identity-number controls.
- Changed completion from “all rendered controls” to core applicable controls. Empty optional repeatable groups do not reduce completion, while the first baseline education record remains included.
- Refactored the shared renderer to support nested groups, multiple upload actions, repeatable group restoration, contextual guidance, and group-aware completion. Removed the obsolete embedded field list so the schema is the only field-model source of truth.
- Focused npm run test:e2e -- tests/e2e/profile-design-prototypes.spec.ts exited 0 with 5/5 Chrome checks. It verifies the five variants, isolated persistence, guided navigation, separate language/exam records, the two resume actions, nested concept separation, file-metadata non-persistence, and narrow viewport behavior.
- Final npm run validate exited 0: TypeScript passed, 41 test files / 370 tests passed, corpus verification passed, production built, all 13 required distribution files passed, permissions remained exact, and forbidden permissions remained absent.
- Final npm run test:e2e exited 0 with 29/29 Chrome scenarios. node --check passed for profile-schema.js and prototype.js; legacy field-path and mojibake searches returned no match; git diff --check reported no whitespace errors beyond existing Windows line-ending notices.
- Refreshed and visually inspected artifacts/profile-design-01-dossier.png, profile-design-01-language.png, and profile-design-mobile-guided.png. They contain only blank prototype UI and show the corrected resume actions, language grouping, Organic hierarchy, and responsive layout.

### F057 changed files and handoff

- Field model: design-prototypes/profile-editor/profile-schema.js.
- Shared renderer and styling: design-prototypes/profile-editor/prototype.js and prototype.css.
- Prototype entry pages: 01-dossier.html, 02-bento.html, 03-guided.html, 04-quiet.html, and 05-compact.html in the same directory.
- Browser verification: tests/e2e/profile-design-prototypes.spec.ts; current ignored evidence includes the dossier, language-detail, and mobile-guided screenshots in artifacts/.
- Harness state: feature_list.json and this progress.md. F057 is complete. The next recommended feature is a separately reviewed migration of the approved information model into the production React CandidateProfile and options editor; this prototype work intentionally did not make that product-data migration.

## 2026-08-07 - F058 MetaApp public ground-truth kickoff

- Marked F058 `in_progress` for the user-supplied MetaApp application URL.
- Read-only public HTML inspection found `js-websiteInfo.website_info.resume_form_schema` version 8. The visible denominator is currently 4 groups and 13 logical fields; hidden schema fields are excluded from the ground truth.
- Browser control had no available instance, so this feature is limited to independently auditable public-schema evidence. It will not claim authenticated rendered-DOM coverage, page filling, upload, login, or submission.

### F058 implementation and acceptance evidence

- Added a reviewed public snapshot and normalized ground truth for MetaApp's `软件研发工程师` application. The current visible denominator is 4 groups / 13 logical fields: 简历 1、基本信息 4、教育经历 4、实习经历 4. Hidden Schema objects are not counted.
- Added a GET-only `npm run audit:metaapp` command. It refetched the user-supplied public application URL, parsed `js-websiteInfo.website_info.resume_form_schema` version 8, compared every visible group and field with the snapshot, verified the public job title through the job-detail GET endpoint, and reported no application submission.
- The normalized corpus ground truth contains the credential-free origin and `/140297/resume/:id/apply` path template. A static privacy check confirmed 4/13, no raw job id, and no cookie, authorization, password, filename, or raw-HTML marker.
- `npm run audit:metaapp` exited 0 with `4 groups, 13 visible fields`. `npm run verify:corpus` exited 0. Final `npm run validate` exited 0 with 41 test files / 370 tests, corpus verification, production build, 13-file distribution verification, unchanged permissions, and collector exclusion.
- `git diff --check` reported no whitespace errors beyond the repository's existing Windows line-ending notices. JSON parse and `node --check scripts/audit-metaapp.mjs` passed. No browser login, page write, file upload, or final-submit action was performed.

### F058 changed files and handoff

- Ground truth and source snapshot: `ats-corpus/ground-truth/metaapp-campus-application-v1.json` and `tests/fixtures/metaapp-campus-application-schema.json`.
- Live audit and operator notes: `scripts/audit-metaapp.mjs`, `docs/metaapp-ground-truth.md`, and the `audit:metaapp` package script.
- Harness state: `feature_list.json` and this `progress.md`. F058 is complete. The next evidence step is a developer-triggered anonymous rendered-page observation for MetaApp, audited against the 4-group/13-field denominator; only after that should the Xiaomi and MetaApp samples be used to justify a broader Feishu family detector/template.

## 2026-08-07 - F059 MetaApp scanner hardening kickoff

- Marked F059 `in_progress` after the user requested a scanner fix and supplied a new private anonymous observation in Downloads. The file remains outside the repository and is used only for aggregate diagnostics.
- The existing corpus importer accepted the sample in dry-run mode. It records the expected four sections, 279 raw interactive nodes, 242 standalone option nodes, one protected file input and one protected final-submit button, with no current values or authentication material.
- Independent strict comparison against the F058 Ground Truth finds 7/13 logical fields. The reproducible defects are missing basic-section association, weak-wrapper label shadowing, missing 手机号码 and date-range semantics, missing required markers, and UI treatment of standalone options as raw controls rather than a separate structural count.
- Scope is limited to privacy-safe structure extraction and the development-only collector quality gate. Production filling behavior, permissions, login, attachments, and final submission remain unchanged.

## 2026-08-07 - F060 Lenovo Talent component ground-truth kickoff

- Followed the repository resume protocol for the user-supplied `https://talent.lenovo.com.cn/account/resume` URL and ran `./init.ps1 -SkipInstall`; the starting validation passed with 41 test files / 370 tests.
- Used agent-reach's public webpage reader first. The unauthenticated route exposes only the Lenovo account-login shell, so it is excluded from the resume component denominator.
- Browser discovery returned no connected instance. No login, QR scan, SMS/voice code, CAPTCHA, cookie, browser storage, candidate value, page write, upload, save, or application submission was attempted.
- Continued with credential-free production evidence only: the current PC `myResume` chunk uses Element Plus controls and exposes seven editor sections, stable model names, validators, conditional branches, repeatable-record components, attachment constraints, and section-specific API families. `GET /gateway/sysDict/all` returned 76 dictionaries, including all 15 option sets referenced by the resume component.
- Current reviewed denominator is 7 sections, 55 profile fields, and 2 workflow confirmation controls. This remains public compiled-component/dictionary evidence until an authorized authenticated rendered-DOM observation is available.

### F060 implementation and acceptance evidence

- Added a normalized Lenovo Talent PC ground truth and a source-bound audit snapshot. The current denominator is 7 sections / 55 profile fields / 2 workflow controls: 上传简历 2、个人信息 17、教育经历 9、实习经历 7、项目经验 6、技能/爱好 10、其他 4. Upload parsing and acknowledgement checkboxes are kept outside the profile-field count.
- Preserved exact technical evidence needed by deterministic filling: Element Plus control families, stable model names, required-rule keys, `YYYY/MM` month controls, repeatability and record-local API families, conditional dependencies, attachment formats/10 MiB limits, sensitive identity confirmation, and the observed misspellings `depatureDate`, `projectIntrodution`, and `informationChannell`.
- Recorded one material component anomaly instead of normalizing it away: the PC country select has a boolean `multiple` attribute and an array-shaped display model while the mobile component is single-select. The mobile bundle exposes only personal, education, and other editing and explicitly directs applicants to the PC site for the remaining sections.
- Added a credential-free live audit. It discovers the current versioned index, PC/mobile `myResume`, resume API, and static config chunks; parses the PC component with TypeScript; compares all 55 profile controls and required rules; verifies section API path markers without calling them; and refetches `GET /gateway/sysDict/all` to check all 15 referenced dictionaries by count, first/last label, and SHA-256 digest.
- `npm run audit:lenovo` exited 0 with `7 groups, 55 profile fields, 2 workflow controls, 15 remote option sets`; `npm run verify:corpus` exited 0. The audit performed public GET requests only and made no resume read/write, upload, save, or submission call.
- The first full validation run encountered a 5-second timeout in the pre-existing expanded `ProfileEditor` test while the other 372 tests passed. An isolated diagnostic with a 15-second ceiling completed all 6/6 tests in 4.985 seconds; the unchanged final strict `npm run validate` then exited 0 with 42 test files / 373 tests, corpus verification, production build, 13-file distribution verification, exact permissions, and collector exclusion all passing.
- Final `npm run test:e2e` exited 0 with 29/29 Chrome scenarios, including complex controls, repeatable records, attachments, collector quality, privacy controls, and zero final submission. This evidence-only feature did not change a user-facing surface, so it adds no synthetic UI screenshot; no authenticated Lenovo screenshot was captured because no browser instance was connected.
- JSON parsing and `node --check scripts/audit-lenovo.mjs` passed. The targeted privacy/no-write scan found no raw HTML, authentication query data, bearer material, candidate value, or resume endpoint call in the audit. `git diff --check` exited 0 with only the repository's existing LF-to-CRLF warnings.

### F060 changed files and handoff

- Ground truth and reviewed snapshot: `ats-corpus/ground-truth/lenovo-talent-resume-v1.json` and `tests/fixtures/lenovo-talent-resume-schema.json`.
- Live audit and operator notes: `scripts/audit-lenovo.mjs`, `docs/lenovo-talent-resume-ground-truth.md`, and the `audit:lenovo` package script.
- Harness state: `feature_list.json` and this `progress.md`. F060 is complete; F059 remains independently in progress. The next Lenovo evidence step is an authorized, value-redacted authenticated DOM observation for the 7/55 denominator. Only after that should a Lenovo-specific production template or Element Plus adapter be proposed. No login, browser credential inspection, commit, push, or PR was performed.

### F059 implementation and acceptance evidence

- Hardened the read-only CDP page-state scanner around bounded structural evidence. It now continues past weak inner wrappers to a real form item, recognizes exact allow-listed labels in small field containers, associates generic `div` section shells, derives section context from technical form names/classes, detects required attributes/classes/asterisks, and sanitizes file/date/upload-status text without reading current input values.
- Limited the structural-label fallback to ancestors containing at most one logical field or a two-control range. This preserves date-range recovery while preventing a single known caption elsewhere in a large page or section from shadowing unrelated controls. The generic anonymous State / Find recall regression caught by the first full browser run was fixed and its isolated scenario then passed.
- Added a synthetic MetaApp failure-shape unit fixture covering the reviewed 4 groups / 13 fields, nested wrappers, phone, two date ranges, structural required markers, standalone options/listbox, a file input, final-submit protection, and explicit private-value non-leak assertions.
- Generalized the development-only collector quality gate. It recognizes the reviewed Xiaomi and MetaApp baselines, evaluates MetaApp independently against 4 groups / 13 logical fields and required evidence, excludes `option` and `listbox` structures from the semantic denominator, reports the three standalone option nodes separately, and blocks download on missing fields, missing required state, raw-count mismatch, weak semantics, or unprotected final submission.
- Extended the browser collector scenario across both baselines. The MetaApp-derived page reaches 4/4 groups and 13/13 fields, reports 3 option nodes outside the logical-field count, leaks none of its synthetic private values or raw job id into JSON, and leaves the submit counter at zero.
- Focused `npm test -- --run src/bridge/pageState.test.ts src/ats/observation.test.ts src/devtools/ats-collector` exited 0 with 4 files / 12 tests. `npm run build:collector` and `npm run verify:collector` passed with the exact unchanged permissions.
- `npm run test:e2e -- --grep "MetaApp|collector"` exited 0. Final `npm run validate` exited 0 with TypeScript, 42 test files / 373 tests, corpus verification, production build, 13-file distribution verification, unchanged permissions, forbidden-permission absence, and proof that the development collector is absent from production.
- Final complete `npm run test:e2e` exited 0 with 29/29 Chrome scenarios, including generic State / Find, Xiaomi, MetaApp, filling, attachments, privacy controls, repeatable records, PDF/DOCX/OCR, and zero final submission. `artifacts/metaapp-ats-collector.png` was refreshed and visually inspected; it contains synthetic structure only and shows the 4/4, 13/13 independent quality result.
- `feature_list.json` parses with 61 features and F059 is `done`. `git diff --check` exited 0 with only existing Windows LF/CRLF notices. The user-supplied observation remains unchanged in Downloads; no login, cookie/password access, telemetry, upload, page write, permission change, or final-submit action was introduced.

### F059 changed files and handoff

- Scanner and unit proof: `src/bridge/pageState.ts` and `src/bridge/pageState.test.ts`.
- Collector gate and UI: `src/devtools/ats-collector/xiaomiQuality.ts`, `xiaomiQuality.test.ts`, and `AtsCollectorCard.tsx`.
- Browser proof: `tests/e2e/ats-collector.spec.ts` and ignored current screenshot `artifacts/metaapp-ats-collector.png`.
- Harness state: `feature_list.json` and this `progress.md`. F059 is complete. The next recommended action is to rebuild/reload `dist-collector`, refresh the authenticated MetaApp application, and create a fresh anonymous observation; only that real recapture can confirm the production DOM now reaches the synthetic 4/4 and 13/13 target. No commit or push was performed.

## 2026-08-07 - F070 NIO Feishu application ground-truth kickoff

- Marked F070 `in_progress` for the user-supplied `nio.jobs.feishu.cn` application URL after the repository baseline passed with 44 test files / 381 tests.
- A credential-free GET of the application HTML exposes public `js-websiteInfo.website_info.resume_form_schema` version 1. Initial independent evidence contains 7 visible groups / 27 logical fields for `资深大语言模型算法（上海）`, including NIO-specific application questions and three configured yes/no selects.
- Scope is evidence only: create company-explicit 蔚来/NIO ground truth, source snapshot, drift audit, and documentation. Do not inspect browser credentials or values, log in, fill, upload, save, or submit; rendered-DOM coverage remains a separate later observation.

### F070 implementation and acceptance evidence

- Added `ats-corpus/ground-truth/nio-feishu-senior-llm-algorithm-application-v1.json`. Both the filename and structured metadata identify `蔚来（NIO）`; the source path is normalized to `/index/resume/:id/apply` and does not retain the public job id.
- The reviewed denominator is 7 groups / 27 logical fields / 7 customized fields: 简历 1、基本信息 7、教育经历 4、工作经历 4、项目经历 5、自我评价 1、申请信息 5. Exact group/child required and repeatable flags are preserved even where the source configuration is unusual.
- Recorded the three NIO-specific configured selects and their exact `是` / `否` captions. Built-in location, preferred-location and degree option catalogs are absent from the public form schema, so the ground truth does not invent them.
- Added a company-explicit reviewed source snapshot and `npm run audit:nio`. The audit refetches only the public application HTML and public job-detail endpoint, compares schema version, company origin, job title, every group and field, customization, options, and the 7/27 denominator, and makes no application mutation request.
- `npm run audit:nio` exited 0 for `资深大语言模型算法（上海）`; `npm run verify:corpus`, JSON parsing, `node --check scripts/audit-nio.mjs`, and the normalized-artifact privacy/path/count audit passed.
- Final `npm run validate` exited 0 with TypeScript, 44 test files / 381 tests, corpus verification, production build, 13-file distribution verification, unchanged permissions, forbidden-permission absence, and collector exclusion. `git diff --check` exited 0 with only existing LF/CRLF notices.
- This is independent public server-schema ground truth, not authenticated rendered-DOM or filling evidence. No browser credential/value inspection, login, cookie/token access, attachment upload, field write, save, or final application submission was performed.

### F070 changed files and handoff

- Ground truth: `ats-corpus/ground-truth/nio-feishu-senior-llm-algorithm-application-v1.json`.
- Reviewed source snapshot: `tests/fixtures/nio-feishu-senior-llm-algorithm-application-schema.json`.
- Drift audit and command: `scripts/audit-nio.mjs` and the `audit:nio` package script.
- Documentation and harness: `docs/nio-feishu-ground-truth.md`, `feature_list.json`, and this `progress.md`.
- F070 is complete. The next NIO evidence step is a developer-triggered anonymous rendered-page observation compared against 7/27; only that later evidence can validate actual controls or promote NIO/Feishu support. No commit or push was performed.

## 2026-08-07 - F061 ATS family expansion harness and support policy

- Used the long-running-agent-harness workflow to convert the OfferLink architecture review into nine durable features, F061-F069. The sequence is support policy, generalized Feishu, Zhiye, Moka, Hotjob, local host overrides, optional privacy-safe AI proposals, an evidence-derived catalog, and a 12-page real acceptance gate.
- Added docs/ats-family-expansion-plan.md. It defines the clean-room five-layer architecture, standard-mode local boundary, feature dependencies, support levels, exact metric formulas, four-family/12-page matrix, verification ladder, evidence allowlist, prohibited data, and failure policy.
- Added a pure typed ATS support policy. It validates privacy attestations, dates, aggregate metrics, evidence ids and safe artifact references; rejects raw/profile/authentication/query/file metadata claims; and derives planned, observed, fixture-verified, or real-page-verified without touching a browser page.
- Promotion requires an independent ground truth or value-redacted observation for the same site. Fixture promotion requires a passing synthetic run. Real promotion requires three distinct passing sites, at least 90% eligible-field coverage, at least 95% verified-write success, coverage of text/choice/date/repeatable controls, and zero incorrect writes, unsafe actions, final-submit activations, unexpected navigation, duplicate records, or standard-mode network calls.
- Added the first bundled support evidence registry. Xiaomi and MetaApp ground truths make the future general Feishu family observed only; it has zero fixture or real write claims. Zhiye, Moka, and Hotjob remain planned.
- Focused npm test -- --run src/ats/supportPolicy.test.ts src/ats/supportEvidence.test.ts exited 0 with 2 files / 8 tests. TypeScript passed.
- Final npm run validate exited 0 with TypeScript, 44 test files / 381 tests, corpus verification, production build, 13-file distribution verification, unchanged exact permissions, forbidden-permission absence, and developer-collector exclusion.
- F061 changes no page detection, matching, writing, user interface, permission, network request, or production support claim, so no new Chrome screenshot or real-page action was required. No OfferLink code, selector configuration, private API, asset, branding, or rating was copied.

### F061 changed files and handoff

- Durable roadmap: docs/ats-family-expansion-plan.md.
- Policy and current evidence: src/ats/supportPolicy.ts and src/ats/supportEvidence.ts.
- Verification: src/ats/supportPolicy.test.ts and src/ats/supportEvidence.test.ts.
- Harness state: feature_list.json and this progress.md. F061 is complete. F062 is the next unblocked node: generalize Feishu from the existing Xiaomi and MetaApp evidence while keeping the family below real-page-verified until three distinct real sites pass.

## 2026-08-07 - F071 禾赛科技 Feishu application ground-truth kickoff

- Followed the repository resume protocol and ran `./init.ps1 -SkipInstall`; the starting validation passed with 44 test files / 381 tests.
- Used agent-reach's general-web/Jina Reader path on the user-supplied public application URL. The page title identifies `禾赛科技`, while the public server payload states the legal tenant name `上海禾赛科技有限公司`; the public job-detail endpoint identifies `设备工程师（嘉定）`.
- Independent credential-free inspection of `js-websiteInfo.website_info.resume_form_schema` version 1 found 10 visible groups / 30 logical fields / 1 customized field.
- Scope is evidence only: create company-explicit ground truth, reviewed snapshot, GET-only drift audit, and documentation. No login, cookie or current-value inspection, form write, upload, save, or final application submission is permitted; rendered-DOM coverage remains a separate later observation.

### F071 implementation and acceptance evidence

- Added `ats-corpus/ground-truth/hesai-feishu-equipment-engineer-jiading-application-v1.json`. Structured metadata states company `禾赛科技` and legal company name `上海禾赛科技有限公司` in plaintext; the normalized source path is `/index/resume/:id/apply` and does not retain the public job id.
- The independent denominator is 10 groups / 30 logical fields / 1 customized field: 简历 1、基本信息 3、教育经历 4、工作经历 4、实习经历 4、项目经历 5、作品 3、获奖 3、语言能力 2、自我评价 1. Exact required and repeatable flags are preserved, including the required 简历 group with a non-required attachment child and individually required fields inside optional repeatable groups.
- Added a reviewed source snapshot plus `npm run audit:hesai`. The GET-only audit refetched the public HTML and job-detail endpoint, verified the page title and public tenant name, compared schema version and every visible group/field, checked the job title `设备工程师（嘉定）`, and exited 0 with `10 groups, 30 visible fields`.
- `npm run verify:corpus` exited 0. JSON parsing, `node --check scripts/audit-hesai.mjs`, and a normalized-artifact audit proved the two plaintext company names, 10/30 denominator, templated path, no raw job id, and no prohibited current-value/authentication/raw-HTML/file/selector data keys.
- Final `npm run validate` exited 0 with TypeScript, 44 test files / 381 tests, corpus verification, production build, 13-file distribution verification, exact permissions, forbidden-permission absence, and developer-collector exclusion. `git diff --check` for the tracked feature files exited 0 with only existing LF-to-CRLF notices; all four new files passed an explicit trailing-whitespace check.
- This remains public server-schema ground truth, not authenticated rendered-DOM or filling evidence. No browser credential/value inspection, login, cookie/token access, attachment upload, field write, save, or final application submission was performed.

### F071 changed files and handoff

- Ground truth: `ats-corpus/ground-truth/hesai-feishu-equipment-engineer-jiading-application-v1.json`.
- Reviewed source snapshot: `tests/fixtures/hesai-feishu-equipment-engineer-jiading-application-schema.json`.
- Drift audit and command: `scripts/audit-hesai.mjs` and the `audit:hesai` package script.
- Documentation and harness: `docs/hesai-feishu-ground-truth.md`, `feature_list.json`, and this `progress.md`.
- F071 is complete. The next 禾赛 evidence step is a developer-triggered anonymous rendered-page observation compared against 10/30; only that later evidence can validate actual controls or successful filling. F062 remains the next implementation feature in the broader ATS-family roadmap. No commit or push was performed.

## 2026-08-07 - F075 legacy ground-truth path migration kickoff

- Followed the repository resume protocol and ran `./init.ps1 -SkipInstall`; the starting validation passed with 44 test files / 381 tests.
- Confirmed that Xiaomi, MetaApp, and Lenovo still use flat legacy paths while `ats-corpus/ground-truth/README.md` now defines `ground-truth/<ats-family>/<company>/` as the current company-classified convention.
- Scope is a lossless organization and metadata migration. Preserve every reviewed field and stable artifact id; add explicit company/ATS/denominator metadata; update active references; do not change matcher behavior, support level, browser permissions, candidate data, or any real page.

## 2026-08-07 - F072 company-explicit downloaded observation organization kickoff

- Found three developer-downloaded ATS observations and classified them from their credential-free origins as 蔚来（NIO）, MetaApp, and 小米.
- Read-only privacy inspection found all four privacy flags false in every file, no current-value/selected/authentication/file-metadata/DOM-session keys, no seven-plus-digit values, no email addresses, and templated paths without raw application ids.
- The NIO and MetaApp exports pass the current corpus importer in dry-run mode. The older Xiaomi export predates the required `sections` and `summary.sectionCount` fields, so it will be preserved and clearly marked legacy rather than silently rewritten or presented as current-schema validated.
- Scope: copy originals byte-for-byte into a company-explicit non-production staging tree, add a readable index, verify hashes, and leave the Downloads originals untouched.

### F072 implementation and acceptance evidence

- Added `ats-corpus/observations/README.md` as the plaintext company index. It names 蔚来（NIO）, MetaApp, and 小米 and records each ATS family, normalized origin/path, captured counts, staging filename, validation status, and independent ground-truth link.
- Copied the three Downloads observations unchanged into `ats-corpus/observations/feishu-recruiting/{nio,metaapp,xiaomi}/`. Source/copy SHA-256 pairs matched: NIO `592f2c6d455927d38182f701a8581ef1925a281607aa7ec16c642fe0ca0e0cb1`, MetaApp `8a86994740f2cf5a3814371e62ae181aaf25e25b60ff6c5deb2f12b1c5071fb7`, and Xiaomi `1c8173e03f10eaea0cff6b6ef8eec45ebb058e8c8fe54a55212c8bc4495aa0c9`. The Downloads originals were not changed or deleted.
- The staged privacy audit passed for all three observations: all four declared privacy flags are false, all JSON parses, paths remain templated, and no current-value/selected/authentication/file-metadata/DOM-session keys, local paths, emails, or seven-plus-digit values were found.
- Current-schema corpus-import dry runs passed for NIO (`generic-html`, digest `3165e4f01a4d096e`) and MetaApp (`generic-html`, digest `c6a1a699f41d305d`). Xiaomi remains explicitly marked legacy because its older export has no required top-level `sections` or `summary.sectionCount`; it was not silently altered or promoted to validated evidence.
- Updated `ats-corpus/README.md` to document `observations/` as non-production staging that is excluded from reviewed corpus samples. `npm run verify:corpus` exited 0, and final `npm run validate` exited 0 with TypeScript, 44 test files / 381 tests, corpus verification, production build, 13-file distribution verification, exact permissions, forbidden-permission absence, and developer-collector exclusion.

### F072 changed files and handoff

- Company index: `ats-corpus/observations/README.md`.
- Staged copies: the NIO, MetaApp, and Xiaomi JSON files below `ats-corpus/observations/feishu-recruiting/`.
- Corpus documentation and harness: `ats-corpus/README.md`, `feature_list.json`, and this `progress.md`.
- F072 is complete. The next evidence action is to recapture Xiaomi with the current collector, then independently compare each current-schema observation with its company ground truth before importing any file into `ats-corpus/samples/`. F062 remains the broader ATS-family implementation feature. No commit or push was performed.

## 2026-08-07 - F073 安克创新 Feishu application ground-truth kickoff

- Followed the repository resume protocol and ran `./init.ps1 -SkipInstall`; starting validation passed with 44 test files / 381 tests.
- Used agent-reach's general-web/Jina Reader route on the user-supplied public job-detail URL. The public title states `AI 业务工程师 — Agent 交付方向 AI Business Engineer (Forward Deployed) - 加入安克创新科技股份有限公司`.
- Credential-free GET inspection confirmed both the supplied detail page and the derived `/index/resume/:id/apply` page expose the same `js-websiteInfo.website_info.resume_form_schema` version 1 with 5 visible groups / 15 logical fields / 0 customized fields.
- Scope is independent public evidence only: add company-explicit normalized ground truth, a reviewed source snapshot, a GET-only drift audit, and documentation. No login, candidate value, cookie/token inspection, attachment upload, field write, save, or final application submission is permitted.

### F073 implementation and acceptance evidence

- Added `ats-corpus/ground-truth/anker-innovations-feishu-ai-business-engineer-application-v1.json`. Company metadata states `安克创新`, `安克创新科技股份有限公司`, and `Anker Innovations` in plaintext; normalized paths are `/index/position/:id/detail` and `/index/resume/:id/apply` and contain no raw job-post id.
- The independent denominator is 5 groups / 15 logical fields / 0 customized fields: 简历 1、基本信息 3、教育经历 4、工作经历 4、作品 3. The source's unusual distinction is preserved: 教育经历 is a required repeatable group while its four children are individually optional, and 简历 is a required group while 简历附件 is individually optional.
- Added the reviewed source snapshot and `npm run audit:anker`. The GET-only audit refetched the supplied detail page, its derived application page, and the public job endpoint; verified company and bilingual job identity; compared both live schemas field-for-field with the snapshot; proved detail/application schema equivalence; and exited 0 with `5 groups, 15 visible fields`.
- JSON parsing, `node --check scripts/audit-anker.mjs`, and the normalized-artifact audit proved the 5/15 denominator, both plaintext Chinese company names, templated paths, absence of the raw public job id from normalized ground truth, and absence of prohibited value/authentication/raw-HTML/file/selector/session keys. `npm run verify:corpus` exited 0.
- Final `npm run validate` exited 0 with TypeScript, 44 test files / 381 tests, corpus verification, production build, 13-file distribution verification, exact permissions, forbidden-permission absence, and developer-collector exclusion. This was not a user-visible runtime milestone, so no E2E screenshot was required.

### F073 changed files and handoff

- Ground truth: `ats-corpus/ground-truth/anker-innovations-feishu-ai-business-engineer-application-v1.json`.
- Reviewed source snapshot: `tests/fixtures/anker-innovations-feishu-ai-business-engineer-application-schema.json`.
- Drift audit and command: `scripts/audit-anker.mjs` and the `audit:anker` package script.
- Documentation and harness: `docs/anker-innovations-feishu-ground-truth.md`, `feature_list.json`, and this `progress.md`.
- F073 is complete. The next 安克 evidence step is a developer-triggered anonymous rendered-page observation compared against 5/15; only that later evidence can validate actual controls or successful filling. F062 remains the broader Feishu-family implementation feature. No commit or push was performed.

## 2026-08-07 - F074 携程社会招聘简历编辑 Ground Truth kickoff

- Followed the repository resume protocol and ran `./init.ps1 -SkipInstall`; starting validation passed with 44 test files / 381 tests.
- Used agent-reach's general-web/Jina Reader route on the user-supplied URL. The credential-free landing page identifies 携程集团（Trip.com Group） and the current root HTML exposes a public Chinese `i18n_base_language` dictionary.
- Public static-bundle inspection classified the site as a company-owned custom recruitment SPA, not Feishu/Moka or another shared ATS. The main route table marks `/experienced/personal-homepage` as authenticated and lazy-loads personal-homepage module `46096`; the current module defines the `/experienced/personal-homepage/editCV` contract.
- Independent bundle review found 7 visible sections / 28 logical controls / 5 repeatable collections / 2 attachment controls for the experienced route. Phone changes trigger a manual verification-code gate; no attempt will be made to read or bypass it.
- Scope is public contract evidence only: add a family/company-classified normalized artifact, a reviewed source snapshot, a GET-only drift audit, and documentation. No login, candidate-value/API response inspection, upload/parse call, verification request, field write, save, or final application submission is permitted.

### F074 implementation and acceptance evidence

- Added the company-explicit normalized artifact at `ats-corpus/ground-truth/ctrip-careers-custom/ctrip/ctrip__experienced-edit-cv__v1.json`. It classifies `job.ctrip.com` as `ctrip-careers-custom` / `company-owned-custom-ats`, explicitly not a shared third-party ATS, and replaces the supplied `tabindex=2` route detail with the template `tabindex=:tab`.
- The independent reviewed snapshot records 7 groups / 28 logical fields / 21 required fields / 5 repeatable collections / 2 attachment fields / 4 configured-option fields / 1 manual verification gate. It preserves the two 25 MB PDF/DOC/DOCX file controls, `male`/`female`, degree and proficiency option values, the `1900-01-01` current-job sentinel, and the manual SMS boundary without storing a candidate value.
- Added `npm run audit:ctrip`. On 2026-08-07 it resolved the live public root, `main.dec41b1a.js`, current personal-homepage chunk 400, and shared recruitment API chunk 138 using GET only. It verified the authenticated experienced route, module 46096, edit-CV contract, live Chinese i18n labels, field/model markers, option values, file constraints, API boundary strings, the 7/28 denominator, normalized-path privacy rules, and exited 0. It invoked no candidate, parse, verification, update, save, or submission endpoint.
- `node --check scripts/audit-ctrip.mjs`, JSON parsing for the GT/snapshot/harness, `npm run verify:corpus`, and the classification/documentation inspection all exited 0. `npm run validate` exited 0 with TypeScript, 44 test files / 381 tests, corpus verification, production build, 13-file distribution verification, exact permissions, forbidden-permission absence, and developer-collector exclusion.
- This is a documentation/corpus milestone rather than a user-visible runtime change, so no E2E screenshot was required. Evidence remains explicitly `public-bundle-contract`: it does not claim logged-in rendered-DOM coverage or successful filling.

### F074 changed files and handoff

- Ground truth and indexes: `ats-corpus/ground-truth/ctrip-careers-custom/ctrip/ctrip__experienced-edit-cv__v1.json`, `ats-corpus/ground-truth/README.md`, and `ats-corpus/README.md`.
- Reviewed source snapshot: `tests/fixtures/ctrip-experienced-edit-cv-public-bundle-contract.json`.
- Drift audit and command: `scripts/audit-ctrip.mjs` and the `audit:ctrip` package script.
- Documentation and harness: `docs/ctrip-experienced-edit-cv-ground-truth.md`, `feature_list.json`, and this `progress.md`.
- F074 is complete. The next Ctrip evidence action is a developer-triggered anonymous scan of the authenticated rendered page, compared group-by-group with 7/28. Do not capture existing values, filenames, cookies, tokens, request bodies, or invoke parse, SMS, save, or final submission. No commit or push was performed.

## 2026-08-07 - F076 Huya campus Moka resume ground-truth kickoff

- Followed the repository resume protocol and ran `./init.ps1 -SkipInstall`; starting validation passed with 44 test files / 381 tests.
- The user supplied `https://app.mokahr.com/campus_apply/huya/4112#/candidateHome/resume`. The hostname and route classify the page as a Moka campus-application tenant for company slug `huya`; public evidence will be used to confirm the company identity and independently observable resume contract.
- Scope is evidence only: create a Moka/huya family-company artifact, reviewed snapshot, GET-only audit, and documentation. No login, current candidate value, cookie/token inspection, attachment upload, form write, save, or final application submission is permitted.

### F076 implementation and acceptance evidence

- Public tenant-shell evidence identifies organization `huya`, display name `虎牙直播`, site 4112, `campus` mode, Chinese locale, and Moka branding. The normalized artifact classifies the page as `moka` / `shared-ats-tenant` and stores it at `ats-corpus/ground-truth/moka/huya/huya__campus-candidate-resume__v1.json`; its path template replaces the public site number with `:siteId` and contains no `4112`.
- The current public Moka applyWeb bundle declares that `/candidateHome/resume` copies `DEFAULT_APPLY_SETTING`, deletes `uploadInfo`, and renders the remaining standard form. The independent reviewed denominator is 9 groups / 41 logical fields / 1 required field / 6 repeatable groups / 7 configured-option fields / 0 attachment fields / 1 identity-sensitive field. The exact group order, selected technical field ids, Chinese labels, Moka types, and gender/degree/language/work-experience catalogs are preserved.
- Added `npm run audit:huya-moka`. The audit performs only three public GETs: the two-step anonymous tenant-shell bootstrap and the current static applyWeb bundle. The anonymous bootstrap cookies remain in process memory and are never printed or persisted. The audit verifies tenant identity, release/asset discovery, routes, default-setting selection, common field definitions, option catalogs, 9/41 counts, the candidateInfo read boundary, and the `PUT /personal-center/resumeInfo` save boundary; it invokes neither endpoint and exited 0.
- JSON parsing and the normalized privacy/count audit proved the family/company classification, exact 9/41 denominator, absence of site id 4112 from normalized GT, and absence of prohibited current-value/cookie/token/filename/raw-HTML/selector/request/response/session keys. `npm run verify:corpus` exited 0.
- Final `npm run validate` exited 0 with TypeScript, 44 test files / 381 tests, corpus verification, production build, 13-file distribution verification, exact permissions, forbidden-permission absence, and developer-collector exclusion. This is a corpus/documentation milestone, not a user-visible runtime change, so no new E2E screenshot was required.

### F076 changed files and handoff

- Ground truth and index: `ats-corpus/ground-truth/moka/huya/huya__campus-candidate-resume__v1.json` and `ats-corpus/ground-truth/README.md`.
- Reviewed source snapshot: `tests/fixtures/huya-moka-campus-candidate-resume-public-contract.json`.
- GET-only drift audit and command: `scripts/audit-huya-moka.mjs` and the `audit:huya-moka` package script.
- Documentation and harness: `docs/huya-moka-campus-resume-ground-truth.md`, `feature_list.json`, and this `progress.md`.
- F076 is complete. The next Huya/Moka evidence action is a developer-triggered anonymous scan of the logged-in rendered page compared group-by-group with 9/41. That later observation must contain no values, identity number, filename, authentication data, request body, save, CAPTCHA action, or final submission. No commit or push was performed.

### 2026-08-07 - F075 implementation and acceptance evidence

- Migrated the three flat artifacts without changing their stable ids or field definitions: Xiaomi to `ats-corpus/ground-truth/feishu-recruiting/xiaomi/xiaomi__internship-application__v1.json`, MetaApp to `ats-corpus/ground-truth/feishu-recruiting/metaapp/metaapp__campus-application__v1.json`, and Lenovo to `ats-corpus/ground-truth/lenovo-talent/lenovo/lenovo__candidate-resume-editor__v1.json`. The old physical paths are absent.
- Added explicit company metadata for `小米（Xiaomi）`, `MetaApp`, and `联想（Lenovo）`; added `feishu-recruiting` or `lenovo-talent` source-family metadata; and recorded exact denominators of 9/34, 4/13, and 7/55. No unsupported legal company name was invented.
- Updated every active runtime import, Xiaomi observation audit, Lenovo live audit, support-evidence reference, company observation index, ground-truth index, and current company documentation to the new paths. A repository search found zero active old-path references outside append-only historical `progress.md` entries.
- `npm run audit:xiaomi`, `npm run audit:metaapp`, and `npm run audit:lenovo` exited 0 and independently reconfirmed the exact public structures using GET-only evidence. The focused regression exited 0 with 4 test files / 10 tests.
- Final `npm run validate` exited 0 with TypeScript, 44 test files / 381 tests, corpus verification, production build, 13-file distribution verification, exact permissions, forbidden-permission absence, and developer-collector exclusion. This migration changes no user-visible runtime surface, so no E2E screenshot was required.

### F075 changed files and handoff

- Migrated artifacts: the Xiaomi, MetaApp, and Lenovo family/company paths listed above.
- Active references: `scripts/ats-corpus/xiaomi-observation-audit.mjs`, `scripts/audit-lenovo.mjs`, `src/ats/supportEvidence.ts`, `src/ats/xiaomiObservationAudit.test.ts`, and `src/devtools/ats-collector/`.
- Indexes and documentation: `ats-corpus/ground-truth/README.md`, `ats-corpus/observations/README.md`, and the three company ground-truth documents.
- Harness state: `feature_list.json` and this `progress.md`. F075 is complete; F076 remains independently in progress. No commit or push was performed.

## 2026-08-07 - F077 kickoff: organize Huya Moka downloaded observation

- Set `F077` to `in_progress` after the repository resume protocol and baseline initialization passed.
- Located six `ats-observation-unknown-2026-08-07T11-19*.json` downloads for `https://app.mokahr.com/campus_apply/huya/:id`.
- Initial evidence: all six are valid schema-v1 JSON; they form three byte-level hashes caused only by capture time and one semantic SHA-256 after `capturedAt` is excluded. Each reports 71 raw controls, 2 sections, 68 controls with extracted semantics, and all four privacy flags as `false`.
- Scope: preserve Downloads originals, stage one latest byte-identical representative under an explicit `moka/huya` path, document duplicate handling and ground-truth comparison, then run the listed privacy/import/corpus/full-validation checks.

## 2026-08-07 - F077 completed: Huya Moka observation organized

- Grouped all six matching Downloads files. Byte-level group sizes are `1`, `3`, and `2` for three capture timestamps; after excluding only `capturedAt`, all six share semantic SHA-256 `dda0adcb983a36b9299c65dd953343f6be8eb097c78c027826d9c5d6f20da42b`. They therefore count as one independent rendered structure.
- Preserved every Downloads original and copied the latest representative byte-for-byte to `ats-corpus/observations/moka/huya/huya__moka__campus-candidate-resume__2026-08-07T11-19-58-393Z.json`. Source and staged files are both 24,097 bytes and share SHA-256 `e1becd7004fc4b564b0135c82273c19bcf82fd17c2227841446444888f8898bb`.
- The staged observation identifies `https://app.mokahr.com/campus_apply/huya/:id`, reports 71 raw controls, 2 detected sections, and 68 controls with extracted semantics. Its four privacy declarations are false and the prohibited-key audit found no raw values, selected state, authentication data, file metadata, local paths, or DOM/session identifiers.
- `npm run corpus:import -- ats-corpus/observations/moka/huya/huya__moka__campus-candidate-resume__2026-08-07T11-19-58-393Z.json --dry-run` exited 0. It correctly retained the payload's current `generic-html` / `unknown` classification, so this staging change does not claim that a Moka detector or template exists.
- Updated `ats-corpus/observations/README.md` with the explicit 虎牙/Moka path, provenance digest, duplicate handling, validation boundary, and link to the independent 9-group / 41-logical-field ground truth. The 71 raw DOM controls are explicitly not treated as 71 logical fields.
- `npm run verify:corpus` exited 0. Final `npm run validate` exited 0 with TypeScript, 44 test files / 381 tests, corpus verification, production build, 13-file distribution verification, permission checks, and developer-collector exclusion.

### F077 changed files and handoff

- Added observation: `ats-corpus/observations/moka/huya/huya__moka__campus-candidate-resume__2026-08-07T11-19-58-393Z.json`.
- Updated index and harness state: `ats-corpus/observations/README.md`, `feature_list.json`, and `progress.md`.
- F077 is complete. This is a developer-data organization milestone with no user-visible runtime change, so E2E and a new screenshot were not required. The next recommended implementation is a Moka family detector and default template driven by the independent Huya ground truth, followed by a recapture that should report `moka` and a concrete resume page type.
- No commit or push was performed.

## 2026-08-07 — F079 kickoff: generic kernel + Feishu Recruiting adapter

- Read `feature_list.json`, `progress.md`, and the complete `long-running-agent-harness` skill instructions.
- Ran `./init.ps1 -SkipInstall`; the baseline `npm run validate` passed with TypeScript, 44 test files / 381 tests, corpus verification, production build, 13 distribution files, permission checks, and no developer collector in the production bundle.
- Split the requested milestone into F079–F081 so module separation, execution wiring, and user-visible regression evidence remain independently recoverable.
- Current scope is F079 only: move generic HTML and Feishu Recruiting family knowledge behind ATS adapter modules, replacing the Xiaomi-specific family identity without changing final-submit or sensitive-field safety behavior.

### F079 completion and F080 kickoff

- Added `src/ats/adapters/generic.ts` and the `src/ats/adapters/feishu/` detector/template module. The family id is now `feishu-recruiting`; no Xiaomi-specific family id remains in ATS runtime code or tests.
- Moved default composition to `src/ats/defaultRuntime.ts`; `AtsMatchingRuntime` now receives detector and template registries explicitly and contains no concrete family imports.
- Added detector regression coverage for Xiaomi, NIO, MetaApp, Anker, Hesai, marker evidence, HTTPS enforcement, unrelated origins, and suffix lookalikes.
- `npm test -- --run src/ats` passed: 10 files / 45 tests. `npx tsc --noEmit`, JSON parsing, and `git diff --check` passed; line-ending warnings were informational.
- F080 is now in progress: route template driver/verification metadata and repeatable rules through the generic content kernel.

### F080 completion and F081 kickoff

- `PageControlAdapterRegistry` can now resolve an exact template-requested driver. `writeControlVerified` rejects incompatible drivers and non-verifying strategies before mutation, retains the two-attempt bound, and still requires adapter readback for every success.
- `fillPage` passes family `driverHint` and `verification` metadata through the generic write boundary; saved field corrections retain control-driver evidence while overriding only the profile path.
- Moved repeatable group keys to the domain layer. The Feishu template now owns record path aliases, section/add/record/save selectors, allowed labels, and creation limits.
- Reworked generic repeatable scanning, creation, and save lifecycle code to consume the resolved template. Production content code has no Xiaomi/Mioffice/Feishu-specific repeatable branch or adapter id.
- Focused F080 verification passed: 14 test files / 84 tests, TypeScript, feature ledger parsing, and `git diff --check`. The explicit source audit reported no company/family-specific repeatable branches in non-test `src/content` code.
- F081 is now in progress: document the boundary, run the full validation/E2E suites, and record a fresh milestone screenshot.

### F081 completion and handoff

- Added `docs/generic-kernel-feishu-adapter.md` and linked it from the README. It separates generic execution responsibilities from Feishu family knowledge and explicitly says public Schema/anonymous observations do not prove every authenticated page can be filled.
- Cross-tenant detector tests cover Xiaomi, NIO, MetaApp, Anker, and Hesai URL shapes plus unrelated, lookalike, and non-HTTPS fallback. Runtime tests cover deterministic mappings, sensitive confirmation, saved corrections, driver incompatibility, selects, date periods, repeatable creation/save, and final-submit exclusion.
- The first `npm run test:e2e` attempt used four workers: 6 tests completed, then the local Vite server exited and 23 tests failed, mostly with `ERR_CONNECTION_REFUSED`. An isolated single-worker run proved the directly related controls/Xiaomi/repeatable tests were healthy and exposed one intentional behavior change: lifecycle reporting now includes all six groups, producing 7 saved records plus 3 verified records that require no save.
- Updated the repeatable E2E assertion to require exactly those 10 successful lifecycle results and zero stopped records. Set Playwright to one worker so the required command is deterministic in the current development environment.
- Final `npm run test:e2e` passed 29/29 in 3.0 minutes. It refreshed `artifacts/repeatable-records.png` at 2026-08-07 21:23:20; visual inspection confirmed two education rows, two internship rows, three project rows, work sample/award/language rows, saved state where required, and a visible but untouched final-submit control.
- Final `npm run validate` passed: TypeScript, 45 test files / 393 tests, corpus verification, production build, 13 required distribution files, exact permission audit, and development-collector exclusion. `git diff --check` passed with only line-ending warnings; feature JSON parsed; no legacy `xiaomi-feishu`/`xiaomi-recruitment` id remains; Feishu adapter definitions contain no page action.

Changed files for F079–F081:

- ATS composition and family modules: `src/ats/adapters/generic.ts`, `src/ats/adapters/feishu/{detector,index,template}.ts`, `src/ats/defaultTemplates.ts`, `src/ats/defaultRuntime.ts`, `src/ats/matchingRuntime.ts`, `src/ats/templateContracts.ts`, and `src/ats/templateRegistry.ts` plus focused tests.
- Generic execution: `src/content/{engine,pageDriver,repeatableRecords,repeatableLifecycle}.ts`, `src/content/controlAdapters/registry.ts`, `src/domain/repeatableGroups.ts`, and focused tests.
- Regression harness and docs: `src/fixture/repeatable-main.ts`, `repeatable-fixture.html`, `tests/e2e/repeatable-records.spec.ts`, `playwright.config.ts`, `README.md`, `docs/generic-kernel-feishu-adapter.md`, `feature_list.json`, and `progress.md`.

No commit or push was performed. There is no blocker for F079–F081. The repository still has the pre-existing F039 browser-action feature marked `in_progress`; reconcile or complete that ledger item before starting another implementation slice. After that, the recommended product validation is a user-triggered, no-submit canary on one authenticated Feishu application page, followed by a separate Moka family adapter rather than company-specific branches.

## 2026-08-07 — F082 kickoff: pre-K5 root-worktree checkpoint

- Re-read `feature_list.json`, `progress.md`, repository instructions, and the complete `long-running-agent-harness` skill. Ran `./init.ps1 -SkipInstall`; validation passed with TypeScript, 45 test files / 393 tests, corpus verification, production build, 13 distribution files, exact permission checks, and developer-collector exclusion.
- Confirmed the root worktree is `agent/ats-observation-core` at `2d8cd61`, while K2–K5 use separate worktrees. F039 remains owned by K2 and will not be altered here.
- The K5 worktree already contains uncommitted `src/adapter-sdk` files plus its own feature/progress edits. This root task will not copy, edit, stage, or commit anything from K5; F083 waits for a clean, explicitly frozen K5 checkpoint.
- Registered F082–F084. Current scope is F082 only: inventory, privacy/secret audit, full validation, deterministic E2E, and a local pre-K5 checkpoint commit with no push.

### F082 pre-commit audit and verification evidence

- Added `scripts/audit-pre-k5-checkpoint.mjs`, exposed as `npm run audit:pre-k5-checkpoint`, and documented the boundary in `docs/pre-k5-root-checkpoint-audit.md`. The report is path-only on failure and never prints matched values. `--compare-staged` requires the exact audited candidate set to be staged before a commit.
- The final pre-stage inventory contains 201 candidate paths / 2132854 bytes with manifest SHA-256 `39bcb4ef288a3496cd83250a6aadc5972f25446324ed12a25eb4c9b5694483dd`: 67 tracked changes, zero tracked deletions, and 134 untracked files. Intended-role counts are 89 extension source/test files, 25 ATS corpus/evidence files, 22 E2E/fixture files, 22 acceptance/architecture documents, 19 scripts, 12 design-prototype files, 5 configuration files, 3 policy/entry documents, 2 harness ledgers, 1 evaluation file, and 1 local E2E fixture.
- The candidate audit found zero high-confidence credentials/private keys/tokens, local absolute user paths, files over 1 MiB, unexpected binaries, symbolic links/reparse points, or ignored outputs. The only binary candidates are the three allowlisted Epilogue `.woff2` assets. Eight local/build entries remain ignored: `.chrome-autofill-profile/`, `.chromium-autofill-profile/`, `.env`, `artifacts/`, `dist-collector/`, `dist/`, `node_modules/`, and `test-results/`.
- Observation audit covers 4 active structures plus 5 explicitly excluded Huya duplicates. MetaApp, NIO, Huya, and all five duplicates pass the current schema/privacy validator. The historical Xiaomi file remains the one expected fail-closed `schema-invalid` staging artifact because it predates required `sections` and `summary.sectionCount`; its four privacy attestations remain false, the forbidden-key/personal-value audit passes, and it is not a corpus sample. This preserves the existing F047 limitation instead of mislabeling old evidence as current-schema ground truth.
- `npm run verify:corpus` passed with zero promoted samples, and `npm test -- --run src/ats` passed 10 files / 45 tests. The path-specific Xiaomi quality command exited 1 with the expected `schema-invalid` code and printed no captured values; dry-run import results were 8 current-schema passes and the same one expected legacy rejection.
- Final `npm run validate` passed TypeScript, 45 test files / 393 tests, corpus verification, production build, 13 required distribution files, exact browser permissions, forbidden-permission absence, and production collector exclusion. Final `npm run test:e2e` passed 29/29 with one worker in 2.8 minutes. An earlier wrapper attempt was terminated by an accidental five-second tool timeout before completion; the full rerun above is the acceptance result.
- `feature_list.json` parsed and the final diff checks exited 0. The staged check first caught two extra EOF blank lines and one Markdown trailing-space line; those three formatting defects were removed before committing. The tracked diff contains 67 paths, 4,526 insertions, and 845 deletions, with no file deletion. Before staging, remote refs hashed to `55fff0e997814ec32a7c9c9852fbd0fe0f2324a80afaf7cc1dca242aa35a58d9`; this digest will be compared again after the local commits to prove that no push occurred.
- The current Feishu execution shape is explicitly documented as a pre-K5 prototype: its CSS selectors, `feishu-select`, and `feishu-date-range` ids are reference behavior only and are not the frozen adapter contract. F083 remains `todo` until K5 supplies a clean, identified SDK commit.

### F082 completion and handoff

- Created the audited local checkpoint commit `c7c24f8f432e5e7eb2e5a91666f2cfed85faf49b` (`checkpoint: preserve pre-k5 ATS autofill prototype`) on `agent/ats-observation-core`. It contains all 201 audited paths, and the worktree was clean immediately after the commit.
- No file was deleted, no stash/rebase was performed, and no other worktree was modified. The remote-ref digest remained `55fff0e997814ec32a7c9c9852fbd0fe0f2324a80afaf7cc1dca242aa35a58d9`, matching the pre-stage value; no push occurred.
- F082-specific additions are `scripts/audit-pre-k5-checkpoint.mjs`, its package command, `docs/pre-k5-root-checkpoint-audit.md`, and the F082–F084 harness entries/evidence. The audit now reads all repository observation JSON files even when the worktree is clean, while candidate path/count/size checks still operate against the current `HEAD` diff.
- F082 is done. F083 is intentionally not started: its first acceptance condition requires a clean, explicitly frozen K5 adapter-sdk commit. Until K5 provides that commit id, this branch must not copy or conform to the uncommitted SDK draft.
## 2026-08-12 - F085 零浏览器扩展秋招 Agent PRD 与验证基线

- 按 `long-running-agent-harness` 和仓库 Resume protocol 恢复了工程状态：读取 `feature_list.json`、`progress.md` 与现有 browser-kernel/真实页验证文档，并在依赖已存在时运行 `./init.ps1 -SkipInstall`。
- 初始化验证退出码为 0：TypeScript 通过，45 个测试文件 / 393 个测试通过，ATS corpus 校验通过，生产构建通过，13 个分发文件和当前扩展权限审计通过。
- 新增 `docs/prd-zero-extension-recruitment-agent.md`。产品决策是“Electron 本机桌面 Agent + 独立求职 Chrome/Edge profile + 内部 CDP transport”，正式产品不再要求安装浏览器扩展，也不承诺接管默认 Chrome profile。
- PRD 定义了 15 个端到端用户步骤，每一步都包含系统行为、可观察完成标准和验证办法；定义 E0-E5 证据等级，并规定只有用户授权的真实招聘页非提交写入与回读 E4 才能证明该页面可用。模拟/复制招聘页不能作为小米、飞书、Moka 等站点支持证据。
- 字段评测口径已固定：字段分母来自独立真实页人工标注，不由程序扫描结果自证；每个字段必须得到唯一终态，明确区分 `profile_missing`、`write_failed`、`unsupported_control`、`ambiguous_review`、敏感确认、人工验证、文件确认、条件不适用、站点规则阻断和用户接管。
- 目标指标包括字段盘点率 100%、每页可自动填覆盖率至少 90%、每页验证写入成功率至少 95%、总体至少 98%、映射正确率至少 98%，以及错误写入、重复记录、凭证读取、验证码绕过、未确认敏感动作和最终提交全部为 0。
- 在 `feature_list.json` 追加 F085-F095 共 11 个可恢复节点：PRD、零扩展浏览器、类型化内核、桌面岗位/批次、全字段审核、小米 E4、Feishu 五公司、非 Feishu 三页面、五岗位恢复、BOSS 有界沟通、桌面发布与扩展退役。BOSS F094 是独立可选能力，不阻塞表单 MVP F095。
- 结构验证退出码为 0：`feature_list.json` 共 96 个 feature，F085-F095 共 11 个节点，ID 唯一、依赖均存在，且每个节点具有状态、验收、验证和 notes；PRD 的 12 个必需章节和 15 个可验证用户步骤全部存在。
- `git diff --check -- feature_list.json docs/prd-zero-extension-recruitment-agent.md` 退出码为 0，仅报告 Windows 工作区预期的 LF-to-CRLF 提示。
- 最终 `npm run validate` 退出码为 0：TypeScript 通过；45 个测试文件 / 393 个测试通过；ATS corpus 验证为 0 个 promoted sample；生产构建通过；13 个分发文件、精确扩展权限、禁止权限缺失和开发 collector 排除检查通过。
- 本节点只改产品文档和持久任务账本，没有修改产品运行代码、扩展权限、真实页面、用户档案或浏览器配置；因此不需要新的用户可见 E2E 或截图。工作区中原有的 `AGENTS.md` 修改及 `deployment-recovery/`、`dist-collector-backup-f043-20260808-184942/` 未跟踪目录均未改动。

### F085 changed files and handoff

- PRD：`docs/prd-zero-extension-recruitment-agent.md`。
- 路线图：`feature_list.json` 中的 F085-F095。
- 证据与交接：本 `progress.md` 节。
- F085 的文档、任务清单和验证证据现已完成。下一推荐节点为 F086：在不安装扩展、不访问默认 Chrome profile 的前提下，建立 Electron 开发入口、独立求职 profile、动态 loopback CDP 会话和真实小米 URL 的 E2 只读启动证据。
## 2026-08-12 - F096 AI-first MCP 多 Agent 与仅真实网页验证计划

- 按 `long-running-agent-harness` 和仓库 Resume protocol 恢复根工作树，读取 `feature_list.json`、`progress.md`、零扩展 PRD、browser-kernel 交付计划、ATS ground truth/observation 索引，并运行 `./init.ps1 -SkipInstall`。根 Agent 的初始化命令退出码为 0，验证通过 45 个测试文件 / 393 个测试、ATS corpus、生产构建和 13 个分发文件审计。
- 用户明确要求多个子 Agent。本轮并行派出三个只读规划 Agent，分别负责真实页评测、AI/MCP/Node CDP 架构、以及多 worktree 交付。三个 Agent 均未修改文件、未访问或写入真实招聘页面；根 Agent 统一处理了结论差异。
- 发现根账本对 F039-F043 的状态已经陈旧，而隔离 worktree 和 origin 分支显示 K2 `f52e8e1`、K3 `f760551`、K4 `29776d7`、K5 `6d5f163`、F043 `4d39144` 均已完成并推送。F043 的脱敏报告记录旧扩展/K5 路径在小米、虎牙、携程的 17/17 普通字段验证、0 wrong-control 和 0 禁止动作。该证据只作为迁移基线，不能证明零扩展 Node CDP、Codex MCP、AI 无模板、当前八站或全字段审核。
- 新增 `docs/ai-first-mcp-real-page-multi-agent-plan.md`。MVP 改成 Node/CLI-first：`Codex/Claude Skill -> MCP stdio -> Local Application Service -> AI planner + policy compiler -> typed browser kernel -> Node CDP -> 独立 Chrome/Edge profile`。桌面/Web 工作台继续复用同一服务，但不阻塞首个 Codex MVP。
- 无模板边界已固定：AI 只提交 `fieldRef -> profilePath/terminal decision`，不能提交值、selector、XPath、坐标、脚本或 raw CDP；真实 AI-first 运行必须记录 `plannerSource=ai` 和 `legacyFieldTemplateEnabled=false`。ATS/company ground truth 是独立标注与漂移参照，不是运行前提。
- 浏览器验收 allowlist 冻结为八个已留存真实页面：小米、MetaApp、蔚来、安克、禾赛、虎牙、联想、携程。公开契约合计 243 个历史字段定义，但每次 E3 必须按当前页面、条件、步骤和重复记录重新冻结 reachable field instances。任何新建、复制、下载或托管的模拟招聘网页均不得用于新 feature 的浏览器验收、完成门或支持宣称。
- 纯协议、schema、策略、状态机、数据库、幂等和指标可以使用结构化对象单测；现有 fixture/模拟页只能保留为 legacy primitive regression，不得计入 MVP 指标。新开发不得新增模拟招聘网页。
- 多 Agent 组织固定为 Coordinator/Integrator、Browser Platform、AI/Application、Independent Annotation/Judge 四个角色；每一波根 Agent + 最多三个子 Agent。真实登录 profile 只允许一个 Execution Agent 串行占用，字段分母由独立标注 Agent和用户冻结，Judge 离线复算，执行者不能更改分母或自报通过。
- 将项目目标更新为完全本地的 MCP/CLI/Web 求职工作台，并调整 F086/F087/F089/F091/F092/F095 依赖与说明。追加 F096-F100：计划、基线收敛、AI planner/policy、MCP/Application/Skill、八站独立 Annotation/Judge。首个实现门为 F097，之后 F086/F098/F100 可由三个子 Agent 并行；F099 依赖 F087+F098，F090 才进入小米 AI-first 零扩展真实写入。
- Feature/DAG 检查退出码为 0：`feature_list.json` 共 101 个节点；F096-F100 ID 唯一，全部依赖存在，且每项具备状态、验收、验证和 notes。计划审计确认 11 个必需章节、8 个真实站点和 6 个 MCP 工具全部存在。
- `git diff --check -- feature_list.json docs/ai-first-mcp-real-page-multi-agent-plan.md` 退出码为 0，仅有 Windows 工作区预期的 LF-to-CRLF 提示。
- 最终 `npm run validate` 退出码为 0：TypeScript 通过，45 个测试文件 / 393 个测试通过，ATS corpus 校验通过，生产构建通过，13 个分发文件、当前精确权限、禁止权限缺失和开发 collector 排除审计通过。
- 本节点仅修改文档和持久任务账本，没有修改产品运行代码、浏览器、真实页面、用户档案或授权状态。未运行 legacy 模拟招聘页 E2E，也未生成新的截图，以免把模拟或旧扩展证据误记成新 MVP 证据。原有 `AGENTS.md` 修改和两个未跟踪恢复目录未触碰。

### F096 changed files and handoff

- 多 Agent 实施计划：`docs/ai-first-mcp-real-page-multi-agent-plan.md`。
- 项目目标、依赖和 F096-F100：`feature_list.json`。
- 本次验证与交接：本 `progress.md` 节。
- F096 完成。下一推荐节点是 Coordinator-only 的 F097：审计并收敛已完成的 K2-K5/F043 分支、PR、commit 和证据，创建干净 `zeroext-mvp-base`。F097 通过后，同时启动三个独立 worktree：B/F086 Node CDP runtime、A/F098 AI planner/policy、Q/F100 Annotation/Judge。

## 2026-08-12 - F097 零扩展集成基线审计启动

- 按仓库恢复协议再次运行 `./init.ps1 -SkipInstall`，退出码为 0：TypeScript 通过，45 个测试文件 / 393 个测试通过，ATS corpus 校验通过，生产构建和 13 个分发文件审计通过。
- F039-F043 的固定分支形成严格祖先链，五个隔离 worktree 均干净且各自 feature 状态为 `done`：K2 `f52e8e1`、K3 `f760551`、K4 `29776d7`、K5 `6d5f163`、F043 `4d39144`。本地 head 与对应 origin ref 全部一致。
- GitHub Draft PR 元数据已核对：#4 K2 基于 K1、#5 K3 基于 K2、#6 K4 基于 K3、#7 K5 基于 K4、#8 F043 基于 K5；五个 PR 均为 OPEN Draft，head OID 与隔离 worktree 完全一致。
- 历史 F043 只证明旧扩展/K5 路径在当次小米、虎牙、携程普通字段分母上 17/17 非提交写入；它不证明 Node CDP、MCP、AI-first、当前页面、完整字段或八站支持，集成后必须继续保留这一证据限制。
- F097 记录集成分支 `agent/zeroext-mvp-base`，基线 `agent/ats-observation-core`。根工作区中的用户 `AGENTS.md` 修改和两个恢复目录不纳入 checkpoint；F085/F096 文档与账本先作为一个作用域明确的计划 checkpoint 提交，再在独立 worktree 收敛 F043。
