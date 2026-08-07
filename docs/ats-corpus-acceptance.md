# ATS corpus foundation acceptance

## Objective

F045 establishes a durable, developer-owned corpus boundary before any browser collector or concrete ATS adapter exists. A downloaded F044 observation can be validated, wrapped with empty annotations, placed deterministically in the repository, reviewed later, and reverified without storing personal data or changing the production extension.

## Trust boundary

The input file is untrusted even when the developer created it. Import is fail-closed and must finish all size, JSON Schema, privacy, source, summary, annotation, placement, duplicate, and conflict checks before creating a target directory or file.

The allowed output root is `ats-corpus/samples/<normalized-family>/`. No command in F045 reads a browser tab, writes outside the configured corpus root, overwrites an existing sample, opens a network connection, or sends telemetry.

## Acceptance gates

### C1 — Exact versioned contract

- `ats-corpus/schema/ats-corpus-sample-v1.schema.json` uses JSON Schema 2020-12 and rejects unknown properties at every object boundary.
- It includes the complete F044 observation plus developer-only annotations for review status/time, reviewed family, canonical field, section, allowlisted behaviors, expected action, fixed driver, verification method, and bounded notes.
- Observation controls and annotations are bounded to 1,000 entries; text, options, behavior lists, evidence, and identifiers have explicit limits and allowlists.

### C2 — Privacy before persistence

- Input is one explicitly named regular JSON file of at most 1,000,000 bytes.
- Personal email, phone and identity values; credentials; Cookie material; URLs outside the exact source Origin; query values; local paths; encoded payloads; and long tokens cause rejection.
- Source Origin is credential-free HTTPS only. Source paths contain no query or fragment and use templates instead of raw numeric, UUID, or opaque identifiers.
- Privacy attestations must remain false. Counts and annotation/control-key correspondence must be exact.
- Validation errors disclose only a bounded JSON location/category, never the rejected value.

### C3 — Deterministic, non-destructive import

- Raw F044 observations are wrapped as `unreviewed`; safe obvious structural behaviors may be pre-annotated, while canonical fields and developer judgments remain empty.
- SHA-256 is computed over anonymous structural metadata, not a resume or user file. Capture time, capture-tool version, family inference, and annotations do not affect the structural digest.
- The target is `samples/<resolved-family>/<page-type>-<digest-prefix>.json` and cannot escape the corpus root.
- Reimporting the same structure and annotations is a no-op even if capture time/tool version changed.
- The same structure with different annotations is a review conflict. An existing target is never overwritten.

### C4 — Whole-corpus verification

- Every JSON sample is schema-validated and privacy-audited again.
- Every file must match its deterministic family directory and filename.
- Duplicate structural digests, symbolic links, nested directories, non-JSON files inside family directories, invalid families, more than 2,000 samples, or more than 20,000,000 total bytes fail verification.
- `npm run validate` includes `npm run verify:corpus`.

### C5 — Capability exclusion

F045 contains no browser collector, side-panel button, production entry point, extension storage, Chrome/debugger API, DOM selector, page read/write, site login, concrete Moka/Beisen detector, field template, HTTP client, telemetry, upload, CAPTCHA handling, or application-submission behavior. Manifest permissions remain unchanged.

## Verification

Run:

```powershell
npm test -- --run src/ats/corpusImport.test.ts
npm run verify:corpus
npm run typecheck
npm run validate
```

Then parse `feature_list.json`, run `git diff --check`, inspect the production build for corpus tooling, and statically scan the new scripts for browser/network/page-action capabilities.

F045 is complete only after exact results and changed files are recorded in `progress.md`. The next feature is a compile-time-excluded developer collector; live ATS samples and family adapters remain later nodes.
