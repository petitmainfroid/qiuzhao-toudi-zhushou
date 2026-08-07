# Company-indexed downloaded ATS observations

This is a non-production staging area for the developer's downloaded, privacy-safe structural observations. Company identity is explicit in the directory, filename, and index below. Representative files were verified byte-for-byte against their generic-named Downloads sources before those sources were moved into this project on 2026-08-07. Redundant downloads are isolated below `_duplicate-downloads/` and are not active samples.

These observations are **not reviewed training samples**. A file becomes usable corpus data only after current-schema validation, independent ground-truth comparison, control annotation, and import into `ats-corpus/samples/`.

## Company index

| Company | ATS family | Origin and normalized path | Captured structure | Staging file | Validation status | Independent ground truth |
| --- | --- | --- | --- | --- | --- | --- |
| 蔚来（NIO） | Feishu Recruiting | `https://nio.jobs.feishu.cn/index/resume/:id/apply` | 5 detected sections, 27 raw controls | `feishu-recruiting/nio/nio__feishu-recruiting__application__2026-08-07T10-54-06-155Z.json` | Privacy audit passed; current corpus schema dry-run passed. Scanner result still needs comparison with the independent 7-group/27-field denominator. | `../ground-truth/nio-feishu-senior-llm-algorithm-application-v1.json` |
| MetaApp | Feishu Recruiting | `https://meta.jobs.feishu.cn/:id/resume/:id/apply` | 4 detected sections, 279 raw controls | `feishu-recruiting/metaapp/metaapp__feishu-recruiting__application__2026-08-07T09-57-27-998Z.json` | Privacy audit passed; current corpus schema dry-run passed. Raw controls include standalone option nodes and must not be treated as logical fields. | `../ground-truth/feishu-recruiting/metaapp/metaapp__campus-application__v1.json` |
| 虎牙（Huya） | Moka (classified from `app.mokahr.com` tenant path; detector pending) | `https://app.mokahr.com/campus_apply/huya/:id` | 2 detected sections, 71 raw controls; 68 have extracted semantics | `moka/huya/huya__moka__campus-candidate-resume__2026-08-07T11-19-58-393Z.json` | Privacy audit and current corpus-schema dry-run passed. The export still reports `generic-html` / `unknown`; it must not be promoted to Moka runtime support until a detector/template is implemented. Six matching downloads represent one semantic structure, not six independent samples. | `../ground-truth/moka/huya/huya__campus-candidate-resume__v1.json` |
| 小米 | Feishu-related Mioffice host | `https://xiaomi.jobs.f.mioffice.cn/internship/resume/:id/apply` | 57 raw controls; legacy export has no top-level section list | `feishu-recruiting/xiaomi/xiaomi__feishu-recruiting__internship-application__2026-08-07T03-06-38-397Z.json` | Privacy audit passed; legacy format predates required `sections` and `summary.sectionCount`, so current corpus import is intentionally blocked until recaptured or explicitly migrated. | `../ground-truth/feishu-recruiting/xiaomi/xiaomi__internship-application__v1.json` |

## Byte-for-byte provenance

| Company | Bytes | SHA-256 |
| --- | ---: | --- |
| 蔚来（NIO） | 10,382 | `592f2c6d455927d38182f701a8581ef1925a281607aa7ec16c642fe0ca0e0cb1` |
| MetaApp | 89,499 | `8a86994740f2cf5a3814371e62ae181aaf25e25b60ff6c5deb2f12b1c5071fb7` |
| 虎牙（Huya） | 24,097 | `e1becd7004fc4b564b0135c82273c19bcf82fd17c2227841446444888f8898bb` |
| 小米 | 19,002 | `1c8173e03f10eaea0cff6b6ef8eec45ebb058e8c8fe54a55212c8bc4495aa0c9` |

Each digest matched its original generic-named file before the move. No local source path is embedded in this index or any observation JSON, and no `ats-observation-*.json` export remains in Downloads.

## Privacy review

All four observations declare:

- `currentValuesIncluded: false`
- `sessionReferencesIncluded: false`
- `queryValuesIncluded: false`
- `fileMetadataIncluded: false`

The organization audit also found no raw value/checked/selected keys, passwords, cookies, authorization tokens, recruitment upload filenames, local paths, DOM/CDP/session ids, seven-or-more-digit values, or email addresses in the JSON payloads.

## Duplicate handling

The Huya download set contained six files from three capture timestamps (`11:19:24.231Z`, `11:19:39.809Z`, and `11:19:58.393Z`). The middle timestamp was downloaded three times and the latest twice. Their byte hashes differ only where `capturedAt` differs; after excluding that timestamp, all six share semantic SHA-256 `dda0adcb983a36b9299c65dd953343f6be8eb097c78c027826d9c5d6f20da42b`. Only the latest representative is active in the company index; the other five moved files are preserved under `_duplicate-downloads/moka/huya/` and explicitly excluded from sample counts and import workflows.

The authenticated observation is scanner evidence, not ground truth. Its 71 raw DOM controls include navigation links, action buttons, date fragments, and repeated-record controls, so that number is not directly comparable to the independently established Huya contract of 9 groups and 41 logical fields.
