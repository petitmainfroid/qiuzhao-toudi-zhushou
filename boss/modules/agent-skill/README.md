# agent-skill

责任：让 Codex/Claude 把自然语言意图映射到本地求职工具，负责薄编排和用户可读说明，不持有业务状态或浏览器底层能力。

上游只读参考：根 `SKILL.md` 与 `README.md`。正式实现位于 `skills/job-hunting/`；现有校招填写六工具保持兼容，求职域能力使用独立封闭 schema。

禁止 Agent 创建/扩大授权，禁止 raw CDP、eval、selector、任意消息、任意路径、Cookie 和档案标量工具。

真实门：Codex/Claude 通过 stdio 完成状态、搜索、评分、计划、执行、审计和取消；工作台与 Agent 对同一 requestId 返回一致结果。
