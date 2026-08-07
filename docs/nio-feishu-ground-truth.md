# 蔚来（NIO）Feishu application ground truth

## Company and scope

- Company: **蔚来（NIO）**.
- Public application origin: `https://nio.jobs.feishu.cn`.
- Normalized application path: `/index/resume/:id/apply`.
- Reviewed job: `资深大语言模型算法（上海）`.
- Evidence source: public server-rendered `js-websiteInfo.website_info.resume_form_schema`, version 1.
- Snapshot date: 2026-08-07.
- Current visible denominator: **7 groups / 27 logical fields**.

The normalized company-explicit artifact is `ats-corpus/ground-truth/nio-feishu-senior-llm-algorithm-application-v1.json`. It is independent structural ground truth and is not derived from the extension scanner.

## Visible inventory

| Group | Group behavior | Visible fields |
| --- | --- | --- |
| 简历 | required, non-repeatable | 简历附件 |
| 基本信息 | required, non-repeatable | 姓名、手机号码、邮箱、工作年限、所在地点、期望工作地点、预计入职时间 |
| 教育经历 | required, repeatable | 学校名称、学历、专业、起止时间 |
| 工作经历 | optional group, repeatable | 公司名称、职位名称、起止时间、描述 |
| 项目经历 | optional group, repeatable | 项目名称、项目角色、起止时间、项目链接、描述 |
| 自我评价 | optional, non-repeatable | 自我评价 |
| 申请信息 | optional custom group, schema marks repeatable | 期望年薪、近 6 个月是否面试过其他 NIO 岗位、是否曾就职于 NIO、肯定回答的具体描述、是否有亲属就职于 NIO |

The source schema marks fields inside the optional 工作经历 group as individually required. This distinction is retained exactly: adding a work record makes its company, title, and date range required even though the group itself is optional. The source also marks the custom 申请信息 group as repeatable; the artifact preserves that observed flag rather than guessing the rendered behavior.

## Custom fields and choices

Seven visible fields are configured as customized by the public schema:

- 预计入职时间
- 自我评价
- 期望年薪
- 是否面试过其他NIO岗位（近6个月内）
- 是否曾经就职于NIO
- 如上述问题选择“是”，请具体描述
- 是否有亲属（包括但不限于直系亲属）就职于NIO

The three custom select questions each expose the exact configured captions `是` and `否`. Public built-in location, preferred-location, and degree option catalogs are not embedded in this schema, so this ground truth does not invent their option lists.

## Evidence boundary

The application HTML and job-detail endpoint were read using credential-free GET requests. No browser login, current field value, cookie, token, filename, raw HTML, attachment upload, form write, save, or final application submission is stored in the normalized ground truth.

This evidence verifies the configured application schema, not the authenticated rendered DOM. It does not yet prove actual control count, iframe/shadow placement, option popover behavior, add/save behavior, validation messages, fill success, or NIO real-page support. A later developer-triggered anonymous observation must be compared with the independent 7/27 denominator before support can be promoted.

Run `npm run audit:nio` to refetch the public schema and job title and compare them with the reviewed source snapshot.
