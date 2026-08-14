# qiuzhao-cli progress

## 2026-08-13 · M001

- Goal: extract the zero-extension Agent path into one maintainable repository without mutating the source repository.
- Source baseline: integration worktree commit `7f703b2`, plus the current F104 profile-editor visual files only. The source repository was not changed by this extraction.
- Included: browser session, browser kernel, application service, MCP server, semantic planner, policy compiler, local profile service/host, shared profile/editor/page primitives, and real-page evaluation contracts.
- Excluded: extension manifest, background/content-script entrypoints, side panel, legacy extension distribution, fixtures as real-site evidence, and the duplicate `packages/browser-runtime` implementation.
- Changed areas: `apps/cli`, `modules`, `gerenxinxi`, `shared`, `tests`, `skills`, root build/verification files, and architecture/status/source-map documentation.
- Verification:
  - `npm run verify:structure`: pass; 11 core entrypoints present and 0 root extension artifacts.
  - `npm run typecheck`: pass.
  - `npm run test:core`: pass; 26/26.
  - `npm run test:modules`: pass; 21 files, 175/175 tests.
  - `npm run profile:build`: pass; local React profile UI and PDF worker emitted.
  - `npm audit`: pass; 0 production or development vulnerabilities after upgrading the extracted repository's test toolchain.
- Privacy/structure audit: no runtime dependency on the source worktree; no extension manifest/background/sidepanel/content entrypoint; no copied runtime profile, session, Cookie, or personal-value files.
- Known blockers: real Xiaomi E3-E5 is still pending a user-authorized real-page run; profile-host PDF persistence/parsing needs its separate regression feature; full installer packaging remains pending.
- Next: run the Xiaomi real-page queue from this extracted tree, then fix only evidence-backed failures without changing the frozen field denominator.

## 2026-08-13 · M006

- Goal: make a PDF selected on the standalone personal-information page survive host/browser restarts without relying on extension storage or the loopback page's changing origin.
- Root cause: the standalone UI did not inject `savedResumeRepository`; the legacy implementation used IndexedDB, whose origin changes with the host's dynamic port; the host had no PDF persistence API.
- Changed areas: `shared/options`, `shared/storage`, `gerenxinxi/profile-host`, `gerenxinxi/profile-service`, `modules/profile-page`, feature/status documentation.
- Implementation: one PDF (maximum 10 MiB) is validated by filename, media type, magic bytes, size and SHA-256; metadata and bytes are protected with Windows CurrentUser DPAPI and atomically stored at the fixed application profile directory. Authenticated loopback GET/PUT/DELETE endpoints require the existing session and mutations require exact Origin plus CSRF. The UI receives metadata only; raw bytes stay server-side and the source file path is never stored.
- Verification:
  - `npm run typecheck`: pass.
  - Targeted profile-host/profile-service tests: pass, 9 files / 29 tests before the final UI integration assertion.
  - `npm run validate`: pass after final changes; structure pass, 26/26 core tests, 22 files / 181 module tests, profile UI production build pass.
  - Production Windows DPAPI byte roundtrip and tamper rejection: pass in the module suite.
  - Persistence evidence: repository re-instantiation recovered the PDF; replacement and deletion passed; encrypted disk envelope contained neither the PDF signature, test payload nor filename.
  - `git diff --check`: pass.
- Initialization note: this extracted repository has no `init.ps1`; `./init.ps1 -SkipInstall` therefore returned command-not-found. Dependencies already existed and the repository's complete `npm run validate` passed.
- Scope boundary: PDF original persistence is complete. Real PDF text extraction/field parsing remains M007 and has not been claimed fixed; automated tests use a minimal synthetic PDF only as a storage primitive, not as real-document parsing or recruitment-site evidence. Recruitment-page attachment upload still requires a separate confirmed workflow.
- Next: validate M007 with a user-selected real PDF in the rebuilt profile host, then fix only the observed parser/resource failure.

### Handoff

- Changed files: `feature_list.json`, `docs/STATUS.md`, `progress.md`, `shared/options/App.tsx`, `shared/storage/savedResumeRepository.ts`, `gerenxinxi/profile-host/**`, `gerenxinxi/profile-service/src/types.ts`, `gerenxinxi/profile-service/src/windowsDpapi.ts`, `gerenxinxi/profile-service/test/windows-dpapi.test.ts`, and `modules/profile-page/cli.mjs`.
- Commands/results: targeted Vitest suite 9/9 files and 29/29 tests pass; final `npm run validate` passes with 26/26 core tests and 181/181 module tests; profile production build passes; forbidden extension/browser storage API scan in the built profile host reports 0; `git diff --check` passes.
- Blockers: no persistence blocker remains. M007 requires a real user-selected PDF and browser-connected parsing observation. The currently running profile host predates this build and must be restarted before manual verification.
- Recommended next feature: M007, after reopening the profile page from this repository.

## 2026-08-13 · M008–M011 harness initialization

- Ordered goal: M008 browser recovery → M009 offline Agent state → M007 real PDF parsing → M010 Xiaomi E3–E5 → M011 final regression/docs.
- Baseline: `main` at `cb17724`; worktree clean before harness edits; dependencies present; the last complete `npm run validate` passed with 26 core tests and 181 module tests.
- Reusable source found: the original repository contains a stale `DevToolsActivePort` cleanup implementation with two failed probes, live-endpoint refusal, link rejection, and compare-before-unlink protection. It has regression tests for stopped-browser relaunch, live endpoint refusal, and concurrent file change.
- Current feature: M008 is `in_progress`. No real-page write is authorized by this harness update; M010 remains gated by the user's explicit lease at execution time.
- Risks: restarting the dedicated recruitment browser can change CDP port and target id; any previous opaque field refs must be invalidated. Real PDF contents and real-page values must not be committed to the repository.
- Next action: port the stale-port cleanup and its tests, then run the browser-session/core verification before starting M009.

## 2026-08-13 · M008 complete

- Changed: `modules/browser-session/browser-session.mjs`, `tests/browser-session.test.mjs`, `tests/fake-browser.mjs`.
- Behavior: launch now rejects link/reparse endpoint files, probes a recorded port twice before treating it as stale, refuses to clean a live endpoint, and compares the file contents before unlinking so a concurrent browser cannot be clobbered. Reconnect treats a dead endpoint as a relaunch condition while still rejecting a live endpoint that does not match the recorded session.
- Verification: `node --test tests/browser-session.test.mjs` passed 9/9; `npm run test:core` passed 28/28. The stopped-browser case specifically left a stale `DevToolsActivePort`, relaunched with the same profile identity, obtained a new nonzero CDP port, and reopened the normalized Xiaomi page identity.
- Next: M009 is `in_progress`; make MCP/ApplicationService startup survive missing or disconnected browser state without relaxing execution safety.

## 2026-08-13 · M009 complete

- Root cause: `ZeroExtensionBrowserKernel` expected `BrowserSessionManager.connection()`, but the production session manager did not implement that contract. Unit tests supplied a fake `connection()` and therefore hid the production-only TypeError. The application service also allowed kernel startup errors to terminate Agent startup.
- Changed: `modules/browser-session/browser-session.mjs`, `modules/browser-kernel/runtime.mjs`, `modules/application-service/application-service.mjs`, and the corresponding browser-session, kernel, application-service, and MCP tests.
- Behavior: the connection contract now exposes only a user-confirmed, currently reachable target bound to launch id, CDP port, target id, normalized origin, and path. Offline startup returns one recovery action; inspect/plan/execute fail closed until ready; an application-level disconnect automatically reattaches to a still-live dedicated browser.
- Verification: browser-session tests passed 10/10; focused application/kernel/MCP tests passed 20/20; `npm run test:core` passed 34/34; `git diff --check` passed. A clean isolated `LOCALAPPDATA` returned `browser.state=stopped`, `errorCode=session_missing`, and `qiuzhao browser launch --url <招聘网页>` with exit code 0. The live Xiaomi session returned `browser.state=ready`; after `browser disconnect`, the next `agent status` automatically restored ready state on the same normalized page identity.
- Safety: no page write, scalar read, Cookie read, CAPTCHA action, sensitive-field action, or final submit occurred. A selector audit found no company/Feishu-specific selector coupling.
- Next: M007 is `in_progress`; reproduce the parser failure against the locally encrypted user PDF and fix the production resource/parser path before Xiaomi E3–E5.

## 2026-08-14 · M007 complete

- Root cause: the standalone browser build could not reliably execute the PDF worker/resource path, and the saved PDF bytes had no server-side parser connected to the encrypted resume repository.
- Changed: added `gerenxinxi/resume-parser/**`; connected authenticated `POST /api/resume/parse` through profile-host and `SavedResumeRepositoryLike.parseSaved`; made the UI merge only empty fields and preserve every existing non-empty field; bundled Node-side `pdfjs-dist` through a file-backed content-addressed cache.
- Real PDF private evidence: one user-selected, encrypted local PDF parsed as one page and 1,210 extracted characters, produced 22 populated structured paths, imported 8 empty scalar fields plus 6 repeatable records on first merge, imported 0 on replay, survived a fresh process/repository reload, and auto-imported 0 identity fields. Neither raw text, filename, bytes nor scalar values entered repository evidence.
- Verification: parser/profile-host/editor targeted tests passed; final `npm run validate` passed with 36/36 core and 188/188 module tests plus production UI build. Public evidence: `artifacts/real-pdf-parse-manifest.json`.
- Scope: OCR-required/scanned PDFs remain a typed manual case; recruitment-page attachment upload remains confirmation-required.

## 2026-08-14 · M010 complete with E3 review caveat

- Real target: current logged-in Xiaomi campus recruitment page at normalized `/internship/resume/:id/apply`; no fixture, copied HTML, company template or extension was used.
- E3: two consecutive read-only observations were stable at 54 raw controls, 45 reachable logical fields, 41 ordinary fields, 4 protected fields and 6 excluded add actions; structure hash `51faffc749c26ee00b4a6358808fef5e2fe6f7b135b74c6df125933d8d2eac64`. This remains a candidate until an independent human freezes it.
- E4: an origin/profile-version-bound ordinary lease created exactly two unsaved internship records and verified three ordinary text writes through Boolean readback, one attempt each. Two language-select attempts returned typed `option_not_found`; no wrong control was modified. No save, attachment, consent, identity, CAPTCHA or final-submit action was executed.
- E5: the dedicated browser was stopped and reconnected with the same profile and retained login state. Unsaved DOM records correctly disappeared after restart; the Agent rebuilt exactly two records and the same three populated fields without creating a third record. A final 51-field application audit assigned one terminal conclusion per field: 17 review-required and 34 manual-required; the idempotent pass made 0 writes and preserved the 51-field/8-internship-field counts.
- Generalization: removed all `.atsx-*`, `.ud-*`, `resumeEditForm`, `createFormSection`, `fixedFeishu`, Feishu driver-hint and company-specific selector dependencies. Repeatable grouping now uses headings, field signatures, ARIA/data attributes and structural ancestry; one nested browser control produces one opaque field ref.
- Privacy/safety: public evidence contains no values, raw DOM, Cookie, query id or filled-page screenshot. The only screenshot is a crop of consent/final-submit controls proving the safety boundary; both remained untouched. Public evidence: `artifacts/xiaomi-e3-e5-manifest.json` and `artifacts/xiaomi-non-submit-safety-controls.png`.

## 2026-08-14 · M011 complete

- `npm run validate`: pass in 138.7s; structure 12/12, root extension artifacts 0, TypeScript pass, core 36/36, modules 23 files and 188/188 tests, profile production build pass.
- MCP: the core suite completed real JSON-RPC initialize/list/call coverage for exactly six closed tools and verified offline discoverability; no authorization, selector, raw CDP, Cookie or submit tool is exposed.
- Static selector audit: 0 matches for `.atsx-*`, `.ud-*`, `fixedFeishu`, `resumeEditForm`, `formOperate`, `createFormSection`, `feishu-select`, or `feishu-date-range` under production and test TypeScript/JavaScript sources.
- `git diff --check`: pass apart from informational Windows LF→CRLF notices. Temporary ordinary-field authorization was revoked after evidence collection.
- Remaining product work is outside this request: independent human freeze of Xiaomi E3, other real ATS pages, OCR for image-only PDFs, packaging/installer and clean-machine release acceptance.

### Handoff

- Changed areas: `modules/browser-session`, `modules/browser-kernel`, `modules/application-service`, `modules/policy-compiler`, `gerenxinxi/resume-parser`, `gerenxinxi/profile-host`, `shared/bridge`, `shared/content`, `shared/matching`, `shared/options`, tests, artifacts and status ledgers.
- Commands/results: targeted browser/application/MCP/parser/page-driver tests passed; real Xiaomi E3/E4/E5 executed without final submit; `npm run validate` passed 36 core + 188 module tests; selector scan and `git diff --check` passed.
- Blockers: none for the requested reconnect/offline/PDF/Xiaomi non-submit MVP. Independent human E3 approval remains required before claiming a frozen external ground truth, and other ATS families remain unverified.
- Recommended next feature: package this exact verified baseline, or run the same E3→E5 queue serially on one additional real ATS page without changing the Xiaomi denominator.
