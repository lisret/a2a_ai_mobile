/**
 * Open-AutoGLM ReactNative — 根组件 (Root Component)
 *
 * AI 驱动的移动端自动化工具 App。
 * 用自然语言描述操作意图，AI 视觉模型分析屏幕截图并自动执行触控操作。
 *
 * An AI-driven mobile automation App.
 * Describe what you want to do in natural language — the AI vision model
 * analyzes the screen and executes touch operations automatically.
 *
 * 根组件职责：
 *   - 初始化全局调试日志服务 (DebugLogService)
 *   - 挂载导航容器 (AppNavigator)
 *
 * @format
 */

import React, {useEffect} from 'react';
import {Alert} from 'react-native';
import {AppNavigator} from './src/navigation/AppNavigator';
import {debugLogService} from './src/features/debug/services/DebugLogService';

function App(): React.JSX.Element {
  useEffect(() => {
    debugLogService
      .initialize()
      .catch(error => {
        // 调试日志初始化失败不影响主功能，仅记录原始错误
        // Debug log init failure is non-fatal — log and continue
        console.error('[App] 调试日志服务初始化失败 | DebugLogService init failed:', error);
      });
  }, []);

  return <AppNavigator />;
}

export default App;
