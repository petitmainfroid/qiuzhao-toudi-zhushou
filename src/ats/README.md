# ATS observation core

This folder is the read-only boundary between the privacy-safe browser state and future ATS corpus/adapters.

## Responsibilities

- Define a versioned, shareable ATS observation contract.
- Remove session snapshots and opaque control references.
- Template identifiers in page paths and redact bounded semantic metadata.
- Select a family through a deterministic, pluggable detector registry.
- Fail closed when a report contains values, credentials, raw HTML, selectors, browser internals, file metadata, personal identifiers, or inconsistent counts.
- Define human ground-truth annotations separately from observations.

## Non-responsibilities

- No DOM or CDP access.
- No browser storage, network calls, telemetry, upload, or automatic sharing.
- No click, type, selection, navigation, file attachment, or final submission.
- No concrete Moka, Beisen, Dayee, Feishu, Greenhouse, or other site adapter in F044.
- No runtime LLM classification.

The module consumes `PrivacySafePageState` from K1. F042 may later add concrete recruitment adapters through the stable browser kernel without weakening this export boundary.

Repository corpus persistence is a separate developer-only layer under `ats-corpus/` and `scripts/ats-corpus/`. It consumes audited observations through a bounded local import command; this production-neutral observation module does not import the corpus tooling.
