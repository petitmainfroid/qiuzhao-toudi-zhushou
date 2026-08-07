# 禾赛科技 Feishu application ground truth

## Company and scope

- Company: **禾赛科技**.
- Legal company name: **上海禾赛科技有限公司**.
- Public application origin: `https://kwh0jtf778.jobs.feishu.cn`.
- Normalized application path: `/index/resume/:id/apply`.
- Reviewed job: `设备工程师（嘉定）`.
- Evidence source: public server-rendered `js-websiteInfo.website_info.resume_form_schema`, version 1.
- Snapshot date: 2026-08-07.
- Current visible denominator: **10 groups / 30 logical fields**.

The normalized, company-explicit artifact is `ats-corpus/ground-truth/hesai-feishu-equipment-engineer-jiading-application-v1.json`. The company is written in plaintext in its filename context, structured `company` metadata, and this document. This artifact is independent structural ground truth and is not derived from the extension scanner.

## Visible inventory

| Group | Group behavior | Visible fields |
| --- | --- | --- |
| 简历 | required, non-repeatable | 简历附件 |
| 基本信息 | required, non-repeatable | 姓名、手机号码、邮箱 |
| 教育经历 | required, repeatable | 学校名称、学历、专业、起止时间 |
| 工作经历 | optional group, repeatable | 公司名称、职位名称、起止时间、描述 |
| 实习经历 | optional group, repeatable | 公司名称、职位名称、起止时间、描述 |
| 项目经历 | optional group, repeatable | 项目名称、项目角色、起止时间、项目链接、描述 |
| 作品 | optional group, repeatable | 作品链接、作品附件、描述 |
| 获奖 | optional group, repeatable | 获奖名称、获奖时间、描述 |
| 语言能力 | optional group, repeatable | 语言、精通程度 |
| 自我评价 | optional, non-repeatable | 自我评价 |

The source schema marks the 简历 group as required while its attachment child is not individually required. It also marks fields inside optional 工作经历 and 实习经历 groups as individually required. Both distinctions are retained exactly rather than normalized away. The source exposes no configured option captions for the built-in 学历、语言 or 精通程度 selects, so this ground truth does not invent option lists.

## Evidence boundary

The public page title states `禾赛科技社会招聘职位`; the embedded public tenant payload states `上海禾赛科技有限公司`; and the public job-detail endpoint states `设备工程师（嘉定）`. The application HTML and job-detail endpoint were read using credential-free GET requests.

No browser login, current field value, cookie, token, filename, raw HTML, attachment upload, form write, save, or final application submission is stored in the normalized ground truth. This evidence verifies configured server schema, not authenticated rendered DOM, actual control count, option popovers, repeatable add/save behavior, validation messages, or successful filling.

Run `npm run audit:hesai` to refetch the public company branding, schema, and job title and compare them with the reviewed snapshot.
