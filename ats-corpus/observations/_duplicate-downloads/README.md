# Excluded duplicate ATS downloads

This directory preserves downloaded files that are byte-identical or semantically identical to a company-indexed representative observation. It is an audit archive, not a corpus input.

Rules:

- Do not count these files as independent websites, pages, observations, training samples, or coverage evidence.
- Do not import them into `ats-corpus/samples/`.
- Keep company, ATS family, page type, capture timestamp, and duplicate status explicit in each filename.
- A file may leave this archive only if a structural comparison proves that it contains independently useful evidence.

## Huya Moka archive

All five files below resolve to the same rendered structure as `../../moka/huya/huya__moka__campus-candidate-resume__2026-08-07T11-19-58-393Z.json` after excluding `capturedAt`.

| Archived filename | Bytes | SHA-256 | Reason excluded |
| --- | ---: | --- | --- |
| `moka/huya/huya__moka__campus-candidate-resume__2026-08-07T11-19-24-231Z__semantic-duplicate.json` | 24,097 | `62c8802c4c933725fbeb065f50883751e673c79ef2232abf0bd0b5b086f74327` | Same structure; earlier capture timestamp only |
| `moka/huya/huya__moka__campus-candidate-resume__2026-08-07T11-19-39-809Z__duplicate-01.json` | 24,097 | `ad4ebf141d18717fb0f1887752d48fb3d9b7ddaaf46a7fd7aa3482c71a3541e5` | Same structure; repeated download |
| `moka/huya/huya__moka__campus-candidate-resume__2026-08-07T11-19-39-809Z__duplicate-02.json` | 24,097 | `ad4ebf141d18717fb0f1887752d48fb3d9b7ddaaf46a7fd7aa3482c71a3541e5` | Byte-identical repeated download |
| `moka/huya/huya__moka__campus-candidate-resume__2026-08-07T11-19-39-809Z__duplicate-03.json` | 24,097 | `ad4ebf141d18717fb0f1887752d48fb3d9b7ddaaf46a7fd7aa3482c71a3541e5` | Byte-identical repeated download |
| `moka/huya/huya__moka__campus-candidate-resume__2026-08-07T11-19-58-393Z__duplicate-01.json` | 24,097 | `e1becd7004fc4b564b0135c82273c19bcf82fd17c2227841446444888f8898bb` | Byte-identical to active representative |

The generic browser-download names were removed only by moving their contents into the company-classified representative or this archive. No observation payload was discarded.
