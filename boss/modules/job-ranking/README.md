# job-ranking

责任：先执行确定性一票否决和基础条件判断，再让用户 API 或封闭 Agent 对 JD 与档案目录做语义评分，保留失败与恢复状态。

上游只读参考：`ai/prefilter.py`、`ai/scorer.py`、`scoring_selection.py`、`scoring_run_store.py`。正式实现位于 `modules/job-ranking/`，与招聘表单 `semantic-planner` 分离。

Agent 只接收必要的 JD 语义与 `hasValue`/能力目录，不接收完整个人档案标量。每个被盘点岗位必须返回一个唯一终态。

真实门：对人工独立标注的真实岗位逐条对齐；一票否决错误放行 0，known-wrong 0，失败项不移出分母。
