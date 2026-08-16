# 智联招聘能力迁移蓝图

## 目的与完成定义

在不引入 BossHunter 运行时代码的前提下，为 `qiuzhao-cli` 增加一条可审计的智联招聘求职能力链路：岗位发现、去重入库、确定性预筛与语义评分、用户审核、受控沟通、回复盘点，以及通向现有非提交网申填写能力的入口。

本蓝图本身完成的判定是：下面的模块契约、状态机、Z001--Z007 依赖、量化验收和 E0--E5 证据要求均明确，且每一项不可逆外部动作都有 fail-closed 边界。它不是“智联已兼容”的声明；真实兼容性只能由相应阶段的保留登录页面证据证明。

## 来源、独立性与禁止项

`C:\Users\jiangbingjian\BossHunter` 仅用于行为研究。其本地源码展示的链路为：搜索/详情抓取、SQLite 状态记录、预筛与 AI 评分、用户确认、招呼语发送、循环监测和简历处理。该代码的 README 与包元数据对许可证的陈述不一致（MIT 链接与 `LicenseRef-BossHunter-NonCommercial`），故本项目一律按较严格的非商业参考材料处理，绝不复制代码、选择器、脚本、数据表或 UI 实现。

下列行为分流如下：

| BossHunter 行为 | 智联方案决策 | 原因 |
| --- | --- | --- |
| 搜索页与详情页采集 | 独立重写 | 仅做有界、去值的站点适配器 |
| SQLite 岗位/历史表 | 独立重写 | 加入乐观版本、幂等请求和脱敏审计 |
| 规则预筛与 AI 评分 | 独立重写 | Agent 只能看到 JD 语义包与档案目录，不看标量档案 |
| 招呼语草稿 | 独立重写 | 草稿是可审阅对象，不是任意文本执行接口 |
| 直接 selector/eval/CDP 代理 | 拒绝 | MCP 不得公开 selector、脚本、CDP 或页面坐标 |
| 批量/自动发送与随机“反检测” | 拒绝 | 不以规避平台检测为目标；仅允许精确岗位、短租约的一次受控动作 |
| 无限 `while` 监测 | 拒绝 | 改为带次数、截止时间、预算和可取消点的持久任务 |
| 自动提交简历、同意、身份或验证码动作 | 拒绝 | 必须人工处理；最终投递永远不由产品点击 |

固定禁止项：读取或保存 Cookie、密码、短信/图形验证码、身份材料、页面档案标量、完整聊天；绕过验证；任意 URL/selector/script/text/path/upload；保存、删除、同意和最终投递。现有六个校招 MCP 工具保持不变。

## 目标模块与契约

```text
ZhilianDiscoveryAdapter ─┐
                         ├─> JobRepository ─> JobRanking ─> JobWorkflow
Workbench / Job Skill ───┘                                  ├─> ConversationService
                                                            └─> ApplicationService
```

### `modules/job-discovery/adapters/zhilian`

- 输入：用户已在专用浏览器选择的、已登录且 origin 匹配的智联搜索或详情页面，以及受限的查询配置引用。
- 输出：脱敏 `JobCandidate`（规范化链接、标题、公司、城市、摘要 JD、来源、页面身份摘要），或 typed blocker。
- 不变量：只读；最大页数、卡片数、详情数、滚动次数和总时间均有硬上限；页面/登录/验证状态变化立即停止。

### `modules/job-repository`

- 输入：候选岗位与工作流事件；输出：带 `expectedVersion` 的 `JobRecord`、`JobEvent` 和查询视图。
- 不变量：唯一键为 `source + normalizedJobIdentity`；重复发现不增加记录；不保存凭证、页面表单值或完整聊天；软删除/恢复都要求版本一致。

### `modules/job-ranking`

- 输入：岗位语义包、`hasValue` 档案目录和封闭规则；输出唯一的 `pass`、`reject`、`review`、`failed` 或 `budget_exhausted` 结论。
- 不变量：城市、岗位类型、薪资、排除词先走确定性规则；AI 失败仍在分母中；评分器不能授予权限或产生页面动作。

### `modules/conversation-service/adapters/zhilian`

- 输入：已审阅 `planId`、精确 `jobId`、origin/page epoch、用户创建的短期 lease 与 `requestId`；输出仅是布尔回读和脱敏事件。
- 不变量：默认只产出草稿；发送只允许一次已审核的计划；无新回复返回 `no_new_reply`；简历卡、验证码、身份、删除、拉黑与最终投递均转人工。

### `modules/job-workflow`

- 输入：封闭命令与持久状态；输出可恢复的任务状态和审计事件。
- 不变量：每个外部动作绑定 `jobId`、`origin`、`pageEpoch`、`profileVersion`、`leaseId`、`requestId` 与尝试预算；同一岗位同一写锁串行；最多一条主策略与一次 fallback。

### `apps/workbench` 与 `skills/job-hunting`

- 只能调用同一个 `JobWorkflow`；工作台和 Agent 不复制状态机。
- 面向 Agent 的 schema 只暴露意图级状态、搜索、审核、计划、执行、审计、取消；不暴露原始页面/档案/聊天值。

## 闭环状态机

每个节点只有一个终态；任何 blocker/失败/人工门都不能从分母移除。

```text
discovered -> stored -> prefiltered -> ranked -> review_required
                                            |             |
                                          rejected      approved
                                                           |
                                             draft_ready -> send_authorized
                                                           |          |
                                                     manual_only   sent_verified
                                                                        |
                                                          no_new_reply / reply_detected
                                                                        |
                                                          application_ready -> application_review
```

- `discovered`：只读候选已形成但尚未持久化。
- `stored`：完成去重和版本化写入；相同规范化身份重复发现不产生第二条记录。
- `prefiltered` / `ranked`：每条岗位有一个确定性或语义评分终态。
- `review_required`：用户须选择 `approved`、`rejected` 或保持人工处理。
- `send_authorized`：只在精确 `jobId + origin + pageEpoch + lease + requestId` 完整时产生。
- `sent_verified`：页面对相同会话的布尔回读成功；否则为 `failed` 或 `manual_only`，不盲重试。
- `application_ready`：仅表示可进入现有 ApplicationService 的非提交式流程；任何最终投递仍是人工终点。

所有状态都可附加 `login_required`、`verification_required`、`page_drift`、`browser_disconnected`、`lease_expired`、`budget_exhausted`、`cancelled` 或 `failed` blocker，且不可自动跨越。

## 分阶段交付与量化验收

| 阶段 | 交付物 | 量化验收 | 最低真实证据 |
| --- | --- | --- | --- |
| Z001 | 智联页面盘点规格与去值 inventory | 两组关键词/城市；至少 5 个候选；每个可达卡片与详情都有唯一终态；盘点覆盖率 100%；写入/提交/凭证读取 0 | E0--E3 |
| Z002 | 只读 ZhilianDiscoveryAdapter | 两轮相同发现结果第二轮新增重复 0；标题/公司/JD/规范化链接人工核对准确率 >=98%；错误入库 0；滚动/详情预算 100% 未超限 | E1--E3 |
| Z003 | 岗位库与恢复审计 | 并发/重放/中断恢复测试全通过；相同身份重复 0；版本冲突写入 0；敏感字段扫描命中 0 | E0--E1，真实重复采集 E3/E5 |
| Z004 | 预筛、评分与审核队列 | 标注分母内每岗位恰有一个评分终态；确定性一票否决误放行 0；AI known-wrong 0；超时/配额/失败仍保留 100% | E0--E1，独立人工标注 E3 |
| Z005 | 可恢复 JobWorkflow 与工作台/Skill 接口 | 三个中断点（发现、评分、授权前）恢复后重复记录/重复外部动作均为 0；同 requestId 返回一致结果；取消后写入 0 | E0--E1，浏览器重启 E5 |
| Z006 | 受控沟通与有界回复盘点 | 只对 1 个明确岗位、1 个已审核草稿执行；发送布尔回读 verified/C >=95%；错会话 0；重复发送 0；无回复时 `no_new_reply` 100% | E3--E5 |
| Z007 | 岗位到网申的非提交串联 | 至少 5 个真实岗位、至少 2 种申请页系统；岗位/字段盘点覆盖 100%；eligible 的**截图与布尔双验证**成功率 >=95%；known-wrong、保护动作、验证码/凭证读取、最终提交均为 0 | E3--E5 |

`Z006` 和 `Z007` 的任何真实写入均必须在用户先行、精确授权后才可开始；定量分母在动作前冻结。

## E0--E5 证据协议

- **E0 静态审计**：检查公共 schema、依赖图、许可隔离、禁用能力、日志脱敏与 MCP 工具数；通过不代表站点可用。
- **E1 协议/对象测试**：覆盖状态转换、幂等、预算、版本冲突、恶意 payload 和 fail-closed 行为；fixture 不可代替真实页面。
- **E2 公开结构漂移检查**：只读公共入口，最多用于发现入口变化，不主张登录后兼容。
- **E3 登录后盘点**：用户保留的真实智联标签页；仅收集去值字段分类、数量与 blocker；人工独立冻结 A（可达实例）分母。
- **E4 受控动作**：先固定 `A=annotated`、`B=eligible`、`C=attempts`；动作仅对带 lease 的精确岗位执行，逐项布尔回读。对每个声称填写成功的字段，还必须在同一页面身份、同一冻结分母下完成填前/填后私有截图的人工或受限视觉逐项对比；只有布尔回读与截图对比都通过的字段才计作 `verified`。失败、登录门、人工门、页面漂移或截图无法可靠判定的字段都在 A 内保留终态，后者不得计入成功。
- **E5 重启幂等**：杀死/重启 Agent 或浏览器后恢复相同 requestId，证明重复发现、重复消息、重复经历、重复上传均为 0。

每份证据 manifest 只允许：代码/浏览器版本、规范化 origin/path、ground-truth hash、lease 摘要、A/B/C、每实例终态、次数、策略、typed error、布尔回读、截图对比结论与零保护动作计数。截图只允许由 `page-vision` 临时采集、在会话内对比并自动清理；manifest 不得保存截图、截图路径、截图字节、OCR 原文或任何表单标量。禁止保存 DOM、HTML、查询参数、Cookie、聊天全文、档案值或 PDF 字节。

## Z001 执行清单

Z001 是下一个且唯一可开始的实施特性。开始条件：用户在专用浏览器中自行登录智联，打开两组搜索组合中的首个结果页；不需要也不得提供密码、Cookie 或验证码。

1. E0：新增闭合 discovery schema、页面身份/预算/typed blocker 单测，并扫描其公共面没有 selector、脚本、任意 URL 或标量值。
2. E3：对两组搜索组合和至少 5 个候选执行只读盘点；人工冻结 `A`，每项标为 `candidate`、`login_required`、`verification_required`、`page_drift`、`manual_required` 或 `failed`。
3. 输出脱敏 manifest；核对 100% A 已有唯一终态，且所有写入/外发/提交/凭证读取计数为 0。
4. 仅当 Z001 达标后，才实现 Z002 的适配器；若网页结构或登录状态不满足，停在 typed blocker，绝不猜测选择器或尝试绕过。

## 验证门

每个阶段完成前至少执行其定向测试、`npm run validate` 与 `git diff --check`。所有真实站点结论附带阶段、证据等级和冻结分母；无 E4 不得使用 `real-page-verified` 描述写入能力。
