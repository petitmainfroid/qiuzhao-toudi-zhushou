# job-repository

责任：本地保存岗位实体、规范化来源、评分摘要、流程状态和脱敏审计时间线，并提供幂等、恢复、软删除和查询能力。

上游只读参考：`db.py`、`job_export.py`、`scoring_run_store.py`、`scoring_selection.py`。正式实现将位于 `modules/job-repository/`，不得导入 vendor Python。

首个契约：`JobRecord`、`JobStatus`、`JobEvent`、`ScoringRun`、`normalizedJobIdentity` 和带 expectedVersion 的仓库写入。禁止保存 Cookie、密码、验证码、页面个人值或完整聊天隐私。

真实门：同一真实岗位列表连续采集两次，第二次重复记录增长为 0；强杀恢复后状态和审计一致。
