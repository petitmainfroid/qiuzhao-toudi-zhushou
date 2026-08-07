# Xiaomi-based ATS collector acceptance

## Objective

F046 proves that the developer can deliberately collect a privacy-safe ATS observation shaped by Xiaomi's current recruitment form, preview it, download it, and validate it through F045 without exposing the collector to production users or touching an application.

This is collector acceptance, not Xiaomi/Feishu adapter acceptance. The result remains `generic-html` until a separately reviewed family detector exists.

## Current public Xiaomi baseline

Checked read-only on 2026-08-06:

- Public internship entry: `https://xiaomi.jobs.f.mioffice.cn/internship`.
- Public application route used by the existing schema audit: `https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply`.
- Unauthenticated rendered access exposes the login boundary rather than a fillable authenticated application.
- `npm run audit:xiaomi` confirms 9 schema groups and 34 visible fields from the public page payload and job endpoint, with no submission request.

The URL and job identifier are freshness inputs for the existing read-only audit only. They must not appear in the anonymous E2E export, corpus sample, screenshot, or collector UI evidence.

## Acceptance levels

### X0 — Live public freshness, read-only

- `npm run audit:xiaomi` returns exactly 9 groups and 34 visible schema fields.
- The internship and application pages remain credential-free HTTPS origins.
- Unauthenticated rendering shows the login boundary.
- No login, Cookie import, password, SMS code, privacy-consent click, authenticated capture, form write, attachment, or submission occurs.
- Failure at this level means the public Xiaomi baseline changed; it does not authorize broader access.

### X1 — Explicit developer gesture

- The collector performs no session start, page read, timer, polling, or download before the developer clicks `采集匿名结构`.
- One click starts or reuses the existing bounded K0/K1 session and calls only `POWER_PAGE_STATE` through `PowerSessionBridge`.
- A second explicit click is required to create the local JSON download.
- An inactive, changed-Origin, expired, unsafe, or privacy-rejected page fails closed with a generic message that does not echo rejected content.

### X2 — Xiaomi-derived structural coverage

The anonymous HTTPS fixture represents all nine public schema groups:

1. Resume attachment.
2. Basic information.
3. Education.
4. Internship.
5. Work samples.
6. Projects.
7. Awards.
8. Languages.
9. Self-evaluation.

It exposes at least 34 field controls and covers text/number, native select, custom combobox, multi-select, textarea, month/date-range pairs, repeatable technical names, file inputs, identity, and final-submit classifications. The downloaded observation must retain bounded labels, roles, input types, options, required/multiple flags, boundaries, safety classes, and templated source metadata needed for later human annotation.

### X3 — Zero-leak export

The observation and visible screenshot must contain zero:

- Current input values, including the fixture's synthetic name, phone, email, age, and identity value.
- Query values or the raw numeric job identifier.
- Snapshot IDs, opaque references, selectors, DOM/CDP IDs, raw HTML, or event payloads.
- Cookie, Authorization, headers/bodies, login data, local paths, filenames, file bytes/digests, or encoded payloads.
- Page writes, upload attempts, final-submit clicks, or network feedback.

The observation privacy attestation remains all false, the fixture final-submit counter remains zero, and the downloaded JSON passes `importAtsCorpusSample(..., { dryRun: true })` without creating a corpus file.

### X4 — Preview and download behavior

- The preview shows safe Origin, templated path, detector result/confidence, control/blocked counts, the first 12 anonymous field summaries, and an expandable complete JSON preview.
- The collector never silently downloads. The download uses a Blob/object URL after confirmation and needs no `downloads` permission.
- The extension does not store the observation in `chrome.storage`, copy it to the clipboard, write it to the repository, or upload it. Repository persistence still requires the F045 developer import command.

### X5 — Compile-time distribution isolation

- `npm run build:collector` creates `dist-collector/` using the dedicated side-panel entry and unique `QIUZHAO_ATS_COLLECTOR_DEV_ONLY_V1` marker.
- `npm run verify:collector` proves the collector marker/UI exists and Manifest permissions are exactly unchanged.
- Normal `npm run build` uses the production side-panel entry. `npm run verify:dist` recursively rejects the marker and collector UI strings.
- Production source has no import of the collector entry from non-test runtime modules. Production packaging continues to consume only `dist/`; `dist-collector/` is ignored.

## Verification commands

```powershell
npm run audit:xiaomi
npm test -- --run src/devtools/ats-collector src/foundation.test.ts
npm run build:collector
npm run verify:collector
npm run validate
npm run test:e2e
```

Visually inspect `artifacts/xiaomi-ats-collector.png`: it must show only the anonymous `xiaomi-fixture.example.test` preview, templated path, generic detector result, counts, and structural labels. It must not contain a real Xiaomi page, profile value, login data, or filled form.

## Non-goals

- No concrete Xiaomi, Feishu, Moka, or Beisen detector.
- No family mapping template or generated behavior adapter.
- No real authenticated sample committed to `ats-corpus/`.
- No automatic sharing, telemetry, server endpoint, or end-user feedback flow.
- No application fill or final submission.
