# 图标配置说明

## 已完成的配置

1. ✅ 安装 `react-native-vector-icons` 图标库
2. ✅ 创建统一的图标组件 (`src/components/Icon.tsx`)
3. ✅ 配置 Android 字体文件：
   - 已复制 `FontAwesome.ttf` 到 `android/app/src/main/assets/fonts/`
   - 已在 `android/app/build.gradle` 中添加 `fonts.gradle` 配置
4. ✅ 更新所有界面使用图标库

## 如何让图标显示

### 方法 1：重新构建应用（推荐）

图标需要重新构建应用才能显示。请执行以下步骤：

```bash
# 1. 清理构建缓存
cd AwesomeProject/android
./gradlew clean

# 2. 返回项目根目录
cd ../..

# 3. 重新运行应用
npm run android:emulator
```

### 方法 2：如果方法 1 不行，手动检查

1. **确认字体文件存在**：
   ```
   AwesomeProject/android/app/src/main/assets/fonts/FontAwesome.ttf
   ```

2. **确认 build.gradle 配置**：
   在 `android/app/build.gradle` 文件末尾应该有：
   ```gradle
   apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")
   ```

3. **完全清理并重建**：
   ```bash
   cd AwesomeProject/android
   ./gradlew clean
   cd ../..
   rm -rf node_modules
   npm install
   npm run android:emulator
   ```

## 图标使用说明

所有界面已统一使用 `AppIcon` 组件：

```typescript
import { AppIcon, IconNames } from '../components/Icon';

// 使用方式
<AppIcon name={IconNames.plus} size={20} color="#165DFF" />
```

## 常用图标名称

- `IconNames.arrowLeft` - 返回箭头
- `IconNames.plus` - 加号
- `IconNames.menu` - 菜单（三条横线）
- `IconNames.close` - 关闭（X）
- `IconNames.edit` - 编辑
- `IconNames.delete` - 删除
- `IconNames.user` - 用户
- `IconNames.robot` - 机器人（Android 图标）
- `IconNames.settings` - 设置（齿轮）
- `IconNames.model` - 模型（芯片图标）
- `IconNames.send` - 发送（纸飞机）

## 故障排查

如果图标仍然不显示：

1. **检查控制台错误**：查看是否有字体加载相关的错误
2. **检查字体文件**：确认 `FontAwesome.ttf` 文件大小不为 0
3. **重启 Metro bundler**：
   ```bash
   npm start -- --reset-cache
   ```
4. **完全重新安装**：
   ```bash
   cd AwesomeProject
   rm -rf node_modules
   npm install
   cd android
   ./gradlew clean
   cd ..
   npm run android:emulator
   ```

