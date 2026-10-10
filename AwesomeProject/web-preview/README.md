# NoNo App 共用源码预览

这是 App 页面源码的浏览器运行入口。页面、StyleSheet、颜色常量、导航注册、底部栏和内置 3D 角色资源均来自 `AwesomeProject/src`，没有第二份 HTML 页面实现。

## 启动

在 `AwesomeProject/web-preview` 执行：

```sh
npm install
npm run dev
```

打开 <http://127.0.0.1:5173>。服务只监听本机。

## 调整并用于 App

在浏览器预览页面，通过左侧下拉框切换所有已注册页面、Android/iOS 布局、逻辑屏幕尺寸和示例/空数据。

把希望调整的内容告诉 Codex，或在编辑器修改左侧标出的 `AwesomeProject/src/...` 文件。保存后 Vite 自动更新浏览器；手机构建使用同一份文件，因此无需人工将 HTML/CSS 翻译回 React Native。

共享路径：

- 页面：`AwesomeProject/src/features/*/screens/*.tsx`
- 布局：`AwesomeProject/src/shared/components/PageLayout.tsx`
- 底部导航：`AwesomeProject/src/navigation/CustomTabBar.tsx`
- 样式常量：`AwesomeProject/src/shared/constants/`
- 角色场景：`AwesomeProject/src/features/task/avatar/scene.js`

浏览器 DevTools 内的临时 CSS 修改不会保存回源码。工作台不是拖拽式页面编辑器。修改预览外框或 `web-preview/src/preview.css` 只会改变开发工作台，不会改变 App。

## 预览边界

这是 [React Native Web](https://necolas.github.io/react-native-web/docs/setup/) 的浏览器渲染：共用源码能够避免手工同步差异，但不保证浏览器、Android、iOS 逐像素一致。系统字体的度量、Switch、阴影/elevation、安全区、键盘、原生转场和 WebView 合成仍需真实设备验收。切换 iOS 是执行现有 iOS 布局分支，不是模拟全部 iOS 系统控件。

模型、任务执行、麦克风权限和语音识别使用明确的演示适配器，不联网调用模型，不操作手机。模型表单的凭据输入不持久化。真实角色下载不在浏览器执行。左侧“演示发言”用于预览 Android 首页对话、记忆提案和任务状态。

界面业务通过已有 `AppFacadesProvider` 注入演示数据；原生服务替换只在 Vite 配置中生效，Metro 和 App 不加载这些替换。

## 验证

```sh
npm run build
```

本地保存页面后先检查 Android/iOS、多种屏幕宽度及长文本，再通过原有 `AwesomeProject` 手机运行流程进行最终核对。

## 局域网 MCP

入口为「能力 → 被操控模式 → 局域网模式」，或在工作台页面选择 `LanMcp`。

- 浏览器只演示设置连接码、开关和下载流程，示例地址不能连接手机；刷新后演示状态重置。
- Android 使用同一页面接入 `LanMcpModule`。设置 12–128 位字母、数字、下划线或连字符组成的连接码，再开启服务。
- 手机会显示当前 Wi-Fi 的 `http://<手机IP>:8765/mcp`，后台有停止通知；切换 Wi-Fi 或 IP 后服务停止，不自动重启。
- 通过「导出连接文件」使用系统保存对话框获得 Markdown 说明，包含地址、鉴权配置及六个工具的调用示例，不包含真实连接码。服务关闭时导出地址占位模板。
- 客户端使用支持远程 Streamable HTTP 的 MCP 客户端，按导出文件填写地址与 `Authorization: Bearer <连接码>`。仅在可信局域网使用，HTTP 不加密。
- 工具为状态、截图、点击、滑动、输入、返回/主页。除状态查询外需要手机解锁及无障碍服务；截图受 Android 版本和页面保护限制。
- 本地任务与被操控模式占用同一设备控制权。开启被操控模式时本地任务会提示冲突；关闭时，已受理动作可能完成后才释放控制权。
- iOS 原生服务尚未实现；公网按钮仍为“暂不开放”。Android 的原生通知、Keystore、Wi-Fi 监听、无障碍动作和系统文件保存需要实机验证，浏览器演示不能覆盖这些行为。

开发验证（在 `AwesomeProject` 执行）：

```sh
npx jest --runInBand src/__tests__/features/capability/lanMcp src/__tests__/application/facades/ProductionRuntimePorts.test.ts
npx tsc --noEmit
cd android
./gradlew :app:testDebugUnitTest --tests 'com.awesomeproject.lanmcp.*' :app:assembleDebug
```

构建需要 JDK 17 与 Android SDK。调试安装仍按项目的 React Native/Metro 流程运行；导出的连接说明以手机运行时生成的文件为准。
