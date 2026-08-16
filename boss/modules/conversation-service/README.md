# conversation-service

责任：为用户选择的岗位生成招呼语、编译外部消息计划、发送后回读，并监测新回复。

上游只读参考：`ai/greeter.py`、`executor/sender.py`、`executor/monitor.py`。正式实现位于 `modules/conversation-service/adapters/boss/`，必须复用现有授权、动作预算、opaque ref、页面 epoch 和审计边界。

公共接口只接受 `planId`/`requestId`，不接受任意文本、selector、脚本或坐标。默认生成回复建议；验证码、身份动作、简历卡片和最终申请提交均转人工。

真实门：一个用户明确选择的真实岗位只发送一条已审核招呼语；回读成功，重启后重复发送 0，错会话 0。
