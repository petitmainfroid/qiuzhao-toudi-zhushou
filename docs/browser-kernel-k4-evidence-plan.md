# K4 文件上传与隐私证据计划

## 目标与边界

F041 在 K3 的固定会话、匿名控件引用和幂等账本上增加三项能力：用户确认后的常用简历 PDF 上传、只在侧边栏内存中展示的当前页截图、以及字段白名单化的命令日志。上传只接受本地简历库中的唯一 `primary` PDF，不接受文件路径、临时任意文件、selector、XPath、脚本或任意 CDP method。

用户必须先在侧边栏看到并确认私密摘要、唯一文件控件引用和完整 HTTPS Origin。确认只绑定当前 `sessionId + snapshotId + ref + Origin + PDF revision`，有效期 60 秒。跨 Origin、页面变化、旧引用、文件变化、重放冲突或取消都会封闭失败。任何路径都不得点击最终提交。

## 实现节点

1. **K4.1 严格协议**：新增上传确认、上传执行、取消、临时截图和脱敏日志读取消息；全部使用精确键校验，拒绝文件路径、文件名、摘要、字节、selector 和脚本等附加参数。
2. **K4.2 固定上传执行器**：后台从本地 `primary` 简历库读取 PDF，通过固定 `File/DataTransfer` 页面函数写入当前唯一 `input[type=file]`，触发 `input/change` 后回读文件数量、类型和大小验证。页面函数和 CDP method 均不可由调用方指定。
3. **K4.3 授权、幂等与类型化错误**：授权绑定会话、Origin、页面路径、快照、引用和 PDF revision；复用 K3 请求账本，重复 requestId 不重复触发上传。调试器冲突、旧引用、超时、控件阻塞、页面变化、验证失败、用户取消分别返回独立原因。
4. **K4.4 隐私证据**：截图只有用户手势触发，返回给侧边栏内存预览，不写入 storage、日志和验收报告。命令日志只保留 request/action type、opaque ref、typed status、attempts、duration bucket 和 failure category。
5. **K4.5 匿名真实 Chrome 验收**：用 unpacked extension、真实 Chromium debugger 和匿名 HTTPS fixture 串行验证固定分母，报告只包含 case id、聚合计数和类型化分类；截图只展示脱敏侧边栏汇总卡。

## 固定 L1 分母

### 8 个正向用例

- 唯一 PDF 控件发现、私密摘要确认、一次上传、同 requestId 重放各 1。
- 上传后的 `input` 和 `change` 事件各只发生 1 次，共 2。
- 用户手势截图可见且不进入持久化存储、日志或报告，共 1。
- 命令日志字段集合严格符合白名单，共 1。

### 8 个封闭失败用例

- 会话已停止或失效 `session-inactive`；调试器占用到 `debugger-conflict` 的传输分类在 L0 以固定 Chrome API 错误验证。
- 旧快照/引用 `stale-reference`。
- 固定执行超时 `timeout`。
- disabled/readOnly/非唯一或非 file 控件 `blocked-control`。
- 同 Origin 路径变化或跨 Origin `page-changed`。
- File/DataTransfer 写入或回读不一致 `verification-failed`。
- 用户取消 `user-cancelled`。
- 重复 requestId 携带不同摘要 `duplicate-request-conflict`。

## RED gates

以下任一项非零即停止 F041：重复上传副作用、未确认上传、任意文件或路径上传、跨 Origin 继续、截图持久化、报告含页面值、日志含文件名/路径/摘要/字节/Cookie/header/query/profile/page value、selector/script/CDP method 接口、最终提交。

## 验证与发布

- L0：协议、授权、上传执行器、隐私 sanitizer、幂等、截图生命周期和错误映射单元测试。
- L1：`npm run eval:kernel-evidence`，真实 Chromium + unpacked extension + 匿名 HTTPS fixture。
- 完成前串行运行 targeted tests、`npm run validate`、完整 `npm run test:e2e`、暂存区隐私/secret/whitespace 检查。
- 证据为忽略的 `artifacts/kernel-evidence-report.json` 与 `artifacts/kernel-evidence.png`；截图只能显示侧边栏聚合卡，不能显示网页或 PDF 内容。
- 提交、推送，并创建以 `agent/browser-kernel-k3-workflows` 为 base 的 Draft PR 后才能把 F041 标记为 `done`。
