# 后台执行解决方案

## 问题分析

切换到后台后，React Native 的 JavaScript 执行可能被系统暂停，导致任务中断。

## 解决方案对比

### 方案 1：不切换到后台，只显示悬浮窗（推荐）⭐

**优点：**
- ✅ JavaScript 可以继续执行
- ✅ 实现简单，无需额外配置
- ✅ 用户可以通过悬浮窗看到任务状态
- ✅ 兼容性好，适用于所有 Android 版本

**缺点：**
- ⚠️ 应用保持在前台（但可以通过悬浮窗最小化视觉干扰）

**实现方式：**
- 移除 `moveToBackground()` 调用
- 只显示悬浮窗
- 保持应用在前台运行

### 方案 2：使用 Headless JS（React Native 无头模式）

**优点：**
- ✅ 可以在后台执行 JavaScript
- ✅ React Native 官方支持

**缺点：**
- ⚠️ 需要配置 `index.js` 注册 Headless JS
- ⚠️ 需要原生代码触发
- ⚠️ 某些厂商 ROM 可能限制
- ⚠️ 实现复杂度较高

**实现方式：**
1. 在 `index.js` 中注册 Headless JS 任务
2. 在原生代码中触发 Headless JS
3. 通过事件桥接与 UI 通信

### 方案 3：将任务逻辑移到原生代码（Kotlin）

**优点：**
- ✅ 原生代码在后台执行更可靠
- ✅ 不受 JavaScript 线程限制

**缺点：**
- ⚠️ 需要重写大量逻辑到 Kotlin
- ⚠️ 维护成本高
- ⚠️ 失去 React Native 的灵活性

**实现方式：**
- 在 `TaskExecutionService` 中执行任务逻辑
- 通过事件发送器（EventEmitter）与 JS 通信
- JS 只负责 UI 更新

### 方案 4：使用 WakeLock 保持 CPU 唤醒

**优点：**
- ✅ 可以防止系统休眠
- ✅ 相对简单

**缺点：**
- ⚠️ 耗电量大
- ⚠️ 可能被系统限制
- ⚠️ 仍然可能被杀死

**实现方式：**
- 在原生代码中获取 WakeLock
- 保持 CPU 唤醒
- 任务完成后释放

## 推荐方案：方案 1（不切换到后台）

基于当前需求和实现复杂度，**推荐使用方案 1**：

1. **移除切换到后台的逻辑**
2. **只显示悬浮窗**
3. **保持应用在前台运行**

这样 JavaScript 可以继续执行，同时用户可以通过悬浮窗看到任务状态，体验良好。

## 实现步骤

### 修改 TaskHistoryScreen.tsx

```typescript
// 移除 moveToBackground() 调用
// 只显示悬浮窗，不切换到后台
if (step === 1) {
  const backgroundRunEnabled = await settingsService.getBackgroundRunEnabled();
  if (backgroundRunEnabled) {
    // 启动前台服务（可选，用于通知）
    await accessibilityService.startTaskExecutionService(`任务执行中...\n步骤: ${step}/${maxSteps}`);
    
    // 显示悬浮窗
    const hasOverlayPermission = await accessibilityService.canDrawOverlays();
    if (hasOverlayPermission) {
      await accessibilityService.showFloatingWindow(`任务执行中...\n步骤: ${step}/${maxSteps}`);
    }
    
    // 不切换到后台，保持应用在前台运行
    // await accessibilityService.moveToBackground(); // 移除这行
  }
}
```

## 其他可选优化

### 1. 最小化应用窗口（如果支持）

某些设备支持将应用窗口最小化，但保持运行。这需要设备特定支持。

### 2. 使用画中画模式（Android 8.0+）

对于视频类应用，可以使用画中画模式，但当前场景不适用。

### 3. 使用无障碍服务执行任务

无障碍服务本身就在后台运行，可以考虑将任务执行逻辑移到无障碍服务中，但这需要大量重构。

## 结论

**推荐使用方案 1**：不切换到后台，只显示悬浮窗。这是最简单、最可靠的方案，可以确保 JavaScript 继续执行，同时提供良好的用户体验。

