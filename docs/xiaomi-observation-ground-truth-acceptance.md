# Xiaomi observation ground-truth acceptance

## Purpose

F047 closes the gap exposed by the first private authenticated Xiaomi observation. Matching K1 and JSON raw-control counts proves only that export preserved scanner output. It does not prove that the scanner found every logical field, section, custom control, option, required marker, or safety boundary.

## Independent denominators

The public `tests/fixtures/xiaomi-internship-schema.json` snapshot is refreshed by the read-only `npm run audit:xiaomi` command and independently defines:

- 9 logical form groups.
- 34 visible logical field definitions.
- Expected field labels, technical names, types, required flags, and repeatability.

The private authenticated page contributes only local, non-committed runtime evidence: K1 raw controls/frames and the downloaded observation. Personal values, filenames, dates selected by the user, cookies, credentials, queries, DOM/CDP identifiers, screenshots, and raw HTML never become ground truth or repository fixtures.

## Required metrics

The audit reports these separately:

1. Raw export preservation: JSON controls versus the K1 count supplied by the developer.
2. Section recall: observed stable section evidence versus 9 schema groups.
3. Logical field recall: distinct observed stable labels/technical names versus 34 schema fields, with repeated rows deduplicated.
4. Semantic coverage: controls with at least one stable label, ARIA label, placeholder, normalized technical name, nearby label text, or section.
5. Required evidence coverage and accuracy where the DOM exposes a stable required marker.
6. Option evidence coverage for controls whose options are statically present; a closed async popup is reported as unavailable rather than fabricated.
7. Safety coverage: credential, verification, identity, file, and final-submit controls are never ordinary.
8. Privacy: zero current values, selected display dates, filenames/upload status, timestamps, paths, queries, credentials, raw page payloads, or session/DOM/CDP references.

## Fail-closed rules

- A privacy finding always blocks preview download and corpus import.
- A final-submit-looking control classified as ordinary always blocks download/import.
- Missing section or field evidence makes the sample incomplete; a matching raw count cannot override it.
- Unnamed controls are reported with role/type/count only. The audit never echoes rejected semantic text.
- A private legacy observation may be read for local diagnosis but is never copied, rewritten, committed, screenshotted, or uploaded.

## Completion gate

Synthetic tests must reproduce every failure shape without personal data. After the implementation passes unit, build, production-isolation, and browser regressions, the developer reloads `dist-collector` and performs one explicit new capture. Only a local report that rejects the legacy file, accepts the new file, reconciles raw counts, reports 9/9 sections, explains logical-field gaps, and contains zero private values can complete F047.
