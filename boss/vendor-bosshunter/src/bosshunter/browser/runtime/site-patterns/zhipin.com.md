---
domain: zhipin.com
aliases: [BOSS直聘, bosszp]
updated: 2026-05-26
---
## 平台特征
- 需要用户登录态才能查看岗位详情完整信息（HR姓名、公司侧边栏等）。
- URL 必须携带完整 securityId 参数，缺失会导致页面加载失败或被拦截。
- 页面用 CDN 渲染，直连用户日常 Chrome 可天然携带登录态。

## 有效模式（已验证 2026-05-26）
- 职位名：`h1`（页面唯一 h1）
- 薪资：`.salary`
- 城市：`.text-city`
- 经验要求：`.text-experiece`（平台 class 拼写是 experiece）
- 学历要求：`.text-degree`
- 公司名：`.sider-company` 文本按行解析，"公司基本信息"之后依次是公司名、融资轮次、人数、行业
- HR 信息：`.job-boss-info`
- JD 全文：`.job-sec-text`
- 公司 sidebar：`.sider-company`

## 已知陷阱
- `.company-name` 有时匹配到无关公司名，应优先使用 `.sider-company` 或 HR title 前缀交叉验证。
- `.text-experiece` 少一个 n 是平台自身命名，不是笔误。
- HR 姓名 `.name` 可能跟随 "在线"、"刚刚活跃" 等状态词，需要清理。
- 批量并行打开大量 tab（6 个以上）建议错开 1-2 秒，避免触发风控。
