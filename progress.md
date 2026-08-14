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
