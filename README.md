# qiuzhao-cli

`qiuzhao-cli` 是从原 `qiuzhaozhushou` 中抽出的零浏览器拓展产品线。它让 Codex、Claude Code 或其他 MCP 客户端通过本地 Node/CDP 内核观察、规划、受控填写并审计招聘网页；个人资料和浏览器登录态都只保存在本机。

## 目录

| 目录 | 责任 | 可否接触个人值 |
| --- | --- | --- |
| `apps/cli/` | 统一 `qiuzhao` 命令入口 | 否 |
| `modules/browser-session/` | 启动专用 Chrome/Edge Profile、复用登录态、绑定标签页 | 不读取表单值/Cookie |
| `modules/browser-kernel/` | CDP 结构观察、opaque ref、固定动作与写后回读 | 执行时由本地服务取值 |
| `modules/semantic-planner/` | 把网页字段映射为档案路径或人工终态 | 只看目录和 `hasValue` |
| `modules/policy-compiler/` | 校验授权、页面 epoch、控件安全和动作预算 | 不接收任意值/selector |
| `modules/application-service/` | inspect → plan → execute → audit 状态机 | 在边界内协调取值 |
| `modules/mcp-server/` | 暴露六个受限 MCP 工具 | 不返回页面/档案标量值 |
| `modules/real-page-validation/` | 真实网页 E0–E5、字段分母和 Judge | 只保存脱敏证据 |
| `gerenxinxi/profile-service/` | CandidateProfile、本地加密仓库、导入/回滚 | 是，仅本地 |
| `gerenxinxi/profile-host/` | 本机回环地址上的个人信息 React 页面 | 是，仅本机 |
| `shared/` | 字段模型、简历解析、UI、页面观察与固定动作原语 | 依调用边界而定 |
| `tests/` | 跨模块协议测试 | 只用合成对象，不证明站点兼容 |

`packages/browser-runtime`、Chrome 扩展的 background/content/sidepanel/manifest 没有迁入，避免零扩展产品继续维护两套浏览器写入链路。

## 开始使用

要求 Windows、Node.js 22+、Chrome 或 Edge。

```powershell
cd C:\path\to\qiuzhao-cli
npm install
npm run profile:build

# 打开本地个人资料页
npm run qiuzhao -- profile serve

# 启动专用浏览器并打开招聘页
npm run qiuzhao -- browser launch --browser chrome --url "https://example.com/apply"

# 登录后确认该页面可用于 Agent
npm run qiuzhao -- browser confirm-ready

# 查看状态并由用户创建最长 30 分钟的普通字段授权
npm run qiuzhao -- agent status
npm run qiuzhao -- agent authorize --ttl-minutes 10

# MCP stdio 服务（供 Codex/Claude Code 配置）
npm run qiuzhao -- agent serve
```

查看全部命令：`npm run qiuzhao -- help`。

## 安全边界

- 不读取或导出 Cookie、密码、验证码。
- 身份信息、附件、同意、记录保存和最终提交必须由用户处理。
- Agent 不能自行创建或扩大授权。
- MCP 只暴露 `workspace_status`、`application_inspect`、`application_plan`、`application_execute`、`application_audit`、`workflow_cancel`。
- 当前“代码存在”不等于“全部真实网站已验证”；站点能力以 `docs/STATUS.md` 为准。

## 开发验证

```powershell
npm run validate
```

模块变更应先跑相应定向测试，最后再跑全量验证。真实招聘网站的兼容性测试只能回到已保留的真实 URL，不能用复制 HTML 或 fixture 替代。
