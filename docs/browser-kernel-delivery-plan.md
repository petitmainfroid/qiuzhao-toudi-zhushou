# 浏览器写入内核 K2–K5 交付计划与真实网页验收标准

F039 的多 Agent 文件所有权、固定 24/8/8/2 分母、RED gate 和串行集成命令见 [`browser-kernel-k2-multi-agent-plan.md`](browser-kernel-k2-multi-agent-plan.md)。并行只发生在一个节点内部；K2–K5 仍按依赖顺序晋升。

## 目标与完成定义

目标是把现有 `src/content/pageDriver.ts` 的可靠写入、事件触发和回读验证能力收敛到 K1 会话内核，使所有招聘流程最终只依赖一套类型化 `state/find/action/wait/upload` API。

完成不等于“能在一个网页写入一次”。完整完成要求：

- K2–K5 各自在独立分支通过确定性匿名 ground truth；
- 旧写入路径在能力平齐后退出，不保留两个行为不同的引擎；
- F043 在三个不同 ATS 家族的真实 HTTPS 申请页完成用户授权、去标识、非提交验收；
- 任何阶段都不操作密码、验证码、身份、隐私同意、破坏性控件或最终提交。

## 明确不做

- 不提供任意 CSS、XPath、页面值、JavaScript 或 CDP 方法接口。
- 不把招聘网站 Cookie、认证头、请求/响应正文或网页现有值带出页面。
- 不用剪贴板作为自动降级；不申请或写入系统剪贴板。
- 不绕过登录、CAPTCHA、短信、身份认证或网站风控。
- 不把“页面可能自动保存草稿”描述成无外部状态变化；真实写入前必须向用户披露。
- 不点击最终申请提交，也不通过键盘回车间接触发提交。

## 固定架构契约

### 命令输入

写入命令必须绑定 `sessionId + snapshotId + opaque ref + action intent`。档案写入使用 allowlisted `profilePath`，可复用开放题使用用户确认的 `answerId`；公开协议不接受任意文本值。

执行前重新验证：

1. 会话 active、凭据为空的 HTTPS、Origin 与固定会话一致；
2. snapshot/ref 属于当前会话，控件语义指纹未漂移；
3. 控件仍可见、可用、非只读，动作与角色兼容；
4. safety 为 ordinary；文件仅进入 K4 的独立确认门；
5. 请求属于用户手势创建、仍在时限内的填写批次。

### 命令输出

只允许返回：`requestId`、动作类型、不透明引用、成功/失败、类型化错误、策略名、尝试次数和耗时桶。禁止返回请求值、旧值、当前值、选中文本、文件摘要或网页错误正文。

### 固定动作策略

- 文本/textarea：聚焦与全选后优先使用浏览器输入事件；失败后最多一次逐字键盘策略；固定 setter 只能作为内部注册动作并触发 `input/change/blur`。
- contenteditable：聚焦、选择可编辑内容、浏览器文本输入、`input/blur`，只在页面内部做归一化布尔验证；不写 `innerHTML`。
- 原生 select/radio/checkbox/date/month：精确目标、标准事件、布尔回读；找不到或多义时失败。
- 自定义下拉/级联/日期：`click -> bounded wait -> refind -> exact option/date action -> settle -> verify`；不修改隐藏 input 冒充成功。
- 任何动作最多主策略加一次降级；验证失败不得换到附近的另一个控件。

## 节点、分支与晋升门

| 节点 | Feature | 分支 | PR base | 晋升门 |
| --- | --- | --- | --- | --- |
| N0 K1 基线与计划 | F037–F038 + 本文 | `agent/browser-kernel-k1-baseline` | `agent/resume-attachment-acceptance` | 当前 30 文件/239 测试、构建、权限审计；计划与分支表提交并发布 |
| N1 K2 原子写入 | F039 | `agent/browser-kernel-k2-actions` | `agent/browser-kernel-k1-baseline` | 匿名动作准确率、安全阻断、隐私响应和截图全部通过 |
| N2 K3 流程控制 | F040 | `agent/browser-kernel-k3-workflows` | `agent/browser-kernel-k2-actions` | 动态控件、SPA、超时、过期引用、幂等和 worker 恢复通过 |
| N3 K4 文件与证据 | F041 | `agent/browser-kernel-k4-evidence` | `agent/browser-kernel-k3-workflows` | 单 PDF 确认、重复上传、截图/日志隐私和错误类型通过 |
| N4 K5 Adapter 收敛 | F042 | `agent/browser-kernel-k5-adapters` | `agent/browser-kernel-k4-evidence` | 旧路径退出；三种匿名 ATS 家族端到端通过 |
| N5 真实网页验收 | F043 | `agent/browser-kernel-real-site-acceptance` | `agent/browser-kernel-k5-adapters` | 三个不同 ATS 家族 L2/L3、每站主策略 >90%、零误写/零提交 |

每个节点完成时必须按顺序执行：

1. 完成 feature 中列出的定向验证；
2. `npm run validate`；用户可见节点同时执行完整 `npm run test:e2e` 并检查当前匿名截图；
3. 更新 `feature_list.json` 与 `progress.md`，记录精确分母和结果；
4. `git diff --check`，检查 staged 文件中没有 `.env`、密钥、真实简历、个人值、Cookie、请求正文或真实填表截图；
5. 在对应分支提交并 `git push -u origin <branch>`；
6. 创建以表中前一分支为 base 的 draft PR，把 branch/commit/PR URL 写回 `progress.md`；
7. 不自动合并、不自动标记 ready、不在同一分支开始下一节点。

## 可重复验证层级

### L0：无浏览器单元测试

- 协议 Schema、引用/session/snapshot 校验；
- 角色与动作兼容矩阵；
- 敏感/验证/身份/文件/破坏/提交阻断；
- 归一化、选项精确匹配、错误类型和隐私 sanitizer；
- requestId 幂等账本和尝试上限。

### L1：匿名 HTTPS + 真实 Chrome

使用扩展真实权限、真实 `chrome.debugger` 和匿名 ground truth。至少覆盖：

- 原生 text/email/tel/textarea/select/radio/checkbox/date/month；
- React 风格受控输入、Vue 风格 input/change、contenteditable；
- 搜索/级联/多选下拉、自定义年月区间、异步校验；
- 主文档、同源 iframe、开放 Shadow DOM；
- framework rejection、disabled/read-only、过期 ref、DOM 替换、SPA 和 Origin 变化；
- 密码、验证码、身份、文件和最终提交陷阱。

K2 已知正确引用的主策略验证成功率目标至少 95%，有界恢复后的最终成功率至少 98%；安全阻断、回读覆盖、错误类型覆盖和零提交必须为 100%。匿名 fixture 是所有百分比回归的权威来源。

### L2：真实招聘页只读预检

每个候选站点必须由用户在已登录的精确标签页点击扩展连接。只读取允许的结构元数据，不读取现有值。预检记录：

- 精确 Origin 与去查询路径模式；
- ATS 家族与页面步骤；
- reachable ordinary 控件按类型的数量；
- blocked safety 控件数量；
- iframe/open-shadow/SPA/自动保存提示的存在性；
- 支持字段分母和不可验收原因。

登录、CAPTCHA、身份检查、条款禁止或控件类型不足时记录 blocker。不得绕过；可以更换另一个 ATS 家族。

### L3：真实招聘页用户授权非提交写入

真实页面可能在最终提交前自动保存草稿，因此开始前必须让用户确认：目标 Origin、使用的本地档案、可能发生服务端草稿保存、不会操作的敏感项以及不会提交申请。

操作规则：

1. 用户点击一次“开始验收填写”，生成单站、限时、单批次授权；
2. 只处理 L2 列入分母且有 ground truth 的 ordinary 字段；
3. 每个字段写后立即布尔复核，失败最多一次降级；
4. 页面导航或结构替换后重新 state/find，旧 ref 一律失效；
5. 发现验证码、身份、同意、上传或提交即暂停对应动作；
6. 不为了恢复测试而清空用户已有草稿或删除记录；需要清理时交给用户。

## 三个真实 ATS 家族的选择标准

- 至少三个不同 ATS/组件家族；同一 ATS 的三个公司只算一个。
- 可考虑牛客、实习僧和一个企业自主 portal，但名称只是候选，不构成授权或保证。
- 每站至少有一个文本控件，并且三站合计必须覆盖 text、textarea/contenteditable、native/custom select、radio/checkbox、date/month；重复记录、iframe 和开放 Shadow DOM 在站点存在时纳入。
- 只使用用户明确同意的真实档案进行可能自动保存的写入；不把假数据写入用户账户。
- 平台条款明确禁止自动化时，该站只可做导航或只读证据，不进入 L3 分母。

## 指标口径

`supported ordinary denominator`：L2 中所有 reachable、用户批准、动作类型已支持、且有明确档案 ground truth 的普通字段。密码、验证码、身份、同意、文件、提交、关闭 Shadow DOM、不可访问跨域 frame 和 Canvas 不进入动作成功率分母，但必须进入 skipped/blocked 统计。

- 主策略成功率 = 首个策略写入并通过回读的字段 / supported ordinary denominator；每站必须 `> 90%`。
- 最终成功率 = 主策略或唯一一次降级后通过回读的字段 / denominator；三站聚合必须 `>= 98%`。
- 映射精度 = 写到正确 canonical profile path 的成功字段 / 所有自动映射并执行字段；必须 `>= 98%`。
- 验证覆盖率 = 有明确布尔回读结果的尝试 / 所有写入尝试；必须 `100%`。
- 安全阻断率 = 被拒绝的已知敏感/验证/身份/提交动作 / 所有安全反例；必须 `100%`。
- wrong-control write、超过两次尝试、最终提交、公开证据个人信息泄漏均必须为 `0`。

## 可提交的真实网页证据白名单

允许进入 GitHub：

- 站点/ATS 名称、Origin、无查询的路径模式；
- 浏览器、扩展、分支与 commit 版本；
- 各类型字段/动作数量、分母、百分比、尝试数；
- 类型化失败类别、blocker、零提交/零敏感动作标志；
- 由缺陷抽象出的匿名 fixture 和匿名截图。

禁止进入 GitHub：

- 任何真实页面值、档案值、简历文本、文件名/摘要/字节；
- Cookie、认证头、请求/响应正文、验证码、身份信息；
- 含真实填入内容的网页截图、录屏或 trace；
- URL 查询串、账号标识、申请 ID、原始 DOM/HTML 和网络 HAR。

真实页面截图只能留在用户本机私下检查；仓库截图必须来自匿名 fixture 或只展示无个人值的扩展汇总面板。

## 失败转回归规则

真实失败先分类为 `mapping`、`stale-ref`、`event`、`framework-rejected`、`option`、`date`、`wait`、`navigation`、`verification`、`blocked` 或 `site-policy`。只有可匿名复现的结构信息可以进入 fixture。修复必须先使匿名回归失败，再改代码使其通过；随后由用户决定是否在原站重新授权复验。
