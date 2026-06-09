# Metro 服务启动说明

## 什么是 Metro Bundler？

Metro 是 React Native 的 JavaScript 打包器，类似于 Web 开发中的 webpack。它负责：
- 将 JavaScript/TypeScript 代码打包成 bundle
- 提供热重载（Hot Reload）功能
- 在开发模式下提供实时代码更新

## Metro 服务的启动方式

### 方式 1: 自动启动（推荐）

运行 `npm run android` 或 `yarn android` 时，React Native CLI 会**自动检测**并启动 Metro bundler：

```bash
cd AwesomeProject
npm run android
```

**如果 Metro 未运行**，CLI 会自动启动它。  
**如果 Metro 已在运行**，CLI 会直接使用现有的服务（显示 "A dev server is already running"）。

### 方式 2: 手动启动（推荐用于调试）

在**单独的终端窗口**中手动启动 Metro：

```bash
cd AwesomeProject
npm start
# 或
yarn start
```

**优点**：
- 可以看到完整的 Metro 输出日志
- 可以看到 JavaScript 的 `console.log` 输出
- 方便调试和查看错误信息

## 如何确认 Metro 是否在运行？

### 方法 1: 检查端口占用

```bash
# Windows
netstat -ano | findstr :8081

# macOS/Linux
lsof -i :8081
```

**如果看到输出**，说明 Metro 正在运行。

### 方法 2: 访问 Metro 状态页面

在浏览器中打开：
```
http://localhost:8081/status
```

**如果显示 JSON 响应**，说明 Metro 正在运行。

### 方法 3: 查看进程

```bash
# Windows PowerShell
Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Select-Object ProcessName, Id

# Windows CMD
tasklist | findstr node

# macOS/Linux
ps aux | grep node
```

## 为什么看不到日志输出？

### 问题 1: Metro 在后台运行

**现象**：应用可以运行，但看不到 `console.log` 输出。

**原因**：Metro 可能在其他终端窗口或后台运行，你看不到它的输出。

**解决方法**：
1. 找到运行 Metro 的终端窗口
2. 或者停止现有 Metro，重新手动启动：

```bash
# 停止所有 node 进程（谨慎使用）
taskkill /F /IM node.exe  # Windows
# 或
killall node  # macOS/Linux

# 然后重新启动
npm start
```

### 问题 2: 日志输出位置不对

**JavaScript 日志（console.log）** 输出位置：
- ✅ Metro bundler 终端窗口
- ✅ Chrome DevTools Console（如果启用了远程调试）
- ❌ 不是 adb logcat（除非通过原生桥接）

**原生日志（Log.d/Log.e）** 输出位置：
- ✅ adb logcat
- ❌ 不是 Metro bundler 终端

### 问题 3: 应用没有连接到 Metro

**检查方法**：
1. 在设备/模拟器上摇动设备（或按 `Ctrl+M`）
2. 打开开发者菜单
3. 查看是否显示 "Reload" 选项

**如果无法连接**：
```bash
# 检查设备连接
adb devices

# 检查 Metro 是否运行
netstat -ano | findstr :8081

# 重启 Metro
# 1. 停止现有 Metro（Ctrl+C）
# 2. 重新启动
npm start
```

## 正确的开发流程

### 推荐流程（两个终端窗口）

**终端 1 - Metro Bundler**：
```bash
cd AwesomeProject
npm start
```
保持这个窗口打开，可以看到所有 JavaScript 日志。

**终端 2 - 构建和运行**：
```bash
cd AwesomeProject
npm run android
```

### 查看日志的位置

1. **JavaScript 日志（console.log）**：
   - 在 Metro bundler 终端窗口查看
   - 或启用 Chrome DevTools 查看

2. **原生日志（Log.d/Log.e）**：
   - 使用 adb logcat 查看：
   ```bash
   adb logcat | grep "AccessibilityModule"
   ```

3. **Headless JS 日志**：
   - 使用 adb logcat 查看：
   ```bash
   adb logcat | grep "Headless JS"
   ```

## 常见问题

### Q1: 为什么运行 `npm run android` 后看不到 Metro 输出？

**A**: `react-native run-android` 可能会在后台启动 Metro，或者检测到已有 Metro 在运行就直接使用。要看到完整输出，建议手动启动 Metro。

### Q2: 如何确保看到所有日志？

**A**: 
1. 手动启动 Metro：`npm start`（在单独终端）
2. 查看原生日志：`adb logcat | grep "AccessibilityModule"`

### Q3: Metro 启动失败怎么办？

**常见错误**：
- 端口 8081 被占用
- node_modules 损坏
- 缓存问题

**解决方法**：
```bash
# 1. 清理缓存
npm start -- --reset-cache

# 2. 如果端口被占用，杀死占用进程
# Windows
netstat -ano | findstr :8081
taskkill /F /PID <进程ID>

# 3. 重新安装依赖
rm -rf node_modules
npm install --legacy-peer-deps
npm start
```

### Q4: 如何同时查看 JavaScript 和原生日志？

**需要两个终端窗口**：

**终端 1**（JavaScript 日志）：
```bash
npm start
```

**终端 2**（原生日志）：
```bash
adb logcat | grep -E "AccessibilityModule|ReactNativeJS|Headless"
```

## 快速检查清单

- [ ] Metro bundler 是否在运行？（检查端口 8081）
- [ ] 是否能看到 Metro 终端输出？
- [ ] 应用是否能连接到 Metro？（检查开发者菜单）
- [ ] JavaScript 日志是否出现在 Metro 终端？
- [ ] 原生日志是否通过 adb logcat 可见？

## 相关命令

```bash
# 启动 Metro（手动）
npm start

# 启动 Metro 并清除缓存
npm start -- --reset-cache

# 运行 Android 应用（会自动检测 Metro）
npm run android

# 查看 Metro 状态
curl http://localhost:8081/status

# 查看原生日志
adb logcat | grep "AccessibilityModule"
```

## 端口占用问题解决

### 快速解决：停止现有 Metro

**Windows**：
```bash
# 方法 1: 使用脚本（最简单）
npm run kill:metro

# 方法 2: 使用批处理脚本
.\scripts\kill-metro.bat

# 方法 3: 使用 PowerShell 脚本
.\scripts\kill-metro.ps1

# 方法 4: 手动终止（进程 ID 27776）
taskkill /F /PID 27776
```

**macOS/Linux**：
```bash
# 使用脚本
npm run kill:metro

# 或手动
lsof -ti :8081 | xargs kill -9
```

### 检查 Metro 是否在运行

```bash
# Windows
netstat -ano | findstr :8081

# macOS/Linux
lsof -i :8081
```

如果看到输出，说明 Metro 正在运行，可以直接使用，不需要重新启动。

## 总结

- **Metro bundler 是必需的**：开发模式下必须运行
- **JavaScript 日志在 Metro 终端**：`console.log` 输出在 Metro bundler 窗口
- **原生日志在 adb logcat**：`Log.d/Log.e` 需要通过 adb logcat 查看
- **推荐手动启动 Metro**：可以更好地看到日志输出
- **两个终端窗口**：一个运行 Metro，一个运行构建命令

