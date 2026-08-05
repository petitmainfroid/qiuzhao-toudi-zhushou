# Agent Reach/OpenCLI 真实网页验证标准

## 目标与证据等级

目标页面是小米实习生招聘申请页：
`https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply`。

以下证据必须分开记录，低等级证据不能替代高等级证据：

1. **真实公开源**：读取实时页面 HTML、职位接口和 `resume_form_schema`，证明字段契约仍然存在；不得登录、填写或提交。
2. **真实登录标签页只读**：OpenCLI Browser Bridge 连接并绑定用户已登录的准确标签页；运行 status/scan/preview，证明 URL、DOM 和匹配结果来自真实页面；不得读取现有控件值或改变页面。
3. **真实登录标签页选择性填写**：用户在侧栏即时批准明确的建议 ID 后，只填写这些字段；记录结果和网络观察，证明未点击最终提交、未调用投递接口。
4. **小米派生本地回归**：覆盖匹配、受控组件、事件和 no-submit 行为；用于稳定回归，但不能声明真实页面已经通过。

## 环境门禁

在访问登录页面前运行：

```powershell
npm run audit:agent-bridge -- --url "https://xiaomi.jobs.f.mioffice.cn/internship/resume/7663053400020879658/apply"
```

预检必须报告：

- OpenCLI 版本；
- OpenCLI Browser Bridge 是否安装；
- `127.0.0.1:19825` daemon 是否已存在且扩展已连接；
- URL 是否为审核过的小米 HTTPS 申请路径；
- 本扩展的必要权限是否仍然只有 `activeTab`、`scripting`、`sidePanel`、`storage`；
- 是否存在 `cookies`、`debugger`、持久 host permission 等越界权限。

预检只观察已有状态。它不能启动 daemon、安装扩展、读取 Cookie、读取页面值或修改浏览器配置。正式真实页测试使用 `--require-ready`，任何 blocker 都必须终止。

## Agent 命令契约

允许命令只有：

- `status`：返回会话、标签页和 URL 绑定状态；
- `scan`：创建一次只读扫描；
- `preview`：返回字段标签、档案路径、置信度和确认状态，不返回现有网页值；
- `fill`：只接受最近扫描产生且被用户即时批准的 opaque suggestion IDs。

禁止提供：任意 CSS selector/value、文件上传、密码、验证码、CAPTCHA、Cookie、身份证号、隐私勾选或 submit 命令。

## 会话与填写安全

- 会话必须由侧栏中的用户点击创建；自动调用不能创建会话。
- capability 使用 256 位随机值，只保存在内存中。
- 会话绑定单个 tab 与去除 fragment 后的准确 HTTPS URL，最长十分钟。
- 导航、换页、换 tab、过期、撤销、协议不匹配或 capability 不匹配时拒绝。
- request ID 一次性使用，重放必须拒绝。
- 新扫描使旧填写批准失效。
- 填写批准最长一分钟，只能使用一次；实际 suggestion IDs 必须与用户批准集合完全相同。
- medium/sensitive 建议默认不选；最终填写仍需侧栏中的即时用户确认。

## 真实页通过标准

F014 只有同时满足以下证据才可完成：

- `npm run audit:xiaomi` 通过并记录时间、9 个分组和 34 个可见字段；
- `npm run audit:agent-bridge -- --url ... --require-ready` 无 blocker；
- OpenCLI 绑定的 tab URL 与审核 URL 匹配；
- status/scan/preview 来自真实登录页面，扫描前后 DOM 值不变；
- 用户明确批准一组非文件、非验证、非身份字段，fill 只改变批准字段；
- medium/sensitive 未批准项保持不变；
- 提交按钮没有 click 事件，未观察到最终投递 API 请求；
- `artifacts/xiaomi-agent-bridge.png` 展示真实页的预览/填写结果，但不包含个人值、Cookie、验证码或身份信息；
- `npm run validate`、Agent Bridge E2E 和完整 `npm run test:e2e` 通过。

若真实站点没有隔离沙箱，选择性填写必须使用用户真实且愿意传给小米的档案值，并在动作发生前再次确认；不得用虚构身份污染真实招聘系统。
