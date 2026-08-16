# Architecture

```text
Codex / Claude Code
        │ MCP stdio（六个意图级工具）
        ▼
modules/mcp-server
        ▼
modules/application-service
   ┌──────────────┬───────────────────┬──────────────────┐
   ▼              ▼                   ▼                  ▼
planner      policy-compiler     profile-service    browser-kernel
                                                        │ CDP
                                                        ▼
                                        browser-session → 专用 Chrome/Edge

用户 → 本机 profile-host React 页面 → profile-service 加密仓库
Judge ← real-page-validation ← 脱敏 observe/execute manifest
```

## 关键设计

1. `browser-session` 只管理专用浏览器 Profile 和标签页身份，不导出 Cookie。
2. `browser-kernel` 只接受 opaque ref 和类型化意图，不开放 eval、selector、XPath 或任意脚本。
3. Planner 只看到字段语义、档案路径目录和 `hasValue`，看不到个人标量值。
4. Policy compiler 生成不可变 plan；执行器随后才从本地档案仓库取值。
5. DOM 或 SPA 变化会使 page epoch/ref 失效，必须重新 inspect/plan。
6. 所有真实页结果按独立标注分母逐字段审计，失败不能从分母中删除。

## 修改位置

- 新增浏览器生命周期能力：`modules/browser-session/`
- 新增控件动作/回读：`modules/browser-kernel/` 与必要的 `shared/content/`
- 调整 AI 决策 schema：`modules/semantic-planner/`
- 调整授权/安全规则：`modules/policy-compiler/`
- 调整端到端业务流：`modules/application-service/`
- 调整 Agent 接口：`modules/mcp-server/` 和 `skills/`
- 调整个人资料字段或界面：先改 `shared/domain/`，再改 `gerenxinxi/`
- 新增站点证据：`modules/real-page-validation/`，不得写入真实值、DOM、Cookie 或截图
