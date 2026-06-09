# AI助手 应用图标生成指南

## 图标要求

Android 应用图标需要多个尺寸，以适配不同密度的屏幕：

| 密度 | 尺寸 (px) | 目录 |
|------|----------|------|
| mdpi | 48×48 | mipmap-mdpi |
| hdpi | 72×72 | mipmap-hdpi |
| xhdpi | 96×96 | mipmap-xhdpi |
| xxhdpi | 144×144 | mipmap-xxhdpi |
| xxxhdpi | 192×192 | mipmap-xxxhdpi |

还需要圆形图标（roundIcon）用于支持圆形图标的设备。

## 方法一：使用在线图标生成工具（推荐）

### 1. Android Asset Studio（最简单）

1. 访问：https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
2. 上传你的图标图片（建议 512×512 或 1024×1024）
3. 选择"Foreground"和"Background"颜色
4. 点击"Generate"生成所有尺寸
5. 下载 ZIP 文件
6. 解压后，将各尺寸的图标复制到对应目录：
   - `mipmap-mdpi/ic_launcher.png` → `android/app/src/main/res/mipmap-mdpi/`
   - `mipmap-hdpi/ic_launcher.png` → `android/app/src/main/res/mipmap-hdpi/`
   - `mipmap-xhdpi/ic_launcher.png` → `android/app/src/main/res/mipmap-xhdpi/`
   - `mipmap-xxhdpi/ic_launcher.png` → `android/app/src/main/res/mipmap-xxhdpi/`
   - `mipmap-xxxhdpi/ic_launcher.png` → `android/app/src/main/res/mipmap-xxxhdpi/`
   - 同样复制 `ic_launcher_round.png` 到各目录

### 2. App Icon Generator

1. 访问：https://www.appicon.co/
2. 上传 1024×1024 的图标
3. 选择 Android 平台
4. 下载并解压
5. 复制图标到对应目录

## 方法二：使用设计工具创建

### 使用 Figma / Adobe Illustrator / Photoshop

1. 创建 1024×1024 的设计文件
2. 设计"AI助手"图标（建议元素：机器人、AI、助手等）
3. 导出为 PNG 格式
4. 使用工具生成各尺寸版本

### 图标设计建议

- **主题**：AI、智能助手、自动化
- **颜色**：蓝色系（科技感）、渐变色
- **元素**：机器人头像、AI 符号、齿轮、对话气泡
- **风格**：现代、简洁、扁平化或轻微立体感

## 方法三：使用命令行工具

### 使用 ImageMagick

```bash
# 安装 ImageMagick（如果未安装）
# Windows: choco install imagemagick
# macOS: brew install imagemagick
# Linux: sudo apt-get install imagemagick

# 假设你有一个 1024×1024 的源图标 source.png
convert source.png -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher.png
convert source.png -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher.png
convert source.png -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
convert source.png -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
convert source.png -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png

# 生成圆形图标（需要先创建圆形遮罩）
# 圆形图标通常与普通图标相同，但 Android 系统会自动裁剪为圆形
```

## 方法四：使用 React Native 图标生成工具

### react-native-make

```bash
npm install -g react-native-make

# 准备一个 1024×1024 的图标文件 icon.png
react-native set-icon --path ./icon.png --platform android
```

## 快速开始（使用预设图标）

如果你想要一个简单的临时图标，可以使用以下步骤：

1. **创建简单的 AI 图标**：
   - 使用在线工具如 Canva、Figma 创建
   - 或使用 AI 图像生成工具（如 DALL-E、Midjourney）生成
   - 关键词："AI assistant app icon, modern, blue, robot, minimalist"

2. **生成各尺寸**：
   - 使用 Android Asset Studio 或 App Icon Generator

3. **替换文件**：
   - 将生成的图标文件复制到对应目录

## 图标文件位置

```
android/app/src/main/res/
├── mipmap-mdpi/
│   ├── ic_launcher.png (48×48)
│   └── ic_launcher_round.png (48×48)
├── mipmap-hdpi/
│   ├── ic_launcher.png (72×72)
│   └── ic_launcher_round.png (72×72)
├── mipmap-xhdpi/
│   ├── ic_launcher.png (96×96)
│   └── ic_launcher_round.png (96×96)
├── mipmap-xxhdpi/
│   ├── ic_launcher.png (144×144)
│   └── ic_launcher_round.png (144×144)
└── mipmap-xxxhdpi/
    ├── ic_launcher.png (192×192)
    └── ic_launcher_round.png (192×192)
```

## 验证图标

替换图标后，重新构建应用：

```bash
cd android
gradlew.bat clean
gradlew.bat assembleDebug
```

然后安装到设备查看效果。

## 推荐工具总结

1. **Android Asset Studio**（最简单）：https://romannurik.github.io/AndroidAssetStudio/
2. **App Icon Generator**：https://www.appicon.co/
3. **Icon Kitchen**：https://icon.kitchen/
4. **Figma**（设计）：https://www.figma.com/
5. **Canva**（快速设计）：https://www.canva.com/

## 注意事项

- 图标应该是正方形
- 建议使用透明背景或与系统主题匹配的背景
- 图标边缘应留出安全区域（约 10%），避免重要内容被裁剪
- 圆形图标通常与普通图标相同，系统会自动裁剪
- 确保图标在不同尺寸下都清晰可见

