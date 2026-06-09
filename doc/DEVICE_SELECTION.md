# 设备选择指南

## 问题

当同时连接多个设备（真机和模拟器）时，`npm run android` 会尝试在所有设备上安装应用。

## 解决方案

### 方法 1：使用设备 ID（推荐）

#### 查看所有设备
```bash
adb devices
```

输出示例：
```
List of devices attached
f2e3929f    device          # 真机
emulator-5554    device     # 模拟器
```

#### 指定设备运行

**只连接模拟器**：
```bash
npm run android:emulator
```

或者直接指定设备 ID：
```bash
# 只连接 emulator-5554
npx react-native run-android --deviceId=emulator-5554

# 只连接真机 f2e3929f
npx react-native run-android --deviceId=f2e3929f
```

### 方法 2：使用环境变量

**Windows PowerShell**：
```powershell
$env:ANDROID_DEVICE="emulator-5554"
npm run android
```

**Windows CMD**：
```cmd
set ANDROID_DEVICE=emulator-5554
npm run android
```

**Linux/Mac**：
```bash
export ANDROID_DEVICE=emulator-5554
npm run android
```

### 方法 3：临时断开其他设备

```bash
# 断开真机（保留模拟器）
adb disconnect f2e3929f

# 运行应用
npm run android

# 需要时重新连接
adb connect f2e3929f
```

### 方法 4：使用脚本自动选择模拟器

创建一个脚本自动选择以 "emu" 开头的设备：

**Windows (select-emulator.bat)**：
```batch
@echo off
for /f "tokens=1" %%i in ('adb devices ^| findstr "emulator"') do (
    set DEVICE_ID=%%i
    goto :found
)
:found
if defined DEVICE_ID (
    echo 找到模拟器: %DEVICE_ID%
    npx react-native run-android --deviceId=%DEVICE_ID%
) else (
    echo 未找到模拟器
)
```

**Linux/Mac (select-emulator.sh)**：
```bash
#!/bin/bash
DEVICE_ID=$(adb devices | grep "emulator" | awk '{print $1}' | head -n 1)
if [ -n "$DEVICE_ID" ]; then
    echo "找到模拟器: $DEVICE_ID"
    npx react-native run-android --deviceId=$DEVICE_ID
else
    echo "未找到模拟器"
fi
```

## 已添加的 npm 脚本

在 `package.json` 中已添加：

- `npm run android` - 在所有设备上运行（默认行为）
- `npm run android:emulator` - 只在模拟器上运行（自动选择以 "emu" 开头的设备）
- `npm run android:device` - 交互式选择设备

## 快速使用

### 只连接模拟器
```bash
npm run android:emulator
```

### 只连接真机
```bash
# 先查看设备 ID
adb devices

# 然后指定设备
npx react-native run-android --deviceId=你的设备ID
```

## 常见问题

### Q: 如何查看设备 ID？
```bash
adb devices
```

### Q: 如何只连接第一个模拟器？
```bash
# 获取第一个模拟器 ID
adb devices | grep emulator | head -n 1 | awk '{print $1}'

# 或直接使用
npx react-native run-android --deviceId=emulator-5554
```

### Q: 如何同时连接多个模拟器？
React Native 默认会在所有设备上安装。如果只想在特定设备上运行，使用 `--deviceId` 参数。

### Q: 设备 ID 格式是什么？
- 模拟器：`emulator-5554`, `emulator-5556` 等
- 真机：通常是设备序列号，如 `f2e3929f`

---

**推荐**：使用 `npm run android:emulator` 来只连接模拟器。

