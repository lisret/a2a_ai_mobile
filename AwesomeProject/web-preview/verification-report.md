PASS — 独立验收通过：构建、HTTP/资源、无头浏览器交互（36/36）、构建产物运行（11/11）、App 边界审计全部通过；未发现需要修复的缺陷，仅有 3 条非阻塞观察。

# web-preview 独立验收报告

- 验收对象：`AwesomeProject/web-preview`（React Native Web + Vite 复用 `AwesomeProject/src` 的 AppNavigator / TSX 屏幕；原生服务与演示数据仅在预览内替换）
- 服务：`http://127.0.0.1:5173/`（主 agent 已启动，未重启、未替换）
- 验收者：独立测试子 agent（非交互），仅新增本文与 `web-preview/verification/` 下的测试脚本；未 commit / push；未改任何实现文件与既有工作区变更
- 最终无漂移验收窗口：**2026-10-10 16:34:39 → 16:35:03**（窗口内 web-preview 源码哈希前后一致）
- 验证结论对应修订（sha256，`AwesomeProject/web-preview/` 前缀已省略）：

```
3260f456fec5ff33a2a4dede147b1b64f3ec2a25126dee8787eb5c24fcac336c  vite.config.ts
fbf17d43cecd4af3e44ad67b770abfda7c0d939ab82b92d8b1b55b5fd9e94e50  package.json
f76a8abf87b46309eaa61c5caf60046918ebcae09ebe93c42bb59457447f3d57  src/PreviewShell.tsx
84d761d504079570052088ca550ab9f9803c12021d26f06772f2672ce418584d  src/main.tsx
81ef67793161f4c9ed9995de1d605e80f30799b58996585b4b0ef5a0af992c25  src/fixtures.ts
02e003c98fdb040102a2cb302b23af7e518fc33ba176715286d9f2e2a3e15e98  src/preview.css
1706d5c22a52a58bc7b93a260273b7e97c3a2456f897eb08eaba3546396d1c88  src/adapters/font-icon.tsx
aac6936da6094602d0b109bffd780748dbb55633f2ed25f6fbb2f851d80dc8ca  src/adapters/native-services.ts
2f57fd9c14d0c9f34eab7659c4a84c2477d713a42c715ae39ab39b8ea619ef00  src/adapters/navigation.tsx
845d6d48016a51f79a590e5b26ccefdd82d27e1d261f70e7fb4f1873635e3499  src/adapters/react-native.tsx
32271d9a984a81745ad0cbfd8f2a2ace60e2c96ceef218f7084f07989147b5ee  src/adapters/safe-area.tsx
5275d77ab43c1b45904b38beb3907d8331000c55792ebf1376e0fb15b6439375  src/adapters/storage.ts
9febd63446e91decb4b1837a026ed853198fb17b01fb4e2f72ec189f55b537af  src/adapters/svg.tsx
8af7ea2797337f079f88ba904bf8fae09dc3f2c87a6c38daf3081323a7bb6241  src/adapters/webview.tsx
```

> 修订漂移说明：主 agent 在 16:22–16:34 期间重写了几乎全部 web-preview 源码（并新增 `research-report.md`）。我第一次 33/33 的运行早于重写完成，故不采信；上表修订是**重跑后的稳定通过修订**。`src/fixtures.ts` 在 16:34:30 前后又改过一次（`41ab817…` → `81ef677…`），最终窗口已包含最新版。

## 1. 测试计划（先写后执行）

1. **边界审计**：确认预览只从 `AwesomeProject/src` 读源、无第二份页面实现、不写 App 源码/构建配置；记录共享文件哈希基线。
2. **构建**：`npm run build`；检查 dist 产物与资源引用。
3. **HTTP/资源**：探测 5173 的 HTML/入口模块/头像 HTML/场景 JS/three/字体。
4. **浏览器验收**（自建无窗口 Chrome，独立 user-data-dir，仅操作自己新建的隐藏 tab）：四主 tab、详情导航+返回+深链、Android/iOS、空数据/示例数据、表单、弹窗（Modal/CustomAlert）、头像与演示语音、19 页渲染巡检、控制台异常、外部网络请求。
5. **聚焦测试**：仅 `HomeFacadeIntegration` / `CapabilityViewStates` / `AppNavigatorTyping`。
6. **报告**：首行 PASS/FAIL/BLOCKED/ERROR，列命令输出与未测范围。

## 2. 命令与输出

### 2.1 构建（`web-preview`）

```sh
cd AwesomeProject/web-preview && npm run build
```
```
> nono-shared-app-preview@1.0.0 build
> vite build

vite v6.4.4 building for production...
transforming...

/fonts/FontAwesome.ttf referenced in /fonts/FontAwesome.ttf didn't resolve at build time, it will remain unchanged to be resolved at runtime
✓ 395 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.41 kB │ gzip:   0.30 kB
dist/assets/index-DbQUw_gU.css    3.28 kB │ gzip:   1.26 kB
dist/assets/index-BSrtzKMW.js   563.99 kB │ gzip: 173.09 kB

(!) Some chunks are larger than 500 kB after minification. [...]
✓ built in 1.10s
[exit 0]
```
说明：字体告警是 `preview.css` 里 `url(/fonts/FontAwesome.ttf)` 由运行时提供，`closeBundle`（`vite.config.ts:150`）会把它复制到 `dist/fonts/`；第 2.4 节已在浏览器中确认字体真实可用，非缺陷。

### 2.2 HTTP / 静态资源（对运行中的 5173，只读）

```sh
node verification/http-assets.mjs
```
```
PASS  预览 HTML 入口  /  status=200 type=text/html bytes=585 contains(/src/main.tsx)=true
PASS  入口模块  /src/main.tsx  status=200 type=text/javascript bytes=2496 contains(PreviewShell)=true
PASS  工作台外壳（复用 AppNavigator）  /src/PreviewShell.tsx  status=200 type=text/javascript bytes=54357 contains(AppNavigator)=true
PASS  演示 facades  /src/fixtures.ts  status=200 type=text/javascript bytes=62153 contains(createPreviewFacades)=true
PASS  复用 App 头像 HTML  /nono-avatar/avatar.html  status=200 type=text/html; charset=utf-8 bytes=647 contains(avatar-canvas)=true
PASS  复用 App 角色场景  /nono-avatar/scene.js  status=200 type=application/javascript bytes=10307 contains(THREE)=true
PASS  three 模块  /nono-avatar/three.module.js  status=200 type=application/javascript bytes=1272972 contains(three)=true
PASS  FontAwesome 字体  /fonts/FontAwesome.ttf  status=200 type=font/ttf bytes=165548

8/8 http checks passed   [exit 0]
```

### 2.3 浏览器交互验收（本机 chrome-headless-shell + CDP，自有隐藏标签页）

```sh
node verification/browser-smoke.mjs
```
```
主 tab：四个入口渲染与切换 — 6/6 PASS
  点击 tab「能力」→ Capabilities 屏幕渲染  :: marker=它会做什么 found=true page-picker=Capabilities
  点击 tab「活动」→ History 屏幕渲染      :: marker=共同经历   found=true page-picker=History
  点击 tab「设置」→ Settings 屏幕渲染     :: marker=这台应用   found=true page-picker=Settings
  点击 tab「首页」→ Home 屏幕渲染         :: marker=陪伴 ·     found=true page-picker=Home
详情页：点击进入 + 返回 + 深链 — 4/4 PASS
  点击卡片「交代的事」→ Errands 详情屏                      found=true page-picker=Errands
  详情页返回按钮回到 Capabilities（点击 FontAwesome arrow-left）found=true page-picker=Capabilities
  深链 ?page=ErrandDetail 渲染交代详情
平台分支：Android / iOS — 4/4 PASS
  iOS：渲染 home indicator 且 meta 显示 ios   :: indicator=true  meta=首页 390 × 844 · ios
  Android：无 home indicator 且 meta 显示 android :: indicator=false meta=首页 390 × 844 · android
  Android/iOS 安全区分支生效（tab bar 距画布底部不同） :: ios=34px android=24px
空数据 / 示例数据 — 3/3 PASS
  空数据：交代列表显示空状态      :: 0 件待办 / 还没有交代
  示例数据：交代列表显示演示条目  :: 1 件待办 / 晚上提醒我整理照片 / 今天 20:00
  示例数据：活动页显示记忆偏好    :: 喜欢安静的地方
表单：输入 + 校验弹窗 + 保存 — 6/6 PASS
  AddModel：输入进入受控输入框（secureTextEntry） :: value=sk-preview-acceptance type=password
  AddModel：空模型 ID 触发校验弹窗                :: alert text 请填写模型 ID
  AddModel：弹窗确认后关闭
  AddModel：手动模型 ID 可编辑                    :: value=preview-acceptance-model
  AddModel：有效表单保存后返回上一屏
Modal 弹窗（设置页） — 4/4 PASS
  设置页 Modal 打开并限制在手机画布内 / 文本域可交互 :: placeholder=请输入搜索框位置描述... / 取消后关闭
全部注册页面深链渲染巡检 — 2/2 PASS
  工作台注册页面数量 ≥ 19 :: Home,Capabilities,History,Settings,PhoneOperate,VisualAgentTools,OpenClaw,Errands,ErrandDetail,Privacy,CompanionConfig,AvatarLooks,AddModel,EditModel,APIKeyGuide,TaskHistory,TaskDetail,DebugLog,About
  全部注册页面深链可渲染且无页面级异常 :: 19 pages clean
头像与演示语音 — 5/5 PASS
  Home 复用 App 头像宿主（iframe） :: src=/nono-avatar/avatar.html
  头像 iframe 内 3D 画布挂载 / 同源可访问（无跨域阻断） / scene.js 真实建立 three.js 场景（window.NonoAvatar 就绪）
  点击头像走演示 ASR 适配器并出对话气泡 :: Bubble 我听到了
全局 — 2/2 PASS
  全部页面无 console.error / 未捕获异常 :: 0 errors
  无外部网络请求（不联网调用模型/供应商）   :: 123 个请求全部本机（123 http / 0 ws）；外部=0

36/36 checks passed   [exit 0]
```
证据：`artifacts/browser-run.log`、`artifacts/check-results.json`、截图 `artifacts/01-tabs-home.png` … `08-avatar-reply.png`。

### 2.4 构建产物真的能跑（dist 静态服务 + 无头浏览器）

```sh
node verification/dist-smoke.mjs
```
```
PASS  dist/index.html 引用资源齐备  :: /assets/index-BSrtzKMW.js /assets/index-DbQUw_gU.css
PASS  构建产物包含 FontAwesome @font-face 且字体文件存在
PASS  构建产物复用 App 资源 nono-avatar/{avatar.html,scene.js,GLTFLoader.js,three.min.js,three.module.js}
PASS  生产构建在浏览器中渲染主界面  :: 陪伴 · NoNo 演示对话模型 / 首页 能力 活动 设置
PASS  生产构建加载 /nono-avatar 场景（three.js 场景就绪）
PASS  生产构建加载 /fonts/FontAwesome.ttf（字体可用）  :: document.fonts.check=true
PASS  生产构建无 console.error / 未捕获异常  :: 0 errors

11/11 dist checks passed   [exit 0]
```
证据：`artifacts/dist-check.log`、`artifacts/09-dist-home.png`。

### 2.5 聚焦测试（AwesomeProject，仅 3 个文件）

```sh
cd AwesomeProject && npm test -- --runTestsByPath \
  src/__tests__/features/task/HomeFacadeIntegration.test.tsx \
  src/__tests__/features/capability/CapabilityViewStates.test.tsx \
  src/__tests__/navigation/AppNavigatorTyping.test.tsx
```
```
PASS src/__tests__/navigation/AppNavigatorTyping.test.tsx
PASS src/__tests__/features/task/HomeFacadeIntegration.test.tsx
PASS src/__tests__/features/capability/CapabilityViewStates.test.tsx

Test Suites: 3 passed, 3 total
Tests:       15 passed, 15 total
Time:        1.576 s
[exit 0]
```
未运行任何其他 AwesomeProject 测试套件。

## 3. 边界审计：共用源码与 App 不受影响

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 预览不产生第二份页面实现 | 预览入口只有 `web-preview/index.html`（空壳 + `/src/main.tsx`）；`PreviewShell.tsx:2,3` 直接 import `../../src/navigation/AppNavigator` 与 `AppFacadesProvider` | 通过 |
| App 侧不引用预览 | `grep -rn "web-preview" AwesomeProject/src AwesomeProject/package.json metro.config.js babel.config.js tsconfig.json index.js App.tsx` | 无匹配 |
| App 构建配置未被改 | `git status --porcelain -- AwesomeProject/package.json metro.config.js babel.config.js tsconfig.json index.js src/navigation src/application/facades` | 空（无改动） |
| 共享源码零改动 | 验收前后对 `AppNavigator.tsx 53c8d96f…`、`CustomTabBar.tsx 1abf0056…`、`AppFacadesContext.tsx aebb5701…`、`HomeScreen.tsx 66cc4ca8…`、`SettingsScreen.tsx c47f2f5b…`、`CapabilitiesScreen.tsx 9a6631af…`、`CustomAlert.tsx 15935f02…`、`PageLayout.tsx a03f5ede…`、`package.json 703934f5…`、`tsconfig.json 45677c32…` 做哈希 | 与开工基线完全一致 |
| 原生 require 未被磁盘改写 | `grep -c "require('react-native-permissions')" src/features/task/screens/HomeScreen.tsx` → `1`；改写只发生在 Vite 编译期（`vite.config.ts:85-98`） | 通过 |
| 写入范围仅限预览目录 | Vite 写操作仅 `dist/`（`outDir: 'dist'`, `emptyOutDir`，`vite.config.ts:150-176,179`）；dev server 只读 `fs.allow:[app]`（`:178`） | 通过 |
| 预览不联网 | 源码无 `fetch/XMLHttpRequest/axios`；浏览器实测 123 个请求全部 `127.0.0.1:5173`，外部 0 | 通过（见 2.3） |

## 4. 未测范围（明确未覆盖）

1. **真机/模拟器**：Android/iOS 原生转场、真实安全区、StatusBar、原生 Switch、elevation/阴影、键盘与 `KeyboardAvoidingView`、WebView 合成、真实权限/麦克风/ASR、真实模型服务与任务执行 —— 全部未测（禁止操作真机，也无凭证）。
2. **像素一致性**：未与真机或 HTML 原型做像素比对；报告中的 Android/iOS 仅证明“执行了原布局分支”，不等于系统控件一致。
3. **非 390×844 尺寸**：全部检查在默认 `390 × 844` 与 1440×1000 窗口（scale=1，`fit` 勾选）下进行；`360/393/412` 预设与长文本、动态字号、横屏未测。
4. **iOS 分支的逐屏覆盖**：iOS 只覆盖 Home + tab bar 安全区 + home indicator；19 页巡检使用默认 android。
5. **交互深度**：19 页巡检只证明“可挂载渲染、无页面级异常、无 console 错误”；除已列路径外的每个按钮/流程未逐一点击。已实测交互路径：四 tab 切换、Capabilities→Errands→返回、ErrandDetail 深链、AddModel 输入/校验弹窗/保存返回、Settings 搜索框位置 Modal 开→取消、头像点击→语音气泡。
6. **HMR 实时编辑回环**：未测（需改共享源码，超出授权）。
7. **生产部署形态**：dist 仅在临时本机静态服务上验证；子路径部署/base 配置、CDN、缓存策略未测。
8. **静态类型检查**：`web-preview` 没有 `tsconfig.json`，`package.json` 也无 `typecheck` 脚本，`vite build` 只转译不做类型检查 —— 预览自身适配器/fixtures 的类型错误不会被构建拦截（仅运行期被本次用例覆盖）。
9. **网络隔离的强验证**：只做了“观测到的请求全在本机”，未做 hosts 级阻断来证明外部调用会失败。

## 5. 观察与非阻塞问题（无一是预览功能缺陷）

1. **工作台“页面”下拉框比屏幕晚一帧更新**（仅影响开发工作台控件）
   - 现象：点击底部 tab 切换后立刻读取 `#page-picker.value`，仍是上一页；等待数帧后收敛为正确值。
   - 位置：`src/adapters/navigation.tsx:86-90`（route 事件在 `useEffect` 里派发）→ `src/PreviewShell.tsx:106-110`（监听后 `setPage`）。
   - 重现：`?page=Home` → 点击底部「能力」→ 同一 tick 内读 `document.querySelector('#page-picker').value` 得到 `Home`，稍后为 `Capabilities`。
   - 影响：仅工作台下拉框显示延迟，不影响 App 与预览页面本身；我的用例已改为等待收敛值（等待窗口 5s，实测稳定通过）。建议（可选）：在 `route` 事件处理里用 `flushSync` 或不依赖该同步读取。

2. **头像 3D 依赖 WebGL；无 WebGL 环境只显示空白并有一条 three.js `console.error`**
   - 位置：`src/features/task/avatar/scene.js:15`（`new THREE.WebGLRenderer`）+ `:326-328` 的 catch。
   - 重现：在无可用 WebGL 上下文的无头/远程环境下打开 `?page=Home`。
   - 影响：App 侧同样依赖真机 WebGL，不是 preview 适配缺陷；报告中的 3D 结论是在启用软件 WebGL（SwiftShader）后取得的真实通过结果。

3. **`npm run build` 的字体告警（非缺陷）**
   - 位置：`src/preview.css`（`/fonts/FontAwesome.ttf`）+ `vite.config.ts:150-176`（`closeBundle` 复制）。
   - 已在 dist 中确认文件存在（`dist/fonts/FontAwesome.ttf`）且 `document.fonts.check('16px FontAwesome') === true`。

未发现需要修复的实现缺陷；无 FAIL 项，因此没有“准确文件行号 + 重现步骤”形式的缺陷条目。

## 6. 本次新增的文件（未改实现，未 commit）

- `AwesomeProject/web-preview/verification-report.md`（本报告）
- `AwesomeProject/web-preview/verification/browser-smoke.mjs`（36 项 CDP 浏览器验收，自建隐藏浏览器）
- `AwesomeProject/web-preview/verification/dist-smoke.mjs`（11 项构建产物运行验证，含临时静态服务）
- `AwesomeProject/web-preview/verification/http-assets.mjs`（8 项 HTTP/资源探测）
- `AwesomeProject/web-preview/verification/dom-probe.mjs`（单页 DOM 取证小工具）
- 证据产物（`web-preview/.gitignore` 已忽略 `artifacts/`）：`artifacts/{build.log,http-assets.log,browser-run.log,check-results.json,dist-check.log,dist-check-results.json,jest.log,01..09-*.png}`

复现全部结论：

```sh
cd AwesomeProject/web-preview
npm run build
node verification/http-assets.mjs
node verification/browser-smoke.mjs
node verification/dist-smoke.mjs
cd .. && npm test -- --runTestsByPath \
  src/__tests__/features/task/HomeFacadeIntegration.test.tsx \
  src/__tests__/features/capability/CapabilityViewStates.test.tsx \
  src/__tests__/navigation/AppNavigatorTyping.test.tsx
```
（无头浏览器二进制默认取 `~/Library/Caches/ms-playwright/chromium_headless_shell-1234/...`，可用 `CHROME_HEADLESS_SHELL` 覆盖；脚本使用 `--no-sandbox --use-angle=swiftshader`，因为 agent 沙箱内 Chromium 自带沙箱无法初始化、且需要软件 WebGL 才能验证 3D 角色。）

## 7. 假设

- 以 `http://127.0.0.1:5173` 上主 agent 已启动的 dev server 为验收对象；测试期间未重启它（Vite 会在 `vite.config.ts` 变更时自行重启，2.2 的响应内容可证明其已在服务新配置）。
- “空数据/示例数据”的预期文案取自共享屏幕源码（如 `ErrandsScreen.tsx:98` 的“还没有交代”、`TaskHistoryScreenTab.tsx:206` 的记忆文案），未擅自定义业务语义。
- 交互验收通过 CDP 真实鼠标事件（`Input.dispatchMouseEvent`）驱动，非直接调用 React 内部 API；表单文本使用 `Input.insertText` 与原生 value setter + `input` 事件（后者与真实键入等价于 React 受控输入路径）。
- 未操作真机、未调用任何模型供应商、未使用任何凭证。
