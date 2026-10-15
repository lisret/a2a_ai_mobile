# 米咔陪伴 3D 原型 · 限定范围独立评审

- 评审时间：2026-10-10 19:19–19:26（本地）
- 工作目录：`/Users/a/Desktop/code/tool/a2a_ai_mobile`
- 方式：静态阅读 + `node scripts/test-mika-avatar.mjs`（cwd `AwesomeProject`）+ GLB 只读解析 + gradle/vite 资源清单核对。**未联网、未启动浏览器、未真机/模拟器验证、未修改任何文件（仅本报告）。**
- 限制：主 agent 本轮正在并行改画幅，评审期间 `src/features/task/avatar/scene.js` 等 4 个文件在 19:24:26 被重写（仅格式化，逻辑未变）。以下行号/结论对应下列哈希；若文件继续变动，行号可能漂移。

| 文件 | sha256（评审时） |
| --- | --- |
| `src/features/task/avatar/scene.js` | `a6a92ac8…5083ea` |
| `src/features/task/avatar/AvatarAnimation.mjs` | `bdb1c6a5…0ee8076` |
| `src/features/task/avatar/mika-prototype.glb` | `7dc2b649…3afdbdd` |
| `src/features/task/components/NonoAvatar3D.tsx` | `8cea953a…951d423e` |
| `scripts/test-mika-avatar.mjs` | `d3f13ae7…55e2ea4` |
| `scripts/generate-mika-avatar.mjs` | `6db9caf2…3bf0726` |
| `web-preview/vite.config.ts` | `5b1870cd…742dbcb7` |
| `android/app/build.gradle` | `827364e4…66ab37f` |

## 1. 结论速览

| # | 关注点 | 判定 | 依据强度 |
| --- | --- | --- | --- |
| 1 | 真实骨骼蒙皮 | **PASS** | 执行验证（Node/CPU 蒙皮层）；GPU/真机未验 |
| 2 | 动画淡入淡出 / 重入 / 一次性回 idle | **部分 FAIL**：核心语义 PASS，同一 one-shot 重入被静默丢弃 | 执行验证 + 代码 |
| 3 | 骨骼与几何释放 | **PASS**（可达路径），附低危缺口 | 代码 + three 源码核对 |
| 4 | 异步加载竞态 | **PASS** | 代码 |
| 5 | WebView 准备时序 | **FAIL**（WebGL 初始化失败时宿主零信号） | 代码 |
| 6 | 打包资源 | 源码/构建清单 **PASS**；**APK 与 Android `file://` 取模型无法验证，且高度可疑（F1）** | 清单核对；APK 未构建 |
| 7 | 纵屏相机裁切 | **PASS**（几何推导，非像素验证） | 计算 |

明确不能称为 PASS 的项：Android 真机上的 GLB 加载与渲染、APK 内资源、WebView 手势转头、GPU 蒙皮、画幅像素结果。

## 2. 测试执行结果

```
cd AwesomeProject && node scripts/test-mika-avatar.mjs
✔ bundled model has weighted skeleton, companion clips and actual skinned deformation (24.4ms)
✔ same mood does not restart; success finishes in idle and can be replayed after a mood change (9.0ms)
✔ missing clips use idle, reduced motion stays still, cleanup stops actions (6.9ms)
tests 3 | pass 3 | fail 0 | exit 0
```

19:19 版本与 19:24 重写后的版本各跑一次，均 3/3 PASS。另做只读 GLB 解析（`three@0.160.1` addons loader）：

- 989,900 B（966.7 KiB，与 `mika-prototype.md` 的"约 967 KiB"一致，且 < 2 MiB 断言 `test-mika-avatar.mjs:32`）
- 22 个 mesh **全部**是 SkinnedMesh，23,964 三角形，8 个材质，**0 张纹理**（离线自包含成立）
- 14 根骨骼：Root/Pelvis/Chest/Head/Ear_L/EarTip_L/Ear_R/EarTip_R/Eye_L/Eye_R/Arm_L/Arm_R/Foot_L/Foot_R
- 6 个 clip 且名称/时长与文档、测试断言一致：idle 4.00 / listen 3.00 / thinking 4.00 / confirm 1.15 / success 1.30 / error 1.50
- 权重：每顶点四通道和 = 1；1,296 个顶点有 ≥2 个非零权重，最大影响数 2；骨骼位移使 `EarLeft` 顶点实际移动 > 0.015

`mika-prototype.md` 的"14 根骨骼 / 无外部贴图 / 后三个为一次性动作 / 无口型同步"逐条与模型一致，文档无夸大；末尾也已声明"真机渲染仍需设备验收"。

## 3. 详细发现

### F1（HIGH，未验证 → 不得判 PASS）Android WebView 用 `fetch()` 取 `file://` GLB

- 位置：`scene.js:298`（`defaultUrl` = `file:///android_asset/nono-avatar/mika-prototype.glb`）、`scene.js:368-369` `new GLTFLoader().load(...)`、`GLTFLoader.js:334-341`、`node_modules/three/src/loaders/FileLoader.js:88` `fetch( req )`。
- 影响：three r160 的 `FileLoader` 已改为 `fetch`。Blink 对 `file://` 直接拒绝（"URL scheme \"file\" is not supported"），`NonoAvatar3D.tsx:110-112` 的 `allowFileAccessFromFileURLs` / `allowUniversalAccessFromFileURLs` 只放宽 XHR，不放宽 `fetch`。若成立，Android 上会走 `scene.js:410-419` 失败分支 → `showLegacy()` → 真机显示的是旧的图元吉祥物，而 http 预览（Vite）一切正常。这恰好会造成"预览 PASS、装机不成"的分裂结论。同类风险也覆盖 `<script type="module">`（`avatar.html:29`）经 `file://` 取模块图。
- 佐证：本轮之前 gradle 的 include 列表**从未包含 GLB**（见 `build.gradle:136-137` 现行为新值），即"GLB 经 android_asset 加载"这条路径在本轮之前不存在，没有任何真机先例可援引。
- 建议（按成本排序）：① 真机跑一次，看 `avatar-load-failed` 是否上报（代码已有该信号，`NonoAvatar3D.tsx:121-123`）；② 若失败，绕开 fetch：RN 侧读资产后 `injectJavaScript` 注入 base64，前端改走 `GLTFLoader.parse(arrayBuffer)`；③ 或用已引入的 NanoHTTPD（`build.gradle:172-174`）在 127.0.0.1 起一个只读 `/nono-avatar/`，把 WebView 切到 http 源。
- 判定：**不能计为 PASS**，属"最可能的真机阻断项"。

### F2（MEDIUM）WebGL 初始化失败时宿主得不到任何信号

- 位置：`scene.js:12-22` 的 `try` 包裹了 `new THREE.WebGLRenderer(...)`，`catch` 在 `scene.js:472-474` 只 `console.warn`。
- 影响：catch 后 IIFE 结束，**既不 post `avatar-ready` 也不 post `avatar-load-failed`**。RN 侧 `onLoadEnd` 仍会触发 `injectState()`（`NonoAvatar3D.tsx:115`），但 `window.NonoAvatar` 未定义，注入的 `window.NonoAvatar&&...` 静默 no-op → 空白区域，且 `onGltfFailed()` 永不触发，无法回落到 2D 吉祥物。设备关闭硬件加速 / 无 WebGL2 时即命中。
- 建议：`catch` 中补 `postMessage({type:'avatar-init-failed'})`（或在 catch 里也报 `avatar-ready`），RN 侧据此回退并上报。

### F3（MEDIUM）同一个一次性动作无法连续重放（被静默丢弃）

- 位置：`AvatarAnimation.mjs:40-41`（finished → `play(fallback)`，但**不清 `requestedMood`**）、`AvatarAnimation.mjs:47`（`requestedMood === mood` 直接 return）、`scene.js:211`（`mood === next` 直接 return，第二道同值闸门）。
- 影响：`success/confirm/error` 播完自动回 idle 后 `requestedMood` 仍是 `'success'`；宿主再次下发同一个 mood（RN 的 mood prop 未经过中间态，例如连续两次"完成"）不会重播。`test-mika-avatar.mjs:43` 把这一行为**固化成了断言**，所以回归测试不会保护这个需求；`avatar-lab.html` 里靠 `api.setMood('idle'); api.setMood(mood)` 手工规避，而 `NonoAvatar3D` 没有等价规避。注意中间态切换（confirm→idle→confirm）是正常的，测试 `:44` 覆盖了。
- 建议：finished 回调里若刚结束的是 one-shot，则 `requestedMood = null;` 再 `play(fallback)`（或让 `setMood` 在 `currentMood !== mood` 时允许重放），并补一条"同一 mood 连续两次应重播"的测试。

### F4（MEDIUM）测试未覆盖真正上机的那份代码

- 位置：`test-mika-avatar.mjs:5` 从 `three/addons/loaders/GLTFLoader.js` 取 loader，而 WebView 实际加载的是 `src/features/task/avatar/GLTFLoader.js`（由 `scripts/vendor-gltf-loader.js` 把 `'three'` 改写成 `'./three.module.js'` 并内联 `toTrianglesDrawMode`）。测试**完全不触及** `scene.js`（相机/缩放、loadGltf 竞态、disposeModel、showLegacy）与 `NonoAvatar3D.tsx`。
- 影响：vendored loader 的改写一旦与 0.160.1 漂移（例如 three 升级后 `'three';` 尾部或 `TriangleStripDrawMode` 列表变化）测试不会红；"模块图闭合""竞态""释放""画幅"这些结论目前只有静态依据。我已人工核对 `vendor-gltf-loader.js` 的两处替换在当前 0.160.1 源码上可命中，且 vendored 与 addons 版本 diff 仅为预期的两处改写（114 行）。
- 建议：至少加一条 `import('../src/features/task/avatar/GLTFLoader.js')` 的 parse 冒烟（用 vendored loader 解析同一个 GLB）；再把 `disposeModel` 的遍历/去重逻辑抽成可测纯函数。

### F5（LOW-MEDIUM）`frustumCulled=false` 的意图没有进入 GLB

- 位置：`generate-mika-avatar.mjs:44` 设置了 `mesh.frustumCulled=false`，但 `frustumCulled` 是运行时属性，`GLTFExporter` 不会序列化；加载后（`scene.js:379`）所有 mesh 恢复默认 `true`，剔除用的是 bind-pose 包围球，而"thinking"里 `Arm_R` 转 1.1 rad、"error"里头部转 0.16 rad 都会把顶点带出原包围球。
- 影响：当前画幅下模型整体在视锥内且留有余量（见第 4 节），所以**大概率看不到**；但主 agent 正在收紧画幅，一旦模型边缘贴框，可能出现小部件（EyeShine/Cheek/Smile）瞬时消失。
- 建议：加载成功后统一 `traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; })`，或 `o.geometry.boundingSphere.radius *= 2`，把 `generate-mika-avatar.mjs:44` 的本意延续到运行时。

### F6（LOW）画幅魔数与模型包围盒无任何约束绑定

- 位置：`scene.js:182`（除 `2.65`）、`scene.js:383`（`2.3 / height`、`2.65 / size.x`）。
- 影响：这两个数隐含"归一化后模型宽 2.65、高 2.3"，一旦重新生成 GLB 改变包围盒（当前实测宽高比使 `scale = min(2.3/2.0, 2.65/2.72)=0.974`），画幅会静默偏大/偏小，且没有测试兜底。
- 建议：`resize()` 里直接用加载时算出的 `size` 归一化（把归一化结果存成模块级变量），或在测试里断言导出 GLB 的 bbox ≈ 2.65 × 2.30。

### F7（LOW）低动态设置只在启动时读一次

- 位置：`scene.js:13-15`（无 `matchMedia(...).addEventListener('change')`）。
- 影响：运行中切换系统"减弱动态效果"需重载 WebView 才生效；另外低动态下 `update()`（`AvatarAnimation.mjs:52`）不推进 mixer，one-shot 永不 finished，`currentMood` 会永久停在 `confirm/success/error`（仅影响状态读取，无视觉后果）。
- 建议：加 change 监听；或在低动态下把 one-shot 视为立即结束。

### F8（LOW）零散健壮性缺口

- `scene.js:353-360` `showLegacy()` 未清 `host.dataset.clips`，回落时会残留上一次成功加载的 clip 列表（仅影响预览页读数）。
- 无 `webglcontextlost` 监听、`pagehide`（`scene.js:433-440`）不 `renderer.dispose()`；页面销毁由 WebView 兜底，风险低。
- `scene.js:410-419`：自定义 pack 加载失败时会**先回落 built-in 再**上报 `avatar-load-failed`，宿主若把该信号等同于"完全失败"会误判。
- 被抢占的在途请求不会 abort（GLTFLoader 无 abort），迟到的 967 KiB 响应仍会走完再被丢弃（`scene.js:372-375` 已正确 dispose），只浪费流量，不是正确性问题 —— 这一点实现是对的。
- `NonoAvatar3D.tsx:97` 依赖父 View 的 `onTouchMove` 做转头：WebView 是原生子视图，理论上不参与 RN responder 体系，但**未经真机验证**；`size.current` 在 `onLayout` 前为 `{1,1}`，好在 `scene.js:457-459` 做了 clamp。
- `NonoAvatar3D` 未设 WebView 的 `onError`，avatar.html 本身加载失败（file:// 路径错、资产缺失）无观测点。

## 4. 纵屏裁切核算（PASS，几何推导）

`resize()`（`scene.js:163-186`）每次按 `host.clientWidth/Height` 重算 `aspect/fov/z`，并把 `root.scale` 夹到 `min(base, visibleWidth*0.82/2.65)`。

- 竖直方向与 aspect 无关：可见高度 = `2·z·tan(fov/2)`，stage = 1.944、preview = 1.547 世界单位；模型被归一化到高 2.3（`scene.js:383`），`root.scale ≤ 0.58` → 最高 1.334，始终 < 1.547 → **不裁切**。
- 横向：横屏/近方形下取 base（0.52/0.58）；窄纵屏下由宽度钳制，例如 360×560（aspect 0.643）：visibleWidth = 1.25 → scale = 0.387 → 模型半宽 0.513 < 可见半宽 0.625，填充率正好 82%。
- 结论：纵屏不会裁切；该断言来自计算与前一轮骨架，**不是像素验证**——像素层面的最终画幅由主 agent 的 CUA 验证负责（其正在调整，说明当前观感仍可能被改）。

## 5. 假设

1. "本轮新文件"按任务给清单判定；`scene.js`、`NonoAvatar3D.tsx`、`build.gradle` 虽在工作树中显示为 modified（含大量先前轮次改动），我只把与米咔 GLB/动画/打包相关的部分计入本轮结论，LAN MCP（nanohttpd、commons-compress、`LanMcpModule.kt` 等）不在范围内、未评审。
2. `android/app/src/main/assets/nono-avatar/` 被 `.gitignore:69` 忽略、由 `build.gradle:135-146` + `preBuild`（`build.gradle:165-167`）在构建时重新拷贝，因此"仓库里看不到资产"不等于打包缺失；我核对了拷贝清单里 5 个源文件与 `node_modules/three/build/three.module.js` 均存在，`vite.config.ts:154-177` 的 `closeBundle` 也拷贝同一组（`dist/nono-avatar/` 已含全部 7 个文件）。但该目录在评审开始时是**陈旧**的（10,307 B 的上一轮 `scene.js`，且无 `AvatarAnimation.mjs`/`mika-prototype.glb`），中途被并发构建刷新到 14,133 B + `AvatarAnimation.mjs` 1,820 B + GLB —— 任何真机检查都必须先重新构建（19:24 之后 src 又大于该副本）。
3. 无法在本环境构建 APK（需 Gradle/网络与设备），故第 6 项的 APK 结论一律标注"未验证"。

## 6. 建议的收口顺序

1. 真机（或模拟器）跑一次并确认 `avatar-load-failed` 是否上报 → 决定 F1 是"必修"还是"误判"。
2. 修 F3（one-shot 重放）与 F2（初始化失败信号），两者都是小改动且能用 Node 测试兜住 F3。
3. 补 F4 的 vendored-loader 冒烟与 `disposeModel` 测试；顺手把 F6 的魔数改成从 bbox 推导。
4. F5/F7/F8 可延后；F5 若收紧画幅后出现部件闪没则升级优先级。
