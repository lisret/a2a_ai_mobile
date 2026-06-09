# 应用图标设置指南

## 📱 图标设计说明

我已经为应用设计了一个新的图标（`app_icon.svg`），图标特点：

- **主题**：AI 自动化助手
- **元素**：
  - AI 机器人头部（友好、智能）
  - 手机轮廓（表示移动端自动化）
  - 自动化齿轮装饰（表示自动化能力）
- **颜色**：蓝色渐变（#165DFF），与应用主题色一致
- **风格**：现代、简洁、扁平化设计

## 🚀 快速设置方法

### 方法一：使用在线工具（推荐，最简单）

1. **将 SVG 转换为 PNG**：
   - 打开 `app_icon.svg` 文件
   - 使用在线工具转换为 1024×1024 PNG：
     - https://cloudconvert.com/svg-to-png
     - https://convertio.co/svg-png/
   - 下载转换后的 PNG 文件

2. **生成 Android 图标**：
   - 访问：https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
   - 上传转换后的 PNG 文件（1024×1024）
   - 选择适配层（Adaptive Icon）或传统图标（Legacy Icon）
   - 点击 "Generate" 生成所有尺寸
   - 下载 ZIP 文件

3. **替换图标文件**：
   ```bash
   # 解压下载的 ZIP 文件
   # 将各尺寸的图标复制到对应目录：
   # - res/mipmap-mdpi/ic_launcher.png
   # - res/mipmap-hdpi/ic_launcher.png
   # - res/mipmap-xhdpi/ic_launcher.png
   # - res/mipmap-xxhdpi/ic_launcher.png
   # - res/mipmap-xxxhdpi/ic_launcher.png
   # 同样复制 ic_launcher_round.png 到各目录
   ```

### 方法二：使用 Node.js 脚本（需要安装 sharp）

1. **安装依赖**：
   ```bash
   cd AwesomeProject
   npm install --save-dev sharp
   ```

2. **运行生成脚本**：
   ```bash
   node scripts/generate-icons.js
   ```

3. **脚本会自动生成所有尺寸的图标到对应目录**

### 方法三：使用 ImageMagick（命令行）

1. **安装 ImageMagick**：
   - Windows: `choco install imagemagick`
   - macOS: `brew install imagemagick`
   - Linux: `sudo apt-get install imagemagick`

2. **将 SVG 转换为 PNG**：
   ```bash
   convert app_icon.svg -resize 1024x1024 app_icon_1024.png
   ```

3. **生成各尺寸图标**：
   ```bash
   cd AwesomeProject
   
   # 生成各尺寸图标
   convert app_icon_1024.png -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher.png
   convert app_icon_1024.png -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher.png
   convert app_icon_1024.png -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
   convert app_icon_1024.png -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
   convert app_icon_1024.png -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
   
   # 复制为圆形图标（系统会自动裁剪）
   cp android/app/src/main/res/mipmap-mdpi/ic_launcher.png android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
   cp android/app/src/main/res/mipmap-hdpi/ic_launcher.png android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
   cp android/app/src/main/res/mipmap-xhdpi/ic_launcher.png android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
   cp android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
   cp android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
   ```

## 📂 图标文件位置

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

## ✅ 验证图标

替换图标后，重新构建应用：

```bash
cd AwesomeProject/android
./gradlew clean
cd ..
npm run android
```

安装到设备后，检查应用图标是否正确显示。

## 🎨 自定义图标

如果你想自定义图标设计：

1. **编辑 SVG 文件**：
   - 使用在线编辑器：https://boxy-svg.com/
   - 或使用 Adobe Illustrator、Inkscape 等工具
   - 编辑 `app_icon.svg` 文件

2. **重新生成图标**：
   - 使用上述任一方法重新生成图标

## 📱 iOS 图标（可选）

如果需要为 iOS 生成图标：

1. 将 SVG 转换为 1024×1024 PNG
2. 使用在线工具生成 iOS 图标：
   - https://www.appicon.co/
   - 选择 iOS 平台
   - 下载并解压
3. 将图标文件复制到：
   ```
   ios/AwesomeProject/Images.xcassets/AppIcon.appiconset/
   ```

## 🔗 推荐工具

1. **Android Asset Studio**（最简单）：https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
2. **App Icon Generator**：https://www.appicon.co/
3. **Icon Kitchen**：https://icon.kitchen/
4. **SVG 转 PNG**：https://cloudconvert.com/svg-to-png

## ⚠️ 注意事项

- 图标应该是正方形
- 图标边缘应留出安全区域（约 10%），避免重要内容被裁剪
- 圆形图标通常与普通图标相同，Android 系统会自动裁剪
- 确保图标在不同尺寸下都清晰可见
- 建议使用 Android Asset Studio 生成适配层图标（Adaptive Icon），以获得更好的视觉效果

