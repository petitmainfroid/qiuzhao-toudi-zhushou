# Resume field coverage audit

## Scope and privacy

This audit covers the five local PDF resumes identified only by the short SHA-256 digests already recorded for F012. Source files stayed in the user's Downloads folder. Filenames, raw text, rendered pages, and personal field values were not copied into the repository.

Each PDF was visually reviewed page by page. A local browser diagnostic then compared four stages:

1. fields visibly present and supported by the current profile schema;
2. non-empty deterministic parser paths;
3. the same paths after merging into an empty profile;
4. labelled controls populated through the normal resume-upload editor flow.

An expected field is counted only when the value is visually evidenced and representable without invention. Empty optional fields are not failures when the source omits them or the schema cannot represent their precision.

## Final field coverage

| Digest | Pages | Education | Work | Projects | Awards | Expected supported fields | Parsed | Preserved after merge | Placed in labelled UI control | Missing | Leakage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `4FFDB2FC` | 1 | 2 | 0 | 1 | 1 | 17 | 17 | 17 | 17 | 0 | 0 |
| `5A12C901` | 2 | 2 | 1 | 2 | 3 | 32 | 32 | 32 | 32 | 0 | 0 |
| `E5A6ADD6` | 2 | 1 | 1 | 5 | 6 | 44 | 44 | 44 | 44 | 0 | 0 |
| `06B46FDE` | 3 | 2 | 4 | 4 | 2 | 56 | 56 | 56 | 56 | 0 | 0 |
| `BC238C94` | 1 | 2 | 0 | 2 | 5 | 30 | 30 | 30 | 30 | 0 | 0 |

The expected inventory includes every visually clear, schema-supported non-empty field across basic information, education, work, projects, work samples, awards, languages, job preference, skills, and self-evaluation. Work and project records were additionally checked for record order, organization/name, role when explicitly present, month-precision dates when present, description, outcome, and neighboring-section leakage.

## Placement evidence

An audit-only browser test uploaded each of the five digest-identified PDFs through the existing options-page control, reconstructed its populated parser paths from an anonymous in-memory file, and compared every non-empty value with the value of its exact labelled editor control. All 179 expected fields were placed; the privacy-sensitive audit spec was deleted after the run.

The permanent browser upload regression uses an actual generated DOCX and the existing options-page upload control. It asserts two education records, two work records, and two project records by their individual repeat-card positions and labelled controls. Company, role, dates, descriptions, project name, project outcome, and record order are checked before save. The test also proves that:

- imported values remain unsaved until the user clicks **保存档案**;
- an existing non-empty city remains unchanged;
- no separate parsing-result page is created;
- the source filename, raw-only marker, and identity number are absent from storage;
- no external request occurs during parsing.

The current `artifacts/resume-import.png` was captured from this multi-record browser flow and shows the populated existing editor.

## Evidence-bound exclusions

- A birth value shown only to year-month precision is not converted to the schema's full-date field because inventing a day would be unsafe.
- `至今`/`现在` leaves the month input's end date empty; the schema has no “current” sentinel and no end month should be fabricated.
- CET scores prove a language, but are not translated into conversational proficiency choices without evidence.
- Education type, department, role, outcome, and links remain empty when the source does not explicitly support them.
- A later “推免” education record does not borrow a `本科` token from neighboring award prose; trailing undergraduate GPA/ranking stays on the evidenced undergraduate record.

## Defects corrected by F013

- Normalized Unicode compatibility glyphs before matching, including PDF variants of common Chinese characters.
- Accepted spaced Chinese year/month ranges and wrapped date rows.
- Read split degree and major metadata while preventing later prose from contaminating the degree.
- Preserved spaces in Latin names while still joining spaced Chinese glyphs.
- Extracted project author/participant roles and `论文成果`/`研究成果` outcome labels.
- Kept right-aligned award results on their visual row and grouped narrative competition descriptions into one record instead of one record per text line.
- Stabilized accessible control names so repeatable values can be verified against the exact destination labels.

## F023 corpus expansion

The 2026-08-05 refresh found six additional layouts, bringing the current Downloads corpus to ten PDFs and one DOCX. The five new PDFs were visually reviewed across all nine pages. The DOCX was checked through its complete OOXML paragraph/list order and the real browser DOCX extraction path; Word, LibreOffice, and the packaged visual renderer were unavailable on this machine, so original DOCX pagination/layout was not claimed as visual evidence.

The table below reports non-empty schema paths rather than personal values. “Before” is the released F013 parser; “After” is the F023 parser. Record counts were checked against the visible/structural source sections. Real filenames, raw text, values, and rendered pages remain outside the repository.

| Digest | Format/pages | Before paths | After paths | Education | Work | Projects | Awards | Languages |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `2EA7842E` | PDF / 2 | 23 | 28 | 2 | 2 | 3 | 0 | 0 |
| `317CA5B2` | PDF / 2 | 40 | 45 | 3 | 0 | 5 | 4 | 2 |
| `6EA82132` | DOCX | 20 | 23 | 2 | 1 | 1 | 0 | 2 |
| `74F1E5AC` | PDF / 2 | 5 | 28 | 3 | 4 | 0 | 5 | 0 |
| `79636754` | PDF / 1 | 14 | 26 | 2 | 0 | 5 | 0 | 0 |
| `EA62283F` | PDF / 2 | 29 | 34 | 2 | 1 | 4 | 0 | 1 |

Aggregate mapped-path coverage for the six newly discovered layouts increased from 131 to 184 (+53). The audit-only digest scripts were deleted after use. The permanent synthetic E2E regression parses 3 education records, 2 internships, 3 projects, and 2 languages, creates the missing recruitment-form rows, fills 23 matched controls, and proves zero delete and zero final-submit clicks.

### Defects corrected by F023

- Added section boundaries for in-school research, project results, open-source contributions, technical skills, personal/research summaries, publications, conferences, extracurricular activities, and other terminal sections.
- Preserved year-only education and internships without fabricating a month; recognized explicitly evidenced expected-admission months.
- Read degree/major details split onto the next line, including direct-PhD wording, without borrowing degree words from awards or prose.
- Split undated Chinese research/project entries after completed descriptions and stopped publications, conferences, and extracurricular activities from leaking into projects.
- Parsed labelled or `+`-prefixed international phone numbers and inline job preferences.
- Parsed multiple languages on one line, including explicit `母语`, `熟练`, and `流利` evidence, while retaining the existing no-inference rule for bare CET scores.
- Reassembled cross-line semicolon/comma/acronym award lists into distinct records only inside an evidenced award section.
- Removed role text from company values in year-only internships before those values reach webpage controls.
