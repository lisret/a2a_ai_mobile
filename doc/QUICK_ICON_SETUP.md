# 快速图标设置指南

## 使用提供的 SVG 模板

我已经为你创建了一个 SVG 图标模板（`icon_template.svg`），你可以：

### 方法 1：使用 Android Asset Studio（最简单）

1. **打开 SVG 文件**：
   - 用浏览器打开 `icon_template.svg`
   - 或使用在线 SVG 编辑器（如 https://boxy-svg.com/）进行自定义

2. **转换为 PNG**：
   - 使用在线工具将 SVG 转换为 1024×1024 的 PNG
   - 推荐工具：https://cloudconvert.com/svg-to-png

3. **生成 Android 图标**：
   - 访问：https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
   - 上传转换后的 PNG 文件
   - 点击 "Generate" 生成所有尺寸
   - 下载 ZIP 文件

4. **替换图标**：
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

### 方法 2：使用命令行工具（需要 ImageMagick）

```bash
# 1. 将 SVG 转换为 1024×1024 PNG
convert icon_template.svg -resize 1024x1024 icon_1024.png

# 2. 生成各尺寸图标
convert icon_1024.png -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher.png
convert icon_1024.png -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher.png
convert icon_1024.png -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
convert icon_1024.png -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
convert icon_1024.png -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png

# 3. 圆形图标通常与普通图标相同（系统会自动裁剪）
# 复制相同文件作为 round 版本
cp android/app/src/main/res/mipmap-mdpi/ic_launcher.png android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-hdpi/ic_launcher.png android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-xhdpi/ic_launcher.png android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
```

### 方法 3：使用 Figma 或在线设计工具

1. 打开 `icon_template.svg` 在 Figma 中
2. 自定义颜色、形状、文字
3. 导出为 1024×1024 PNG
4. 使用 Android Asset Studio 生成各尺寸

## 图标设计说明

当前 SVG 模板包含：
- **蓝色渐变背景**：科技感
- **机器人头像**：代表 AI 助手
- **对话气泡**：代表智能对话
- **AI 文字**：底部装饰

你可以根据需要修改：
- 颜色方案
- 图标元素
- 文字内容

## 验证图标

替换图标后，重新构建应用：

```bash
cd android
gradlew.bat clean
gradlew.bat assembleDebug
```

安装到设备查看效果。

