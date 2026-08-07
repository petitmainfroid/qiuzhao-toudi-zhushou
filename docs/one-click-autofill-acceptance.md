# One-click automatic filling acceptance

## Product outcome

The ordinary user sees one primary action: `自动填写当前页面`. Scanning, deterministic matching, repeatable preparation, selection-plan construction, writing, and readback verification are internal stages of that action. The interface does not expose developer-oriented State/Find, connection, scan, or per-safe-field selection steps.

## Required workflow

1. The user opens an editable recruitment application page and explicitly clicks `自动填写当前页面`.
2. The extension reads the current page only after that gesture, loads the local profile and site corrections, and reports a bounded progress stage.
3. Where the existing reviewed adapter identifies one safe add control, missing repeatable records are created with bounded mutation checks and the page is rescanned.
4. Empty, high-confidence, non-sensitive matches are placed in the safe plan.
5. Sensitive, conflicting, unreadable, and non-high-confidence matches are grouped into one confirmation surface and are not preselected.
6. With no exceptions, the safe plan is written immediately and each write is read back. With exceptions, one continue action writes the safe plan plus only explicitly selected exceptions.
7. The result reports filled, skipped, already-equal, unsupported, and repeatable-created counts. The user checks the recruitment page and performs final submission personally.

## Safety and privacy invariants

- No password, OTP/SMS/email verification code, CAPTCHA, authentication cookie, hidden control, file input, or final-submit control enters the automatic plan.
- Current conflicting page values are compared in the content boundary but never returned to or displayed by the side panel.
- Identity and other sensitive profile values stay masked in previews and always require explicit confirmation.
- Resume attachment remains a separate file/destination/digest authorization and is never included in the one-click safe plan.
- Page navigation, changed mappings, stale conflict snapshots, missing controls, unsupported options, and failed readback stop or skip safely with typed outcomes.
- The implementation includes no OfferLink code, assets, private endpoints, account/quota logic, cloud resume sync, or broadening of permissions.

## Deterministic verification matrix

| Case | Expected evidence |
| --- | --- |
| Safe-only form | One click performs scan and verified fill; no confirmation surface appears. |
| Sensitive/medium/conflict fields | One concentrated confirmation surface appears; exceptions start unselected. |
| Continue without exceptions | Safe fields fill; unselected exceptions remain untouched. |
| Explicit conflict confirmation | Conflict token is forwarded and stale page changes are rejected. |
| Missing repeatable records | Unique supported add controls run with bounded waits, then rescan precedes filling. |
| Ambiguous/unsupported records or controls | Existing safe fields may fill; unsupported items appear only in the final summary/details. |
| Resume file candidate | No file transfer occurs until the separate destination confirmation. |
| Submit/CAPTCHA/password trap | Values and click counters remain unchanged. |
| Write/readback failure | Result counts the skip and gives an actionable retry without claiming success. |
| Production UI | No `扫描当前页面`, `重新扫描`, `State / Find`, or connection card is rendered. |

## Commands and artifacts

- `npm test -- --run src/sidepanel/autoFillWorkflow.test.ts src/sidepanel/SidePanel.test.tsx src/sidepanel/SidePanel.repeatable.test.tsx`
- `npm run validate`
- `npm run test:e2e`
- Inspect `artifacts/one-click-autofill.png`; it must use the Organic visual system and contain synthetic data only.
- Parse `feature_list.json`, run `git diff --check`, and statically check the production source/build for OfferLink bundle paths, remote API additions, final-submit actions, and removed scan/State/Find production UI strings.
