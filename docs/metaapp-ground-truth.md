# MetaApp application ground truth

## Scope

- Public application URL supplied by the developer: `https://meta.jobs.feishu.cn/140297/resume/:id/apply`.
- Evidence source: server-rendered `js-websiteInfo.website_info.resume_form_schema`, version 8.
- Snapshot date: 2026-08-07.
- Current visible denominator: 4 groups and 13 logical fields.
- Normalized artifact: `ats-corpus/ground-truth/feishu-recruiting/metaapp/metaapp__campus-application__v1.json`.

This is independent structural ground truth. It is not derived from the extension scanner. Hidden schema objects are excluded because they are not configured as part of this application form.

## Visible inventory

| Group | Group behavior | Visible fields |
| --- | --- | --- |
| 简历 | required, non-repeatable | 简历附件 |
| 基本信息 | required, non-repeatable | 姓名、手机号码、邮箱、国籍（地区） |
| 教育经历 | required, repeatable | 学校名称、学历、专业、起止时间 |
| 实习经历 | optional, repeatable | 公司名称、职位名称、起止时间、描述 |

The public schema marks the education group as required while its four child fields are individually optional. The same distinction is retained instead of inferring stronger child requirements.

## Evidence boundary

The public HTML and public job-detail GET endpoint were read without authentication. No browser instance was available for an authenticated rendered-DOM observation, so this evidence does not prove actual control count, iframe/shadow placement, option captions, add/save behavior, validation messages, or fill success. No login, form write, attachment upload, or final submission was performed.

Run `npm run audit:metaapp` to compare the current public schema and job title with the reviewed snapshot. A later private anonymous observation should be audited against this denominator before it is imported as an ATS corpus sample.
