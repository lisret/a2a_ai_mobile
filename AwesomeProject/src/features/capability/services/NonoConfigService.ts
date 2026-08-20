import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '@shared/constants';
import type {AgentModeId} from '@shared/types/Model';
import {
  DEFAULT_AGENT_MODE,
  DEFAULT_CAPABILITIES,
  DEFAULT_OPENCLAW,
  DEFAULT_PRIVACY,
  SEED_MEMORIES,
  type AgentModeState,
  type CapabilityFlags,
  type MemoryItem,
  type OpenClawConfig,
  type PrivacySettings,
} from '../types';

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? ({...fallback, ...JSON.parse(raw)} as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

class NonoConfigService {
  async getCapabilities(): Promise<CapabilityFlags> {
    return readJson(STORAGE_KEYS.CAPABILITIES, DEFAULT_CAPABILITIES);
  }

  async setCapability<K extends keyof CapabilityFlags>(
    key: K,
    value: CapabilityFlags[K],
  ): Promise<CapabilityFlags> {
    const next = {...(await this.getCapabilities()), [key]: value};
    await writeJson(STORAGE_KEYS.CAPABILITIES, next);
    return next;
  }

  async getPrivacy(): Promise<PrivacySettings> {
    return readJson(STORAGE_KEYS.PRIVACY, DEFAULT_PRIVACY);
  }

  async setPrivacy(patch: Partial<PrivacySettings>): Promise<PrivacySettings> {
    const next = {...(await this.getPrivacy()), ...patch};
    await writeJson(STORAGE_KEYS.PRIVACY, next);
    return next;
  }

  async getAgentMode(): Promise<AgentModeState> {
    return readJson(STORAGE_KEYS.AGENT_MODE, DEFAULT_AGENT_MODE);
  }

  async setDraftMode(draftMode: AgentModeId): Promise<AgentModeState> {
    const current = await this.getAgentMode();
    const next = {...current, draftMode};
    await writeJson(STORAGE_KEYS.AGENT_MODE, next);
    return next;
  }

  async saveActiveMode(mode: AgentModeId): Promise<AgentModeState> {
    const next = {activeMode: mode, draftMode: mode};
    await writeJson(STORAGE_KEYS.AGENT_MODE, next);
    return next;
  }

  async getOpenClaw(): Promise<OpenClawConfig> {
    return readJson(STORAGE_KEYS.OPENCLAW, DEFAULT_OPENCLAW);
  }

  async setOpenClaw(patch: Partial<OpenClawConfig>): Promise<OpenClawConfig> {
    const next = {...(await this.getOpenClaw()), ...patch};
    await writeJson(STORAGE_KEYS.OPENCLAW, next);
    return next;
  }

  async getMemories(): Promise<MemoryItem[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.MEMORIES);
      if (!raw) {
        await writeJson(STORAGE_KEYS.MEMORIES, SEED_MEMORIES);
        return SEED_MEMORIES;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : SEED_MEMORIES;
    } catch {
      return SEED_MEMORIES;
    }
  }

  async addMemory(item: MemoryItem): Promise<MemoryItem[]> {
    const items = await this.getMemories();
    const next = [item, ...items];
    await this.saveMemories(next);
    return next;
  }

  async saveMemories(items: MemoryItem[]): Promise<void> {
    await writeJson(STORAGE_KEYS.MEMORIES, items);
  }

  async updateMemory(item: MemoryItem): Promise<MemoryItem[]> {
    const items = await this.getMemories();
    const next = items.map(entry => (entry.id === item.id ? item : entry));
    await this.saveMemories(next);
    return next;
  }

  async deleteMemory(id: string): Promise<MemoryItem[]> {
    const next = (await this.getMemories()).filter(item => item.id !== id);
    await this.saveMemories(next);
    return next;
  }

  async forgetPreferences(): Promise<MemoryItem[]> {
    const next = (await this.getMemories()).filter(item => item.kind === 'errand');
    await this.saveMemories(next);
    return next;
  }
}

export const nonoConfigService = new NonoConfigService();
