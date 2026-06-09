import { NativeModules, Platform } from 'react-native';
import { ADB_CONFIG, getBrowserPackages } from '@shared/constants';
import { appMappingService } from './ADBAppMappingService';

const { ADBModule, AccessibilityActionModule } = NativeModules;

/**
 * ADB 服务接口
 * 用于在无障碍服务不支持时，使用 ADB 命令执行操作
 * 注意：此服务需要在 Android 设备上通过原生模块执行 shell 命令
 */
class ADBService {
  /**
   * 检查 ADB 模块是否可用
   */
  private isModuleAvailable(): boolean {
    return Platform.OS === 'android' && ADBModule != null;
  }

  /**
   * 执行 shell 命令（通过原生模块）
   */
  private async executeShellCommand(command: string): Promise<void> {
    if (!this.isModuleAvailable()) {
      const errorMsg = 'ADB模块不可用，请确保已正确注册Native Module。如果已启用ADB回退，请重新构建应用。';
      console.error('[ADB服务]', errorMsg);
      throw new Error(errorMsg);
    }

    try {
      await ADBModule.executeShellCommand(command);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      
      // 提供更详细的错误信息，根据命令类型给出不同的提示
      let userFriendlyError = errorMessage;
      
      if (errorMessage.includes('权限不足') || errorMessage.includes('permission')) {
        if (command.includes('am start')) {
          userFriendlyError = `启动应用失败：权限不足。am start 命令可能需要系统权限。建议：1. 使用无障碍服务启动应用 2. 检查应用是否已安装 3. 尝试使用 monkey 命令`;
        } else if (command.includes('monkey')) {
          userFriendlyError = `启动应用失败：权限不足。monkey 命令可能需要系统权限。建议：1. 使用无障碍服务启动应用 2. 检查应用是否已安装`;
        } else if (command.includes('input')) {
          userFriendlyError = `ADB命令执行失败：权限不足。input 命令可能需要 root 权限或系统权限。`;
        } else {
          userFriendlyError = `ADB命令执行失败：权限不足。命令: ${command}`;
        }
      } else if (errorMessage.includes('退出码')) {
        userFriendlyError = `ADB命令执行失败: ${errorMessage}。命令: ${command}。可能原因：1. 设备不支持该命令 2. 需要root权限 3. 命令格式错误`;
      } else if (errorMessage.includes('不可用')) {
        userFriendlyError = `ADB模块未注册，请重新构建应用`;
      } else {
        userFriendlyError = `ADB命令执行失败: ${errorMessage}。命令: ${command}`;
      }
      
      throw new Error(userFriendlyError);
    }
  }

  /**
   * 执行点击操作
   */
  async performClick(x: number, y: number): Promise<void> {
    await this.executeShellCommand(`input tap ${x} ${y}`);
  }

  /**
   * 执行长按操作
   */
  async performLongPress(x: number, y: number): Promise<void> {
    // ADB 长按：使用 input swipe 命令，起始和结束坐标相同，持续时间800ms
    await this.executeShellCommand(`input swipe ${x} ${y} ${x} ${y} 800`);
  }

  /**
   * 执行双击操作
   */
  async performDoubleTap(x: number, y: number): Promise<void> {
    // ADB 双击：执行两次点击，间隔150ms
    await this.executeShellCommand(`input tap ${x} ${y}`);
    await new Promise(resolve => setTimeout(resolve, 150));
    await this.executeShellCommand(`input tap ${x} ${y}`);
  }

  /**
   * 执行滑动操作
   */
  async performSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number = 300
  ): Promise<void> {
    await this.executeShellCommand(`input swipe ${startX} ${startY} ${endX} ${endY} ${duration}`);
  }

  /**
   * 执行文本输入
   */
  async performTextInput(text: string): Promise<void> {
    try {
      console.info(`[ADB文本输入] 准备输入文本: "${text}" (长度: ${text.length})`);
      
      // 转义特殊字符（shell 命令需要转义）
      // 注意：ADB input text 命令对特殊字符的处理
      // 对于空格，需要使用 %s 或者转义
      const escapedText = text
        .replace(/\\/g, '\\\\')
        .replace(/ /g, '%s')  // 空格使用 %s 转义（ADB input text 的标准方式）
        .replace(/&/g, '\\&')
        .replace(/</g, '\\<')
        .replace(/>/g, '\\>')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'");

      const command = `input text "${escapedText}"`;
      console.info(`[ADB文本输入] 执行命令: ${command}`);
      await this.executeShellCommand(command);
      console.info(`[ADB文本输入] 输入完成: "${text}"`);
    } catch (error) {
      console.error(`[ADB文本输入] 输入失败:`, error);
      throw error;
    }
  }

  /**
   * 执行返回操作
   */
  async performBack(): Promise<void> {
    await this.executeShellCommand('input keyevent KEYCODE_BACK');
  }

  /**
   * 执行Home操作（回到桌面）
   */
  async performHome(): Promise<void> {
    await this.executeShellCommand('input keyevent KEYCODE_HOME');
  }

  /**
   * 通过应用名称查找包名
   * @param appName 应用名称（如：浏览器、微信等）
   * @returns 包名，如果找不到则返回null
   */
  private async findPackageNameByAppName(appName: string): Promise<string | null> {
    try {
      // 方法1: 使用 pm list packages 查找
      // 注意：这个方法只能查找包名，不能直接通过应用名称查找
      // 我们需要使用 dumpsys package 来查找应用名称对应的包名
      
      // 方法2: 使用 dumpsys package 查找应用名称
      // 这个命令会列出所有应用的信息，包括应用名称和包名
      // 但由于输出可能很大，我们使用更简单的方法
      
      // 方法3: 使用 Intent 启动（不需要知道具体包名）
      // 这是最可靠的方法，通过 Intent 启动应用
      return null; // 暂时返回null，使用Intent方式启动
    } catch (error) {
      console.warn('[ADB服务] 查找包名失败:', error);
      return null;
    }
  }

  /**
   * 启动应用
   * @param appIdentifier 应用包名（如：com.example.app）或应用名称（如：浏览器）
   */
  async launchApp(appIdentifier: string): Promise<void> {
    // 判断是否是包名（包名通常包含点号，如 com.example.app）
    const isPackageName = appIdentifier.includes('.') && !appIdentifier.includes(' ');

    if (isPackageName) {
      // 如果是包名，直接尝试启动
      await this.launchAppByPackageName(appIdentifier);
    } else {
      // 如果是应用名称，使用 Intent 方式启动
      await this.launchAppByIntent(appIdentifier);
    }
  }

  /**
   * 查询应用的主Activity（通过无障碍服务原生模块，不需要root权限）
   */
  private async queryMainActivity(packageName: string): Promise<string | null> {
    try {
      // 使用无障碍服务的原生模块获取主Activity（不需要root权限）
      if (Platform.OS === 'android' && AccessibilityActionModule && AccessibilityActionModule.getMainActivity) {
        try {
          const activityName = await AccessibilityActionModule.getMainActivity(packageName);
          if (activityName) {
            console.info(`[ADB服务] 通过无障碍服务找到主Activity: ${packageName}/${activityName}`);
            return activityName;
          }
        } catch (e) {
          console.warn(`[ADB服务] 无障碍服务查询主Activity失败: ${packageName}`, e);
        }
      }
      return null;
    } catch (error) {
      console.warn(`[ADB服务] 查询主Activity失败: ${packageName}`, error);
      return null;
    }
  }

  /**
   * 通过包名启动应用（只使用非root命令）
   * @param packageName 应用包名
   */
  private async launchAppByPackageName(packageName: string): Promise<void> {
    const errors: Array<{ method: string; error: any }> = [];

    // 方法1: 使用 Intent 启动（不指定Activity，让系统选择）- 非root
    try {
      await this.executeShellCommand(`am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${packageName}`);
      console.info(`[ADB服务] 方法1成功: 使用Intent启动应用: ${packageName}`);
      return;
    } catch (intentError) {
      errors.push({ method: 'Intent', error: intentError });
    }

    // 方法2: 使用 Intent 但不指定Activity（让系统选择）- 非root
    try {
      await this.executeShellCommand(`am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n ${packageName}/`);
      console.info(`[ADB服务] 方法2成功: 使用Intent自动选择启动应用: ${packageName}`);
      return;
    } catch (autoError) {
      errors.push({ method: 'Intent自动选择', error: autoError });
    }

    // 方法3: 使用 Intent 启动主Activity（尝试MainActivity）- 非root
    try {
      await this.executeShellCommand(`am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n ${packageName}/.MainActivity`);
      console.info(`[ADB服务] 方法3成功: 使用MainActivity启动应用: ${packageName}`);
      return;
    } catch (mainActivityError) {
      errors.push({ method: 'Intent+MainActivity', error: mainActivityError });
    }

    // 方法4: 查询主Activity并启动 - 非root
    try {
      const mainActivity = await this.queryMainActivity(packageName);
      if (mainActivity) {
        await this.executeShellCommand(`am start -n ${packageName}/${mainActivity}`);
        console.info(`[ADB服务] 方法4成功: 使用查询到的主Activity启动应用: ${packageName}/${mainActivity}`);
      return;
      }
    } catch (queryError) {
      errors.push({ method: '查询主Activity', error: queryError });
    }

    // 所有方法都失败，抛出特殊错误，让调用者可以优雅降级
    const errorMessages = errors.map(e => e.method).join(', ');
    const error = new Error(`启动应用失败: ${packageName}。尝试的方法: ${errorMessages}。可能原因：1. 包名不正确 2. 应用未安装 3. 权限不足 4. 设备不支持该命令`);
    // 添加特殊标记，表示需要用户手动启动
    (error as any).requiresManualLaunch = true;
    (error as any).packageName = packageName;
    throw error;
  }

  /**
   * 通过应用名称使用 Intent 启动应用
   * @param appName 应用名称（如：浏览器、微信等）
   */
  private async launchAppByIntent(appName: string): Promise<void> {
    try {
      // 方法1: 使用应用映射服务查找包名（优先使用缓存的映射表）
      try {
        const packageName = await appMappingService.findPackageName(appName);
        if (packageName) {
          try {
            await this.launchAppByPackageName(packageName);
            return;
          } catch {
            // 继续尝试其他方法
          }
        }
      } catch (error) {
        // 应用映射服务失败，继续尝试其他方法
        console.warn('[ADB服务] 应用映射服务查找失败:', error);
      }

      // 方法2: 使用常见的应用名称到包名的映射
      const packageName = this.getCommonAppPackageName(appName);
      if (packageName) {
        try {
          await this.launchAppByPackageName(packageName);
          return;
        } catch {
          // 继续尝试其他方法
        }
      }

      // 方法3: 尝试通过系统查询包名
      try {
        const foundPackageName = await this.findPackageNameBySystemQuery(appName);
        if (foundPackageName) {
          await this.launchAppByPackageName(foundPackageName);
          return;
        }
      } catch {
        // 继续尝试其他方法
      }

      // 方法3: 对于特定类型的应用，尝试常见包名列表
      if (appName.includes('浏览器') || appName.toLowerCase().includes('browser')) {
        const browserPackages = getBrowserPackages();
        for (const pkg of browserPackages) {
          try {
            await this.launchAppByPackageName(pkg);
            return;
          } catch {
            // 继续尝试下一个
          }
        }
      }

      // 如果所有方法都失败，抛出错误
      throw new Error(`无法通过应用名称启动应用: ${appName}。请使用应用包名（如：com.example.app）`);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 通过系统查询查找应用包名
   * @param appName 应用名称
   * @returns 包名，如果找不到则返回null
   */
  private async findPackageNameBySystemQuery(appName: string): Promise<string | null> {
    try {
      // 方法1: 使用 pm list packages 和 dumpsys package 查找
      // 这个方法需要执行多个命令，性能较低，但更准确
      
      // 由于性能考虑，我们暂时不实现这个方法
      // 如果需要，可以使用以下命令：
      // 1. pm list packages -f | grep <关键词>
      // 2. dumpsys package | grep -A 5 <应用名称>
      
      // 方法2: 使用 Intent 查询（需要系统支持）
      // 这个方法可能不总是可用
      
      return null;
    } catch (error) {
      console.warn('[ADB服务] 系统查询包名失败:', error);
      return null;
    }
  }

  /**
   * 获取常见应用名称对应的包名
   * @param appName 应用名称
   * @returns 包名，如果找不到则返回null
   */
  private getCommonAppPackageName(appName: string): string | null {
    const appNameLower = appName.toLowerCase();
    const commonApps = ADB_CONFIG.COMMON_APP_PACKAGES;

    // 精确匹配
    if (commonApps[appNameLower as keyof typeof commonApps]) {
      return commonApps[appNameLower as keyof typeof commonApps];
    }

    // 部分匹配
    for (const [key, value] of Object.entries(commonApps)) {
      if (appNameLower.includes(key) || key.includes(appNameLower)) {
        return value;
      }
    }

    return null;
  }

  /**
   * 检查 ADB 是否可用
   */
  async isAvailable(): Promise<boolean> {
    if (!this.isModuleAvailable()) {
      return false;
    }
    
    // 尝试执行一个简单的测试命令来验证是否真的可用
    try {
      // 测试命令：获取 Android 版本（这个命令通常不需要特殊权限）
      await ADBModule.executeShellCommand('getprop ro.build.version.release');
      return true;
    } catch (error) {
      console.warn('[ADB服务] ADB模块可用但命令执行可能受限:', error);
      // 即使测试失败，也返回 true，因为可能是权限问题，但模块本身是可用的
      return true;
    }
  }
  
  /**
   * 测试 ADB 命令是否真的可以执行（需要权限）
   */
  async testCommand(): Promise<boolean> {
    try {
      // 尝试执行一个简单的 input 命令（不实际执行操作）
      // 注意：这个命令可能会失败，因为需要权限
      await this.executeShellCommand('input keyevent KEYCODE_HOME');
      return true;
    } catch (error) {
      console.warn('[ADB服务] ADB命令测试失败，可能需要root权限或系统权限:', error);
      return false;
    }
  }

  /**
   * 使用 ADB 命令截图
   * 使用 screencap -p 命令获取屏幕截图
   */
  async captureScreen(): Promise<string> {
    if (!this.isModuleAvailable()) {
      const errorMsg = 'ADB模块不可用，无法执行截图';
      console.error('[ADB服务]', errorMsg);
      throw new Error(errorMsg);
    }

    try {
      console.info('[ADB服务] 开始使用 ADB 截图');
      const result = await ADBModule.captureScreenWithADB();
      console.info('[ADB服务] ADB 截图成功');
      return result;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error('[ADB服务] ADB 截图失败:', error);
      
      // 提供更详细的错误信息
      if (errorMessage.includes('未获取到图片数据')) {
        throw new Error('ADB截图失败：未获取到图片数据。可能原因：1. 设备不支持screencap命令 2. 权限不足');
      } else if (errorMessage.includes('退出码')) {
        throw new Error(`ADB截图失败: ${errorMessage}。可能原因：1. 设备不支持该命令 2. 需要root权限`);
      } else {
        throw new Error(`ADB截图失败: ${errorMessage}`);
      }
    }
  }
}

export const adbService = new ADBService();

