import type {AgentModeId} from '@shared/types/Model';

export type MemoryLocation = 'device' | 'openclaw';
export type MemoryKind = 'name' | 'preference' | 'errand';
export type ErrandType = 'once' | 'schedule';

export interface CapabilityFlags {
  phoneOperate: boolean;
  errands: boolean;
  openclaw: boolean;
}

export interface PrivacySettings {
  memoryEnabled: boolean;
  memoryLocation: MemoryLocation;
}

export interface AgentModeState {
  activeMode: AgentModeId;
  draftMode: AgentModeId;
}

export interface OpenClawConfig {
  gateway: string;
  deviceId: string;
  cluster: string;
}

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  title: string;
  body?: string;
  errandType?: ErrandType;
  when?: string;
}

export const MODE_LABELS: Record<AgentModeId, string> = {
  cloud_direct: '云端一体',
  cloud_split: '双云端',
  local_vision_cloud_planner: '本地视觉',
};

export const DEFAULT_CAPABILITIES: CapabilityFlags = {
  phoneOperate: false,
  errands: true,
  openclaw: false,
};

export const DEFAULT_PRIVACY: PrivacySettings = {
  memoryEnabled: true,
  memoryLocation: 'device',
};

export const DEFAULT_AGENT_MODE: AgentModeState = {
  activeMode: 'cloud_direct',
  draftMode: 'cloud_direct',
};

export const DEFAULT_OPENCLAW: OpenClawConfig = {
  gateway: 'gateway.example.ai',
  deviceId: 'nono-device',
  cluster: '未加入',
};

export const SEED_MEMORIES: MemoryItem[] = [
  {
    id: 'mem-name',
    kind: 'name',
    title: '你叫它 NoNo',
    body: '确认过的称呼，会用在对话里',
  },
  {
    id: 'mem-pref-1',
    kind: 'preference',
    title: '周末常搜高铁',
    body: '出行相关会先看高铁时刻',
  },
  {
    id: 'mem-pref-2',
    kind: 'preference',
    title: '咖啡少糖',
    body: '点外卖时默认少糖、热饮',
  },
  {
    id: 'mem-errand-1',
    kind: 'errand',
    errandType: 'once',
    title: '把这周通知摘要再看一遍',
    when: '',
  },
  {
    id: 'mem-errand-2',
    kind: 'errand',
    errandType: 'schedule',
    title: '每周五交周报',
    when: '周五 18:00',
  },
];
