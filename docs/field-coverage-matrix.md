# 字段覆盖矩阵

更新时间：2026-08-05。范围是本地结构化档案、简历解析器、已审计招聘页三者的证据并集；“全部字段”不包含密码、验证码、身份核验、认证 Cookie、隐私同意或最终提交。

## 契约与记号

- `档案`：`CandidateProfile` 与档案编辑器可以本地保存、迁移和编辑。
- `简历`：`parseResumeText` 只在简历文本存在明确证据时提取，合并时不覆盖已有非空值。
- `小米`：小米实习招聘表单静态 schema 或 2026-08-05 登录后真实页面只读审计提供了字段证据。
- `T`：NFKC、去首尾空白，再通过 `normalizeFieldText` 统一大小写并移除空白、标点和符号。
- `E`：NFKC、去首尾空白、邮箱小写。
- `P`：NFKC 后仅保留电话号码数字。
- `D`：NFKC 后仅保留日期或年龄数字。
- “需确认”字段不会进入默认批量勾选。所有支持路径的别名和控件类型以 `canonicalFields` 为唯一代码账本；`catalog-coverage.test.ts` 保证路径无遗漏、别名非空、控件类型非空、敏感集合完整且比较归一化确定。

## 支持字段

| 档案路径 | 证据来源 | 允许控件 | 敏感性 | 比较 | 状态与招聘页约束 |
|---|---|---|---|---|---|
| `basic.fullName` | 档案、简历、小米 | text/textarea/contenteditable | 普通 | T | 支持 |
| `basic.preferredName` | 档案、简历 | text/textarea/contenteditable | 普通 | T | 支持；当前小米页无此项 |
| `basic.gender` | 档案、简历、小米 | radio/select/text | 需确认 | T | 支持 |
| `basic.birthDate` | 档案、简历 | date/month/text | 需确认 | D | 支持；当前小米页只提供派生年龄 |
| `derived.age` | 出生日期派生、小米 | number/text | 需确认 | D | 支持；不重复持久化，按当前日期计算 |
| `basic.phone` | 档案、简历、小米 | tel/text | 普通 | P | 支持；不保存登录密码、短信码或 Cookie |
| `basic.email` | 档案、简历、小米 | email/text | 普通 | E | 支持 |
| `basic.nationality` | 档案、简历、小米 | text/select | 需确认 | T | 支持 |
| `basic.currentCity` | 档案、简历 | text/select | 普通 | T | 支持；当前小米页无此项 |
| `basic.hometown` | 档案、简历、小米 | text/select | 需确认 | T | 支持 |
| `basic.politicalStatus` | 档案、简历 | text/select/radio | 需确认 | T | 支持；当前小米页无此项 |
| `education.0.school` | 档案、简历、小米 | text/select | 普通 | T | 支持；`.0` 按页面数组序号重写 |
| `education.0.degree` | 档案、简历、小米 | text/select/radio | 普通 | T | 支持；`.0` 按页面数组序号重写 |
| `education.0.educationType` | 档案、简历、小米 | text/select/radio | 普通 | T | 支持；`.0` 按页面数组序号重写 |
| `education.0.major` | 档案、简历、小米 | text/select | 普通 | T | 支持；`.0` 按页面数组序号重写 |
| `education.0.startDate` | 档案、简历、小米 | date/month/text | 普通 | D | 匹配支持；小米 date-range 仍按不可读处理，不伪报成功 |
| `education.0.endDate` | 档案、简历、小米 | date/month/text | 普通 | D | 匹配支持；小米 date-range 仍按不可读处理，不伪报成功 |
| `education.0.gpa` | 档案、简历 | text/number | 普通 | T | 支持；当前小米页无此项 |
| `education.0.ranking` | 档案、简历 | text/number/select | 普通 | T | 支持；当前小米页无此项 |
| `workExperiences.0.company` | 档案、简历、小米 | text/textarea/contenteditable | 普通 | T | 支持；`.0` 按页面数组序号重写 |
| `workExperiences.0.department` | 档案、简历 | text/textarea/contenteditable | 普通 | T | 支持；当前小米页无此项 |
| `workExperiences.0.role` | 档案、简历、小米 | text/textarea/contenteditable | 普通 | T | 支持；小米字段名为 `title` |
| `workExperiences.0.startDate` | 档案、简历、小米 | date/month/text | 普通 | D | 匹配支持；小米 date-range 仍按不可读处理 |
| `workExperiences.0.endDate` | 档案、简历、小米 | date/month/text | 普通 | D | 匹配支持；小米 date-range 仍按不可读处理 |
| `workExperiences.0.description` | 档案、简历、小米 | textarea/contenteditable/text | 普通 | T | 支持；小米字段名为 `desc` |
| `projects.0.name` | 档案、简历、小米 | text/textarea/contenteditable | 普通 | T | 支持；`.0` 按页面数组序号重写 |
| `projects.0.role` | 档案、简历、小米 | text/textarea/contenteditable | 普通 | T | 支持 |
| `projects.0.startDate` | 档案、简历、小米 | date/month/text | 普通 | D | 匹配支持；小米 date-range 仍按不可读处理 |
| `projects.0.endDate` | 档案、简历、小米 | date/month/text | 普通 | D | 匹配支持；小米 date-range 仍按不可读处理 |
| `projects.0.description` | 档案、简历、小米 | textarea/contenteditable/text | 普通 | T | 支持；小米字段名为 `desc` |
| `projects.0.outcome` | 档案、简历 | textarea/contenteditable/text | 普通 | T | 支持；当前小米页无独立成果项 |
| `projects.0.link` | 档案、简历、小米 | text/textarea/contenteditable | 普通 | T | 支持 |
| `workSamples.0.link` | 档案、简历、小米 | text/textarea/contenteditable | 普通 | T | 支持 |
| `workSamples.0.description` | 档案、简历、小米 | text/textarea/contenteditable | 普通 | T | 支持；小米字段名为 `desc` |
| `awards.0.name` | 档案、简历、小米 | text/textarea/contenteditable | 普通 | T | 支持 |
| `awards.0.date` | 档案、简历、小米 | date/month/text | 普通 | D | 支持 |
| `awards.0.description` | 档案、简历、小米 | text/textarea/contenteditable | 普通 | T | 支持；小米字段名为 `desc` |
| `languages.0.language` | 档案、简历、小米 | text/select | 普通 | T | 支持 |
| `languages.0.proficiency` | 档案、简历、小米 | text/select/radio | 普通 | T | 支持 |
| `jobPreference.targetRoles` | 档案、简历 | text/select | 普通 | T | 支持；当前小米投递页由岗位上下文决定，无编辑项 |
| `jobPreference.preferredCities` | 档案、简历、小米 | text/select | 普通 | T | 支持；小米为多选控件 |
| `jobPreference.availableDate` | 档案、简历 | date/month/text | 普通 | D | 支持；当前小米页无此项 |
| `answers.selfIntroduction` | 档案、简历 | textarea/contenteditable/text | 普通 | T | 支持；当前小米页无此项 |
| `answers.selfEvaluation` | 档案、简历、小米 | textarea/contenteditable/text | 普通 | T | 支持 |
| `answers.strengths` | 档案、简历 | textarea/contenteditable/text | 普通 | T | 支持；当前小米页无此项 |
| `answers.careerPlan` | 档案、简历 | textarea/contenteditable/text | 普通 | T | 支持；当前小米页无此项 |

## 有证据但不自动处理的字段

| 来源字段 | 控件 | 状态 | 原因 |
|---|---|---|---|
| 小米简历上传包装层 | file | 用户确认附件 | 2026-08-06 真实页证明 input 无 label/name/id，简历语义只在 `.atsx-upload-btn`；确定性包装层适配后可复用本机 PDF，但每次站点传输仍需确认且不得自动提交 |
| 小米作品附件 | file | 暂不支持 | 档案当前只保存链接和描述；二进制附件需用户明确选择 |
| 小米获奖证明附件 | file | 暂不支持 | 证明材料可能包含额外敏感信息，必须由用户明确选择 |
| 小米 `identification` | text | 确认后填写 | 映射到本地证件号码；预览遮罩且不进入默认安全选择，只有用户逐项确认后才写入 |
| 登录密码、短信码、验证码、CAPTCHA | password/text | 永久排除 | 不存储、不读取、不绕过验证 |
| 隐私同意 | checkbox | 永久排除 | 法律同意必须由用户本人操作 |
| 推荐来源 | select/text | 不支持 | 档案和简历没有可信事实来源，不能编造 |
| 最终投递/提交 | submit/button | 永久排除 | 产品没有自动提交入口 |

## 真实页面的重复区块证据

2026-08-05 通过已绑定的 OpenCLI 会话，对 `https://xiaomi.jobs.f.mioffice.cn/internship/resume/:id/apply` 做了只读结构审计。脚本只读取 URL 形状、`data-cy`/`data-form-field-name`、section class、控件 tag/class/disabled 状态；未读取 input/textarea 的当前值，未点击、未填写、未删除、未上传、未提交。

2026-08-06 进一步只读核对复杂控件：页面包含 29 个自定义下拉和 4 个顶层复合日期控件。日期 input 本身没有 name/placeholder/ARIA，但同一 `.resumeEditForm-item` 内的普通字段 ID 能确定 education/project 集合与记录序号。F018 使用这一结构生成单个起止时间动作，并要求隐藏 `{start,end}` 状态和可见年月同时通过写后验证；真实页写入仍待用户单独确认。

| 档案集合 | 静态 schema 前缀 | 线上路径别名 | 线上现有序号 | 行数 | section-local 添加目标 |
|---|---|---|---|---:|---|
| `education` | `education_list` | `education` | 0, 1 | 2 | 唯一 `.formOperate-addBtn` |
| `workExperiences` | `internship_list` | `internship` | 0 | 1 | 唯一 `.formOperate-addBtn` |
| `workSamples` | `works_list` | `work`/`works` | 无 | 0 | 唯一 `.createFormSection-addBtn` |
| `projects` | `project_list` | `project` | 0, 1 | 2 | 唯一 `.formOperate-addBtn` |
| `awards` | `award_list` | `award` | 无 | 0 | 唯一 `.createFormSection-addBtn` |
| `languages` | `language_list` | `language` | 0, 1 | 2 | 唯一 `.formOperate-addBtn` |

每类区块都找到且仅找到一个未禁用的添加目标。线上非空区块使用 `formOperate-addBtn`，空区块使用 `createFormSection-addBtn`。审计输出不记录档案内容或档案记录数；F017 只能在用户手势触发的 content-script 内存中比较“有意义档案记录数”和页面行数。

## F017 安全创建协议

1. 用户在当前招聘页主动触发扫描后，按集合计算至少含一个非空业务字段的档案记录数；空占位记录不计数。
2. 先做只读结构扫描。仅当 `profileCount > pageCount` 时生成创建计划；从不因档案较少而删除、折叠、重排或覆盖页面记录。
3. 站点适配器必须同时命中已批准 origin/path、唯一 section root、唯一添加目标和预期 fingerprint。通用“文本里含添加”不能成为点击依据。
4. 单次只点击一个添加目标，然后等待 DOM 结构变化并完整重扫。URL 必须保持不变，目标组行数必须恰好增加 1，并且只能出现一个新数组序号。
5. 每组最多创建 `min(profileCount - pageCount, 10)` 行；超过上限时停止并向用户报告剩余数量。一次用户手势不得跨页面继续执行。
6. 若 section/add fingerprint 改变、候选不唯一、控件被禁用、行数增量不是 1、序号异常、导航发生或等待超时，立即停止该组，不再尝试点击。
7. 新行创建完成后仍走现有的确定性扫描、页面值比较、敏感确认和冲突确认流程。不能把“创建成功”等同于“填写成功”，也不能触发最终提交。

F016 只固化结构证据和协议，没有在真实页面点击添加控件。F017 已实现受限的小米 section 适配器、侧栏分组动作、逐条重扫和本地 Xiaomi 形态回归；真实页面在实现前后都只做了只读 fingerprint 审计，尚未点击真实添加控件。
