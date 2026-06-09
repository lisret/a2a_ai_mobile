# 系统级提示窗功能实现说明

## 功能概述

在任务完成时，除了原有的通知和 Toast 提示外，新增了**系统级提示窗**功能，提供更醒目的任务完成提示。提示窗会自动显示在屏幕中央，3秒后自动消失，无需用户点击。

## 实现内容

### 1. 原生代码实现（Kotlin）

在 `AccessibilityModule.kt` 中新增 `showSystemDialog` 方法：

```kotlin
@ReactMethod
fun showSystemDialog(title: String, message: String, buttonText: String, promise: Promise)
```

**特性：**
- 显示系统级提示窗（类似悬浮窗，但用于提示）
- 支持自定义标题和内容
- 显示在屏幕中央，更醒目
- 3秒后自动消失，无需用户操作
- 如果应用在后台且有悬浮窗权限，可以在应用外显示
- 如果没有悬浮窗权限，自动降级到 Toast 提示

### 2. TypeScript 接口实现

在 `AccessibilityService.ts` 中新增方法：

```typescript
async showSystemDialog(
  title: string, 
  message: string, 
  buttonText: string = '确定'
): Promise<void>
```

### 3. 任务完成时自动调用

在 `TaskExecutionHeadless.ts` 中，任务完成和失败时都会显示系统提示窗：

**任务完成时：**
- 显示系统提示窗："任务完成" + 完成消息
- 提示窗显示在屏幕中央，3秒后自动消失
- 同时显示通知栏通知

**任务失败时：**
- 显示系统提示窗："任务失败" + 错误消息
- 提示窗显示在屏幕中央，3秒后自动消失
- 同时显示通知栏通知

## 使用方式

### 自动调用（已实现）

任务完成或失败时会自动显示系统对话框，无需手动调用。

### 手动调用（可选）

如果需要手动显示系统提示窗，可以这样调用：

```typescript
import { accessibilityService } from './services/AccessibilityService';

// 显示系统提示窗（3秒后自动消失）
await accessibilityService.showSystemDialog(
  '提示',
  '这是一条重要消息',
  '确定' // 此参数保留以兼容，实际不使用
);
```

## 提示窗特性说明

### 系统级提示窗

- 显示在屏幕中央，更醒目
- 半透明黑色背景，白色文字
- 3秒后自动消失，无需用户操作
- 可以在应用外显示（需要 `SYSTEM_ALERT_WINDOW` 权限）
- Android 8.0+ 使用 `TYPE_APPLICATION_OVERLAY`
- Android 8.0 以下使用 `TYPE_PHONE`

### 降级方案

- 如果没有悬浮窗权限，自动降级到 Toast 提示
- 确保用户始终能收到提示

## 降级策略

系统提示窗的显示遵循以下降级策略：

1. **首选**：系统级提示窗（如果有悬浮窗权限）
2. **降级**：Toast 提示（如果没有悬浮窗权限或显示失败）

这确保了在任何情况下用户都能收到任务完成的提示。

## 用户体验

### 任务完成时的提示层次

1. **系统提示窗**（最醒目）
   - 直接显示在屏幕中央
   - 3秒后自动消失，无需用户操作
   - 即使应用在后台也能看到（需要悬浮窗权限）

2. **通知栏通知**（持久化）
   - 显示在通知栏
   - 可以点击打开应用
   - 即使错过了提示窗也能看到

3. **Toast 提示**（降级方案）
   - 如果提示窗显示失败，使用 Toast
   - 短暂显示，不打扰用户

## 权限要求

### 必需权限

- 无（普通对话框不需要权限）

### 可选权限（用于系统级对话框）

- `SYSTEM_ALERT_WINDOW`（悬浮窗权限）
  - 用于在应用外显示对话框
  - 如果未授予，仍可显示普通对话框

## 测试建议

### 测试场景

1. **应用在前台时任务完成**
   - 应该显示系统提示窗在屏幕中央
   - 3秒后自动消失

2. **应用在后台时任务完成**
   - 如果有悬浮窗权限，显示系统级提示窗（可在应用外显示）
   - 如果没有权限，降级到 Toast 提示

3. **任务失败时**
   - 应该显示失败提示窗
   - 内容显示错误信息
   - 3秒后自动消失

4. **降级测试**
   - 模拟提示窗显示失败的情况
   - 应该自动降级到 Toast

## 相关文件

- `android/app/src/main/java/com/awesomeproject/AccessibilityModule.kt` - 原生实现
- `src/services/AccessibilityService.ts` - TypeScript 接口
- `src/services/interfaces/IAccessibilityService.ts` - 接口定义
- `src/services/TaskExecutionHeadless.ts` - 任务完成时调用

## 注意事项

1. **提示窗必须在主线程显示**：使用 WindowManager 在主线程添加视图
2. **自动隐藏**：使用 Handler 延迟3秒后自动移除提示窗
3. **权限检查**：Android 8.0+ 需要检查悬浮窗权限才能显示系统级提示窗
4. **降级处理**：所有异常情况都有降级方案，确保用户始终能收到提示
5. **资源清理**：提示窗消失后自动清理 Handler 和 View 引用

## 未来优化

可以考虑的优化方向：

1. **自定义提示窗样式**：添加图标、颜色、动画等
2. **可配置显示时长**：允许自定义提示窗显示时间
3. **提示窗位置**：支持自定义显示位置（顶部、底部、中央等）
4. **声音和震动**：添加完成提示音和震动反馈
5. **动画效果**：添加淡入淡出动画

