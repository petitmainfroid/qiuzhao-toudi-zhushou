# Current status

## 已有实现

- 专用 Chrome/Edge Profile、动态本机 CDP、登录态复用、标签页绑定和重连。
- 隐私安全页面结构、opaque ref、普通控件固定动作、写后布尔回读和重复组意图。
- 本地加密 CandidateProfile 仓库、DPAPI、版本冲突、导入预览/确认/回滚。
- 本机个人信息 React 页面和统一 CLI 入口。
- AI planner、确定性 policy compiler、ApplicationService 状态机。
- 六工具 MCP stdio 入口和 Codex Skill。
- 真实页面标注/Judge 的 schema 与小米 E3 盘点入口。

## 尚未完成或不能宣称完成

- 小米登录后全页独立标注、用户冻结字段分母、E4/E5 非提交填写与重启幂等尚需真实页面授权验证。
- MetaApp、蔚来、安克、禾赛、虎牙、联想、携程需各自 E3/E4/E5 或明确 typed blocker。
- PDF 简历在新 profile-host 内的完整持久化/解析回归仍需修复和真实 PDF 验证；附件上传招聘页仍是用户操作。
- 当前 profile UI 来自原仓库未提交的 F104 视觉工作，迁入后需要单独截图验收。
- 打包安装、卸载、Codex/Claude MCP 自动配置和 Windows 干净机发布验收尚未完成。

因此，这个目录现在是“可继续开发的统一零扩展代码库”，不是已经完成所有真实站点验收的发布版。
