# 项目部署说明

欢迎使用 Open-AutoGLM-ReactNative 项目！

本目录包含项目部署相关的文档和说明，帮助你在新环境中快速部署和运行项目。

## 📚 文档索引

### 1. [快速部署指南.md](./快速部署指南.md) ⚡
**推荐首先阅读**

5 分钟快速开始指南，包含：
- 前提条件检查
- 一键部署脚本
- 常见问题快速修复

### 2. [环境部署文档.md](./环境部署文档.md) 📖
**详细部署文档**

完整的部署指南，包含：
- 系统要求
- 详细的环境安装步骤
- 项目配置说明
- 运行和调试指南
- 常见问题解决方案

### 3. [项目文件清单.md](./项目文件清单.md) 📋
**项目结构说明**

项目文件清单，包含：
- 完整的目录结构
- 关键文件说明
- 文件查找指南
- 部署检查清单

## 🚀 快速开始

### 第一步：检查环境

```bash
# 检查 Node.js (需要 >= 18.0.0)
node --version

# 检查 Java (需要 JDK 17)
java -version

# 检查 Android SDK
echo $ANDROID_HOME  # macOS/Linux
echo %ANDROID_HOME%  # Windows
```

### 第二步：安装依赖

```bash
cd AwesomeProject
npm install
```

### 第三步：配置 Android SDK

编辑 `android/local.properties`，设置正确的 SDK 路径。

### 第四步：运行项目

```bash
# 启动 Metro Bundler
npm start

# 在新终端运行 Android
npm run android
```

## 📖 详细文档

- **环境配置问题** → 查看 [环境部署文档.md](./环境部署文档.md)
- **快速开始** → 查看 [快速部署指南.md](./快速部署指南.md)
- **项目结构** → 查看 [项目文件清单.md](./项目文件清单.md)
- **技术文档** → 查看 `../doc/` 目录

## 🆘 遇到问题？

1. **查看常见问题**: [环境部署文档.md](./环境部署文档.md#常见问题)
2. **检查日志**: 使用 `adb logcat` 查看 Android 日志
3. **清理缓存**: 运行 `npm run start:reset` 和 `cd android && ./gradlew clean`
4. **查看技术文档**: 查看 `../doc/` 目录下的相关文档

## 📝 项目信息

- **项目名称**: Open-AutoGLM-ReactNative
- **React Native 版本**: 0.73.6
- **Node.js 要求**: >= 18.0.0
- **Java JDK 要求**: 17
- **Android SDK**: API 21-34

## 🔗 相关链接

- [React Native 官方文档](https://reactnative.dev/)
- [Android 开发文档](https://developer.android.com/)
- [项目主文档](../doc/README.md)

---

**祝部署顺利！** 🎉

