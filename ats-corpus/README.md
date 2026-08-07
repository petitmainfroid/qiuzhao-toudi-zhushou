# ATS corpus

This directory contains developer-owned, privacy-safe structural samples used to build ATS detectors, mapping templates, and anonymous regression fixtures. It is not extension user data and is never populated automatically by a production build.

## Lifecycle

1. The F046 development-only collector converts the current page's `PrivacySafePageState` into an F044 observation; production builds exclude that collector entirely.
2. The developer reviews the privacy preview and downloads one JSON file.
3. `npm run corpus:import -- <downloaded-json>` validates, audits, normalizes, deduplicates, and writes the sample beneath `samples/<family>/`.
4. The developer reviews and edits only the allowlisted `annotations` object in the imported file, including the review timestamp.
5. `npm run verify:corpus` must pass before the sample is retained or used to generate a fixture.

The importer also accepts an already annotated corpus envelope. It never overwrites an existing structural sample; annotation conflicts must be resolved by reviewing the existing repository file.

## Privacy denylist

Never place field values, selected/checked state, passwords, verification answers, identity numbers, email addresses, phone numbers, cookies, authorization data, headers, request/response bodies, URL query values, filenames, local paths, resume content, raw HTML, selectors, DOM/CDP/session identifiers, hashes of user files, or encoded payloads in this directory.

Safe data is limited to bounded labels and option captions, public control types and capabilities, template paths, credential-free HTTPS origins, family evidence, aggregate counts, and explicit developer annotations that contain no personal information.

## Directories

- `ground-truth/`: independent expected page contracts; new multi-family captures are grouped by `<family>/<company>/`, while older reviewed flat artifacts remain unchanged until explicit migration.
- `schema/`: the exact versioned corpus contract.
- `observations/`: company-indexed, byte-identical downloaded structures awaiting review/import; these are staging evidence, not reviewed training samples.
- `samples/`: validated samples grouped by normalized ATS family id.
- `fixtures/`: future anonymous HTML behavior fixtures generated or hand-authored from reviewed samples.
- `templates/`: future reviewed family mapping templates. No profile values belong here.

F045 intentionally ships no live sample, family detector, mapping template, browser collector, network feedback, or page action.
