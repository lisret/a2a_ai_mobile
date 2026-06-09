# 自定义Alert使用说明

## 概述

已创建自定义Alert组件，样式与app内部的ConfirmModal保持一致，用于替换React Native的系统Alert.alert。

## 已完成的修改

### 1. 创建CustomAlert组件
- **位置**：`AwesomeProject/src/shared/components/CustomAlert.tsx`
- **样式**：与ConfirmModal完全一致
  - 白色背景，圆角20dp
  - 标题：18px，粗体700，颜色#111827
  - 消息：15px，颜色#6B7280
  - 按钮：圆角24dp，取消按钮#F3F4F6，确认按钮#2563EB

### 2. 创建Alert工具函数
- **位置**：`AwesomeProject/src/shared/utils/alert.tsx`
- **功能**：提供`showCustomAlert`函数和`AlertProvider`组件
- **API**：与React Native的`Alert.alert`保持一致

### 3. 修改原生弹窗样式
- **位置**：`AwesomeProject/android/app/src/main/java/com/awesomeproject/ui/SystemDialogManager.kt`
- **修改**：将原生弹窗样式改为与app内部ConfirmModal一致
  - 白色背景替代半透明黑色
  - 深色文字替代白色文字
  - 圆角20dp
  - 阴影效果

### 4. 集成AlertProvider
- **位置**：`AwesomeProject/src/navigation/AppNavigator.tsx`
- **功能**：在AppNavigator中包装了AlertProvider，使全局可以使用自定义Alert

## 使用方法

### 方法1：使用showCustomAlert（推荐）

```typescript
import { showCustomAlert } from '../shared/utils/alert';

// 单个按钮
showCustomAlert('提示', '这是一个提示消息');

// 两个按钮
showCustomAlert(
  '确认删除',
  '确定要删除这个项目吗？',
  [
    { text: '取消', style: 'cancel' },
    { text: '删除', style: 'destructive', onPress: () => {
      // 删除操作
    }},
  ]
);

// 多个按钮
showCustomAlert(
  '选择操作',
  '请选择要执行的操作',
  [
    { text: '取消', style: 'cancel' },
    { text: '选项1', onPress: () => {} },
    { text: '选项2', onPress: () => {} },
  ]
);
```

### 方法2：直接使用CustomAlert组件

```typescript
import { CustomAlert } from '../shared/components/CustomAlert';

const [showAlert, setShowAlert] = useState(false);

<CustomAlert
  visible={showAlert}
  title="提示"
  message="这是一个提示消息"
  buttons={[
    { text: '确定', onPress: () => setShowAlert(false) }
  ]}
  onDismiss={() => setShowAlert(false)}
/>
```

## 替换现有Alert.alert

### 替换前（React Native系统Alert）

```typescript
Alert.alert(
  '提示',
  '这是一个提示消息',
  [
    { text: '取消', style: 'cancel' },
    { text: '确定', onPress: () => {} },
  ]
);
```

### 替换后（自定义Alert）

```typescript
import { showCustomAlert } from '../shared/utils/alert';

showCustomAlert(
  '提示',
  '这是一个提示消息',
  [
    { text: '取消', style: 'cancel' },
    { text: '确定', onPress: () => {} },
  ]
);
```

## 样式对比

### app内部ConfirmModal样式
- 背景：白色 (#FFFFFF)
- 圆角：20dp
- 标题：18px，粗体700，颜色#111827
- 消息：15px，颜色#6B7280
- 按钮：圆角24dp
- 取消按钮：背景#F3F4F6，文字#374151
- 确认按钮：背景#2563EB，文字白色
- 危险按钮：背景#EF4444，文字白色

### 原生弹窗（SystemDialogManager）样式
- 已修改为与ConfirmModal一致的样式
- 白色背景，深色文字
- 圆角20dp
- 阴影效果

## 注意事项

1. **AlertProvider已集成**：在AppNavigator中已经包装了AlertProvider，无需额外配置

2. **API兼容性**：`showCustomAlert`的API与`Alert.alert`完全一致，可以直接替换

3. **按钮样式**：
   - `style: 'cancel'` - 取消按钮（灰色背景）
   - `style: 'destructive'` - 危险按钮（红色背景）
   - 默认 - 确认按钮（蓝色背景）

4. **原生弹窗**：SystemDialogManager主要用于后台任务执行时的提示，样式已更新为与app风格一致

## 迁移建议

1. **逐步迁移**：可以逐步将代码中的`Alert.alert`替换为`showCustomAlert`
2. **保持一致性**：所有弹窗现在都使用统一的样式
3. **测试**：替换后需要测试各种场景下的弹窗显示效果

## 相关文件

- `AwesomeProject/src/shared/components/CustomAlert.tsx` - 自定义Alert组件
- `AwesomeProject/src/shared/utils/alert.tsx` - Alert工具函数和Provider
- `AwesomeProject/src/navigation/AppNavigator.tsx` - AlertProvider集成
- `AwesomeProject/android/app/src/main/java/com/awesomeproject/ui/SystemDialogManager.kt` - 原生弹窗样式
