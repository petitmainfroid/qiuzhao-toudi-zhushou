# workbench

责任：展示岗位链接、岗位名称、JD、评分、状态、审核队列、沟通记录摘要和自动填写入口。

上游只读参考：`web/server.py`、`DashboardPage.tsx`、dashboard components 和 `useDashboard.ts`。只借鉴信息架构；正式界面位于 `apps/workbench/`，必须遵循本仓库 Organic 视觉规范。

工作台与 Codex/Claude 必须调用同一个 JobWorkflow，不能复制业务状态机。页面不显示 Cookie、档案标量、完整聊天隐私或底层 selector。

真实门：用真实岗位记录完成列表、详情、评分、授权、任务状态和填写入口 E2E，并保存当前截图到 `artifacts/`。
