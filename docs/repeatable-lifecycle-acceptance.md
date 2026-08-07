# Repeatable add-fill-save-verify lifecycle acceptance

## Supported scope

This lifecycle is enabled only for the reviewed Xiaomi recruitment repeatable adapter and its local synthetic fixture. It covers education, internship/work-experience and project record cards. Other pages retain verified field filling but do not receive guessed save-button clicks.

Within one user-started automatic-fill workflow:

1. Missing records are added one at a time with the existing count/index mutation guard.
2. The page is rescanned after each attempted group preparation.
3. Record fields are filled through verified control adapters.
4. Filled fields are grouped by their record-local root and read back.
5. At most one exact record-local `保存` or `完成` control may be clicked.
6. The lifecycle waits for a bounded saved-state mutation and reads every written field again.
7. A second run is idempotent: equal fields do not write or save again.

## Stop conditions

- navigation changed;
- structure/add/save fingerprint changed;
- add or save control is missing, disabled or ambiguous where required;
- mutation timeout;
- record value readback failed;
- creation limit reached.

Every stop is typed and reported. No selector can match `提交`, `投递`, `申请`, `submit`, `apply`, a submit-type button, a final-submit container, a delete control, or a page-global button.

## Verification

- `npm test -- --run src/content/repeatableRecords.test.ts src/content/repeatableLifecycle.test.ts src/content/engine.test.ts`
- `npm run validate`
- `npm run test:e2e -- --grep "repeatable records"`
- Inspect `artifacts/repeatable-records.png`: education, internship and project cards show `已保存`; delete counts and the visible final-submit counter remain zero.
