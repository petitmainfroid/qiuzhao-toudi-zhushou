# Lenovo Talent resume component ground truth

## Scope

- User-supplied route: `https://talent.lenovo.com.cn/account/resume`.
- Snapshot date: 2026-08-07.
- Production frontend build observed in public assets: `v0.0.2`.
- Ground-truth surface: PC resume editor implemented with Element Plus controls.
- Denominator: 7 sections, 55 profile fields, 2 workflow confirmation controls, 15 remote option sets, and 1 static yes/no option set.
- Normalized artifact: `ats-corpus/ground-truth/lenovo-talent/lenovo/lenovo__candidate-resume-editor__v1.json`.

The unauthenticated route returns the Lenovo account-login shell. That shell is not resume evidence. No connected browser instance was available, so this snapshot is deliberately limited to the credential-free production component chunks, their validation and conditional branches, the resume API-family declarations, and `GET /gateway/sysDict/all`.

## Component inventory

| Section | Behavior | Profile fields |
| --- | --- | ---: |
| 上传简历 | optional section; save requires one attachment and confirmation | 2 |
| 个人信息 | required, non-repeatable; contains one sensitive composite identity control | 17 |
| 教育经历 | required, repeatable; bachelor-through-highest constraint | 9 |
| 实习经历 | required answer, repeatable details when “是” | 7 |
| 项目经验 | required answer, repeatable details when “是” | 6 |
| 技能/爱好 | required, with three optional nested repeatable tables | 10 |
| 其他 | required information channel, referral code, conditional other-source field | 4 |

The two workflow controls under 上传简历 are not counted as profile fields: `confirmAnalysis` requests parsing, while `confirmBtn` acknowledges the upload editor before save.

## Why this page is structurally friendly to deterministic filling

The editor exposes more than visible captions:

- Stable technical model names such as `surname`, `universityName`, `depatureDate`, and `informationChannell` are wired directly to Element Plus inputs.
- Required state is defined by component validation maps rather than inferred only from red stars.
- Repeated education, internship, and project records have separate list/add/update/delete API families.
- Selects reference named dictionaries such as `city_portal`, `education`, `industry`, and `InformationChannel`; the public dictionary response provides labels and stable numeric values.
- Conditional fields are driven by explicit values: job adjustment, internship/project presence, and other source (`18`). The referral-code input is rendered unconditionally.
- Month controls declare `YYYY/MM`, end-date constraints, and record-local save/delete behavior.

These properties explain why a site-specific adapter can outperform generic label similarity. The normalized artifact preserves the observed spellings `depatureDate`, `projectIntrodution`, and `informationChannell`, because silently correcting them would break exact matching.

## Important anomalies

- The PC country control carries a boolean `multiple` attribute even though its model and the mobile component represent a single country. This is recorded as observed component behavior, not normalized away.
- The identity control is composite: one form item labelled 个人证件 contains a certificate-type select and certificate-number input. A later re-verification state renders `certificateTypeNew` and `certificateNoNew`; these are variants of the same logical identity field, not extra profile fields.
- The mobile component exposes only 个人信息、教育经历、其他 and tells the user to continue on the PC site for the remaining resume information. This snapshot therefore does not claim PC/mobile parity.

## Evidence boundary and safety

The artifacts contain labels, technical names, control kinds, required and conditional metadata, attachment constraints, API path markers, and option-set digests only. They contain no candidate values, identity number, account id, cookie, token, redirect state, raw HTML, filename, or authenticated response.

The audit performs only public GET requests for the page shell, versioned JavaScript chunks, and dictionaries. It never calls resume read/write endpoints, never logs in, never uploads a file, never clicks save, and never submits an application.

Run `npm run audit:lenovo` to refetch the current public assets, parse the PC component, compare the 55-field denominator, verify API-family markers, and hash all 15 referenced remote option sets.

An authorized, value-redacted browser observation is still required to prove real DOM wrappers, current visibility, add/save transitions, popover behavior, and actual fill success.
