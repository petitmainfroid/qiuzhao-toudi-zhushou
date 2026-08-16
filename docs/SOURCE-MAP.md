# Source map

抽取来源：原仓库 integration worktree 的已提交基线 `7f703b2`；个人信息视觉层同时带入该工作树当前 F104 文件。原仓库未被本次抽取修改。

| 新位置 | 原位置 |
| --- | --- |
| `modules/browser-session/` | `yonghuxinxi/browser-session/` |
| `modules/browser-kernel/` | `yonghuxinxi/browser-kernel/` |
| `modules/application-service/` | `yonghuxinxi/application-service/` |
| `modules/mcp-server/` | `yonghuxinxi/mcp-server/` |
| `modules/profile-page/` | `yonghuxinxi/profile-page/` |
| `modules/real-page-validation/` | `yonghuxinxi/real-page-validation/` + `evals/real-pages/` |
| `modules/semantic-planner/` | `packages/semantic-planner/` |
| `modules/policy-compiler/` | `packages/policy-compiler/` |
| `gerenxinxi/profile-service/` | `packages/profile-service/` |
| `gerenxinxi/profile-host/` | `packages/profile-host/` |
| `shared/` | 零扩展运行时实际引用的 `src/` 子集 |

不复制运行时数据。旧浏览器 Profile 和本地档案仍位于 `%LOCALAPPDATA%\QiuzhaoRecruitmentAgent\yonghuxinxi`，所以新 CLI 默认复用已有登录状态和档案；这些数据不在本项目目录，也不会进入 Git。
