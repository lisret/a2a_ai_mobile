/**
 * Open-AutoGLM ReactNative — 应用入口 (Application Entry Point)
 *
 * 注册主应用组件与后台 Headless JS 任务。
 * HeadlessTask 允许在无 UI 的情况下由原生服务唤起，
 * 用于熄屏/切后台后继续执行自动化任务。
 *
 * Registers the main App component and a background Headless JS task.
 * The HeadlessTask is invoked by the native foreground/headless service
 * to continue executing automation tasks even when the app is backgrounded
 * or the screen is off.
 *
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {registerTaskExecutionTask} from './src/features/task/services/TaskExecutionHeadless';

// ---- 注册主应用组件 / Register Main App Component ----
AppRegistry.registerComponent(appName, () => App);

// ---- 注册 Headless JS 后台任务 / Register Headless JS Background Task ----
// 由原生 TaskExecutionService / TaskExecutionHeadlessService 唤起，
// 用于在悬浮窗执行模式或完全后台模式下驱动 AI 任务执行引擎。
AppRegistry.registerHeadlessTask('TaskExecution', () => registerTaskExecutionTask);

