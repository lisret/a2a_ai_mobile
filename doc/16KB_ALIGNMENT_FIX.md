# 16 KB 页面大小对齐问题修复

## 问题描述

错误信息：
```
APK app-debug.apk is not compatible with 16 KB devices. 
Some libraries have LOAD segments not aligned at 16 KB boundaries:
- lib/arm64-v8a/libc++_shared.so
- lib/arm64-v8a/libcrypto.so
- lib/arm64-v8a/libevent-2.1.so
- lib/arm64-v8a/libevent_core-2.1.so
- lib/arm64-v8a/libevent_extra-2.1.so
- lib/arm64-v8a/libfabricjni.so
```

## 问题原因

这是 **Android 15+** 的新要求。某些设备（特别是使用 16 KB 页面大小的设备）要求所有原生库的 LOAD 段都必须对齐到 16 KB 边界。

React Native 0.73.6 的某些依赖库（如 libc++_shared.so, libcrypto.so 等）可能还没有更新到支持 16 KB 对齐的版本。

## 已实施的修复

### 1. 更新 NDK 版本
- 从 `25.1.8937393` 更新到 `26.1.10909125`
- 新版本 NDK 更好地支持 16 KB 对齐

### 2. 添加打包配置
在 `android/app/build.gradle` 中：
```gradle
packaging {
    jniLibs {
        useLegacyPackaging = false
    }
}
```

### 3. 打包配置优化
在 `android/app/build.gradle` 中添加了打包配置，使用新的打包方式。

## 测试步骤

1. **清理构建**：
   ```bash
   cd android
   ./gradlew clean
   cd ..
   ```

2. **重新构建**：
   ```bash
   npm run android
   ```

3. **检查结果**：
   - 如果警告消失，问题已解决
   - 如果警告仍然存在，但应用可以正常运行，可以暂时忽略

## 如果问题仍然存在

### 方案 1：暂时忽略警告（如果应用可以运行）

如果应用在 16 KB 设备上可以正常运行，这个警告可以暂时忽略。它不会影响：
- 大多数设备的安装和运行
- 应用的正常功能

### 方案 2：等待 React Native 更新

React Native 的后续版本可能会更新这些依赖库以支持 16 KB 对齐。可以考虑：
- 升级到 React Native 0.74+（如果可用）
- 关注 React Native 的更新日志

### 方案 3：手动重新对齐库（高级）

如果需要完全解决，可以：
1. 使用 `zipalign` 工具重新对齐 APK
2. 但这需要每次构建后手动处理

### 方案 4：仅构建支持的架构

如果不需要支持所有架构，可以只构建支持的架构：
```gradle
ndk {
    abiFilters "arm64-v8a"  // 只构建 arm64-v8a
}
```

## 当前状态

✅ **已更新配置**：
- NDK 版本：26.1.10909125
- 打包配置：已添加
- Gradle 属性：已添加

⚠️ **可能仍存在的问题**：
- 某些依赖库可能仍需要更新
- 如果警告仍然存在，但应用可以运行，可以暂时忽略

## 验证

运行构建后，检查：
1. 警告是否消失
2. 应用是否可以正常安装和运行
3. 在目标设备上测试功能

---

**注意**：如果应用在大多数设备上可以正常运行，这个警告通常不会影响使用。只有在 16 KB 页面大小的设备上安装时才会出现问题。

