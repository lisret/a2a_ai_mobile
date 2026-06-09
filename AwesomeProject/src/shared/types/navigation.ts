import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * 导航参数类型定义
 */
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  AddModel: { importedData?: Partial<import('./Model').AIModelFormData> } | undefined;
  EditModel: { modelId: string };
  TaskHistory: { modelId: string };  // 任务历史页面（保留用于从模型列表跳转或详情查看）
  TaskDetail: { taskId: string };    // 任务详情页面
  APIKeyGuide: { providerId?: string } | undefined;
  DebugLog: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Models: undefined;
  History: undefined;
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
