# 安克创新（Anker Innovations）Feishu application ground truth

## Company and scope

- Company: **安克创新**.
- Legal company name: **安克创新科技股份有限公司**.
- English tenant name: **Anker Innovations**.
- Public recruitment origin: `https://anker-in.jobs.feishu.cn`.
- Normalized job-detail path: `/index/position/:id/detail`.
- Normalized application path: `/index/resume/:id/apply`.
- Reviewed job: `AI 业务工程师 — Agent 交付方向 AI Business Engineer (Forward Deployed)`.
- Evidence source: public server-rendered `js-websiteInfo.website_info.resume_form_schema`, version 1.
- Snapshot date: 2026-08-07.
- Current visible denominator: **5 groups / 15 logical fields**.

The normalized company-explicit artifact is `ats-corpus/ground-truth/anker-innovations-feishu-ai-business-engineer-application-v1.json`. It is independent structural ground truth and is not derived from the extension scanner.

## Visible inventory

| Group | Group behavior | Visible fields |
| --- | --- | --- |
| 简历 | required, non-repeatable | 简历附件 |
| 基本信息 | required, non-repeatable | 姓名、手机号码、邮箱 |
| 教育经历 | required, repeatable | 学校名称、学历、专业、起止时间 |
| 工作经历 | optional, repeatable | 公司名称、职位名称、起止时间、描述 |
| 作品 | optional, repeatable | 作品链接、作品附件、描述 |

The public schema marks the 教育经历 group as required while marking each of its four child fields as individually optional. It also marks the 简历 group as required while the child attachment field itself is optional. These flags are preserved exactly rather than being rewritten into a guessed browser-validation rule.

All 15 visible fields are built-in Feishu fields; this schema exposes no visible customized field and no configured custom option list. The artifact does not invent degree options or other catalogs that are absent from the public schema payload.

## Independent evidence

The user supplied a public job-detail URL. Its page title identifies the job and `安克创新科技股份有限公司`; the public payload identifies the tenant as `Anker Innovations`. The corresponding public application path was derived using the same job-post id and returned the same schema version and exact 5/15 inventory. The public job-detail API independently confirmed the complete bilingual job title.

Run `npm run audit:anker` to refetch the detail page, application page, and job-detail endpoint. The audit compares both live schemas with the reviewed snapshot and verifies that the detail and application pages remain structurally identical.

## Evidence boundary

All evidence was read using credential-free GET requests. No browser login, current field value, cookie, token, filename, raw HTML, attachment upload, form write, save, or final application submission is stored in the normalized ground truth.

This evidence verifies the configured server schema, not the authenticated rendered DOM. It does not prove actual control count, iframe/shadow placement, popover behavior, repeatable-record lifecycle, validation messages, fill success, or 安克创新 real-page support. A later developer-triggered anonymous observation must be compared with the independent 5/15 denominator before support can be promoted.
