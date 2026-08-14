# Current status

## 已有实现

- 专用 Chrome/Edge Profile、动态本机 CDP、登录态复用、标签页绑定和重连。
- 隐私安全页面结构、opaque ref、普通控件固定动作、写后布尔回读和重复组意图。
- 本地加密 CandidateProfile 仓库、DPAPI、版本冲突、导入预览/确认/回滚。
- 本机个人信息 React 页面和统一 CLI 入口。
- AI planner、确定性 policy compiler、ApplicationService 状态机。
- 六工具 MCP stdio 入口和 Codex Skill。
- 真实页面标注/Judge 的 schema 与小米 E3 盘点入口。
- 浏览器缺失或 CDP 断开时，Agent 保持在线并返回唯一恢复指令；专用浏览器重启后自动重连。
- 真实 PDF 已通过服务端文本层解析、结构化合并、DPAPI 持久化与重启幂等验证；解析不会覆盖已有非空字段，也不会自动导入身份证明字段。
- 小米真实招聘页已完成 E3 候选盘点、E4 普通字段非提交填写/布尔回读和 E5 重启后重建验证。最终幂等审计覆盖 51/51 个应用字段，0 次重复写、0 次提交、0 次 Cookie/凭证读取。

## 尚未完成或不能宣称完成

- 小米 E3 结构候选仍需独立人工审核后才能称为“人工冻结 ground truth”；本轮真实执行证据不能替代独立 Judge。
- MetaApp、蔚来、安克、禾赛、虎牙、联想、携程需各自 E3/E4/E5 或明确 typed blocker。
- 招聘页附件上传仍是用户操作；扫描件 PDF 目前不自动 OCR 导入，需明确提示人工处理。
- 当前 profile UI 来自原仓库未提交的 F104 视觉工作，迁入后需要单独截图验收。
- 打包安装、卸载、Codex/Claude MCP 自动配置和 Windows 干净机发布验收尚未完成。

因此，这个目录现在是“小米真实页 MVP 已形成非提交闭环的统一零扩展代码库”，还不是全部招聘站点均已验收的发布版。
