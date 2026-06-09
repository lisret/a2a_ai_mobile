# Android 安装失败问题修复

## 错误信息
```
INSTALL_FAILED_USER_RESTRICTED: Install canceled by user
```

## 问题原因
这是 Android 设备的安全设置阻止了自动安装应用，不是代码问题。

## 解决方案

### 方案 1：启用 USB 安装（推荐）

1. **在 Android 设备上操作**：
   - 打开 **设置** → **安全** 或 **开发者选项**
   - 找到 **"通过 USB 安装应用"** 或 **"USB 安装"** 选项
   - 启用该选项
   - 如果找不到，请先启用开发者选项：
     - 设置 → 关于手机 → 连续点击"版本号"7次

2. **重新连接设备**：
   - 断开 USB 连接
   - 重新连接设备
   - 在设备上确认"允许 USB 调试"

3. **重新运行安装命令**：
   ```bash
   npm run android
   # 或
   yarn android
   ```

### 方案 2：手动安装 APK

如果方案 1 不行，可以手动安装：

1. **构建 APK**：
   ```bash
   cd AwesomeProject/android
   ./gradlew assembleDebug
   ```

2. **找到 APK 文件**：
   ```
   AwesomeProject/android/app/build/outputs/apk/debug/app-debug.apk
   ```

3. **手动安装**：
   - 将 APK 文件传输到设备
   - 在设备上打开文件管理器
   - 点击 APK 文件进行安装
   - 允许"安装未知来源应用"

### 方案 3：使用 ADB 手动安装

1. **确保设备已连接**：
   ```bash
   adb devices
   ```

2. **卸载旧版本**（如果存在）：
   ```bash
   adb uninstall com.awesomeproject
   ```

3. **安装新版本**：
   ```bash
   adb install AwesomeProject/android/app/build/outputs/apk/debug/app-debug.apk
   ```

### 方案 4：检查设备设置

1. **检查 USB 调试**：
   - 设置 → 开发者选项 → USB 调试（已启用）

2. **检查 USB 配置**：
   - 设置 → 开发者选项 → 选择 USB 配置 → 选择"文件传输"或"MTP"

3. **检查未知来源安装**：
   - 设置 → 安全 → 允许安装未知来源应用（根据 Android 版本可能位置不同）

## 常见问题

### Q: 找不到"通过 USB 安装应用"选项？
A: 不同 Android 版本和厂商的选项位置可能不同：
   - 华为/荣耀：设置 → 安全 → 更多安全设置 → 外部来源应用下载
   - 小米：设置 → 更多设置 → 开发者选项 → USB 安装
   - 三星：设置 → 开发者选项 → USB 安装
   - 其他：设置 → 安全 → 未知来源

### Q: 仍然无法安装？
A: 尝试以下步骤：
   1. 重启设备
   2. 重新连接 USB
   3. 在设备上确认"允许 USB 调试"弹窗
   4. 检查 USB 线是否支持数据传输（有些线只能充电）

### Q: 使用模拟器时出现此错误？
A: 模拟器通常不需要这些设置，可能是模拟器问题：
   1. 重启模拟器
   2. 创建新的模拟器
   3. 检查模拟器的 Android 版本

## 验证安装

安装成功后，可以通过以下命令验证：

```bash
# 检查应用是否已安装
adb shell pm list packages | grep awesomeproject

# 启动应用
adb shell am start -n com.awesomeproject/.MainActivity
```

## 注意事项

- 这个错误与代码重构无关，是 Android 设备的安全设置
- 如果是在生产环境，建议使用正式签名进行安装
- 某些企业设备可能有额外的安全策略限制

