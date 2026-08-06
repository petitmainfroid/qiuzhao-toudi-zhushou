# OpenCLI 网页驱动拆解与洁净重写

> 历史范围说明：本文记录 F018 当时的低权限内容脚本重写。后续 F037 经单独权限、隐私和许可证验收加入扩展内嵌的 CDP 会话内核；当前分层标准以 `docs/browser-kernel-acceptance.md` 为准。

更新时间：2026-08-06。

## 来源与许可

- 本机安装包：`@jackwener/opencli@1.8.6`。
- 对应上游：[jackwener/OpenCLI](https://github.com/jackwener/OpenCLI)，审计提交 `399c0de2a76eb979aee3a3836cf2d24fd247780f`，Apache-2.0。
- 版本证据：[OpenCLI v1.8.6](https://github.com/jackwener/OpenCLI/releases/tag/v1.8.6)。
- 日期控件格式的交叉证据：[LUCIANO-LI/CV-plugin 日期适配器](https://github.com/LUCIANO-LI/CV-plugin/blob/c0b997930f7cc112e94a2a326d2eb7cbcf65b61b/src/content/main.js)，MIT。该实现提供了 `{ start, end }` 序列化格式的公开证据；本项目没有复制其直接修改可见标签并立即报告成功的实现。

本项目采用行为级洁净重写：先记录公开接口、输入输出和失败条件，再按秋招助手自己的权限、安全约束和类型系统重新实现。没有复制 OpenCLI 的守护进程、CDP 传输或任意网页执行代码。

## OpenCLI 原始架构

```text
CLI
  → 127.0.0.1:19825 本地守护进程
  → WebSocket /ext
  → Browser Bridge 扩展
  → chrome.debugger / CDP
  → 页面
```

证据：

- [Bridge manifest](https://github.com/jackwener/OpenCLI/blob/399c0de2a76eb979aee3a3836cf2d24fd247780f/extension/manifest.json) 请求 `debugger`、`tabs`、`cookies`、`downloads` 和 `<all_urls>` 等权限。
- [Bridge protocol](https://github.com/jackwener/OpenCLI/blob/399c0de2a76eb979aee3a3836cf2d24fd247780f/extension/src/protocol.ts) 支持执行脚本、导航、标签页、Cookie、截图、文件路径上传、网络捕获和原始 CDP。
- [Page operations](https://github.com/jackwener/OpenCLI/blob/399c0de2a76eb979aee3a3836cf2d24fd247780f/src/browser/base-page.ts) 使用元素重识别、滚动/聚焦、原生输入回退和写后验证。
- [DOM snapshot](https://github.com/jackwener/OpenCLI/blob/399c0de2a76eb979aee3a3836cf2d24fd247780f/src/browser/dom-snapshot.ts) 对可见、交互、遮挡、Shadow DOM、iframe 和控件属性做裁剪并生成引用。

## 秋招助手重写的最小能力

| 可观察行为 | 秋招助手实现 | 隐私与安全差异 |
|---|---|---|
| 稳定引用 | 扫描时写入不透明 `data-qiuzhao-field-id`，动作前重新解析 | 不接受任意 CSS 或网页脚本 |
| 页面查看 | 只产生招聘字段描述、匹配、比较状态和计数 | 不返回网页原值、全文 DOM、Cookie 或请求体 |
| 操作准备 | 检查连接、类型、禁用/只读/隐藏状态，再滚动和聚焦 | 密码、验证码、身份、文件和提交控件仍阻断 |
| 文本输入 | 原生属性 setter + `beforeinput/input/change/blur` | 只写入最新扫描产生的档案建议 |
| 下拉选择 | 打开弹层、等待精确候选、点击、读取已选择标记 | 无模糊候选点击；找不到即失败 |
| 多选 | 仅选择能逐项精确匹配的原生/结构化选项 | 任一候选缺失则整次失败 |
| 日期周期 | 从同一经历的结构 ID 得到集合与序号，一次写入 `{start,end}` | 必须同时验证隐藏状态和两个可见月份；不直接伪造标签 |
| 富文本 | 写入 `contenteditable` 并触发框架事件 | 写后不一致即失败 |
| 等待与重试 | MutationObserver + 有上限轮询，幂等写最多两次 | 不无限重试，不重复点击不可逆动作 |
| 写后验证 | 页面内布尔比较，结果只返回成功/失败和原因 | 失败结果不携带网页实际值 |

实现位于 `src/content/pageDriver.ts`。填表引擎不再把“事件已发出”视为成功；只有页面重新读取与档案值一致时才返回 `filled`。

## 明确不重写的能力

- 本地守护进程、WebSocket 远程控制和浏览器会话租约。
- `debugger`、`cookies`、`downloads`、`<all_urls>` 或宽泛 host permission。
- 任意 JavaScript/CDP、任意选择器、任意值、页面导航或标签页管理。
- 文件系统路径上传、网络请求体捕获、Cookie/Authorization 读取。
- 密码、短信、CAPTCHA、身份证件、隐私同意和最终提交。

OpenCLI 继续作为开发期真实页面只读审计工具；商店版秋招助手不依赖 OpenCLI，也不会继承其权限。

## 证据级别

1. 上游源码与许可证确认：完成。
2. 已登录真实小米页只读结构：完成；发现 29 个自定义下拉、4 个真实复合日期控件及其记录 ID 结构，未读取输入值或页面个人文本。
3. 匿名浏览器夹具：完成；级联下拉、日期周期、多选、单选、富文本、写后拒绝和零提交均有回归。
4. 真实页面写入：未执行。仍需要用户在当前招聘页授权，并对写入动作单独确认；匿名夹具不能替代真实写入证据。
