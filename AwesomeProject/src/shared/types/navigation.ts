import type {NavigatorScreenParams} from '@react-navigation/native';
import type {ModelListKey} from './Model';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  AddModel:
    | {importedData?: Partial<import('./Model').AIModelFormData>; list?: ModelListKey}
    | undefined;
  EditModel: {modelId: string; list?: ModelListKey};
  TaskHistory: {modelId: string};
  TaskDetail: {taskId: string};
  APIKeyGuide: {providerId?: string} | undefined;
  DebugLog: undefined;
  PhoneOperate: undefined;
  OpenClaw: undefined;
  Errands: undefined;
  Privacy: undefined;
  CompanionConfig: undefined;
  AvatarLooks: undefined;
  ErrandDetail: {errandId: string};
  About: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Capabilities: undefined;
  History: undefined;
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
