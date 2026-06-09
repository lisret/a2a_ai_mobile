# Android Studio 构建问题排查指南

## 为什么 `npm run android` 能运行，但 Android Studio 报错？

这是 React Native 项目中的常见问题，主要原因包括：

### 1. **Gradle 版本不一致**

**问题**：Android Studio 可能使用不同的 Gradle 版本或配置

**解决方案**：
- 在 Android Studio 中：`File` → `Settings` → `Build, Execution, Deployment` → `Build Tools` → `Gradle`
- 确保使用项目中的 Gradle wrapper（推荐）
- 选择：`Use Gradle from: 'gradle-wrapper.properties' file`

### 2. **Gradle 缓存问题**

**解决方案**：
```bash
# 在项目根目录执行
cd android
./gradlew clean
./gradlew --stop

# 删除 Gradle 缓存
rm -rf ~/.gradle/caches/
# Windows: 删除 C:\Users\你的用户名\.gradle\caches\

# 在 Android Studio 中
File → Invalidate Caches / Restart → Invalidate and Restart
```

### 3. **项目同步问题**

**解决方案**：
1. 在 Android Studio 中：`File` → `Sync Project with Gradle Files`
2. 如果同步失败，尝试：
   - `File` → `Invalidate Caches / Restart`
   - 关闭 Android Studio
   - 删除 `.idea` 文件夹（在项目根目录）
   - 重新打开 Android Studio

### 4. **JDK 版本不一致**

**问题**：Android Studio 可能使用不同的 JDK 版本

**解决方案**：
- 在 Android Studio 中：`File` → `Project Structure` → `SDK Location`
- 确保 JDK 版本为 17（React Native 0.73.6 推荐）
- 或设置：`File` → `Settings` → `Build, Execution, Deployment` → `Build Tools` → `Gradle`
- 设置 `Gradle JDK` 为 Java 17

### 5. **依赖解析问题**

**问题**：Android Studio 可能使用不同的依赖解析策略

**解决方案**：
- 确保 `android/gradle.properties` 中的配置正确
- 检查 `android/app/build.gradle` 中的依赖配置

### 6. **Kotlin 版本问题**

**问题**：Android Studio 可能使用不同的 Kotlin 版本

**解决方案**：
- 确保 `android/build.gradle` 中的 `kotlinVersion = "1.8.0"`
- 在 Android Studio 中同步项目

### 7. **Native Modules 未正确链接**

**问题**：自定义的 Native Module（如 AccessibilityModule）可能未正确识别

**解决方案**：
- 确保 `MainApplication.kt` 中正确注册了 `AccessibilityPackage`
- 重新同步项目

## 快速修复步骤

### 步骤 1：清理所有缓存
```bash
# 在项目根目录
cd android
./gradlew clean
./gradlew --stop

# 删除构建产物
rm -rf app/build
rm -rf .gradle

# 返回根目录
cd ..
```

### 步骤 2：在 Android Studio 中
1. `File` → `Invalidate Caches / Restart` → `Invalidate and Restart`
2. 等待 Android Studio 重启
3. `File` → `Sync Project with Gradle Files`
4. 等待同步完成

### 步骤 3：检查配置
1. `File` → `Project Structure`
   - 检查 `SDK Location`
   - 检查 `Gradle Version`（应该是 8.4）
   - 检查 `Android Gradle Plugin Version`（应该是 8.3.0）

2. `File` → `Settings` → `Build, Execution, Deployment` → `Build Tools` → `Gradle`
   - 选择 `Use Gradle from: 'gradle-wrapper.properties' file`
   - 设置 `Gradle JDK` 为 Java 17

### 步骤 4：重新构建
- 在 Android Studio 中：`Build` → `Rebuild Project`

## 常见错误及解决方案

### 错误 1：`Unresolved reference: BaseReactPackage`
**原因**：依赖版本不兼容或未同步

**解决**：
```bash
cd android
./gradlew clean
cd ..
npm install
cd android
./gradlew build
```

### 错误 2：`Gradle sync failed`
**原因**：Gradle 配置问题

**解决**：
1. 检查 `android/gradle/wrapper/gradle-wrapper.properties` 中的 Gradle 版本
2. 检查 `android/build.gradle` 中的 Android Gradle Plugin 版本
3. 确保版本兼容

### 错误 3：`Could not find method implementation()`
**原因**：Gradle 版本过低

**解决**：确保使用 Gradle 8.4（已在 `gradle-wrapper.properties` 中配置）

### 错误 4：`Kotlin version mismatch`
**原因**：Kotlin 版本不一致

**解决**：确保 `android/build.gradle` 中 `kotlinVersion = "1.8.0"`

## 推荐配置

### Android Studio 设置
- **Gradle JDK**: Java 17
- **Gradle Version**: 使用 wrapper（8.4）
- **Android Gradle Plugin**: 8.3.0
- **Kotlin Version**: 1.8.0

### 项目配置
- **compileSdk**: 34
- **targetSdk**: 34
- **minSdk**: 21
- **Gradle**: 8.4
- **AGP**: 8.3.0

## 如果仍然有问题

1. **检查错误日志**：
   - 在 Android Studio 的 `Build` 窗口中查看详细错误
   - 查看 `Gradle Console` 输出

2. **对比配置**：
   - 确保 Android Studio 使用的配置与命令行一致
   - 检查是否有 IDE 特定的配置文件覆盖了项目配置

3. **重新导入项目**：
   - 关闭 Android Studio
   - 删除 `.idea` 文件夹
   - 重新打开项目

4. **使用命令行构建**：
   - 如果 Android Studio 一直有问题，可以继续使用 `npm run android`
   - 只在需要调试原生代码时使用 Android Studio

## 最佳实践

1. **优先使用命令行**：
   - React Native 项目推荐使用 `npm run android` 进行构建
   - Android Studio 主要用于调试原生代码

2. **保持配置一致**：
   - 确保 Android Studio 使用项目中的 Gradle wrapper
   - 不要使用 IDE 的默认 Gradle 版本

3. **定期清理缓存**：
   - 遇到问题时，先清理缓存再重试
   - 使用 `./gradlew clean` 清理构建缓存

---

**最后更新**：2025-01-27

