# APK 打包指南

本文档说明如何将 React Native 应用打包为 APK 文件。

## 前置要求

1. 确保已安装 JDK（Java Development Kit）
2. 确保已安装 Android SDK
3. 确保项目可以正常运行（`npm run android` 或 `npx react-native run-android`）

## 方法一：生成调试版 APK（用于测试）

调试版 APK 使用默认的调试密钥，可以直接安装到设备上测试。

### 步骤

1. **进入 Android 目录**
   ```bash
   cd android
   ```

2. **生成调试版 APK**
   ```bash
   # Windows
   gradlew.bat assembleDebug
   
   # macOS/Linux
   ./gradlew assembleDebug
   ```

3. **APK 文件位置**
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

## 方法二：生成发布版 APK（用于分发）

发布版 APK 需要签名密钥，适合正式发布。

### 步骤 1：生成签名密钥

如果还没有签名密钥，需要先生成一个：

```bash
# 进入 android/app 目录
cd android/app

# 生成密钥库（keytool 是 JDK 自带的工具）
keytool -genkeypair -v -storetype PKCS12 -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

**重要提示：**
- 记住输入的密码和别名，后续配置需要用到
- 密钥库文件（`.keystore`）请妥善保管，丢失后无法更新应用
- 建议将密钥库文件添加到 `.gitignore`，不要提交到代码仓库

### 步骤 2：配置签名信息

编辑 `android/app/build.gradle` 文件，在 `android` 块中添加签名配置：

```gradle
android {
    // ... 其他配置 ...
    
    signingConfigs {
        release {
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                storeFile file(MYAPP_RELEASE_STORE_FILE)
                storePassword MYAPP_RELEASE_STORE_PASSWORD
                keyAlias MYAPP_RELEASE_KEY_ALIAS
                keyPassword MYAPP_RELEASE_KEY_PASSWORD
            }
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled enableProguardInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }
}
```

### 步骤 3：配置密钥信息

在 `android/gradle.properties` 文件中添加密钥信息（如果文件不存在则创建）：

```properties
MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_STORE_PASSWORD=你的密钥库密码
MYAPP_RELEASE_KEY_PASSWORD=你的密钥密码
```

**安全提示：**
- `gradle.properties` 文件可能被提交到代码仓库
- 建议使用环境变量或单独的文件来存储敏感信息
- 可以将密钥信息放在 `android/keystore.properties` 文件中，并在 `build.gradle` 中读取：

```gradle
// 在 build.gradle 顶部添加
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

// 在 signingConfigs 中使用
signingConfigs {
    release {
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
    }
}
```

然后在 `android/keystore.properties` 文件中（不要提交到 Git）：

```properties
storeFile=my-release-key.keystore
storePassword=你的密钥库密码
keyAlias=my-key-alias
keyPassword=你的密钥密码
```

### 步骤 4：生成发布版 APK

1. **进入 Android 目录**
   ```bash
   cd android
   ```

2. **生成发布版 APK**
   ```bash
   # Windows
   gradlew.bat assembleRelease
   
   # macOS/Linux
   ./gradlew assembleRelease
   ```

3. **APK 文件位置**
   ```
   android/app/build/outputs/apk/release/app-release.apk
   ```

## 方法三：生成 AAB（Android App Bundle）

AAB 是 Google Play 推荐的分发格式，文件更小，Google Play 会自动为不同设备生成优化的 APK。

### 步骤

1. **进入 Android 目录**
   ```bash
   cd android
   ```

2. **生成 AAB 文件**
   ```bash
   # Windows
   gradlew.bat bundleRelease
   
   # macOS/Linux
   ./gradlew bundleRelease
   ```

3. **AAB 文件位置**
   ```
   android/app/build/outputs/bundle/release/app-release.aab
   ```

## 优化 APK 大小

### 1. 启用代码混淆（ProGuard）

编辑 `android/app/build.gradle`：

```gradle
def enableProguardInReleaseBuilds = true
```

### 2. 只打包特定架构

编辑 `android/gradle.properties`：

```properties
# 只打包 arm64-v8a（大多数现代设备）
reactNativeArchitectures=arm64-v8a

# 或者只打包 armeabi-v7a 和 arm64-v8a（覆盖所有 ARM 设备）
reactNativeArchitectures=armeabi-v7a,arm64-v8a
```

### 3. 启用资源压缩

在 `android/app/build.gradle` 的 `buildTypes.release` 中添加：

```gradle
buildTypes {
    release {
        // ... 其他配置 ...
        shrinkResources true
    }
}
```

## 验证 APK

### 检查 APK 签名

```bash
# 使用 jarsigner 验证签名
jarsigner -verify -verbose -certs app-release.apk
```

### 检查 APK 信息

```bash
# 使用 aapt 查看 APK 信息（需要 Android SDK）
aapt dump badging app-release.apk
```

## 常见问题

### 1. 找不到 keytool 命令

确保 JDK 已正确安装并添加到 PATH 环境变量中。

### 2. 签名配置错误

检查：
- 密钥库文件路径是否正确
- 密码和别名是否正确
- `build.gradle` 中的配置是否正确

### 3. APK 安装失败

- 确保设备允许安装未知来源的应用
- 检查 Android 版本兼容性（`minSdkVersion`）
- 如果是更新安装，确保使用相同的签名密钥

### 4. APK 文件过大

- 启用代码混淆
- 只打包需要的架构
- 启用资源压缩
- 检查是否有不必要的资源文件

## 自动化脚本

可以创建一个脚本来自动化打包过程：

**Windows (build-apk.bat):**
```batch
@echo off
cd android
call gradlew.bat assembleRelease
echo APK 已生成在: android\app\build\outputs\apk\release\app-release.apk
pause
```

**macOS/Linux (build-apk.sh):**
```bash
#!/bin/bash
cd android
./gradlew assembleRelease
echo "APK 已生成在: android/app/build/outputs/apk/release/app-release.apk"
```

## 参考资源

- [React Native 官方文档 - 生成签名 APK](https://reactnative.dev/docs/signed-apk-android)
- [Android 官方文档 - 为应用签名](https://developer.android.com/studio/publish/app-signing)
- [Gradle 官方文档](https://docs.gradle.org/)

