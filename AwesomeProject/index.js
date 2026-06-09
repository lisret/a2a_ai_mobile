/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {registerTaskExecutionTask} from './src/features/task/services/TaskExecutionHeadless';

AppRegistry.registerComponent(appName, () => App);
// 注册 Headless JS 任务，用于后台执行任务
AppRegistry.registerHeadlessTask('TaskExecution', () => registerTaskExecutionTask);
