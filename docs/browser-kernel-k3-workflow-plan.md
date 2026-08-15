# K3 浏览器流程控制计划与验证标准

## 目标

F040 在已验证的 K2 `state/find/action` 之上增加有界等待、同 Origin 页面变化和请求幂等性。K3 不增加任意 selector、XPath、JavaScript、CDP method、跨 Origin 导航、网络正文、Cookie、剪贴板或最终提交能力。

上层组合流程固定为：

```text
state/find → action(open-control) → wait(option/find/state) → refind → action → wait(dom-settle) → verify
```

等待只观察脱敏结构、布尔状态、Origin 和无查询串路径。它不读取或返回输入值、选中值、简历字段值或页面错误正文。

## 四个实现增量

1. **K3.1 严格等待协议**：定义 `control-state`、`find`、`option-list`、`same-origin-navigation` 和 `dom-settle` 条件；超时限制为 100–10,000ms，轮询限制为 50–500ms；未知属性和 selector/script/nodeId 一律拒绝。
2. **K3.2 固定等待执行器**：只调用 K1 结构读取、固定引用复核和浏览器标签状态；命中时返回脱敏 snapshot/match/path 元数据；超时和 Origin 变化返回类型化原因。
3. **K3.3 持久幂等账本**：在 `chrome.storage.session` 中先记录请求摘要和 `in-flight`，再执行动作；相同 requestId+摘要复用已完成结果；不同摘要拒绝；worker 重启后遇到 `in-flight` 只返回 `uncertain-duplicate`，绝不重做副作用。
4. **K3.4 匿名真实 Chrome 验收**：真实扩展、真实 debugger 和匿名 HTTPS 动态页面串行执行固定分母，输出只含聚合数量、类型化类别和零计数。

## 固定 L1 分母

### 12 个成功用例

- `find`：延迟文本控件、延迟角色控件，共 2。
- `control-state`：disabled→enabled、collapsed→expanded，共 2。
- `option-list`：延迟选项出现、精确语义选项出现，共 2。
- `same-origin-navigation`：整页同 Origin 跳转、SPA history 跳转，共 2。
- `dom-settle`：多次结构变化后稳定、选项弹层稳定，共 2。
- 动态 refind 工作流：节点替换后重新定位并写入、异步下拉打开→等待→重新定位选项，共 2。

### 6 个有界失败用例

- 找不到语义控件。
- 选项列表不出现。
- 控件始终不可用。
- DOM 在超时内始终不稳定。
- 旧 snapshot/ref 不得在结构变化后继续写入。
- 跨 Origin 导航立即失败并暂停会话。

### 4 个幂等用例

- 已完成 action 的相同 requestId 顺序重放，副作用仍为 1。
- 同一 action requestId 并发两次，副作用仍为 1。
- 新建 ledger 实例模拟 worker 重启，已完成响应可安全重放且副作用不增加。
- 相同 requestId 携带不同摘要或恢复到 `in-flight` 状态时拒绝执行。

## RED gates

以下任意一项非零即停止 F040：

- duplicate side effect
- cross-Origin continuation
- arbitrary selector/script/CDP method acceptance
- stale-reference write
- third action attempt
- clipboard call
- password/OTP/identity/file/consent/destructive/final-submit action
- final submission
- profile/page value, query, ref, authorization, Cookie/header/body/file evidence leak

## 证据与晋级

- L0：协议、等待服务、ledger、运行时集成单元测试。
- L1：`npm run eval:kernel-workflows`，真实 Chromium + unpacked extension + anonymous HTTPS fixture。
- 报告：`artifacts/kernel-workflows-report.json`，只能包含固定 case id、分母、状态类别、耗时桶和零计数。
- 截图：`artifacts/kernel-workflows.png`，只显示扩展的匿名聚合卡片，不显示被填写页面值。
- 完成前串行运行 targeted tests、`npm run validate`、完整 `npm run test:e2e`、隐私/secret/whitespace 检查；随后提交、推送并创建以 `agent/browser-kernel-k2-actions` 为 base 的 Draft PR。
