# 浏览器操作内核：分层设计与验证标准

## 阶段目标

当前阶段只建设类似 OpenCLI 的浏览器操作底层，不在底层硬编码小米、BOSS、牛客或其他招聘站点规则。招聘字段识别、档案映射和站点 Adapter 在内核稳定后接入。

最终用户只安装“秋招填表助手”一个扩展。扩展内包含会话、页面状态、定位、原子操作、等待、上传、截图和审计能力；不要求另装 OpenCLI、Node.js、本地守护进程或第二个 Browser Bridge。

## 不可突破的产品边界

- 只有用户在扩展界面点击后，才能开始读取或操作目标页面。
- 只连接没有内嵌用户名或密码的 HTTPS 页面；跨 Origin 后立即暂停并解绑。
- 不读取、保存或导出 Cookie、认证头、密码、验证码、身份证件值或网络响应正文。
- 不提供任意 JavaScript 执行接口，不把任意 CDP 方法透传给上层。
- 不绕过 CAPTCHA、短信或身份认证，不操作浏览器内部页。
- 内核必须识别并拒绝最终申请提交控件；招聘提交永远由用户完成。
- 日志只记录命令类型、目标引用、状态码、耗时和失败类别，不记录填写值、页面现有值或简历字节。

## 分层里程碑

| 层级 | 能力 | 通过标准 | 明确不包含 |
| --- | --- | --- | --- |
| K0 会话内核（F037） | 固定一个 HTTPS 标签页、CDP 连接、生命周期、结构摘要 | 用户手势启动；同 Origin 跳转延续；跨 Origin、超时、关闭标签页、调试器冲突均安全停止；状态只含 Origin、路径和数量 | 查找、填写、点击、上传 |
| K1 状态与定位（F038） | `state`、稳定引用、`find`、frame/shadow 边界 | 匿名复杂页面的可交互控件召回率 >= 95%；重复 state 的稳定引用率 100%；不返回输入值 | 页面修改、任意 CSS/XPath 接口 |
| K2 原子操作（F039） | `click`、`type`、`select`、`check`、`fill` | 支持的匿名控件写后复核准确率 100%；每个失败都有类型化原因；提交/密码/验证码/身份控件阻断率 100% | 最终提交、CAPTCHA、身份字段自动化 |
| K3 流程控制（F040） | `wait`、同 Origin 导航、标签页状态、会话复用 | 动态控件、异步校验和 SPA 跳转有确定超时；相同 requestId 不重复副作用；服务工作线程重启后可恢复 | 跨 Origin 静默继续、无限等待 |
| K4 文件与证据（F041） | 单文件上传、截图、命令日志、类型化错误 | 保存的 PDF 只在用户确认后传给唯一文件控件；截图不进入持久日志；重试不重复上传；日志隐私检查 100% | 任意本地路径、Cookie/网络正文捕获 |
| K5 Adapter 接口（F042） | 让秋招规则调用统一内核 | 现有扫描、填写、建档和简历附件都只依赖类型化接口；至少三种匿名 ATS 结构通过 | 站点最终提交策略 |

百分比指标必须来自带 ground truth 的匿名 fixture。真实招聘网页只用于用户授权后的非提交验收，不能替代可重复的自动化回归。

K2–K5 的节点拆分、堆叠分支、动作策略和三类真实 ATS 验收清单见 [`browser-kernel-delivery-plan.md`](browser-kernel-delivery-plan.md)。F039–F042 只证明可重复的内核与匿名 ATS 能力；只有 F043 可以声明“三个真实校招网站”的去标识、非提交验收结果。

## K0（F037）详细验收用例

### 正向能力

1. 构建产物只包含本扩展，不包含 OpenCLI CLI、daemon 或第二个扩展。
2. 用户点击“连接当前招聘页”后，后台固定一个 HTTPS 标签页并返回 `active`。
3. 返回状态只允许包含 sessionId、tabId、Origin、路径、开始/到期时间、可交互控件数和 frame 数。
4. 同 Origin 从 `/apply/1` 跳到 `/apply/2` 后，sessionId 不变，路径更新。
5. Manifest 的新增权限与验证脚本中的白名单完全一致。

### 安全反例

1. 没有用户手势、HTTP、`chrome://`、带用户名密码的 URL 一律拒绝。
2. 跳到不同 Origin 后状态变为 `paused`，并调用 debugger detach。
3. 10 分钟到期、标签页关闭或 debugger 被占用时，不自动重连或切换其他标签页。
4. 页面含密码、验证码和“提交申请”按钮时，K0 只能统计结构，不能触发任何事件。
5. 状态、错误、截图和测试产物不得出现输入框 value、Cookie、Authorization、PDF 字节或真实个人信息。

### 自动化证据

- 单元测试覆盖会话启动、幂等启动、同 Origin、跨 Origin、超时、关闭、detach 与未授权消息。
- `npm run validate` 全部通过，权限审计精确比较允许/禁止项。
- 扩展 E2E 在匿名 HTTPS 页面启动真实 `chrome.debugger`，验证结构摘要、同 Origin 延续、跨 Origin 暂停和零提交。
- `artifacts/embedded-bridge.png` 只显示去敏会话状态。
- `progress.md` 记录命令、退出码、测试数量、截图检查和下一层，不记录网页值。

## K1（F038）详细验收用例

### 正向能力

1. `state` 只返回控件角色、标签、占位提示、技术名称、附近文字、选项标题、布尔能力、边界类型、安全分类和会话内不透明引用。
2. 同一会话中未变化控件的引用在重复 `state` 间保持稳定；每次读取生成新的 snapshotId。
3. `find` 只接受经过类型校验的文字、角色白名单和 1–20 的结果上限，不接受 CSS、XPath 或 CDP 节点 ID。
4. 普通文档、同源 iframe 和开放 Shadow DOM 都纳入同一次结构读取，并标记各自边界。
5. 标签、ARIA 标签、`label for`、包裹标签、占位提示、技术名称、附近文字和下拉选项均可参与确定性查找。

### 安全反例

1. 公开响应中不得出现 input value、checked/selected 状态、DOM id/class/style、选择器、CDP nodeId/backendNodeId/frameId 或 URL 查询串。
2. 任意未知 input type 按浏览器默认的 `text` 类型输出，页面不能借伪造类型属性带出信息。
3. 关闭的 Shadow DOM、跨 Origin 内容、隐藏控件和超过结构上限的页面不得被静默扩权读取。
4. 密码、验证码、身份、文件和最终提交控件只能返回类型化限制标记，不执行任何页面操作。
5. K1 不提供 click、type、select、check、upload、navigate、任意脚本执行或网络/Cookie 接口。

### 自动化证据

- `npm run eval:kernel-state` 在真实 Chrome 中加载本扩展和匿名 HTTPS ground truth：24/24 标签命中，语义召回率 100%，重复引用稳定率 100%，覆盖同源 iframe 与开放 Shadow DOM。
- 五个查找样本（毕业院校、硕士选项、期望岗位、作品集链接、推荐人姓名）全部首位命中。
- fixture 中的输入值、勾选状态、DOM 标识、查询参数和节点 ID 均未进入公开状态；禁泄漏计数为 0，最终提交计数为 0。
- `artifacts/page-state-find-report.json` 只保存聚合指标和匿名标签；`artifacts/page-state-find.png` 展示只读结构与查找结果。

## K2（F039）详细验收用例

### 正向能力

1. `fill`、`type`、`select`、`check` 和受限 `click` 只接受活动会话的当前 snapshot 与不透明引用，不接受选择器、DOM/CDP ID、脚本或调用方提供的页面值。
2. 用户在侧栏单独授权后，后台从当前本地档案版本的白名单路径解析值；授权最长 60 秒，并在会话停止、跨 Origin、到期或 debugger detach 时失效。
3. 固定动作覆盖文本、email、textarea、原生单选/多选 select、radio、checkbox、date、month、contenteditable，以及只打开兼容 combobox/listbox 的 click。
4. 文本路径触发 `beforeinput`、原生 setter、`input`、`change`、`blur/focusout` 等兼容事件；每次动作在页面内回读验证，只返回状态、策略、尝试次数、耗时档位和失败类别。
5. 主策略失败时只有文本类动作可使用一次固定键盘输入降级；不使用剪贴板，不进行第三次尝试，也不换到相邻控件。

### 安全反例

1. 密码、OTP/CAPTCHA、身份、文件、同意条款、破坏性动作和最终提交全部阻止且零页面修改。
2. disabled、readonly、动作前隐藏、过期 snapshot、节点替换、伪造 ref、旧 session 和不兼容按钮全部关闭失败。
3. 动作前后语义指纹、frame 与同 Origin 证明必须一致；未知或跨 Origin frame 不进入可写集合。
4. 标签提取必须跳过包裹 label 内的 textarea 值与 select 控件正文，避免旧页面值混入语义状态。
5. 证据不得包含授权 ID、session/snapshot/ref、档案路径/版本、请求值、旧值、当前值、选择器、节点 ID、查询串、Cookie、请求正文或真实个人信息。

### 自动化证据

- `npm run eval:kernel-actions` 在真实 Chrome 中加载本扩展和匿名 HTTPS ground truth：主策略 23/24，单次降级后 24/24，正确回读与事件契约 24/24。
- 8/8 受限控件阻止、8/8 完整性场景关闭失败、2/2 类型化拒绝符合预期。
- 误写、提交、第三次尝试、剪贴板、跨 Origin 动作和证据泄露计数全部为 0。
- `artifacts/kernel-actions-report.json` 只保存匿名聚合与 case ID；`artifacts/kernel-actions.png` 展示无值的 Organic 验收摘要。

## K5（F042）匿名三家族验收证据

### 覆盖范围

1. `anonymous-ats-alpha` 覆盖普通文本、textarea、原生 select 和单日期。
2. `anonymous-ats-beta` 覆盖 contenteditable、可搜索下拉、radio、由档案字段是否存在驱动的 checkbox，以及同源 iframe。
3. `anonymous-ats-gamma` 覆盖双输入日期区间、开放 Shadow DOM、重复记录新增/保存和已保存简历 PDF 上传。
4. 未知企业自定义题保持手动；密码、验证码、身份、同意条款、破坏性动作和最终投递不进入可执行计划。

### 自动化证据

- `npm run eval:kernel-adapters` 在真实 Chrome 中通过 3/3 匿名 ATS 家族。
- Ground Truth 计划与映射为 14/14，映射精度 100%；支持写入 14/14，主策略和最终回读验证均为 100%。
- 重复记录新增 1 次、保存 1 次，已保存简历上传 1 次；错误控件写入和最终投递动作均为 0。
- 当前 `npm run validate` 通过 46 个测试文件、394 个测试、生产构建和权限审计；`npm run test:e2e` 通过 30/30 个串行真实 Chrome 用例。
- `artifacts/kernel-adapters-report.json` 只包含匿名家族、能力、计数、比率和安全标志；`artifacts/kernel-adapters.png` 是 Organic 风格的无个人值验收摘要。
- 生产飞书清单的独立匿名 canary 在真实 Chrome 中通过：K1 从受限容器元数据恢复技术字段键，同时去除网页值、简历文件名、上传时间和 URL 查询。写入 parity 覆盖文本、可搜索下拉、唯一复合日期区间、项目新增/保存和已保存 PDF；企业自定义题未修改，最终投递为 0。
- 安装版侧栏在精确受信任飞书申请 URL 上已走生产 K5 resolver：扫描建议默认勾选 0 项，用户勾选后写入由内核回读验证。当前截图为 `artifacts/feishu-k5-sidepanel.png`，仅含匿名测试档案。
- 第二个生产家族 Moka 已通过保守 L1 parity：公共 41 字段契约中 27 个可由当前档案无歧义承载的字段全部写后验证，三个连续自定义下拉会逐次重扫和精确重绑。独立工作经历、身份字段、无独立 schema 的细分字段、企业题、整页保存和最终提交均未操作。截图为 `artifacts/moka-k5-sidepanel.png`。
- 第三个生产家族 Lenovo Talent 已通过保守 L1 parity：公开 55 字段契约逐项记录了 15 个自动处理和 40 个手动决策；14 个档案字段全部写后验证，保存的 PDF 上传 1 次。姓名拆分、radio 组、`YYYY/MM` 月份、远程学校、多选城市、条件创建、证件和专属问题均保持手动；整页保存和最终提交为 0。截图为 `artifacts/lenovo-k5-sidepanel.png`。
- 第四个生产家族 Ctrip Careers 已通过保守 L1 parity：公开 28 控件契约逐项记录 14 个自动处理和 14 个手动决策，14 个档案字段全部写后验证。手机号只触发人工短信门槛，验证码未读取或填写；解析附件、作品集附件、整页保存和最终提交均为 0。截图为 `artifacts/ctrip-k5-sidepanel.png`。
- 旧 `ChromePageBridge`/`RoutedPageBridge`、runtime content 消息协议、content-script 入口和 `content.js` 构建产物均已删除；Manifest 不再申请 `scripting`。生产侧栏只有精确 URL 门控后的 K5 适配器路径。
- 新增未知 ATS 安装版 Chrome 验收：扫描前后姓名哨兵值不变，`input`、`change`、`submit` 事件全部为 0，侧栏明确说明“没有扫描或填写任何字段”。截图为 `artifacts/k5-unsupported-page.png`。

### F042 完成边界

F042 已完成统一 K5 内核、四个生产家族的声明与匿名 parity、旧写入路径删除和未知页面零写入验收。这里仍然只是 L1 匿名 HTTPS 证据；真实招聘网站上的只读与用户确认后非提交验收只属于 F043，不能由本节点推断。

## 真实网页验收梯度

- L0：单元测试；无浏览器。
- L1：匿名 HTTPS fixture；真实 Chrome + 真实扩展权限 + 真实 debugger。
- L2：用户已登录的真实招聘页只读结构验收；不得读取现有值。
- L3：用户逐项确认后的真实非提交操作；每种操作单独授权并记录去敏结果。

任何低等级证据都不能宣称完成更高等级验收。验证码、身份检查和最终申请提交在所有等级都不执行。
