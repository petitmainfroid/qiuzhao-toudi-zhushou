# BOSS 求职能力迁移区

这个目录支持一条可审计的迁移路线：隔离归档 → 行为拆解 → 独立重写 → 逐步替换。它不是第二套产品，也不会取代 `qiuzhao-cli` 已有的浏览器、个人档案、校招填写和 MCP 内核。

## 目录

- `vendor-bosshunter/`：固定上游提交的只读参考快照，不进入正式运行或分发产物。
- `upstream-snapshot.json`：快照内每个文件的 SHA-256、大小、来源提交和许可证标识。
- `module-map.json`：上游文件到自有模块的决策映射。
- `modules/`：七个目标模块的责任、依赖、禁止项和真实验收入口。
- `REAL_OPERATION_ACCEPTANCE.md`：真实 BOSS 页面与真实校招页面的 E0-E5 验收规则。
- `scripts/verify-vendor-snapshot.mjs`：校验快照未漂移且正式运行代码没有引用 vendor。

## 固定来源与许可边界

- 上游：`https://github.com/powerycy/BossHunter.git`
- 固定提交：`62d1ccea878932f4e98ff67eaa00d5302c7cdff4`
- 上游实际许可证：BossHunter Non-Commercial License。
- 当前快照只用于个人、研究和独立重写准备。商业发布前必须获得书面商业授权，或者完成经审查的独立实现与法律确认。
- 改名、翻译或机械地从 Python 改成 Node 不会自动消除上游许可义务。

## 目标结构

```text
工作台 / Codex / Claude
        │
        ▼
job-workflow ───────────────► 现有 application-service（校招填写）
  ├─ job-discovery ─────────► 现有 browser-session + browser-kernel
  ├─ job-ranking ───────────► 用户 API 或封闭的外部 Agent 判断
  ├─ conversation-service ──► 现有授权、动作预算、回读与审计
  └─ job-repository ────────► 本地岗位与操作时间线
```

`vendor-bosshunter` 不能出现在这张运行图中。BOSS 特定结构只能进入未来的 BOSS adapter，不能污染通用校招表单识别器。

## 开发顺序

1. B001：冻结来源、许可证、哈希和模块边界。
2. B002：把上游行为变成独立规格、错误类型和安全契约。
3. B003-B005：岗位库、可恢复工作流和岗位评分。
4. B006-B007：在真实 BOSS 页面验证岗位发现与受控沟通。
5. B008-B009：同一服务接入工作台和 Codex/Claude。
6. B010：真实 BOSS 岗位到真实校招页的串行非提交闭环。
7. B011：移除 vendor 后构建、许可和发布审计。

## 常用验证

```powershell
node boss/scripts/verify-vendor-snapshot.mjs
npm run validate
```
