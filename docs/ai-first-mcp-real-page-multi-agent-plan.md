# AI-first 本地求职 Agent：仅真实网页验证的多 Agent 开发计划

- 状态：可执行计划
- 日期：2026-08-12
- 计划节点：F096
- 上位 PRD：`docs/prd-zero-extension-recruitment-agent.md`
- MVP 终点：Codex 通过本地 MCP 调用完全本地的求职内核，在独立已登录 Chrome/Edge 中理解、填写并逐字段审核真实招聘网页；不安装扩展，不依赖网站字段模板，不提交申请

## 1. 本轮产品决策

MVP 采用 Node/CLI-first，而不是先完成桌面 UI：

```text
Codex / Claude Code
  └─ Skill（薄编排说明）
      └─ MCP stdio（六个类型化招聘工具）
          └─ Local Application Service
              ├─ 批次授权与恢复账本
              ├─ AI 字段规划器
              ├─ 确定性安全策略编译器
              ├─ 本地档案与岗位库
              ├─ 全字段审核与评测
              └─ Browser Kernel
                  └─ Node.js CDP transport
                      └─ 独立求职 Chrome/Edge profile
```

桌面/Web 工作台仍是完整产品入口，但不是证明“Codex 可以操作真实招聘页”的最短依赖。MVP 先用交互式 CLI 创建、查看和撤销授权；MCP 客户端不能自行创建或扩大授权。MVP 成功后再把相同本地服务接入桌面工作台，不产生第二套浏览器或业务内核。

## 2. “无模板”边界

本轮不以公司或 ATS 字段模板作为识别前置条件。AI 从当前真实页面的去值结构理解字段，并输出：

```text
fieldRef → profilePath | profile_missing | manual | review | ensure_repeatable
```

AI 不输出网页字段值、CSS/XPath、坐标、JavaScript、CDP 命令或提交动作。本地策略根据 `profilePath` 取值并批准或拒绝计划，浏览器内核执行固定动作并回读验证。

允许复用的确定性资产：

- 个人档案 schema 与路径目录；
- 文本、选项、日期、富文本和重复记录等通用控件能力；
- 敏感、验证、附件、删除、同意和最终提交安全策略；
- 选项/日期规范化、写后验证、幂等和过期引用规则；
- 历史 ATS ground truth 作为独立标注起点、漂移参照和可选提示。

禁止把以下内容变成运行前提：

- 只有命中某个公司/ATS 模板才允许扫描或填写；
- 公司专属 CSS/XPath、DOM id、脚本或任意页面动作；
- 用历史模板答案代替当前页面观察；
- 用模板预期分母替换本次真实页面可达字段实例分母。

为证明无模板，真实运行清单必须记录：

```json
{
  "plannerSource": "ai",
  "legacyFieldTemplateEnabled": false,
  "companyFieldOverrideRequired": false
}
```

若某个站点只能依靠历史公司字段映射才能通过，该运行可以作为兼容模式证据，但不能满足 AI-first MVP 门槛。

## 3. 已有基线事实与启动门

根工作树的 `feature_list.json` 对 F039-F043 的状态已经陈旧；不得据此重新开发 K2-K5。隔离 worktree 和远端分支显示：

| 节点 | 分支 | 当前 commit | 状态 |
| --- | --- | --- | --- |
| F039/K2 | `agent/browser-kernel-k2-actions` | `f52e8e1` | 已完成并推送 |
| F040/K3 | `agent/browser-kernel-k3-workflows` | `f760551` | 已完成并推送 |
| F041/K4 | `agent/browser-kernel-k4-evidence` | `29776d7` | 已完成并推送 |
| F042/K5 | `agent/browser-kernel-k5-adapters` | `6d5f163` | 已完成并推送 |
| F043 | `agent/browser-kernel-real-site-acceptance` | `4d39144` | 已完成并推送 |

F043 的脱敏报告记录了旧扩展内核在小米、虎牙、携程三个 ATS 家族的 17/17 用户授权普通字段非提交验证，且 wrong-control 和禁止动作均为 0。这份证据仅证明对应 commit 下的扩展/K5 路径；它不能证明：

- Node CDP 零扩展 transport 已完成；
- Codex 已通过 MCP 发起流程；
- AI 在关闭历史字段模板时完成映射；
- 当前八个网页均未漂移；
- 页面全部字段均有审核结论。

因此开发前必须先执行 F097“基线收敛”：核对固定分支、commit、draft PR 和验证证据，形成一个干净、唯一的零扩展集成起点，并同步根账本。F039-F043 不重做、不改历史分支，也不在脏根目录并发开发。

## 4. 唯一允许的真实网页验收集

本轮浏览器级验证只允许使用以下八个当前线上真实页面。不得新增、复制、下载或托管模拟招聘网页来替代它们。

| 顺序 | 公司 | ATS | 规范化真实路径 | 已有独立契约 | 新 MVP 必需证据 |
| ---: | --- | --- | --- | ---: | --- |
| 1 | 小米 | Feishu Recruiting | `xiaomi.jobs.f.mioffice.cn/internship/resume/:id/apply` | 9 组 / 34 字段 | 当前 E3 + AI-first 零扩展 E4 |
| 2 | MetaApp | Feishu Recruiting | `meta.jobs.feishu.cn/:id/resume/:id/apply` | 4 / 13 | 当前 E3 + E4 或 typed blocker |
| 3 | 蔚来 NIO | Feishu Recruiting | `nio.jobs.feishu.cn/index/resume/:id/apply` | 7 / 27 | 当前 E3 + E4 或 typed blocker |
| 4 | 安克创新 | Feishu Recruiting | `anker-in.jobs.feishu.cn/index/resume/:id/apply` | 5 / 15 | 当前 E3 + E4 或 typed blocker |
| 5 | 禾赛科技 | Feishu Recruiting | `kwh0jtf778.jobs.feishu.cn/index/resume/:id/apply` | 10 / 30 | 当前 E3 + E4 或 typed blocker |
| 6 | 虎牙 | Moka | `app.mokahr.com/campus_apply/huya/:id#/candidateHome/resume` | 9 / 41 | 当前 E3 + E4 或 typed blocker |
| 7 | 联想 | Lenovo Talent | `talent.lenovo.com.cn/account/resume` | 7 / 55 | 当前 E3 + E4 或 typed blocker |
| 8 | 携程 | 自研 ATS | `job.ctrip.com/#/experienced/personal-homepage/editCV` | 7 / 28 | 当前 E3 + E4 或 typed blocker |

现有契约合计 243 个字段定义，但 243 不是新运行的固定填写分母。每次 E3 必须根据当时登录状态、条件分支、页面步骤和重复记录数量，冻结本次 `reachable logical field instances`。历史 ground truth 用于发现漂移，不能给当前程序自证。

### 4.1 现有历史观察的正确用途

- 小米 observation 是旧 schema，缺少顶层 sections，不可直接晋升。
- MetaApp 的 279 个 raw controls 包含大量 option 节点，不能当作 279 个逻辑字段。
- NIO 的历史 5 sections / 27 raw controls 必须和 7 组 / 27 字段独立契约逐项调和。
- 虎牙的六份下载只是一个语义结构，且历史扫描仍标成 generic/unknown，不能算六个样本。
- 安克、禾赛、联想、携程主要是公开 schema/bundle 契约，不能证明当前登录 DOM 或写入。

## 5. 验证政策：只用真实网页

### 5.1 允许

- 协议、JSON Schema、策略、状态机、数据库迁移、幂等和指标计算可以使用纯 TypeScript 对象单元测试。
- CDP 浏览器启动和连接可以在专用空白页上验证 transport 生命周期，但不得据此证明字段识别或招聘站兼容。
- 所有涉及页面字段发现、控件动作、重复记录、AI 映射、填写和审核的浏览器级验证，只能在第 4 节八个真实网页上进行。
- 现有 legacy 测试可以继续作为仓库健康检查被 `npm run validate` 执行，但不能成为新 feature 的完成证据或站点支持证据。

### 5.2 禁止作为验收证据

- `fixture.html`、`xiaomi-fixture.html`、`repeatable-fixture.html`；
- 复制、保存或重建的真实网页 HTML；
- 带小米、飞书、Moka 等品牌名称的模拟页面；
- `fill-fixture`、`xiaomi-fixture`、`repeatable-records`、`complex-controls` 等 legacy E2E 的截图或成功率；
- 公开 schema、bundle contract 或历史 observation 单独证明写入成功；
- AI 对网页截图或 HTML 的主观判断替代逐字段回读。

### 5.3 历史模拟测试处置

本计划不要求立即删除 legacy 测试，以免在迁移前丢失底层行为回归。它们必须统一降级标记为 `legacy-primitive-regression` 或 `public-contract-drift`，从支持目录、发布报告、MVP 指标和 `site-pass` 中移除。新开发不得添加任何模拟招聘网页。

## 6. 证据等级与真实页串行协议

| 等级 | 定义 | 是否可声称该页面可填写 |
| --- | --- | --- |
| E0 | 代码、协议和安全静态检查 | 否 |
| E1 | 无网页纯对象测试或 transport 生命周期 | 否 |
| E2 | 当前公开真实 URL/schema/bundle 只读 | 否 |
| E3 | 用户登录后的真实页完整只读盘点 | 否 |
| E4 | 用户授权、真实档案、非提交写入和逐字段回读 | 是，仅限该页面与版本 |
| E5 | 打包版跨重启、升级和恢复的真实页验收 | 是，产品级 |

每个真实页面必须串行执行：

1. 协调 Agent 预约用户窗口；用户在独立求职浏览器完成登录。
2. 标注 Agent 在只读模式查看当前真实页，不看程序扫描结果，形成字段实例、条件、步骤、重复组和安全分类。
3. 用户审核并冻结 `annotationId + version + hash + denominator`。
4. 执行前向用户展示 origin、档案版本、可能自动保存、禁止项和授权时限；用户创建 lease。
5. 执行 Agent 在固定 commit/app/browser 下运行 `observe → plan → compile → execute → reobserve → audit`。
6. 每次导航、重复记录创建或 DOM 结构改变都使旧 ref 失效；只对未决字段重新规划，循环次数有界。
7. Judge Agent 只读取冻结标注与脱敏运行清单，独立复算指标；执行 Agent 无权改分母或宣布通过。
8. 登录、CAPTCHA、短信、身份、条款或控件限制必须成为 typed blocker；不得绕过或换模拟页。

同一时间只有一个执行者可以连接真实登录 profile。同一页面、profile 或 tab 禁止多 Agent 并行写入。

## 7. 字段分母与完成指标

每站固定三个分母：

- `A = annotated reachable instances`：独立标注的所有可达逻辑字段实例，包含普通、敏感、人工、条件不适用和不可达结论。
- `B = eligible ordinary`：有本地档案来源、普通安全等级且当前控件能力允许写入的字段。
- `C = write attempts`：实际执行的所有写入尝试。

通过门：

| 指标 | 门槛 |
| --- | ---: |
| 全字段盘点和审核 | `audited / A = 100%` |
| 每字段唯一终态 | `100%` |
| eligible 覆盖 | `verified fields / B ≥ 90%` |
| 写入成功 | `verified writes / C ≥ 95%` |
| 首策略成功 | `primary verified / B > 90%` |
| 跨站总体成功 | `≥98%` |
| 映射正确率 | `≥98%` 且 known wrong = 0 |
| 写后布尔回读 | `100%` 写入尝试 |
| 安全反例阻断 | `100%` |

必须为 0：wrong-control write、主策略加一次降级之外的第三次尝试、重复记录、未确认敏感/附件动作、密码/Cookie/令牌读取、验证码/身份绕过、意外跨 origin、删除、不可逆保存、最终提交。

注意：若站点在填写普通字段时自动保存草稿，必须在 lease 前披露；这不等于允许 Agent 点击显式“保存经历”。在 MVP 的无点击普通授权里，显式保存、删除、同意、上传和提交均标记 `user_action_required`，除非未来增加单独、即时、目标绑定的确认能力。

## 8. MCP MVP 契约

只提供六个工具：

1. `workspace_status`
2. `application_inspect`
3. `application_plan`
4. `application_execute`
5. `application_audit`
6. `workflow_cancel`

`application_inspect` 返回去值页面结构、opaque field refs、section、role、options、required、安全类别、profile path catalog 和 `hasValue`，不返回页面当前值、档案值、原始 HTML 或浏览器认证信息。

`application_plan` 接受每个字段的类型化 decision；未知字段不能被静默遗漏。内核编译出不可变 `planId`，拒绝不允许的路径、歧义、空档案、敏感项和不兼容动作。

`application_execute` 只接受 `planId`，由本地内核取真实档案值。MCP 不允许传任意值。

不得暴露：`eval`、raw CDP、selector、XPath、坐标、任意文本值、Cookie、HTML、文件路径、upload、save、delete、consent 或 submit。

## 9. 多 Agent 组织

最多四个并发槽包含主 Agent，因此每一波使用一个协调 Agent和最多三个子 Agent。

### 9.1 固定角色

| 角色 | 责任 | 禁止 |
| --- | --- | --- |
| O：Coordinator/Integrator | 独占共享契约、根账本、集成分支、依赖门、合并和最终状态 | 不让两个 worker 同时改共享 ledger |
| B：Browser Platform | Node CDP runtime、独立 profile、typed browser kernel transport | 不改 AI、MCP、标注分母和 UI |
| A：AI/Application | AI planner、policy compiler、application service、MCP stdio、Skill | 不接受值/selector，不直接连接真实页写入 |
| Q：Annotation/Judge | 真实页只读标注 schema、隐私清单、指标复算和独立判定 | 不改浏览器/映射代码，不执行真实写入，不用程序结果定分母 |

站点缺陷修复时，由 O 临时创建独立 Site Repair Agent；此时暂停相应 B/A/Q worker，保持总并发不超过四。真实页执行由 O 指定唯一 Execution Agent，不能与 Q 是同一角色。

### 9.2 文件所有权

```text
O: feature_list.json, progress.md, AGENTS.md, docs/*plan*, shared contract schema
B: packages/browser-runtime/**, packages/browser-kernel/**
A: packages/semantic-planner/**, packages/policy-compiler/**,
   packages/application-service/**, packages/mcp-server/**, skills/**
Q: evals/real-pages/**, packages/audit/**, privacy-safe evaluation scripts
```

跨包类型先由 O 冻结在单独 checkpoint。worker 不得自行修改另一条泳道接口；需要变更时提交契约提案，由 O 串行合入后所有分支重置到新 checkpoint。

### 9.3 worktree 与分支规则

- 代码 Agent 不得从当前脏根工作树直接开工；F097 先形成干净集成 checkpoint。
- 每个节点一个 branch、一个 worktree、一个 owner；开始前在 feature 中记录 branch、base、owner 和路径范围。
- worker 只提交所属目录；不得 `git reset --hard`、stash、删除或改写其他 worktree。
- O 独占 `feature_list.json` 和 `progress.md` 的最终合入。worker 用 handoff 消息报告 changed files、commands、results、blockers、commit。
- F039-F043 保留 AGENTS.md 中既有精确 branch/pr_base；只审计和收敛，不改写历史。
- 真实登录 profile 不是共享测试资源，只由单一 Execution Agent 串行占用。

## 10. 依赖 DAG 与开发波次

```text
F096 计划完成
  └─ F097 K2-K5/F043 基线收敛
       ├─ F086 Node CDP 零扩展 runtime ─┐
       ├─ F098 AI planner/policy ───────┼─ F087 Node typed kernel
       └─ F100 真实页 annotation/judge ┘       │
                                               ├─ F099 MCP + Skill + app service
                                               └─ F088 桌面/本地工作台（并行，不阻塞首个Codex MVP）
F087 + F098 + F099 + F100 ─> F089 全字段闭环
F089 ─> F090 小米 AI-first 零扩展 E4
F090 ─┬─> F091 Feishu 其余四公司
      └─> F092 虎牙/联想/携程
F091 + F092 ─> F093 五岗位批次恢复 ─> F095 打包本地工作台
                                     └─> F094 BOSS 可选能力
```

### Wave 0：计划与基线门

- O 完成 F096。
- O 执行 F097，核对并收敛 K2-K5/F043 分支、PR、commit、验证和账本；形成干净 `zeroext-mvp-base`。
- 通过前不启动业务代码子 Agent。

### Wave 1：三个子 Agent 并行

- B/F086：Node CDP runtime、独立 profile、动态端口、重连和关闭。
- A/F098：AI decision schema、planner adapter、policy compiler；只做纯对象测试。
- Q/F100：真实页 annotation/run manifest/judge schema、指标和隐私扫描；只准备八站队列，不访问登录页写入。
- O：审查契约、处理 integration checkpoint，不与 worker 重叠编辑。

### Wave 2：内核与入口

- B/F087：把 K1-K5 迁移到 Node transport；先在小米当前真实页做 E3 只读，不能写。
- A/F099：在 F087 contract 冻结后实现 local application service、CLI lease、MCP stdio 和薄 Skill。
- Workbench Agent/F088 可与 F087 后半段并行，但不阻塞 F090 的 CLI-first MVP。
- Q：用户登录窗口到来后完成小米独立标注，用户冻结分母。

### Wave 3：首个真实 MVP

- O/F089：集成 inspect/plan/execute/audit，确认每字段唯一结论。
- 唯一 Execution Agent/F090：在小米执行 AI-first 零扩展 E4。
- Q：离线复算；O 只在 Judge 通过后标记 F090 done。

### Wave 4：站点扩展

- Feishu Site Agent准备 MetaApp/NIO/安克/禾赛差异修复。
- Non-Feishu Site Agent准备虎牙/联想/携程差异修复。
- Q 可并行只读标注，但所有 E4 写入进入一个串行队列。
- 同族改动必须重跑“失败页 + 小米 canary”；通用内核改动另加一个非 Feishu canary。

### Wave 5：批次与发布

- F093：至少五个真实岗位、至少两个 ATS、一次 lease、强制中断恢复。
- F095：本地工作台/CLI/MCP 安装、升级、回滚和迁移；干净 Windows 用户从安装到首个真实审核不安装扩展。
- F094 BOSS 是单独开关和授权模型，不阻塞表单 MVP。

## 11. Feature 完成定义

### F097：基线收敛

- 根账本状态与 K2-K5/F043 分支现实一致；记录精确 branch/commit/PR/evidence。
- 选择一个干净 integration base，完整 `npm run validate` 和 `npm run test:e2e` 通过。
- 审计 F043 17/17 报告，但明确其不是零扩展/AI-first新证据。

### F086：Node CDP runtime

- 不安装扩展，启动独立求职 profile，动态 endpoint 只监听 loopback。
- 默认 Chrome profile 元数据不变；错误令牌、重连、停机和孤儿进程测试通过。
- 当前小米 URL 达到 E2；0 页面值读取、0 写入、0 submit。

### F098：AI planner/policy

- 每个输入 field ref 恰有一个 decision；未知项不能遗漏。
- AI 只见去值结构和 path catalog，不见档案值。
- 恶意网页文本/模型输出不能生成 selector/value/script/受保护动作。
- 纯 schema/属性测试通过；不使用任何模拟招聘网页。

### F100：真实页评测 harness

- 八站 allowlist 固定；未知/模拟/local URL被拒绝进入 E3/E4。
- annotation、run manifest 和 Judge schema 可验证分母冻结、互斥结论、指标复算和隐私白名单。
- 执行者不能修改 annotation；Judge 不接受自报 pass。

### F087：Node typed kernel

- 唯一 writer 通过 Node CDP，公共 API 无 eval/selector/raw CDP/value/cookie/delete/submit。
- 小当前米登录页 E3 前后页面值摘要和记录数保持一致；全字段盘点与冻结标注比对 100%。

### F099：MCP + Skill

- Codex 通过 stdio 完成六个工具的真实握手和脱敏调用转录。
- 未授权时 `application_inspect` 也不能读取页面；MCP不能创建 lease。
- replay、过期、跨 origin、恶意 payload、取消和重启恢复测试通过。

### F090：小米首个 MVP

- `legacyFieldTemplateEnabled=false`、`plannerSource=ai`。
- 全字段审核 100%，eligible 覆盖 ≥90%，写入成功 ≥95%，映射 ≥98%。
- wrong write、重复记录、第三次尝试、敏感/保存/删除/submit 均为0。
- 强制重启后不重复创建或填写已验证字段。

### F091/F092：八站扩展

- 每站都有当前 E3 和 E4 pass 或明确 typed blocker；不把 blocker 隐藏为 unsupported denominator。
- 至少三个 Feishu 公司分别 E4 才能宣称家族级行为；一个租户修复不能修改其他租户分母。
- 非 Feishu 三站不得通过 Feishu 专属分支执行。

### F093/F095：批次与打包

- 五真实岗位、两 ATS、一次授权，强杀恢复 0 重复/0 跨 origin/0 submit。
- 干净 Windows 用户无需扩展或开发者模式；生产包无 manifest 和扩展运行依赖。
- 用户档案迁移可验证、可回滚，不自动删除旧数据。

## 12. 失败回归与修复流程

1. 先冻结失败前 annotation 和私有 E3/E4 清单；禁止删除字段或更改分母美化指标。
2. 分类为 `page_drift`、`mapping`、`control`、`wait`、`stale_ref`、`framework_rejected`、`auth`、`site_policy` 或 `safety`。
3. O 分配唯一 Site Repair Agent和独立 branch；Q 和 Execution Agent 不改代码。
4. 允许增加纯协议/算法测试，但不得创建模拟招聘页面。
5. 修复后必须由用户重新授权回原真实页复验；用户窗口不可用时记录 blocker，不能宣称完成。
6. 租户修复重跑原页和小米；通用内核修复再重跑虎牙或携程 canary。
7. 任何错写、重复、越界动作或 submit 立即 fail closed，回滚到上一已验证版本。

## 13. 持久交接契约

每个 worker 的完成消息必须包含：

```text
feature / owner / branch / base / commit
changed files
commands and exact results
real-page evidence level and denominator, if any
privacy and safety zero counts
known blockers
next integration action
```

O 在合入后统一运行：

- feature 定向验证；
- `npm run validate`；
- 用户可见节点的 `npm run test:e2e` 与当前无个人值截图；
- `git diff --check`；
- secret/PII/真实页面值/URL query/DOM/HAR/填后截图扫描；
- feature JSON 和依赖 DAG 校验。

只有 O 可以更新根 `feature_list.json`、追加最终 `progress.md`、标记 done 或发布支持等级。真实页用户登录、授权、验证码、敏感确认和最终提交不能由子 Agent替代。

## 14. 下一步

立即开始 F097，而不是重新实现 F039-F043：先把已完成的浏览器内核和三站真实页证据收敛成干净的零扩展集成基线。F097 完成后，按 Wave 1 同时启动 B/F086、A/F098 和 Q/F100 三个子 Agent。
