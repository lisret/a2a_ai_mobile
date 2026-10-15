# 米咔自制原型验证

PASS — 浏览器预览、源代码与资源打包范围；Android 实机尚未验收。

- GLB：989900 bytes，14 骨骼，22 SkinnedMesh，6 动作，所有权重归一化；耳朵和躯干包含混合权重。
- `node scripts/test-mika-avatar.mjs`：6/6。验证真实骨骼顶点位移、状态不重复重启、一次性回到 idle、减少动态、缺失 clip、模型加载竞争、资源释放、隐藏暂停、Android file URL 的 XHR/parse 路径。
- Jest avatar + HomeLocalExperienceIntegration：7 suites、27 tests PASS。含新的 WebView 模型/状态分离、ready 重放、渲染失败原生回退测试。
- `./node_modules/.bin/tsc --noEmit` PASS。
- web-preview `npm run build` PASS，现有 chunk 大小提示保留。
- Gradle `:app:copyNonoAvatarAssets --offline` PASS。模型、scene.js、AvatarAnimation.mjs、AvatarAsset.mjs 的源文件、Android assets、Vite dist SHA256 一致。
- CUA 实际显示：390×844 与 360×800 首页，角色外观小预览，独立 avatar-lab 六个按钮。观察到思考状态的歪头、耳朵和抬臂变化。截图见 artifacts/mika-home.png 和 artifacts/mika-preview.png。
- 浏览器历史日志存在来源未标记的 MutationObserver 警告/错误；当前角色成功渲染，未据此宣称整个预览控制台无错误。

## 独立评审处理

原始评审：mika-review.md。以下为主 agent 的修复与裁定，并非再次独立签字。

1. WebGL 初始化失败没有信号：已加 avatar-render-failed、模块就绪前失败标记和原生 NoNoMascot 回退，补了组件测试。
2. Android file:// Fetch 风险：已添加 AvatarAsset.mjs，file 走 XHR ArrayBuffer 后 loader.parse，HTTP 仍用 loader.load。传输选择与失败路径已测；实际 Android WebView 仍待真机验证。
3. 导出不保留 frustumCulled=false：载入时为 SkinnedMesh 显式关闭裁切，避免动作超出静态边界消失。
4. 同一 mood 在一次性动作结束后不自动重播：保留设计。mood 是状态而非事件，避免 ready 或重渲染造成重复庆祝；下一次状态切换后可重播，lab 可重复点播。若未来连续事件需要同名动作重播，应增加独立事件标识，这是当前状态接口的明确限制。
5. CPU 骨骼测试用上游 loader，未单独覆盖 vendored loader 的解析：浏览器 CUA 已用实际 vendored loader 成功加载；Node 集成测试执行实际 scene.js 的加载竞争和生命周期。GPU 与 Android 仍不由 CPU 测试代替。
6. 画幅常数与 bbox 尚无全模型自动画面测试；本原型已经目视核对，其他任意外部模型的动画边界仍需针对素材验证。

没有安装到手机、重建完整 APK、提交或推送。此任务交付为可调整的本地自制模型原型与共享 App 源码。
