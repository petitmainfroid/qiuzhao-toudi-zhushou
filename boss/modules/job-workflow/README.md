# job-workflow

责任：统一编排发现、入库、评分、审核、沟通、监测和校招填写，提供取消、恢复、锁、预算和审计。

上游只读参考：`pipeline.py`、`cancellation.py`、`throttle.py`、`web/tasks.py`。正式实现位于 `modules/job-workflow/`，不能照搬无限监测循环。

每个外部动作必须绑定 jobId、origin、page epoch、profileVersion、授权 lease、requestId 和尝试预算。重启后恢复剩余步骤，已验证动作不得重放。

真实门：在三个不同阶段强杀进程，恢复后重复岗位、重复消息、重复经历和重复附件均为 0。
