# MiniCPM Android 本地运行实现进度与接手说明

更新时间：2026-08-18（Asia/Shanghai）

## 1. 当前结论

MiniCPM 目前**尚未达到“真机可完成真实本地推理”**的状态。

已经完成并经过多轮测试的是：模型清单与下载授权策略、Wi-Fi/移动网络二次确认规则、断点续传下载、恢复/暂停/取消/删除互斥、前台下载服务的大部分生命周期与 Android API lint 边界。

R5-I1 / R5-I2 的实现与 focused 测试已在工作树完成（未提交、未独立复审）。

仍未完成的是：

1. Task 2 剩余静态门禁（lint NewApi/MissingPermission、Jest/Prettier/ESLint、独立复审）与提交。
2. RN 下载确认与进度 UI。
3. MiniCPM/llama.cpp 原生推理引擎、JNI、模型加载与视觉推理接线。
4. Agent Runtime/Mode 3 与本地 MiniCPM 的生产组装。
5. 小米 MI 9 真机上的真实模型下载、校验、加载、推理和任务执行验收。

因此，接手者不要宣称 MiniCPM 已能运行；最终标准必须是真机产生真实本地推理结果。

## 2. 仓库与工作树

- 主仓库：`/Users/a/Desktop/code/tool/a2a_ai_mobile`
- 当前实现工作树：`/Users/a/Desktop/code/tool/a2a_ai_mobile/.worktrees/nono-task-surfaces-integration`
- 分支：`codex/nono-task-surfaces-integration`
- 当前已提交 HEAD：`ac04fe4`
- 当前工作树有两份未提交源码变更，处于 Round 6 RED 阶段；另有一个仅用于测试的未跟踪 `AwesomeProject/node_modules` 软链接，绝对不要提交。

检查命令：

```bash
cd /Users/a/Desktop/code/tool/a2a_ai_mobile/.worktrees/nono-task-surfaces-integration
git status --short
git log --oneline -12
```

## 3. 已批准设计与实施计划

- 设计：`docs/superpowers/specs/2026-08-18-minicpm-v46-android-runtime-design.md`
  - commit：`32dc9b3 docs: design MiniCPM Android runtime`
- 计划：`docs/superpowers/plans/2026-08-18-minicpm-v46-android-runtime-implementation.md`
  - commit：`76e1ac4 docs: plan MiniCPM Android integration`
- SDD 进度账本：`.superpowers/sdd/2026-08-18-minicpm-v46-android-runtime-implementation/progress.md`
- Task 2 完整审查记录：`.superpowers/sdd/2026-08-18-minicpm-v46-android-runtime-implementation/task-2-review.md`
- Task 2 修复验证报告：`.superpowers/sdd/2026-08-18-minicpm-v46-android-runtime-implementation/task-2-rescue-report.md`

## 4. 已完成提交

### Task 1：固定可信模型产物与下载授权规则

- `bc5f78b feat: pin MiniCPM model artifacts`

已实现：

- 固定 MiniCPM 模型及 mmproj 的 URL、长度、SHA-256。
- Wi-Fi、移动网络、未知网络均要求用户二次确认后才能下载。
- 网络类型变化后必须重新确认。
- 离线状态不发起请求。
- 设备门槛：API 26+、arm64、RAM >= 6 GB、首次下载可用空间 >= 2.5 GB。

固定产物：

- `MiniCPM-V-4_6-Q4_K_M.gguf`
  - size：`529101504`
  - sha256：`6b0c74962c44bc6bf4b655b9b02c13eda9d5a0491543ae976d1ac18e4b7892e2`
- mmproj
  - size：`1108746944`
  - sha256：`ca931d861d0801d9003e50697cd764721a334107c0e0415a51168ee1938462de`
- OpenBMB app commit：`bbd042eebd333ab64998d2e630e01d58e673ca3f`
- llama.cpp-omni gitlink：`bebcf1676fe90db4dd9b4e9764d89e48ed52bdd9`

### Task 2：安全下载、恢复与服务生命周期（已完成大部分，未最终通过）

提交链：

```text
51ab3c7 feat: download MiniCPM artifacts safely
ba40c83 fix: harden MiniCPM download runtime
5add3e2 fix: persist MiniCPM download recovery
3f4b890 test: cover MiniCPM coordinator recovery
fcce8f0 fix: harden MiniCPM service recovery controls
2b90f9c fix: join MiniCPM download owner on teardown
a2fc94e fix: harden MiniCPM download cancellation
da527ac fix: close MiniCPM download lifecycle races
488fe90 docs: record Task 2 rescue verification
ee53ed1 fix(android): close local model lifecycle races
ac04fe4 docs: record Task 2 round 5 verification
```

当前已通过的能力：

- 断点续传与严格 `Content-Range`/长度边界。
- 固定目录、原子 checkpoint、恢复采纳。
- 暂停/取消/销毁在下载启动前不会继续开网。
- 首次 0 字节下载始终重新检查 2.5 GB；真实非零续传使用剩余大小规则。
- 恢复采纳与旧会话删除通过独占 gate 串行化。
- 校验前与 mismatch cleanup 的暂停/取消竞态已覆盖。
- 删除与活动下载互斥。
- 进度事件与 checkpoint 节流。
- API 26 verifier 边界与广义 `NewApi`/`MissingPermission` lint parser 已清零。
- 公开暂停原因固定为 `DOWNLOAD_CONFIRMATION_REQUIRED`。

最近完整门禁（commit `ac04fe4`）：

- Android localmodel：54/54 PASS。
- Kotlin compile：PASS。
- Task 2/localmodel `NewApi|MissingPermission`：0。
- Jest：2/2 PASS。
- Prettier、ESLint、diff、privacy、URL、logging、ownership：PASS。
- 未进行真实网络、真实模型下载或真机推理。

## 5. 当前未提交状态（非常重要）

Round 6 已把 R5-I1 / R5-I2 做成 GREEN，仍未提交。`AwesomeProject/node_modules` 仍是测试软链接，绝对不要提交。

主要未提交变更：

```text
M AwesomeProject/android/app/build.gradle
M AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalModelDownloadModule.kt
M AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/DownloadOperationGate.kt
M AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel/LocalModelDownloadCoordinator.kt
M AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel/LocalModelDownloadCoordinatorTest.kt
A AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalModelDownloadApi26Delegate.kt
A AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalModelDownloadBridgeDelegate.kt
A AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel/LocalModelDownloadModuleApiCompatTest.kt
?? AwesomeProject/node_modules
```

I1：operation gate 增加 `finalized`；owner 终态通过 `finalizeIfRunning` 与 pause/cancel linearize；activation catch 走 `gateInterruption`。原 3 组 barrier tests 现为 GREEN。

I2：API 26 实现抽到 `LocalModelDownloadApi26Delegate`，仅在 SDK >= 26 时用 `Class.forName` 创建。API 21/23/25 的 `initialize()` 不再订阅 Runtime。Robolectric 真实构造模块后 6 个公开方法返回 `DEVICE_UNSUPPORTED`，listener/coordinator/service 调用数为 0。

最近 focused 门禁：localmodel **60/60 PASS**，Kotlin compile PASS。尚未重跑 lint / Jest / 独立复审。

## 6. 当前必须解决的两个问题

### I1：终态发布与暂停/取消没有原子化

文件：`LocalModelDownloadCoordinator.kt`

根因：operation token 在 `confirmWhenOwned()` finally 才释放，但若 `FAILED`、`IDLE / INSUFFICIENT_STORAGE` 已发布而 token 仍被持有，`pause()`/`cancel()` 仍可把终态改成 `AWAITING_CONFIRMATION`。反向竞态中，激活异常 catch 也可能覆盖更早的 pause/cancel。

推荐修复：

- 在 operation gate 中加入原子 `FINALIZING`/terminal 状态。
- 终态 publication 与 token release 必须相对 control linearize。
- pause/cancel 在 PREPARING/DOWNLOADING/VERIFYING 可记录 sticky stop。
- pause/cancel 不得改写已经 finalizing/finalized 的 IDLE/FAILED/COMPLETE/CANCELLED。
- activation catch 必须像 mismatch cleanup 一样通过 `gateInterruption`/`runIfRunning`，不能无条件发布 FAILED。
- 让当前新增的 3 组 barrier tests 先 RED，再最小 GREEN。

### I2：API 21/23/25 未通过真实 RN 模块行为验证

涉及：

- `AccessibilityPackage.kt`
- `LocalModelDownloadModule.kt`
- `LocalModelDownloadRuntime`/service/coordinator 的 API 26 引用边界。

现状：模块在 package 中无条件注册，`initialize()` 和 React methods 的 lambda 可能在 API 21–25 触碰 API 26 类。当前只有纯 policy JVM 测试，不能证明不会出现 `VerifyError`/`NoClassDefFoundError`。

推荐修复：

- 把 API 26 实现隔离为仅在 SDK guard 通过后才创建的 delegate。
- API 21–25 的模块构造与 `initialize()` 不得订阅/加载 LocalModelDownloadRuntime。
- 所有公开 RN 方法在 API 21/23/25 返回固定 `DEVICE_UNSUPPORTED`，且 runtime/service delegate 调用数为 0。
- 使用 Robolectric 或 instrumentation，真实构造 `AccessibilityPackage`/`LocalModelDownloadModule`，运行生命周期并调用所有公开方法。
- 保留 broad lint parser `NewApi|MissingPermission == 0` 作为独立门禁。

## 7. 建议的下一步顺序

1. 保留当前 RED 测试，完成 I1 atomic finalization 修复。
2. 为 I2 写 API 21/23/25 真实模块 RED 测试，再做 lazy API26 delegate。
3. 重跑并扩展 localmodel 测试（基线至少 54 项）。
4. 重跑 Kotlin compile、`lintDebug`，解析 Task2/localmodel `NewApi|MissingPermission` 必须为 0。
5. 重跑 Jest、Prettier、ESLint、privacy、URL、logging、diff、ownership。
6. 再做一次独立代码审查；Task 2 Ready 后才能进入 Task 3。
7. Task 3：RN 下载确认/进度/暂停/恢复/删除 UI 与严格 bridge。
8. 后续任务：原生供应链、JNI、推理引擎、Agent Runtime 生产组装。
9. 最终在小米 MI 9 真实下载模型并完成一次真实视觉推理；未做到前不能称为完成。

## 8. 常用命令

```bash
cd /Users/a/Desktop/code/tool/a2a_ai_mobile/.worktrees/nono-task-surfaces-integration

export JAVA_HOME=/private/tmp/nono-temurin17/Contents/Home
export ANDROID_HOME=/Users/a/Library/Android/sdk

cd AwesomeProject/android
sh ./gradlew :app:testDebugUnitTest --tests 'com.awesomeproject.localmodel.*' :app:compileDebugKotlin --rerun-tasks --console=plain
sh ./gradlew :app:lintDebug --rerun-tasks --console=plain

cd ../
npm test -- --runInBand src/__tests__/core/engine/agentRuntime/localModel/LocalModelDownloadBridge.test.ts

cd ..
git diff --check
git status --short
```

注意：`/private/tmp/nono-temurin17` 是临时 JDK 17，可能在重启或清理后消失；若不存在，请重新配置 JDK 17。`AwesomeProject/node_modules` 是测试用软链接，提交前必须移除或确认不进入 git。

## 9. 明确禁止事项

- 不要把模型 URL、任务指令、API key、截图路径或原始异常写入日志/通知。
- 不要绕过 Wi-Fi/移动网络二次确认。
- 不要在确认前发起任何模型网络请求。
- 不要用测试假数据声称 MiniCPM 真机可运行。
- 不要提交 `AwesomeProject/node_modules`、GGUF、mmproj 或其他大模型产物。
- 不要删除当前未提交的 Round 6 RED 测试，除非用等价或更强的行为测试替代。
