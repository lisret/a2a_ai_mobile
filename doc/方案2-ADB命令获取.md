# 方案2：ADB 命令获取（最全面方案）

## 方案概述
通过执行 ADB 命令 `pm list packages` 获取所有应用包名，这是最直接、最全面的方法，可以获取到所有包名，包括隐藏的系统服务。

## 优势
- ✅ 获取最全面，包括所有系统服务和隐藏应用
- ✅ 不依赖应用是否有启动Activity
- ✅ 可以获取到 PackageManager 可能遗漏的应用
- ✅ 命令简单直接，执行速度快

## 劣势
- ❌ 需要 ADB 连接（USB调试或无线调试）
- ❌ 需要执行 shell 命令，可能有权限限制
- ❌ 只能获取包名，无法直接获取应用名称

## 实现代码

### TypeScript/React Native 实现

```typescript
import { exec } from 'react-native-shell-exec';

interface PackageInfo {
  packageName: string;
  appName?: string; // 可选，需要通过其他方式获取
}

class ADBPackageService {
  /**
   * 通过 ADB 命令获取所有包名
   * @param deviceId 设备ID（可选，如果只有一个设备可以省略）
   * @returns 包名数组
   */
  async getAllPackagesViaADB(deviceId?: string): Promise<string[]> {
    try {
      // 构建 ADB 命令
      let command = 'adb';
      if (deviceId) {
        command += ` -s ${deviceId}`;
      }
      command += ' shell pm list packages';
      
      console.log('[ADB包名服务] 执行命令:', command);
      
      // 执行命令
      const result = await exec(command);
      const output = result.stdout || result.output || '';
      
      // 解析输出
      // 输出格式: package:com.example.app
      const packages = output
        .split('\n')
        .filter(line => line.trim().startsWith('package:'))
        .map(line => line.replace('package:', '').trim())
        .filter(pkg => pkg.length > 0);
      
      console.log(`[ADB包名服务] 获取到 ${packages.length} 个包名`);
      return packages;
      
    } catch (error) {
      console.error('[ADB包名服务] 获取包名失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有包名（包括系统应用）
   */
  async getAllPackagesIncludingSystem(deviceId?: string): Promise<string[]> {
    try {
      let command = 'adb';
      if (deviceId) {
        command += ` -s ${deviceId}`;
      }
      command += ' shell pm list packages -a'; // -a 表示所有包，包括已卸载但保留数据的
      
      const result = await exec(command);
      const output = result.stdout || result.output || '';
      
      const packages = output
        .split('\n')
        .filter(line => line.trim().startsWith('package:'))
        .map(line => line.replace('package:', '').trim())
        .filter(pkg => pkg.length > 0);
      
      return packages;
    } catch (error) {
      console.error('[ADB包名服务] 获取所有包名失败:', error);
      throw error;
    }
  }

  /**
   * 只获取用户安装的应用包名
   */
  async getUserPackages(deviceId?: string): Promise<string[]> {
    try {
      let command = 'adb';
      if (deviceId) {
        command += ` -s ${deviceId}`;
      }
      command += ' shell pm list packages -3'; // -3 表示只获取第三方应用
      
      const result = await exec(command);
      const output = result.stdout || result.output || '';
      
      const packages = output
        .split('\n')
        .filter(line => line.trim().startsWith('package:'))
        .map(line => line.replace('package:', '').trim())
        .filter(pkg => pkg.length > 0);
      
      return packages;
    } catch (error) {
      console.error('[ADB包名服务] 获取用户应用包名失败:', error);
      throw error;
    }
  }

  /**
   * 获取包名并尝试获取应用名称（结合 PackageManager）
   * 这是最完整的方案：ADB获取包名 + 原生模块获取名称
   */
  async getAllPackagesWithNames(deviceId?: string): Promise<Record<string, string>> {
    try {
      // 1. 通过 ADB 获取所有包名
      const packages = await this.getAllPackagesViaADB(deviceId);
      
      // 2. 通过原生模块获取应用名称映射
      // 这里需要调用原生模块的 getAllInstalledApps 方法
      // 或者逐个查询每个包的应用名称
      
      const mapping: Record<string, string> = {};
      
      // 对于每个包名，尝试获取应用名称
      // 可以通过执行 adb shell dumpsys package <packageName> 获取
      // 或者通过原生模块查询
      
      for (const packageName of packages) {
        try {
          // 方法1: 通过 dumpsys 获取应用名称
          const appName = await this.getAppNameViaADB(packageName, deviceId);
          if (appName) {
            mapping[appName] = packageName;
          } else {
            // 如果获取不到名称，使用包名作为key
            mapping[packageName] = packageName;
          }
        } catch (e) {
          // 单个包名获取失败，使用包名作为key
          mapping[packageName] = packageName;
        }
      }
      
      return mapping;
      
    } catch (error) {
      console.error('[ADB包名服务] 获取包名和名称失败:', error);
      throw error;
    }
  }

  /**
   * 通过 ADB 获取指定包名的应用名称
   */
  private async getAppNameViaADB(packageName: string, deviceId?: string): Promise<string | null> {
    try {
      let command = 'adb';
      if (deviceId) {
        command += ` -s ${deviceId}`;
      }
      command += ` shell dumpsys package ${packageName} | grep -A 1 "applicationLabel"`;
      
      const result = await exec(command);
      const output = result.stdout || result.output || '';
      
      // 解析输出获取应用名称
      // 输出格式可能类似: applicationLabel=应用名称
      const match = output.match(/applicationLabel=(.+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }
}

export const adbPackageService = new ADBPackageService();
```

### 使用示例

```typescript
import { adbPackageService } from './ADBPackageService';

// 获取所有包名
const packages = await adbPackageService.getAllPackagesViaADB();

// 获取所有包名（包括系统应用）
const allPackages = await adbPackageService.getAllPackagesIncludingSystem();

// 只获取用户安装的应用
const userPackages = await adbPackageService.getUserPackages();

// 获取包名和名称映射
const mapping = await adbPackageService.getAllPackagesWithNames();
```

## ADB 命令说明

### 常用命令

1. **获取所有已安装包名**
   ```bash
   adb shell pm list packages
   ```

2. **获取所有包名（包括已卸载但保留数据的）**
   ```bash
   adb shell pm list packages -a
   ```

3. **只获取用户安装的应用**
   ```bash
   adb shell pm list packages -3
   ```

4. **只获取系统应用**
   ```bash
   adb shell pm list packages -s
   ```

5. **获取禁用的应用**
   ```bash
   adb shell pm list packages -d
   ```

6. **获取启用的应用**
   ```bash
   adb shell pm list packages -e
   ```

7. **获取指定用户的应用**
   ```bash
   adb shell pm list packages --user <user_id>
   ```

### 获取应用详细信息

```bash
# 获取应用名称
adb shell dumpsys package <packageName> | grep applicationLabel

# 获取应用的所有信息
adb shell dumpsys package <packageName>

# 获取应用的主Activity
adb shell dumpsys package <packageName> | grep -A 5 "Activity"
```

## 适用场景
- ✅ 需要获取最全面的包名列表（包括系统服务）
- ✅ 已有 ADB 连接环境
- ✅ 需要批量处理多台设备
- ✅ 自动化测试或脚本场景

## 注意事项
1. **权限要求**: 需要 USB 调试权限或无线调试权限
2. **性能考虑**: 如果包数量很多，逐个获取应用名称会比较慢
3. **错误处理**: 某些包可能无法获取详细信息，需要做好异常处理
4. **设备连接**: 需要确保设备已连接且 ADB 可用
5. **厂商限制**: 某些厂商可能限制某些 ADB 命令的执行

## 优化建议
1. **批量获取**: 可以一次性获取所有包名，然后批量查询应用名称
2. **缓存机制**: 将结果缓存，避免频繁执行 ADB 命令
3. **并行处理**: 对于获取应用名称，可以使用并行处理提高效率
4. **混合方案**: 结合原生 PackageManager 方法，ADB 获取包名，原生模块获取名称

