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
