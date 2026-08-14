# Boss workstream operating guide

This directory is the isolated BossHunter reference and the clean implementation workstream for B001-B011.

1. Read the root `AGENTS.md`, `feature_list.json`, `progress.md`, `boss/README.md`, and the active module README before editing.
2. Work on one B-series feature at a time and record exact verification in `progress.md`.
3. Treat `vendor-bosshunter/` as immutable reference material. Never import it from `apps/`, `modules/`, `gerenxinxi/`, or `shared/`, and never patch it into a distributable product.
4. New product code must be written under the target module named in `module-map.json` and must use the existing `browser-session`, browser kernel, profile service, authorization and audit boundaries.
5. Protocol/object tests prove primitives only. A BOSS site claim requires the retained real page, an independently reviewed denominator and the evidence levels in `REAL_OPERATION_ACCEPTANCE.md`.
6. Never read or store recruitment passwords, Cookies, verification codes or raw page/profile scalar values. Never bypass verification or click a final application submission control.
7. A real external message needs an exact job-scoped, time-bounded user authorization. No authorization can be created or expanded by an Agent.
