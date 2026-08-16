# job-discovery

责任：在真实 BOSS 岗位搜索和详情页中执行有界观察，返回去敏的岗位候选，不发送消息或填写申请。

上游只读参考：`scraper/jobs.py`、`cities.py`、`boss_cities.json`、`job_filters.py` 和 `zhipin.com.md`。正式实现位于 `modules/job-discovery/adapters/boss/`，只调用现有 `browser-session` 与受限内核。

禁止：第二套 CDP 代理、公共 eval/selector、无限滚动、读取 Cookie、把 BOSS 结构加入通用校招字段识别器。

真实门：至少 5 个真实岗位和 2 个搜索组合，盘点覆盖率 100%，读取准确率不低于 98%，错岗位入库 0。
