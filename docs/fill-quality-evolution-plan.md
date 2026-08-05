# 填表效果评测与受控迭代方案

## 决策对象

每轮只回答一个问题：**某个可复现的填表缺陷，是否值得通过一个确定性改动修复并晋升？**

- 默认行动：没有新证据时保持当前规则。
- 验收者：项目所有者；AI 只能生成评测、诊断和可回滚候选改动。
- 不可牺牲项：本地优先、真实个人值不出端、敏感字段保护、零最终提交、确定性规则为真值源。
- Human Gate：模型建议不能直接改变运行时规则；必须先有匿名 fixture、失败复现、候选前后对比和回滚路径。

## 因果模型

```text
页面结构 + 档案结构
-> 字段发现
-> 路径匹配
-> 用户选择/确认
-> 控件适配与写入
-> 页面回读验证
-> 最终填表质量
```

可观察中介量是匹配路径、置信度、排除原因、比较状态、填写结果码、重复记录数、附件目标和安全计数。模型只看到这些合成结构化证据，不看到真实简历、档案值、网页值、HTML、截图、路径、Cookie 或 token。

## 三层评测

### 1. 确定性真值层

版本化合成页面为每个控件声明期望 canonical path 或排除行为。真实 Chrome 执行当前代码并产生：

- 匹配 precision / recall / F1；
- 选中字段的精确写入率；
- 排除正确率；
- 重复记录补齐率；
- 简历附件候选是否唯一且目标正确；
- 密码、验证码、身份、其他附件、删除和最终提交的变更计数。

关键安全计数必须全部为零。安全失败不能被平均分掩盖。

### 2. DeepSeek shadow judge

开发命令可把上一步的纯合成结构化 artifact 交给 DeepSeek V4 Flash。它负责发现错误类型、证据缺口和下一条最小回归测试，不负责给产品准确率打真值标签。

调用约束：

- 只读 ignored `.env`，绝不打印 key；
- 只允许 HTTPS，拒绝重定向和明文 HTTP；
- 关闭 thinking，`temperature: 0`，限制输出 token，并要求 JSON object；
- 同时给出已知正确、错误匹配、漏填和危险写入四个 calibration case；
- 只保存清洗后的 verdict、finding、校准预测、模型标识、延迟与 token 数。

### 3. 候选晋升层

一次只修一个最高影响、可复现问题：

1. 把失败缩成匿名 fixture。
2. 保存 baseline 指标和失败码。
3. 修改一个 matcher/parser/control/workflow 中介。
4. 重跑目标测试、离线评测、全量验证和 E2E。
5. 只有安全率 100%、precision 不下降、目标失败消失且存在回滚 commit 时，进入 Human Gate。

## VOI 与停止规则

最高价值信息依次是：真实确定性失败、模型能否通过 calibration、模型诊断是否能指出一个可复现反例。以下情况停止继续询问模型：

- endpoint 不是 HTTPS；
- 确定性 baseline 未生成；
- 模型 calibration 不能稳定识别危险写入；
- 新一轮回答不会改变候选排序；
- 只有措辞或 UI 风格建议，没有具体 evidence id 和回归测试；
- 达到三次 disagreement 重试预算。

## 运行方式

```powershell
# 默认：真实 Chrome + 合成数据 + 确定性指标，不调用模型
npm run eval:fill -- --offline

# 仅当 .env 使用可信 HTTPS endpoint 时启用 shadow judge
npm run eval:fill -- --judge
```

结果写入 ignored `artifacts/fill-quality-observation.json`、`artifacts/fill-quality-report.json` 和可选的 `artifacts/fill-quality-judge.json`。这些文件不是生产遥测，也不会进入扩展包。

接口约定以 DeepSeek 官方文档为准：[模型与 HTTPS Base URL](https://api-docs.deepseek.com/quick_start/pricing/)、[JSON Output](https://api-docs.deepseek.com/guides/json_mode/) 和 [Thinking Mode 开关](https://api-docs.deepseek.com/guides/thinking_mode/)。第三方网关的模型别名、传输安全和 key 兼容性必须单独验证，不能从官方接口能力推断。
