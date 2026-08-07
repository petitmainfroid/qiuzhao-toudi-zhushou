# Pre-K5 root-worktree checkpoint audit

This document defines the local checkpoint boundary before the separately owned K5 adapter SDK is frozen. The checkpoint preserves the accumulated ATS observation, corpus, one-click autofill, generic execution, and Feishu prototype work on `agent/ats-observation-core`. It does not merge, copy, or modify another worktree.

## Contract status: prototype only

The current generic-kernel-plus-Feishu implementation is a **pre-K5 prototype**, not the frozen adapter contract. In particular:

- `src/ats/templateContracts.ts` still exposes vendor driver ids such as `feishu-select` and `feishu-date-range`.
- `src/ats/adapters/feishu/template.ts` still contains CSS selectors for repeatable record, section, and save discovery.
- `src/content/pageDriver.ts` still recognizes vendor adapter ids while choosing an execution strategy.

These details are checkpointed only as tested reference behavior. They must not be copied into or treated as requirements for the K5 SDK. After K5 publishes a clean checkpoint, F083 must classify the prototype and produce a selector-free, capability-based assessment. F084 may remove the legacy declarations only after equivalent SDK conformance tests pass.

## Candidate inventory

`npm run audit:pre-k5-checkpoint` computes the candidate set directly from `HEAD`: every tracked addition/change/deletion plus every non-ignored untracked file. It reports path classes, intended roles, extensions, byte totals, large or binary files, symbolic links, ignored-output summaries, and a SHA-256 digest of the sorted path manifest.

The checkpoint candidate is expected to contain these repository roles:

| Role | Reason it belongs in the checkpoint |
| --- | --- |
| Extension source and tests | Preserves the accumulated local-first profile, scan, matching, fill, recovery, and ATS behavior. |
| ATS corpus and reviewed fixtures | Preserves anonymous structures, independently reviewed ground truth, schemas, and duplicate provenance. |
| Audit/build/corpus scripts | Makes the evidence repeatable instead of relying on narrative claims. |
| Acceptance and architecture docs | Records boundaries, denominators, limitations, and handoff decisions. |
| Design prototypes and local fixtures | Preserves the user-visible profile exploration and deterministic browser-test surfaces. |
| Harness ledgers and configuration | Makes the long-running session resumable and pins the commands used for acceptance. |

The exact final counts and manifest digest are recorded in `progress.md` after the final candidate tree is audited.

## Privacy and local-output boundary

The checkpoint audit is deliberately path-only when it reports a finding: it never prints matched values. It rejects high-confidence private-key or credential patterns, local absolute user paths, credential/database file extensions, files over 1 MiB, symbolic links/reparse points, and binary files other than the three repository-owned Epilogue `.woff2` assets.

Generated builds, browser profiles, local environment files, screenshots, reports, and dependency trees remain ignored. In particular, `dist/`, `dist-collector/`, `node_modules/`, `test-results/`, `artifacts/`, `.env`, and the two local browser-profile directories are not checkpoint candidates.

This repository-level scan complements, but does not replace, the stricter ATS payload checks. `npm run verify:corpus`, `npm run audit:xiaomi-observation`, and the ATS unit tests validate schema invariants, privacy attestations, forbidden observation keys, normalized routes, and duplicate handling. No password, authentication cookie, current candidate field value, file name, page HTML, final-submit action, or automated upload is accepted as ATS observation evidence.

## Checkpoint acceptance sequence

1. Run the repository candidate audit and the ATS observation/corpus checks.
2. Run `npm run validate` and `npm run test:e2e` on the same candidate tree.
3. Parse `feature_list.json` and run `git diff --check`.
4. Stage the audited candidate set locally, then run `npm run audit:pre-k5-checkpoint -- --compare-staged` and confirm zero missing or extra paths.
5. Create a local checkpoint commit on `agent/ats-observation-core` and record its commit id in `progress.md`.
6. Compare remote refs captured before and after the operation. Do not push, rebase, stash, delete files, or mutate another worktree.

F083 remains blocked by dependency, not by implementation uncertainty: the K5 worktree currently contains an uncommitted SDK draft. Its files are read-only context until K5 publishes and identifies a stable frozen commit.
