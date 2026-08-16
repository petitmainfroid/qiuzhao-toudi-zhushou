# qiuzhao-cli

`qiuzhao-cli` 是一个 Windows 本地优先、零浏览器扩展的招聘表单 MCP。它让 Codex、Claude Code 或其他支持 STDIO MCP 的 Agent，通过专用 Chrome/Edge Profile 读取招聘页面结构、规划字段映射、受控填写并进行写后回读。

个人资料、简历和招聘网站登录状态都只保存在本机。MCP 不向 Agent 返回档案标量值、Cookie、密码、验证码、DOM、selector 或任意脚本能力，也不会点击最终提交。

> 当前定位：可实际使用的专业型 Beta，而不是任意网页自动化工具。小米、MetaApp、虎牙和蔚来等真实招聘页面已经进行过非提交验证；复杂自定义下拉仍可能需要人工选择。站点能力以 [`docs/STATUS.md`](./docs/STATUS.md) 为准。

## 新用户需要几步？

首次使用需要 **7 步**：

1. 克隆代码。
2. 安装依赖并构建本地资料页。
3. 填写并保存本地个人资料。
4. 启动专用浏览器并登录招聘网站。
5. 把 MCP 接入 Codex 或其他 Agent。
6. 为当前招聘网站创建短期普通字段授权。
7. 让 Agent 填写，最后由本人检查并提交。

配置完成后，每次填写通常只需要 **4 步**：打开或重连专用浏览器 → 打开招聘页 → 创建短期授权 → 让 Agent 填写并人工提交。

## 环境要求

- Windows 10/11。
- Node.js 22 或更高版本。
- Git。
- Chrome 或 Edge。
- 可选：Codex CLI、Codex IDE/桌面端，或其他支持 STDIO MCP 的客户端。

不需要安装浏览器扩展，也不需要招聘网站 API。

## 首次使用：7 步完成设置

### 1. 克隆项目

```powershell
git clone https://github.com/petitmainfroid/qiuzhao-toudi-zhushou.git
cd qiuzhao-toudi-zhushou
```

### 2. 安装依赖并构建

```powershell
npm ci
npm run profile:build
```

如果需要先确认本机环境和完整代码状态，可以运行：

```powershell
npm run validate
```

### 3. 填写本地个人资料

在一个单独的 PowerShell 窗口中运行：

```powershell
npm run qiuzhao -- profile serve
```

命令会打开本机资料页。填写基本信息、教育经历、实习/工作经历、项目、获奖、语言能力和求职偏好后保存。也可以在资料页导入简历。

资料和默认简历使用当前 Windows 用户的 DPAPI 加密，默认不会上传到网络。`profile serve` 需要保持运行；结束后可以按 `Ctrl+C`，或在另一个终端运行：

```powershell
npm run qiuzhao -- profile stop
```

### 4. 启动专用浏览器并登录

```powershell
npm run qiuzhao -- browser launch --browser chrome --url "https://example.com/apply"
```

请在打开的专用浏览器中自行登录招聘网站，并完成短信、验证码或身份验证。登录状态保存在本机专用 Profile 中，程序不读取或导出 Cookie。

确认当前页面可填写：

```powershell
npm run qiuzhao -- browser status
```

正常状态应为 `application_ready`。系统会自动区分申请表、登录页和验证页；只有状态为 `unknown` 且你已确认页面确实是申请表时，才使用：

```powershell
npm run qiuzhao -- browser confirm-ready
```

### 5. 接入 Codex MCP（只需一次）

先取得项目中 `apps\cli\qiuzhao.mjs` 的绝对路径，然后运行：

```powershell
codex mcp add qiuzhao -- node "C:\absolute\path\to\qiuzhao-toudi-zhushou\apps\cli\qiuzhao.mjs" agent serve
codex mcp list
```

重启 Codex 客户端。在 Codex 中可使用 `/mcp` 检查 `qiuzhao` 是否已连接。

也可以编辑 `~/.codex/config.toml`：

```toml
[mcp_servers.qiuzhao]
command = "node"
args = ["C:\\absolute\\path\\to\\qiuzhao-toudi-zhushou\\apps\\cli\\qiuzhao.mjs", "agent", "serve"]
cwd = "C:\\absolute\\path\\to\\qiuzhao-toudi-zhushou"
startup_timeout_sec = 30
tool_timeout_sec = 300
```

Codex CLI、IDE 扩展和桌面端在同一 Codex 主机上共享 MCP 配置。其他 MCP 客户端使用相同的 STDIO 启动信息：

- command：`node`
- args：`<项目绝对路径>\apps\cli\qiuzhao.mjs agent serve`
- working directory：项目根目录

配置格式可参考 [OpenAI 官方 MCP 文档](https://developers.openai.com/codex/mcp/)。

### 6. 为当前网站创建短期授权

Agent 不能自行创建或扩大填写权限。确认浏览器和资料均为 `ready` 后，由用户运行：

```powershell
npm run qiuzhao -- agent status
npm run qiuzhao -- agent authorize --ttl-minutes 10
```

授权只绑定当前网站来源、当前资料版本和普通字段，最长 30 分钟。切换到另一家公司页面后，需要为新的来源重新授权。

随时可以撤销：

```powershell
npm run qiuzhao -- agent revoke
```

### 7. 让 Agent 填写

可以直接对 Codex 说：

> 使用 qiuzhao MCP 检查当前招聘页面，按本地资料规划并填写所有可安全确定的普通字段，完成写后回读和审计；不要保存、删除、同意或最终提交。

Agent 会使用固定流程：

```text
page readiness
  → CDP 结构读取
  → 区块与记录识别
  → 字段映射
  → 安全编译
  → 受控填写
  → Boolean 回读
  → 审计
```

如果希望不经过外部 MCP 客户端，也可以在本机直接运行封闭的一键普通字段流程：

```powershell
npm run qiuzhao -- autofill
```

最后请回到招聘网页，人工检查所有字段，处理无法唯一匹配的下拉、同意项、验证码和身份字段，并由本人点击保存或最终提交。

## 以后每次填写：4 步

### 1. 启动资料页并重连浏览器

```powershell
npm run qiuzhao -- profile serve
```

在另一个终端运行：

```powershell
npm run qiuzhao -- browser reconnect
```

如果专用浏览器还没有运行，改用 `browser launch`。

### 2. 打开或绑定招聘页

```powershell
npm run qiuzhao -- browser open --url "https://example.com/apply"
npm run qiuzhao -- browser status
```

如果页面已经由用户打开，可以先列出标签页，再绑定目标：

```powershell
npm run qiuzhao -- browser tabs
npm run qiuzhao -- browser attach --target <targetId>
```

### 3. 创建短期授权

```powershell
npm run qiuzhao -- agent authorize --ttl-minutes 10
```

### 4. 让 Agent 填写并人工提交

让 Agent 使用 MCP 完成非提交填写和审计。检查网页后，由本人处理剩余字段并提交申请。

## MCP 暴露的工具

招聘表单 MCP 固定暴露六个意图级工具：

| 工具 | 用途 |
| --- | --- |
| `workspace_status` | 查看浏览器、资料、授权和工作流状态 |
| `application_inspect` | 读取不含字段值的页面组件清单 |
| `application_plan` | 提交封闭的字段映射计划 |
| `application_execute` | 执行已编译、已授权的普通字段计划 |
| `application_audit` | 查看每个字段的脱敏终态和安全计数 |
| `workflow_cancel` | 取消流程、撤销授权并使引用失效 |

它不提供原始 CDP、任意 selector、任意脚本、任意页面点击、任意本地文件路径或直接字段值输入。

## 重复经历与复杂控件

页面记录少于本地资料时，系统可以识别教育、工作、实习、项目、语言和奖项区块，并按以下顺序补齐：

```text
比较本地目标条数
  → 填完当前最新记录
  → 每次只新增一条
  → 重新观察页面
  → 填写新记录并回读
  → 再决定是否继续新增
```

年月范围固定遵循左侧/前项为开始、右侧/后项为结束。找不到唯一精确选项时返回 `option_not_found` 或 `option_ambiguous`，不会猜选。

## 安全边界

- 不读取、导出或保存招聘网站 Cookie、密码和验证码。
- 个人资料和简历仅保存在本机，并使用 Windows DPAPI 加密。
- 身份字段、同意项、删除、记录保存和最终提交不可由 MCP 自动执行。
- Agent 不能创建授权；授权必须由用户针对当前网站短期创建。
- 页面变化、登录失效、验证码、候选歧义和回读失败都会停止或要求重新规划。
- 页面视觉模块只用于本地验收核验，不参与生产字段理解；临时截图应及时清理。

## 常用命令

```powershell
# 查看全部命令
npm run qiuzhao -- help

# 浏览器
npm run qiuzhao -- browser status
npm run qiuzhao -- browser tabs
npm run qiuzhao -- browser reconnect

# 资料页
npm run qiuzhao -- profile status
npm run qiuzhao -- profile stop

# Agent/MCP
npm run qiuzhao -- agent status
npm run qiuzhao -- agent revoke
npm run qiuzhao -- agent serve

# 本地视觉核验
npm run qiuzhao -- vision status
npm run qiuzhao -- vision cleanup-expired
```

## 故障排查

### `profile serve` 提示找不到构建文件

```powershell
npm run profile:build
```

### `browser_not_ready`

先检查：

```powershell
npm run qiuzhao -- browser status
```

在专用浏览器中完成登录或验证后重试。不要尝试绕过验证码。

### Codex 中看不到工具

```powershell
codex mcp list
```

确认启动路径是绝对路径，然后重启 Codex。可在 Codex 中使用 `/mcp` 查看连接状态。

### `authorization_required`

确认当前招聘页和个人资料均为 ready，然后运行：

```powershell
npm run qiuzhao -- agent authorize --ttl-minutes 10
```

### `option_ambiguous` 或 `option_not_found`

网页选项与本地资料没有唯一精确对应。请在网页中人工选择，不要通过放宽匹配规则强行猜测。

### 切换电脑后读不到原资料

资料使用当前 Windows 用户的 DPAPI 加密，不能直接复制密文到另一台电脑或另一名 Windows 用户。请在原环境导出允许迁移的数据，或在新环境重新录入。

## 项目结构

| 目录 | 责任 | 可否接触个人值 |
| --- | --- | --- |
| `apps/cli/` | 统一命令入口 | 否 |
| `modules/browser-session/` | 专用浏览器 Profile、登录态复用、标签页绑定 | 不读取 Cookie/表单值 |
| `modules/browser-kernel/` | CDP 结构观察、固定动作、写后回读 | 执行时本地取值 |
| `modules/section-extractor/` | 区块与重复记录上下文 | 否 |
| `modules/semantic-planner/` | 网页字段映射为档案路径或人工终态 | 只看目录与 `hasValue` |
| `modules/policy-compiler/` | 授权、页面 epoch、安全类别和动作预算 | 不接收任意值/selector |
| `modules/application-service/` | inspect → plan → execute → audit | 在本地边界内协调 |
| `modules/mcp-server/` | 六个受限 MCP 工具 | 不返回页面/档案标量值 |
| `gerenxinxi/profile-service/` | 加密档案仓库 | 是，仅本地 |
| `gerenxinxi/profile-host/` | 本机个人资料页面 | 是，仅本地 |
| `modules/page-vision/` | 临时截图验收工具 | 私有、本机、非生产理解 |
| `tests/` | 协议、模块和安全回归测试 | 使用合成对象 |

## 开发与验证

```powershell
npm run validate
```

模块变更应先运行相应定向测试，最后运行完整验证。真实招聘网站的兼容性结论必须来自保留的真实页面和独立冻结的字段分母；fixture 只能证明协议和原语行为。

## License

本项目使用 MIT License。个人资料、本机运行状态、临时截图、招聘网站内容和第三方非商业源码不属于发布内容。
