/**
 * AI智能工具APP
 * 基于Open-AutoGLM框架的自动化任务执行应用
 *
 * @format
 */

import React, { useEffect } from 'react';
import { AppNavigator } from './src/navigation/AppNavigator';
import { debugLogService } from './src/features/debug/services/DebugLogService';

function App(): React.JSX.Element {
  useEffect(() => {
    // 初始化调试日志服务
    debugLogService.initialize().catch(error => {
      // 如果初始化失败，使用原始 console 记录
      console.error('初始化调试日志服务失败:', error);
    });
  }, []);

  return <AppNavigator />;
}

export default App;
