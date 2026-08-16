# page-vision

`page-vision` 把当前 `browser-session` 已选择、已就绪的真实招聘标签页采集成一组有重叠的可见视口图片，供本机支持多模态的 Codex、Claude 或其他 Agent 直接阅读。

它复用同一个专用 Chrome/Edge Profile 和标签页，不读取 Cookie、密码、验证码或浏览器存储，也不点击、填写、上传、保存、删除或提交。采集前后都会重新验证页面身份；只要标签、CDP 端口或规范化页面发生变化，本次截图就会被删除并失败关闭。

## CLI

```powershell
# 先通过既有 browser 命令启动或绑定真实标签页
npm run qiuzhao -- browser status

# 默认生成最多 24 张 PNG，保留 15 分钟
npm run qiuzhao -- vision capture

# 查看仍存在的临时采集
npm run qiuzhao -- vision status

# 模型读取完毕后立即删除
npm run qiuzhao -- vision cleanup --capture vis_xxx
```

`capture` 返回系统临时目录中的 `manifest.json` 和图片绝对路径。不要把这些图片复制到仓库、日志、聊天附件或评测产物，因为页面可能正在显示个人资料。崩溃遗留会在下一次调用时按 TTL 回收。

## 程序调用

推荐使用自动清理的回调接口：

```js
import { PageVisionObserver } from './modules/page-vision/index.mjs';

const observer = new PageVisionObserver();
await observer.withCapture(async ({ files }) => {
  // 在本机把 files 交给支持图片输入的 Agent。
  // 回调返回或抛错后，整个临时目录都会删除。
});
```

文本模型继续使用结构观察结果；视觉截图没有稳定字段引用，不能直接作为填写指令。正确链路是“视觉理解组件 + browser-kernel 稳定 ref + 受控执行 + 回读验证”。本模块不会注册为 MCP 工具，现有六工具权限边界保持不变。
