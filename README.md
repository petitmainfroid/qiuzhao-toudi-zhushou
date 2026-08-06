# 秋招投递助手

秋招投递助手是一款本地优先的 Chrome / Edge 扩展。你只需要维护一份求职档案，就能在招聘网页中预览字段匹配、创建缺失的教育/实习/项目等记录，并选择性填入重复信息。

简历解析、档案保存和字段纠错均在本机完成。你还可以保存一份常用 PDF 到扩展本地数据库，后续投递无需重复选择文件。扩展不会保存招聘网站密码或 Cookie，不会绕过验证码，也不会点击最终提交按钮。

## 普通用户：三分钟开始

### 1. 下载

进入 [GitHub Releases](https://github.com/petitmainfroid/qiuzhao-toudi-zhushou/releases)，按需求下载：

- `qiuzhao-toudi-assistant-bundle.zip`：推荐。包含浏览器扩展、Codex Skill、中文说明和隐私说明。
- `qiuzhao-profile-assistant.zip`：只包含浏览器扩展。
- `qiuzhao-toudi-assistant-skill.zip`：只包含 Codex Skill。

项目尚未上架 Chrome Web Store，因此目前需要以“加载已解压的扩展程序”方式安装。

### 2. 加载浏览器扩展

1. 解压下载的 ZIP。
2. Chrome 打开 `chrome://extensions/`；Edge 打开 `edge://extensions/`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 如果使用扩展单独包，选择包含 `manifest.json` 的解压目录；如果使用完整包，选择其中的 `extension` 目录。
6. 建议把“秋招填表助手”固定到浏览器工具栏。

浏览器不允许网页或脚本代替用户确认“加载已解压的扩展程序”，因此第 2–5 步必须由用户本人完成。

### 3. 导入简历并建立档案

1. 打开扩展的“求职档案”。
2. 选择不超过 10 MB 的文字版 PDF 或 DOCX 简历。
3. 在原有档案表单中检查解析结果；已有非空内容不会被静默覆盖，无法确认的信息保持空白。
4. 修正内容后点击“保存档案”。

解析全程在扩展页面内运行，不会上传。PDF 原件会作为“常用简历”保存到扩展的本地 IndexedDB，方便后续复用；DOCX 原件和提取全文不会持久化。结构化字段仍需检查后点击“保存档案”。可在档案页单独删除常用 PDF，也可通过“删除全部本地数据”一并清除。

### 4. 在招聘网页中使用

1. 打开一个普通的 `http/https` 招聘申请页面。
2. 在当前招聘页面亲自点击一次工具栏中的扩展图标，授予该标签页临时 `activeTab` 权限。
3. 在侧边栏点击“扫描当前页面”。扫描只读取字段标签和结构，不读取输入框当前值。
4. 查看“网页为空”“内容一致”和“内容冲突”的比较结果。
5. 按需创建缺失的教育、实习、项目、作品、获奖或语言记录。
6. 只勾选确认无误的字段，然后点击“填写已选项”。
7. 如果侧边栏发现唯一且明确的“上传简历”PDF 控件，会自动准备已保存的常用 PDF；核对文件名、大小、摘要、目标网站和目标控件后，再点击一次“确认上传到……”。也可以临时另选一个 PDF，并将它替换为新的常用简历。招聘网站可能在确认时立即接收文件。
8. 回到网页检查填写内容和简历附件，手动完成其他附件或验证码，最后由本人提交。

页面跳转或刷新后，`activeTab` 权限可能失效。看到“无法读取当前页面”或 `Cannot access contents of the page` 时，请停留在招聘页面并重新点击扩展图标，再扫描一次。

## 安装 Codex Skill

Skill 可以让 Codex 按本项目的安全流程协助你构建、加载、授权、导入简历和排查网页填写问题。

从源码仓库安装：

```powershell
npm run install:skill
```

命令会把 `qiuzhao-toudi-assistant` 复制到 `%CODEX_HOME%\skills`；未设置 `CODEX_HOME` 时使用 `%USERPROFILE%\.codex\skills`。重新启动 Codex 后，可以这样调用：

```text
$qiuzhao-toudi-assistant 帮我构建并加载秋招投递助手，然后检查当前招聘页为什么无法扫描。
```

如果下载的是 Skill 单独包，也可以把其中的 `qiuzhao-toudi-assistant` 文件夹复制到上述 skills 目录。Skill 不会获得招聘网站密码、Cookie、验证码、任意文件路径或最终提交能力。

## 从源码构建

环境要求：Node.js 22 或更高版本、Chrome 114+ 或较新的 Edge。当前开发基线使用 Node.js 24。

```powershell
git clone https://github.com/petitmainfroid/qiuzhao-toudi-zhushou.git
cd qiuzhao-toudi-zhushou
.\init.ps1
```

`init.ps1` 会安装锁定依赖并运行完整验证。验证后的扩展位于 `dist/`，按前面的浏览器步骤加载该目录。

常用命令：

```powershell
npm run validate
npm run test:e2e
npm run eval:fill -- --offline
npm run eval:kernel-state
npm run audit:resume-attachment-live -- --session qiuzhao-live --expected-origin https://xiaomi.jobs.f.mioffice.cn --expected-path-prefix /internship/resume/
npm run package:release
npm run install:skill
```

- `npm run validate`：类型检查、全部单元/组件测试、生产构建和权限审计。
- `npm run test:e2e`：验证档案、简历导入、页面比较、动态记录创建、用户确认的简历附件、隐私控制和禁止最终提交。
- `npm run eval:fill -- --offline`：在真实 Chrome 中用纯合成 ground truth 计算匹配、填写、排除、建行、附件和安全指标，不调用外部模型。
- `npm run eval:kernel-state`：在匿名 HTTPS 招聘页中验证只读 `state/find` 的字段召回率、重复引用稳定性、iframe/开放 Shadow DOM 覆盖、隐私零泄漏和零提交。
- `npm run eval:kernel-actions`：在真实 Chrome 与匿名 HTTPS 页面中验证 K2 固定动作、写后回读、一次有界降级、安全阻断和零误写/零提交。
- `npm run audit:resume-attachment-live -- ...`：对已由用户绑定的真实招聘标签页做去标识、只读的附件结构预检；不读现有值或文件名，不上传、不提交。
- [`docs/opencli-page-driver-rewrite.md`](docs/opencli-page-driver-rewrite.md)：记录 OpenCLI 1.8.6 的源码拆解、许可证、洁净重写范围和未引入的高权限能力。
- `npm run package`：生成并审计浏览器扩展 ZIP。
- `npm run package:skill`：验证并生成 Codex Skill ZIP。
- `npm run package:release`：生成扩展包、Skill 包和完整发行包。

## 功能范围

- 保存基本信息、教育、实习、工作、项目、作品、获奖、语言、求职偏好和常用回答。
- 本地解析 PDF/DOCX 简历，并将有来源证据的内容合并到现有档案。
- 识别常见中英文招聘字段，显示匹配分数、置信度和原因。
- 比较网页与档案内容，默认跳过一致值，并单独提示冲突。
- 为六类重复信息安全创建缺失记录，每次结构变化后重新扫描。
- 使用本地规则填写并复核普通输入、文本域、单选、多选、`contenteditable`、飞书 ATS 精确/级联下拉和结构化日期周期；页面拒绝写入时返回失败，不暴露网页原值。
- 在本机长期保存一份可替换的常用 PDF，并在唯一、高置信度的 HTTPS 招聘站点简历控件上经用户再次确认后附加。
- 内置一个不依赖 OpenCLI、Node.js 或本地服务的浏览器会话内核；用户点击“连接当前招聘页”后，它会固定该 HTTPS 标签页 10 分钟，并在跨站、到期、关闭或调试器冲突时停止。连接后可识别普通页面、经证明同源的 iframe 和开放 Shadow DOM 中的控件，并按标签、角色、名称、占位提示、附近文字和选项查找；结果只含语义摘要与会话内不透明引用。
- 用户另行点击“允许本次内核填写”后，K2 会获得 60 秒、当前会话与当前本地档案版本绑定的动作授权。它只从本地档案解析白名单字段，支持文本、文本域、原生选择、单选、勾选、日期/月、`contenteditable` 和仅打开兼容下拉；每次写入都回读验证，主策略失败时最多使用一次非剪贴板键盘降级。
- 记住同一网站中用户确认的字段纠错映射。
- 导出、导入或永久删除本地档案与映射；PDF 字节不进入 JSON 导出，可单独删除或随全部本地数据清除。

## 隐私与安全边界

- 浏览器会话内核申请 `debugger`、`tabs`、`webNavigation`、`alarms` 和 `<all_urls>`，并保留 `storage`、`activeTab`、`scripting`、`sidePanel`。Chrome/Edge 安装时会明确提示它可以读取和更改网页；产品仍只在用户点击连接、扫描或填写后工作。
- 会话只接受没有内嵌凭据的 HTTPS 页面，固定一个 Origin，10 分钟到期；跨 Origin 会立即暂停并解绑。页面状态不会返回输入值、勾选/选中状态、DOM ID/class/style、选择器或 CDP 节点 ID。
- 动作请求必须绑定用户手势授权、活动会话、当前快照、不透明引用、内部语义指纹和本地档案版本；过期快照、换节点、语义漂移、禁用/只读或验证失败均关闭失败。公开响应只含状态、策略、尝试次数和失败类别，不含档案路径或写入前后值。
- 不存储招聘网站密码、Cookie、验证码、身份凭据或浏览器会话。
- 不填写密码、验证码、CAPTCHA、身份证、护照、银行卡和隐藏字段。
- 不提供任意文件上传；只保存一份用户亲选的 PDF。每次附加前必须核对文件摘要、HTTPS 站点和简历控件，并只允许一次、60 秒内有效的尝试。其他附件仍由用户手动处理。
- 不绕过登录、短信验证、身份检查或网站风控。
- 不点击最终申请提交按钮。
- 出生日期、性别、籍贯、政治面貌等敏感字段默认要求确认。
- 不使用遥测、广告、云端账号或远程运行时代码。

开发者可以选择运行 `npm run eval:fill -- --judge`，让 `.env` 中配置的 OpenAI-compatible 模型对合成评测结果做 shadow review。该命令不属于扩展运行时，只接受 HTTPS、拒绝重定向，并且不会发送真实简历、档案值、网页值、截图或文件路径；模型意见不能替代确定性回归和人工晋升。

需要审计真实本地简历的提取完整性时，先运行 `npm run eval:resume -- --offline` 生成摘要白名单、去标识观测；明确允许 Boyue 读取去标识证据后，再运行 `npm run eval:resume -- --judge --skip-browser`。全量基线完成后应使用 `--sample=<8位摘要>` 定向复评。详细隐私边界、模型误报规则和晋升门槛见 `docs/resume-completeness-evolution-plan.md`。

完整说明见 [PRIVACY.md](./PRIVACY.md)。

## 常见问题

### 无法读取当前页面

确认当前标签页是普通 HTTPS 招聘网页，而不是 `chrome://`、`edge://`、扩展商店、PDF 内置阅读器或浏览器设置页。打开侧边栏并点击“连接当前招聘页”；同一站点内可以继续使用，跳转到其他站点后需要重新连接。若提示调试器被占用，请关闭该标签页的 DevTools 或其他浏览器自动化工具后重试。

### 扫描后没有可填写字段

先检查求职档案是否已经保存。空档案字段不会生成填写建议；跨域 iframe、关闭的 Shadow DOM、Canvas 表单或尚未适配的复杂组件也可能无法识别。

### 网页缺少实习或项目输入行

侧边栏会显示档案记录数、网页记录数和缺失数。请逐类点击“创建并重扫”；扩展不会使用任意文字按钮，也不会删除或重新排序现有记录。

### 简历无法解析

当前支持不超过 10 MB 的文字版 PDF 和 DOCX。纯图片扫描件会尝试本地 OCR，但加密 PDF、旧版 `.doc` 和严重损坏的文件仍可能失败。解析器不会臆造缺失内容。

### 修改代码后扩展没有变化

运行 `npm run build`，然后回到扩展管理页点击刷新。已经打开的招聘页面也建议重新加载并再次点击扩展图标。

## 工程结构

```text
src/domain       档案模型、迁移、验证和完成度
src/bridge       HTTPS 会话、隐私安全页面状态与语义查找
src/storage      浏览器本地档案仓库
src/matching     字段目录、DOM 描述和确定性匹配
src/content      页面扫描、比较、动态记录和安全写值
src/options      求职档案、简历导入和本地数据管理
src/sidepanel    预览、确认和填写工作流
src/resume       PDF/DOCX 提取、OCR、解析和档案合并
skills           可安装的 Codex Skill
tests/e2e        Chrome 端到端验证
```

开发接力请先阅读 `AGENTS.md`、`feature_list.json` 和 `progress.md`。欢迎通过 Issue 报告经过匿名化的页面结构问题；请勿上传真实简历、Cookie、验证码、页面填写值或身份信息。

## 许可证

本项目使用 [MIT License](./LICENSE)。
