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
