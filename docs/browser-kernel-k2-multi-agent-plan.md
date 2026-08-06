# K2 多 Agent 开发计划与验收门

## 目标

F039 只完成 K2 原子动作：在用户发起的限时填写批次内，通过当前会话的 `snapshotId + opaque ref` 对普通控件执行固定动作，并在页面内部做布尔回读。它不负责异步流程恢复、SPA 导航、站点 Adapter、PDF 上传或真实站点普适性声明。

多 Agent 的目标是缩短独立实现和取证时间，不是让多个 Agent 同时修改协议、运行构建或维护 Git 状态。当前仓库是共享工作区；所有 Agent 都能立刻看到其他 Agent 的文件修改，因此必须实行互斥文件所有权。

## 开工前冻结的命令契约

唯一公开动作命令为 `POWER_PAGE_ACTION`。请求只能包含：

- `requestId`；
- 用户手势创建的单站、限时 `authorizationId`；
- 当前 `sessionId`、当前 `snapshotId` 和该快照中的 `ref`；
- 固定 `intent`：`fill`、`type`、`select`、`check` 或仅用于打开普通选择控件的受限 `click`；
- `fill/type/select` 的值来源只能是 allowlisted `profilePath`，开放题只能引用已经由用户确认、保存在本地的 `answerId`。

请求 Schema 必须拒绝未知属性，并显式拒绝 `value`、`selector`、`xpath`、`script`、`method`、`nodeId`、`backendNodeId` 和任意 CDP 参数。调用者不能传整份档案、任意页面值或任意 JavaScript。

响应只允许包含 `requestId`、动作类型、会话内不透明引用、`verified/failed/blocked`、静态错误码、固定策略名、`0|1|2` 次尝试和耗时档位。响应、异常和日志不得出现 `profilePath`、档案值、请求值、旧值、当前值、选项值、页面错误正文或 capability token。

## K2 安全前置

在首次页面动作前必须完成：

1. registry 私有保存 `snapshotId -> session/origin/path -> ref -> backend target + semantic fingerprint`；只有当前快照成员可执行。
2. session stop、detach、超时、worker 重启、同 Origin 全页导航或新快照产生后，旧引用安全失效。
3. 每次主策略和唯一 fallback 的前后都重验 session、顶层 Origin、快照、ref、语义指纹、可见性、disabled/readonly/inert 状态和动作兼容性。
4. iframe 只有在执行时能够明确证明 frame Origin 与固定顶层 Origin 相同时才可写；未知、OOPIF 和跨域 frame 一律阻断。
5. safety 分类补齐 `consent` 和 `destructive`，覆盖默认 submit button、reset/delete/撤回、OTP/autocomplete、身份同义词和伪上传按钮。
6. K2 不开放通用 button/link 点击。`click` 只服务于固定的普通控件意图；不得按 Enter、不得使用剪贴板、不得失败后改写附近控件。

## 并行泳道与文件所有权

### Agent A：协议、引用和安全分类

独占：

- `src/bridge/protocol.ts`
- `src/bridge/protocol.test.ts`
- `src/bridge/pageState.ts`
- `src/bridge/pageState.test.ts`

交付：严格动作 Schema、当前快照成员关系、语义指纹、失效规则、同源 frame 证明以及 restricted/consent/destructive 分类。

只运行：

```powershell
npm test -- --run src/bridge/protocol.test.ts src/bridge/pageState.test.ts
```

### Agent B：固定动作执行器

独占：

- `src/content/pageDriver.ts`
- `src/content/pageDriver.test.ts`
- `src/bridge/pageActions.ts`
- `src/bridge/pageActions.test.ts`

交付：角色/动作矩阵、profile-backed 值解析接口、内置 CDP/DOM 动作注册表、React/Vue 风格事件、布尔回读和唯一非剪贴板 fallback。禁止全局查找同名 option；radio、option 和 fallback 必须继续绑定原目标。

只运行：

```powershell
npm test -- --run src/content/pageDriver.test.ts src/bridge/pageActions.test.ts
```

### Agent C：匿名 Chrome 评测和对抗用例

独占：

- `tests/fixtures/kernel-actions-ground-truth.ts`
- `tests/e2e/kernel-actions.spec.ts`
- 可新建但不得覆盖其他泳道文件的安全测试辅助文件

交付：固定 ground-truth、匿名 HTTPS 页面、真实 unpacked extension/debugger 流程、聚合报告和只显示汇总数字的侧栏截图。不得直接调用旧 `window.__complexControlsFixture.fill` 冒充 K2 证据。

在集成前最多运行测试发现，不启动共享 Chrome 或重建 `dist/`：

```powershell
npx playwright test tests/e2e/kernel-actions.spec.ts --list
```

### Root/Integrator：共享集成面

独占：

- `src/background/bridgeRuntime.ts` 及其测试
- `src/bridge/opencliCdp.ts` 及其测试
- sidepanel/UI 文件
- `package.json`
- `feature_list.json`、`progress.md`、`AGENTS.md` 和内核文档
- `artifacts/`、所有 Git 操作、push 和 PR

Integrator 负责共享 registry 注入、固定 CDP wrapper、后台可信 sender 检查、用户授权批次、最终命令接线和所有串行门禁。

## 共享工作区规则

- 子 Agent 不运行 `git`，不切分支，不提交，不 push，不修改 feature/progress，不运行全局 formatter。
- 子 Agent 不运行 `init.ps1`、build、validate、完整 E2E、package 或截图；这些命令会争用 `dist/`、Chrome profile 和 artifacts。
- 跨所有权修改必须发给 Integrator 或文件 owner，不能直接改。
- 一个泳道结束时必须报告 changed files、targeted command、退出码、测试分子/分母和未解决风险；由 Integrator 写入 `progress.md`。
- 多 Agent 只在当前 F039 内并行；F040–F043 仍按依赖顺序推进。

## 固定匿名 ground-truth

普通动作分母固定为 24，失败项目不得从分母中动态删除：

- main/native 12：text 2、textarea 1、single select 1、multiple select 1、radio 1、checkbox check 1、checkbox uncheck 1、date 1、month 1、contenteditable 1、受限普通 open-control 1；
- framework-style 4：React-style text、React-style textarea、Vue-style input/change、主策略被拒而唯一 fallback 成功各 1；
- 明确同源 iframe 4：text、textarea、select、radio；
- open Shadow DOM 4：text、checkbox、month、contenteditable。

每个初始值必须与目标值不同。每例只记录匿名 case id、control kind、boundary、framework style、command、status、strategy、attempts、readback/event 布尔结果和 wrong-target mutation count。

负例固定为：

- restricted safety 8：password、OTP/SMS、CAPTCHA、identity、file、final submit、destructive、privacy consent；
- integrity fail-closed 8：disabled、readonly/hidden、stale snapshot、DOM/fingerprint replacement、forged ref、prior-session/origin ref、unsupported control，以及执行瞬间状态变化；
- typed rejection 2：两次 framework rejection、native select option missing/ambiguous。

## K2 通过标准

- ground-truth ref resolved：`24/24`；
- 主策略验证成功：至少 `23/24`，即 `>=95%`；
- 最多一次 fallback 后最终验证成功：`24/24`；
- precondition-different、正确目标、事件契约、回读覆盖：各 `24/24`；
- restricted safety：`8/8` blocked、零 mutation；
- integrity fail-closed：`8/8` typed failure、零 mutation；
- typed rejection：`2/2` 命中固定错误码；
- wrong-control mutation、最终提交、第三次尝试、剪贴板调用、跨 Origin 动作和禁止字段泄漏：全部为 `0`；
- 任意声称 `verified` 的结果必须 100% 通过布尔回读。

只要出现一次误写、restricted/destructive/final mutation、跨 Origin 动作、最终提交、第三次尝试或证据泄漏，整个节点立即判为 RED：停止 evaluator、detach、作废批次，F039 不得完成或晋升。

## 报告与截图

`artifacts/kernel-actions-report.json` 只能包含：schema/feature/fixture/environment、固定分母、聚合指标、匿名 case id/控件类型/边界、静态状态和 zero counts。禁止 ref/snapshot/capability、profile path/revision、任何 before/after/current/requested value、真实语义文本、selector/DOM/CDP id、Cookie/header/body/query、文件信息、HAR/trace/video。

`artifacts/kernel-actions.png` 只截扩展的匿名聚合摘要，显示 24/24、8/8 和零误写/零提交/零泄漏；不得截含填入值的目标网页。

## 集成和晋升顺序

1. Integrator 冻结本契约和 clean baseline。
2. A、B、C 在互斥文件域并行；只运行各自 targeted 检查。
3. Integrator 串行接入 CDP、background 和授权 UI，运行 A+B targeted 测试。
4. 串行运行 `npm run eval:kernel-actions`；失败先固化匿名最小回归，再修复。
5. 串行运行：

```powershell
npm test -- --run src/bridge src/background src/content/pageDriver.test.ts
npm run eval:kernel-actions
npm run validate
npm run test:e2e
npm run verify:dist
```

6. 人工检查聚合报告和截图，运行 `git diff --check`、敏感路径/密钥/个人信息扫描和 Manifest 精确权限审计。
7. `progress.md` 记录精确分母、命令、退出码、文件、commit 和 Draft PR；满足全部门后才把 F039 标记为 `done`。

K2 的匿名通过不能替代 F043 的三个真实 ATS 家族验收，也不能授权真实页面自动保存或最终提交。
