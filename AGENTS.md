# Repository Operating Guide

This repository implements a local-first Chrome/Edge extension that helps autumn-recruitment applicants fill repetitive web forms from one structured profile.

## Resume protocol

At the beginning of every coding session:

1. Read `feature_list.json` and `progress.md`.
2. Run `./init.ps1 -SkipInstall` when dependencies already exist; otherwise run `./init.ps1`.
3. Pick the next unblocked feature, set it to `in_progress`, and keep the change scoped to that feature.
4. Run the feature's listed verification checks.
5. Mark it `done` only after recording exact evidence in `progress.md`.

Before stopping, make sure `feature_list.json` reflects reality and append a handoff section to `progress.md` with changed files, commands, results, blockers, and the next recommended feature.

## Browser-kernel branch checkpoints

For F039–F043, use the exact `branch` and `pr_base` recorded in `feature_list.json`.

1. Start the feature branch from its recorded `pr_base`; do not continue multiple kernel nodes on one branch.
2. Do not mark a node `done` until its listed checks pass and `progress.md` records the exact denominators, results, changed files, branch, commit, and draft PR URL.
3. Stage only files belonging to the node. Run a secret/personal-data scan and `git diff --check` before committing.
4. Push the completed branch to `origin` and open a draft stacked PR against `pr_base`. Never merge, close, or mark a draft ready without the user's request.
5. If real-page evidence is required, follow `docs/browser-kernel-delivery-plan.md`; user authorization and non-submit evidence cannot be replaced by a fixture.

## Multi-agent browser-kernel work

For F039, follow `docs/browser-kernel-k2-multi-agent-plan.md`. Parallel work is allowed only inside the current feature and only with explicit, non-overlapping file ownership.

- The root/integrator exclusively owns shared runtime wiring, package scripts, UI, harness/status files, artifacts, Git, push, and PR operations.
- Child agents must not run Git, global formatters, `init.ps1`, build, validate, full E2E, package, or screenshot commands in the shared workspace. They may run only their assigned targeted checks.
- Build, real-Chrome E2E, screenshots, staging scans, commits, and pushes are serialized by the integrator because they share `dist/`, Chrome state, and artifacts.
- A child agent needing a file outside its lane must request the owner or integrator to make the change. It must not edit across ownership boundaries.
- Any wrong-control write, restricted/destructive/final action, cross-Origin action, third attempt, final submission, or evidence leak is a RED gate: stop integration and keep the feature incomplete.

## Product constraints

- Keep personal information local by default.
- Never store recruitment-site passwords or authentication cookies.
- Never bypass CAPTCHA, SMS verification, or identity checks.
- Never click the final application submission control.
- Require a user gesture before reading or filling the active page.
- Treat identity numbers and other sensitive fields as confirmation-required.
- Prefer deterministic field matching. Semantic/AI matching is a later fallback, not the source of truth.

## Interface direction

Use the Organic frontend anchor consistently: sand `#E8DCC7`, sage `#8B9D83`, clay `#B08B6E`, terracotta `#C66B3D`, ochre `#C08E3A`, and moss `#606C38`; Epilogue typography; 16–32px rounded corners; 1–3% grain; 300–500ms gentle motion. Do not introduce pure white, pure black, cold gray, sharp rectangles, or decorative copy.

## Required verification

Run `npm run validate` before calling a feature complete. User-visible milestones also require `npm run test:e2e` and a current screenshot in `artifacts/`.
