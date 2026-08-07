# ATS observation core acceptance

## Objective

Create a standalone, privacy-safe foundation that turns the existing K1 page state into a versioned ATS observation suitable for local review, human annotation, clustering, and anonymous fixture generation. This node does not expose a user-facing export button and does not implement a site-specific adapter.

## Trust boundary

The input is the already allowlisted `PrivacySafePageState`. The public output contains only a credential-free HTTPS Origin, templated pathname, normalized ATS identity, sequential anonymous control keys, bounded semantic metadata, boolean capabilities, boundary type, safety classification, and derived counts.

The output must never contain current or previous control values, selected/checked state, session snapshot IDs, opaque control references, raw HTML, arbitrary selectors, DOM/CDP node IDs, query values, Cookie or authorization material, request/response data, file metadata, local paths, encoded payloads, or real applicant identifiers.

## Acceptance gates

1. `src/ats` is independently importable and has no UI, storage, debugger, page-action, or site-specific dependency.
2. Family detectors receive only the sanitized observation source, sanitized controls, and bounded sanitized markers. Invalid or failing detectors cannot block generic fallback.
3. Path identifiers are templated and all public text is bounded and redacted before detector or export use.
4. The runtime audit validates exact object keys, unions, counts, unique anonymous control keys, privacy attestations, and personal/credential patterns.
5. Human ground truth is a separate contract so an unreviewed observation cannot be mistaken for a labeled training example.
6. Targeted unit tests, TypeScript, and the repository-wide validation pass without a permission or distribution change.

## Completion evidence

- `npm test -- --run src/ats`
- `npm run typecheck`
- `npm run validate`
- Parse `feature_list.json` and inspect `git diff --check`.
- Review the module import graph and diff for any page mutation, network, storage, upload, or submission capability.
