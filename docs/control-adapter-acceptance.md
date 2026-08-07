# Verified page-control adapter acceptance

## Outcome

All ordinary field mutations use one registry of deterministic adapters. The registry resolves exactly one adapter before writing, and every adapter exposes four explicit boundaries: `canHandle`, `read`, `write`, and `verify`.

Routing order is intentionally specific-to-general:

1. Feishu date range
2. Feishu/UD select
3. Ant select
4. Element select
5. framework-neutral ARIA combobox
6. native input, textarea, select, radio, and contenteditable

## Safety invariants

- Detached, hidden, disabled, read-only, password, file, checkbox, submit/reset/button/image, button-contained, and semantic submit-like controls are rejected before adapter routing.
- Options must match exactly after normalization. Missing or ambiguous options never fall back to free text.
- Typed search text is not accepted as selected state; framework selects require an explicit selected marker or ARIA selected value.
- Writes use at most two attempts. Option and verification waits are bounded.
- Every successful result is based on adapter readback; event dispatch alone is never success.
- Failure results contain only typed reasons and counts, never rejected page values.
- The registry does not navigate, delete records, upload files, access credentials, or click final submission.

## Verification

- `npm test -- --run src/content`
- `npm run validate`
- `npm run test:e2e -- --grep "complex controls|Xiaomi"`
- Inspect the adapter fixtures for native, Feishu/UD, Ant, Element and generic ARIA routing, missing-option failure, visible date-range verification and pre-routing safety rejection.
