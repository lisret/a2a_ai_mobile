// Transactional migration of legacy model/capability/privacy/OpenClaw keys into a
// single RuntimeConfigEnvelopeV1. Legacy bytes are buffered before any write and
// preserved on failure; OpenClaw uses the injected Connector Bridge port.
import type {CredentialStore} from '../contracts/CredentialStore';
import type {
  RuntimeConfigEnvelopeV1,
  RuntimeRouteConfigV1,
} from '../contracts/RuntimeConfigContracts';
import type {
  ModelBindingV1,
  ModelEndpointProfileV1,
  ModelRole,
  ProviderPresetV1,
} from '../model/ModelProviderContracts';
import {BUILT_IN_REGISTRATIONS} from '../model/ModelProviderRegistry';
import type {VisualAgentProfileV1} from '../visualAgent/VisualAgentContracts';
import {RuntimeConfigError} from './CredentialRetirementRepository';
import {
  LEGACY_OPENCLAW_BINDING_ID,
  type LegacyOpenClawBindingPort,
} from './LegacyOpenClawBindingPort';
import {
  RUNTIME_STORAGE_KEYS,
  type RuntimeAsyncStorage,
} from './RuntimeConfigStorageKeys';
import {
  DEFAULT_AGENT_CONFIG_V2,
  EMPTY_ROUTE_CONFIG,
  validateRuntimeRoute,
} from './RuntimeConfigValidation';

export const LEGACY_KEYS = {
  autoglmModels: '@autoglm:models',
  autoglmSelected: '@autoglm:selected_model',
  autoglmSelectedAlt: '@autoglm:selectedModel',
  splitVision: '@nono:models:splitVision',
  splitPlanner: '@nono:models:splitPlanner',
  localPlanner: '@nono:models:localPlanner',
  companion: '@nono:models:companion',
  selectedSplitVision: '@nono:selected:splitVision',
  selectedSplitPlanner: '@nono:selected:splitPlanner',
  selectedLocalPlanner: '@nono:selected:localPlanner',
  selectedCompanion: '@nono:selected:companion',
  capabilities: '@nono:capabilities',
  privacy: '@nono:privacy',
  agentMode: '@nono:agent_mode',
  openclaw: '@nono:openclaw',
} as const;

const ROLE_SOURCES: readonly {
  role: ModelRole;
  listKey: string;
  selectedKey: string;
}[] = [
  {role: 'direct', listKey: LEGACY_KEYS.autoglmModels, selectedKey: LEGACY_KEYS.autoglmSelected},
  {role: 'vision', listKey: LEGACY_KEYS.splitVision, selectedKey: LEGACY_KEYS.selectedSplitVision},
  {role: 'split_planner', listKey: LEGACY_KEYS.splitPlanner, selectedKey: LEGACY_KEYS.selectedSplitPlanner},
  {role: 'local_planner', listKey: LEGACY_KEYS.localPlanner, selectedKey: LEGACY_KEYS.selectedLocalPlanner},
  {role: 'companion', listKey: LEGACY_KEYS.companion, selectedKey: LEGACY_KEYS.selectedCompanion},
];

const LEGACY_PRESET_IDS: Readonly<Record<string, ProviderPresetV1>> = {
  openai: 'openai',
  anthropic: 'anthropic',
  deepseek: 'deepseek',
  zhipu: 'zhipu_glm',
  moonshot: 'moonshot_kimi',
  modelscope: 'modelscope',
};

interface LegacyModelRecord {
  id: string;
  provider: string;
  apiUrl?: string;
  apiKey?: string;
  modelName?: string;
}

interface LegacyOpenClawRecord {
  enabled?: boolean;
  gatewayUrl: string;
  deviceId: string;
  cluster: string;
  upstreamSecretRef?: string;
  token?: string;
}

export interface RuntimeConfigMigrationDependencies {
  readonly storage: RuntimeAsyncStorage;
  readonly credentials: CredentialStore;
  readonly legacyOpenClaw: LegacyOpenClawBindingPort;
  readonly bridgeUrl: string;
  readonly now: () => number;
  readonly newId: () => string;
}

const conservativeCustomCapabilities = () => ({
  inputModalities: ['text'] as const,
  outputModalities: ['text'] as const,
  capabilities: {
    chat: true as const,
    vision: 'unknown' as const,
    toolCalls: 'unknown' as const,
    reasoning: 'unknown' as const,
  },
});

const isNonBlank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export class RuntimeConfigMigrationV1 {
  constructor(private readonly deps: RuntimeConfigMigrationDependencies) {}

  async run(): Promise<RuntimeConfigEnvelopeV1 | null> {
    const legacy = await this.readLegacyBytes();

    const profiles: ModelEndpointProfileV1[] = [];
    const bindings: ModelBindingV1[] = [];
    const tupleToProfileId = new Map<string, string>();
    const credentialPuts: {ref: string; plaintext: string}[] = [];

    for (const source of ROLE_SOURCES) {
      const records = this.parseRecords(legacy[source.listKey]);
      const selectedId = this.parseSelectedId(legacy[source.selectedKey]);
      for (const record of records) {
        const profileId = this.ensureProfile(
          record,
          profiles,
          tupleToProfileId,
          credentialPuts,
        );
        if (selectedId && record.id === selectedId) {
          bindings.push({
            id: this.deps.newId(),
            role: source.role,
            profileId,
            modelId: isNonBlank(record.modelName) ? record.modelName : record.id,
            maxSteps: DEFAULT_AGENT_CONFIG_V2.maxSteps,
          });
        }
      }
    }

    // Move every distinct model API plaintext credential into the secure store.
    for (const put of credentialPuts) {
      await this.deps.credentials.put(put.ref, put.plaintext);
      const readback = await this.deps.credentials.get(put.ref);
      if (readback !== put.plaintext) {
        throw new RuntimeConfigError('runtime_config_migration_credential_failed');
      }
    }

    const {visualProfiles, activeProfileId, stageId} = await this.migrateOpenClaw(
      legacy[LEGACY_KEYS.openclaw],
    );

    const route = this.assembleRoute(
      legacy,
      profiles,
      bindings,
      visualProfiles,
      activeProfileId,
    );

    try {
      validateRuntimeRoute(route);
    } catch (error) {
      await this.rollbackStage(stageId);
      throw error;
    }

    const envelope: RuntimeConfigEnvelopeV1 = {
      schemaVersion: 1,
      revision: 1,
      active: route,
      draft: route,
    };

    try {
      await this.deps.storage.setItem(
        RUNTIME_STORAGE_KEYS.RUNTIME_CONFIG_V1,
        JSON.stringify(envelope),
      );
      const verify = await this.deps.storage.getItem(
        RUNTIME_STORAGE_KEYS.RUNTIME_CONFIG_V1,
      );
      if (!verify || JSON.parse(verify).revision !== 1) {
        throw new RuntimeConfigError('runtime_config_migration_write_failed');
      }
    } catch (error) {
      await this.rollbackStage(stageId);
      throw error instanceof RuntimeConfigError
        ? error
        : new RuntimeConfigError('runtime_config_migration_write_failed');
    }

    if (stageId) {
      await this.deps.legacyOpenClaw.commit(stageId);
    }

    await this.deps.storage.setItem(
      RUNTIME_STORAGE_KEYS.RUNTIME_CONFIG_MIGRATION_V1,
      JSON.stringify({schemaVersion: 1, state: 'completed', at: this.deps.now()}),
    );

    await this.scrubLegacyKeys();

    return envelope;
  }

  private ensureProfile(
    record: LegacyModelRecord,
    profiles: ModelEndpointProfileV1[],
    tupleToProfileId: Map<string, string>,
    credentialPuts: {ref: string; plaintext: string}[],
  ): string {
    const preset = LEGACY_PRESET_IDS[record.provider];
    const tupleKey = `${record.provider}|${record.apiUrl ?? ''}|${record.apiKey ?? ''}`;
    const existing = tupleToProfileId.get(tupleKey);
    if (existing) {
      return existing;
    }
    const profileId = `legacy-${record.provider}-${this.deps.newId()}`;
    const hasCredential = isNonBlank(record.apiKey);
    let secretRef: string | null = null;
    if (hasCredential) {
      secretRef = `model:${profileId}:${this.deps.newId()}`;
      credentialPuts.push({ref: secretRef, plaintext: record.apiKey as string});
    }

    if (preset) {
      if (!hasCredential) {
        throw new RuntimeConfigError('runtime_config_migration_credential_required');
      }
      const registration = BUILT_IN_REGISTRATIONS.find(item => item.preset === preset);
      const baseURLOverride =
        isNonBlank(record.apiUrl) && record.apiUrl !== registration?.defaultBaseURL
          ? (record.apiUrl as string)
          : null;
      profiles.push({
        id: profileId,
        label: record.provider,
        mode: 'preset',
        preset,
        baseURLOverride,
        region: null,
        channel: null,
        secretRef,
        generation: 1,
      });
    } else {
      profiles.push({
        id: profileId,
        label: record.provider,
        mode: 'custom',
        custom: {
          protocol: 'openai_chat_completions',
          baseURL: isNonBlank(record.apiUrl) ? (record.apiUrl as string) : 'https://localhost',
          auth: hasCredential ? {kind: 'bearer'} : {kind: 'none'},
          chatPath: '/chat/completions',
          modelListPath: null,
          declaredCapabilities: conservativeCustomCapabilities(),
        },
        region: null,
        channel: null,
        secretRef,
        generation: 1,
      });
    }
    tupleToProfileId.set(tupleKey, profileId);
    return profileId;
  }

  private async migrateOpenClaw(raw: string | null): Promise<{
    visualProfiles: VisualAgentProfileV1[];
    activeProfileId: string | null;
    stageId: string | null;
  }> {
    if (!raw) {
      return {visualProfiles: [], activeProfileId: null, stageId: null};
    }
    let record: LegacyOpenClawRecord;
    try {
      record = JSON.parse(raw) as LegacyOpenClawRecord;
    } catch {
      throw new RuntimeConfigError('runtime_config_migration_openclaw_invalid');
    }
    if (isNonBlank(record.token) || !isNonBlank(record.upstreamSecretRef)) {
      // A plaintext token (or a missing secure ref) fails closed; never copied.
      throw new RuntimeConfigError('runtime_config_migration_openclaw_plaintext');
    }
    const staged = await this.deps.legacyOpenClaw.stage({
      bindingId: LEGACY_OPENCLAW_BINDING_ID,
      toolId: 'openclaw',
      protocol: 'gateway_ws',
      gatewayUrl: record.gatewayUrl,
      deviceId: record.deviceId,
      cluster: record.cluster,
      upstreamSecretRef: record.upstreamSecretRef as string,
    });
    const enabled = record.enabled === true;
    const profile: VisualAgentProfileV1 = {
      schemaVersion: 1,
      profileId: 'legacy-openclaw',
      toolId: 'openclaw',
      enabled,
      connector: {
        kind: 'connector_bridge',
        bridgeUrl: this.deps.bridgeUrl,
        bindingId: LEGACY_OPENCLAW_BINDING_ID,
        secretRef: staged.bridgeSecretRef,
      },
      requestedCapabilities: {
        imageInput: true,
        structuredAction: true,
        stream: true,
        cancel: true,
        approval: true,
        resume: false,
        steer: false,
        preferences: false,
      },
    };
    return {
      visualProfiles: [profile],
      activeProfileId: enabled ? 'legacy-openclaw' : null,
      stageId: staged.stageId,
    };
  }

  private assembleRoute(
    legacy: Record<string, string | null>,
    profiles: ModelEndpointProfileV1[],
    bindings: ModelBindingV1[],
    visualProfiles: VisualAgentProfileV1[],
    activeProfileId: string | null,
  ): RuntimeRouteConfigV1 {
    const capabilities = this.parseCapabilities(legacy[LEGACY_KEYS.capabilities]);
    const privacy = this.parsePrivacy(
      legacy[LEGACY_KEYS.privacy],
      visualProfiles.length > 0,
    );
    return {
      capabilities,
      privacy,
      modelAPI: {
        agentConfig: DEFAULT_AGENT_CONFIG_V2,
        profiles,
        bindings,
      },
      visualAgent: {
        enabled: activeProfileId !== null,
        activeProfileId,
        profiles: visualProfiles,
      },
    };
  }

  private parseCapabilities(raw: string | null): RuntimeRouteConfigV1['capabilities'] {
    if (!raw) {
      return {...EMPTY_ROUTE_CONFIG.capabilities};
    }
    try {
      const parsed = JSON.parse(raw);
      return {
        phoneOperate: parsed.phoneOperate === true,
        errands: parsed.errands === true,
      };
    } catch {
      return {...EMPTY_ROUTE_CONFIG.capabilities};
    }
  }

  private parsePrivacy(
    raw: string | null,
    hasVisualProfile: boolean,
  ): RuntimeRouteConfigV1['privacy'] {
    if (!raw) {
      return {...EMPTY_ROUTE_CONFIG.privacy};
    }
    let parsed: {memoryEnabled?: boolean; memoryLocation?: string};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {...EMPTY_ROUTE_CONFIG.privacy};
    }
    if (parsed.memoryLocation === 'openclaw' && hasVisualProfile) {
      return {
        memoryEnabled: parsed.memoryEnabled === true,
        memoryLocation: 'visual_agent',
        memoryProfileId: 'legacy-openclaw',
      };
    }
    return {
      memoryEnabled: parsed.memoryEnabled === true,
      memoryLocation: 'device',
      memoryProfileId: null,
    };
  }

  private parseRecords(raw: string | null): LegacyModelRecord[] {
    if (!raw) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new RuntimeConfigError('runtime_config_migration_corrupt');
    }
    const list = Array.isArray(parsed) ? parsed : [];
    return list
      .filter(
        (item): item is LegacyModelRecord =>
          item !== null &&
          typeof item === 'object' &&
          isNonBlank((item as LegacyModelRecord).id) &&
          isNonBlank((item as LegacyModelRecord).provider),
      )
      .map(item => ({...item}));
  }

  private parseSelectedId(raw: string | null): string | null {
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') {
        return parsed;
      }
      if (parsed && typeof parsed === 'object' && isNonBlank(parsed.id)) {
        return parsed.id as string;
      }
    } catch {
      return isNonBlank(raw) ? raw : null;
    }
    return null;
  }

  private async readLegacyBytes(): Promise<Record<string, string | null>> {
    const entries = await Promise.all(
      Object.values(LEGACY_KEYS).map(async key => {
        try {
          return [key, await this.deps.storage.getItem(key)] as const;
        } catch {
          return [key, null] as const;
        }
      }),
    );
    return Object.fromEntries(entries);
  }

  private async scrubLegacyKeys(): Promise<void> {
    for (const key of Object.values(LEGACY_KEYS)) {
      await this.deps.storage.removeItem(key);
    }
  }

  private async rollbackStage(stageId: string | null): Promise<void> {
    if (!stageId) {
      return;
    }
    try {
      await this.deps.legacyOpenClaw.rollback(stageId);
    } catch {
      // Rollback failure leaves the staged record for cold-start reconciliation.
    }
  }
}
