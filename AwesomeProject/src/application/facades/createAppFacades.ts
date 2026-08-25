// The single application composition root. It is the only application file that
// is allowed to know the concrete `Default*Facade` classes and the core
// registry types; Screens must consume `AppFacades` through the context and
// never import these implementations directly.
//
// `createAppFacades` builds the frozen `AppFacades` graph from an explicit set
// of application ports. There is no service locator: every dependency is
// injected. `projectVisualAgentToolOptions` is a pure projection over the
// canonical built-in registry manifest — it copies each declared capability
// field verbatim and never widens a capability to `true`.
import type {
  VisualAgentToolId,
  VisualAgentToolRegistry,
} from '../../core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import {DefaultActivityFacade} from './ActivityFacade';
import {DefaultCompanionFacade} from './CompanionFacade';
import {DefaultErrandFacade} from './ErrandFacade';
import {DefaultModelConfigFacade} from './ModelConfigFacade';
import {DefaultOperateFacade} from './OperateFacade';
import {DefaultPhoneOperateFacade} from './PhoneOperateFacade';
import {DefaultPrivacyFacade} from './PrivacyFacade';
import {DefaultVisualAgentToolsFacade} from './VisualAgentToolsFacade';
import type {
  ActivityApplicationPort,
  AppFacades,
  CompanionApplicationPort,
  CustomProviderConfigViewState,
  ErrandApplicationPort,
  ModelCatalogRefreshInput,
  ModelCatalogViewState,
  ModelConfigApplicationPort,
  ModelConfigListItemViewState,
  ModelConfigListViewState,
  ModelConfigSaveInput,
  ModelConfigViewState,
  OperateApplicationPort,
  PhoneOperateApplicationPort,
  PhoneOperateViewState,
  PrivacyApplicationPort,
  ProviderPresetViewState,
  TaskUiEventSource,
  VisualAgentReadiness,
  VisualAgentToolOptionViewState,
  VisualAgentToolsApplicationPort,
} from './UiRuntimeContracts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {AgentModeId, ModelListKey} from '../../shared/types/Model';
import type {
  ModelBindingV1,
  ModelEndpointProfileV1,
  ModelRole,
  ProviderModelCatalogResult,
} from '../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {
  RuntimeConfigRepository,
  RuntimeRouteConfigV1,
} from '../../core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import type {ProviderFetch} from '../../core/engine/operateRuntime/model/transports/providerHttp';
import {
  AsyncStorageCredentialRetirementRepository,
  AsyncStorageRuntimeConfigRepository,
  RuntimeConfigError,
} from '../../core/engine/operateRuntime/config';
import {
  AsyncStorageModelCatalogCache,
  createModelProviderRegistry,
} from '../../core/engine/operateRuntime/model';
import type {ModelProviderRegistry} from '../../core/engine/operateRuntime/model';
import type {CredentialStore} from '../../core/engine/operateRuntime/contracts/CredentialStore';
import {NativeCredentialStore} from '../../core/engine/agentRuntime/credentials/NativeCredentialStore';
import {NativeLocalModelEligibilityChecker} from '../../core/engine/agentRuntime/config/NativeLocalModelEligibilityChecker';
import {
  RuntimeActivityPort,
  RuntimeCompanionPort,
  RuntimeErrandPort,
  RuntimeOperatePort,
  RuntimePrivacyPort,
  RuntimeVisualAgentToolsPort,
  TaskUiEventBus,
  wireHeadlessOperate,
} from './RuntimeApplicationPorts';
import {nonoConfigService} from '../../features/capability/services/NonoConfigService';
import {settingsService} from '../../features/settings/services/SettingsService';
import {mapProviderCatalog} from '../../features/model/services/ModelListService';
import {PROVIDER_PRESET_DISPLAY} from '../../shared/constants/apiProviders';

export interface AppFacadePorts {
  readonly operate: OperateApplicationPort;
  readonly operateEvents: TaskUiEventSource;
  readonly companion: CompanionApplicationPort;
  readonly phoneOperate: PhoneOperateApplicationPort;
  readonly visualAgentTools: VisualAgentToolsApplicationPort;
  readonly modelConfig: ModelConfigApplicationPort;
  readonly errands: ErrandApplicationPort;
  readonly privacy: PrivacyApplicationPort;
  readonly activity: ActivityApplicationPort;
}

export function createAppFacades(ports: AppFacadePorts): AppFacades {
  return {
    operate: new DefaultOperateFacade(ports.operate, ports.operateEvents),
    companion: new DefaultCompanionFacade(ports.companion),
    phoneOperate: new DefaultPhoneOperateFacade(ports.phoneOperate),
    visualAgentTools: new DefaultVisualAgentToolsFacade(ports.visualAgentTools),
    modelConfig: new DefaultModelConfigFacade(ports.modelConfig),
    errands: new DefaultErrandFacade(ports.errands),
    privacy: new DefaultPrivacyFacade(ports.privacy),
    activity: new DefaultActivityFacade(ports.activity),
  };
}

export interface VisualAgentToolStatus {
  readonly readiness: VisualAgentReadiness;
  readonly configuredProfileCount: number;
}

const DEFAULT_TOOL_STATUS: VisualAgentToolStatus = {
  readiness: 'not_configured',
  configuredProfileCount: 0,
};

export function projectVisualAgentToolOptions(
  registry: VisualAgentToolRegistry,
  statusByTool: ReadonlyMap<VisualAgentToolId, VisualAgentToolStatus>,
): readonly VisualAgentToolOptionViewState[] {
  return registry.list().map(toolId => {
    const {manifest} = registry.require(toolId);
    const status = statusByTool.get(toolId) ?? DEFAULT_TOOL_STATUS;
    const declared = manifest.declaredCapabilities;
    return {
      toolId,
      builtIn: !toolId.startsWith('custom:'),
      label: manifest.displayName,
      readiness: status.readiness,
      maturity: manifest.maturity,
      capabilities: {
        imageInput: declared.imageInput,
        structuredAction: declared.structuredAction,
        stream: declared.stream,
        cancel: declared.cancel,
        approval: declared.approval,
        resume: declared.resume,
        steer: declared.steer,
        preferences: declared.preferences,
      },
      configuredProfileCount: status.configuredProfileCount,
    };
  });
}

// --- Live runtime wiring for phoneOperate + modelConfig + Home/capability ports
//
// The UI-only `ModelListKey` is mapped to the canonical runtime `ModelRole`
// exactly once here, at the ApplicationPort boundary. Repositories, bindings and
// sessions only ever see `ModelRole`.
const ROLE_BY_LIST: Readonly<Record<ModelListKey, ModelRole>> = {
  unified: 'direct',
  splitVision: 'vision',
  splitPlanner: 'split_planner',
  localPlanner: 'local_planner',
  companion: 'companion',
};

const MODE_LABELS: Readonly<Record<AgentModeId, string>> = {
  cloud_direct: '云端一体',
  cloud_split: '双云端',
  local_vision_cloud_planner: '本地视觉',
};

const MODE_PIPELINE: Readonly<
  Record<AgentModeId, {nodes: readonly string[]; caption: string}>
> = {
  cloud_direct: {
    nodes: ['截图', '云端一体', '动作'],
    caption: '一个云端或网关模型既看屏幕，也决定下一步。',
  },
  cloud_split: {
    nodes: ['截图', '云端视觉', '云端编排', '动作'],
    caption: '视觉模型和编排模型分开。编排只拿结构化观察，不看原图。',
  },
  local_vision_cloud_planner: {
    nodes: ['截图', '本地视觉', '云端编排', '动作'],
    caption: 'MiniCPM 在手机里看截图；云端只做编排。失败不会自动改走云端视觉。',
  },
};

const AGENT_MODES: readonly AgentModeId[] = [
  'cloud_direct',
  'cloud_split',
  'local_vision_cloud_planner',
];

const DEFAULT_MAX_STEPS = 20;

let idCounter = 0;
const newId = (): string =>
  `${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

export class RuntimePhoneOperatePort implements PhoneOperateApplicationPort {
  constructor(
    private readonly repo: RuntimeConfigRepository,
    private readonly eligibility: NativeLocalModelEligibilityChecker,
  ) {}

  async read(): Promise<PhoneOperateViewState> {
    const [agentMode, envelope, adbFallbackEnabled, localReady] =
      await Promise.all([
        nonoConfigService.getAgentMode(),
        this.repo.load(),
        settingsService.getADBFallbackEnabled(),
        this.isLocalReady(),
      ]);
    const active = envelope.active;
    const hasRole = (role: ModelRole): boolean =>
      active.modelAPI.bindings.some(binding => binding.role === role);
    const phoneEnabled = active.capabilities.phoneOperate;

    const modes = {} as PhoneOperateViewState['modes'];
    for (const id of AGENT_MODES) {
      const blockers = this.blockersFor(id, phoneEnabled, hasRole, localReady);
      modes[id] = {
        id,
        label: MODE_LABELS[id],
        nodes: MODE_PIPELINE[id].nodes,
        caption: MODE_PIPELINE[id].caption,
        runnable: blockers.length === 0,
        blockers,
      };
    }

    return {
      status: 'ready',
      revision: envelope.revision,
      activeMode: agentMode.activeMode,
      draftMode: agentMode.draftMode,
      adbFallbackEnabled,
      modes,
    };
  }

  async setDraft(mode: AgentModeId): Promise<PhoneOperateViewState> {
    await nonoConfigService.setDraftMode(mode);
    return this.read();
  }

  async activate(
    mode: AgentModeId,
    expectedRevision: number,
  ): Promise<PhoneOperateViewState> {
    // Guard on the persisted config revision before any write so a stale draft
    // never silently overwrites a concurrently-changed configuration.
    const envelope = await this.repo.load();
    if (envelope.revision !== expectedRevision) {
      throw new RuntimeConfigError('runtime_config_conflict');
    }
    await nonoConfigService.saveActiveMode(mode);
    return this.read();
  }

  async setAdbFallback(enabled: boolean): Promise<PhoneOperateViewState> {
    await settingsService.setADBFallbackEnabled(enabled);
    return this.read();
  }

  private blockersFor(
    mode: AgentModeId,
    phoneEnabled: boolean,
    hasRole: (role: ModelRole) => boolean,
    localReady: boolean,
  ): PhoneOperateViewState['modes'][AgentModeId]['blockers'] {
    const blockers: {code: PhoneOperateViewState['modes'][AgentModeId]['blockers'][number]['code']; message: string}[] =
      [];
    if (!phoneEnabled) {
      blockers.push({
        code: 'phone_operate_disabled',
        message: '请先在设置中开启「替我操作手机」。',
      });
    }
    if (mode === 'cloud_direct') {
      if (!hasRole('direct')) {
        blockers.push({
          code: 'missing_unified_model',
          message: '尚未配置云端一体模型。',
        });
      }
    } else if (mode === 'cloud_split') {
      if (!hasRole('vision')) {
        blockers.push({
          code: 'missing_split_vision_model',
          message: '尚未配置云端视觉模型。',
        });
      }
      if (!hasRole('split_planner')) {
        blockers.push({
          code: 'missing_split_planner_model',
          message: '尚未配置云端编排模型。',
        });
      }
    } else {
      if (!localReady) {
        blockers.push({
          code: 'local_model_not_ready',
          message: '本地视觉模型未就绪。',
        });
      }
      if (!hasRole('local_planner')) {
        blockers.push({
          code: 'missing_local_planner_model',
          message: '尚未配置云端编排模型。',
        });
      }
    }
    return blockers;
  }

  private async isLocalReady(): Promise<boolean> {
    try {
      const report = await this.eligibility.getCurrent();
      return report.state === 'ready';
    } catch {
      return false;
    }
  }
}

export class RuntimeModelConfigPort implements ModelConfigApplicationPort {
  constructor(
    private readonly repo: RuntimeConfigRepository,
    private readonly registry: ModelProviderRegistry,
    private readonly credentials: CredentialStore,
  ) {}

  private presets(): readonly ProviderPresetViewState[] {
    return this.registry.listPresets().map(reg => ({
      id: reg.preset,
      label: PROVIDER_PRESET_DISPLAY[reg.preset].label,
      maturity: PROVIDER_PRESET_DISPLAY[reg.preset].maturity,
      catalogSupported: reg.catalog.kind === 'remote',
    }));
  }

  private profileFor(
    active: RuntimeRouteConfigV1,
    profileId: string | undefined,
  ): ModelEndpointProfileV1 | undefined {
    return active.modelAPI.profiles.find(profile => profile.id === profileId);
  }

  private toCustomView(
    profile: Extract<ModelEndpointProfileV1, {mode: 'custom'}>,
  ): CustomProviderConfigViewState {
    return {
      providerLabel: profile.label,
      baseUrl: profile.custom.baseURL,
      protocol: profile.custom.protocol,
      auth: profile.custom.auth,
      chatPath: profile.custom.chatPath,
      modelListPath: profile.custom.modelListPath,
      declaredCapabilities: profile.custom.declaredCapabilities,
      capabilityTrust: 'user_declared_unverified',
    };
  }

  private providerLabelOf(profile: ModelEndpointProfileV1): string {
    return profile.mode === 'preset'
      ? PROVIDER_PRESET_DISPLAY[profile.preset].label
      : profile.label;
  }

  async read(input: {
    list: ModelListKey;
    bindingId?: string;
  }): Promise<ModelConfigViewState> {
    const envelope = await this.repo.load();
    const active = envelope.active;
    const presets = this.presets();
    const emptyCatalog: ModelCatalogViewState = {
      requestGeneration: 0,
      status: 'empty',
      models: [],
    };

    const binding = input.bindingId
      ? active.modelAPI.bindings.find(item => item.id === input.bindingId)
      : undefined;
    const profile = binding
      ? this.profileFor(active, binding.profileId)
      : undefined;

    if (!binding || !profile) {
      return {
        status: 'ready',
        revision: envelope.revision,
        mode: 'preset',
        selectedPresetId: 'openai',
        presets,
        providerLabel: PROVIDER_PRESET_DISPLAY.openai.label,
        baseUrl: '',
        modelId: '',
        credential: {state: 'missing'},
        catalog: emptyCatalog,
      };
    }

    return {
      status: 'ready',
      revision: envelope.revision,
      mode: profile.mode,
      selectedPresetId: profile.mode === 'preset' ? profile.preset : undefined,
      presets,
      providerLabel: this.providerLabelOf(profile),
      baseUrl: profile.mode === 'preset' ? profile.baseURLOverride ?? '' : profile.custom.baseURL,
      custom: profile.mode === 'custom' ? this.toCustomView(profile) : undefined,
      modelId: binding.modelId,
      credential: profile.secretRef
        ? {state: 'ready', maskedLabel: '••••'}
        : {state: 'missing'},
      catalog: emptyCatalog,
    };
  }

  async readList(list: ModelListKey): Promise<ModelConfigListViewState> {
    const envelope = await this.repo.load();
    const active = envelope.active;
    const role = ROLE_BY_LIST[list];
    const items: ModelConfigListItemViewState[] = active.modelAPI.bindings
      .filter(binding => binding.role === role)
      .map((binding, index) => {
        const profile = this.profileFor(active, binding.profileId);
        return {
          bindingId: binding.id,
          endpointProfileId: binding.profileId,
          displayName: profile?.label || binding.modelId,
          providerLabel: profile ? this.providerLabelOf(profile) : '',
          modelId: binding.modelId,
          mode: profile?.mode ?? 'preset',
          // Runtime stores one binding-per-purpose; the first configured binding
          // for a role is treated as the active/in-use one.
          selected: index === 0,
        };
      });
    return {
      status: 'ready',
      revision: envelope.revision,
      list,
      items,
    };
  }

  async fetchCatalog(
    input: ModelCatalogRefreshInput,
  ): Promise<ModelCatalogViewState> {
    const envelope = await this.repo.load();
    const active = envelope.active;
    const existingBinding = input.bindingId
      ? active.modelAPI.bindings.find(item => item.id === input.bindingId)
      : undefined;
    const existingProfile = existingBinding
      ? this.profileFor(active, existingBinding.profileId)
      : undefined;

    let secretRef: string | null = existingProfile?.secretRef ?? null;
    let tempSecretRef: string | null = null;
    if (input.credential.action === 'replace' && input.credential.plaintext.trim()) {
      tempSecretRef = `catalog:${newId()}`;
      try {
        await this.credentials.put(tempSecretRef, input.credential.plaintext);
        secretRef = tempSecretRef;
      } catch {
        tempSecretRef = null;
      }
    }

    const profile = this.buildProfile(input, {
      id: existingProfile?.id ?? `catalog-${newId()}`,
      secretRef,
    });

    try {
      const result: ProviderModelCatalogResult = await this.registry
        .resolveCatalog(profile)
        .listModels({
          profile,
          signal: new AbortController().signal,
          timeoutMs: 30_000,
          requestGeneration: input.requestGeneration,
        });
      return mapProviderCatalog(result, input.requestGeneration);
    } catch {
      return {
        requestGeneration: input.requestGeneration,
        status: 'network_failed',
        models: [],
      };
    } finally {
      if (tempSecretRef) {
        try {
          await this.credentials.delete(tempSecretRef);
        } catch {
          // Best-effort cleanup; a stranded ephemeral secret is GC'd on cold start.
        }
      }
    }
  }

  async save(input: ModelConfigSaveInput): Promise<ModelConfigViewState> {
    const envelope = await this.repo.load();
    // Optimistic-concurrency gate: reject a stale save before any credential or
    // config write so a mismatched revision never mutates the runtime config.
    if (envelope.revision !== input.expectedRevision) {
      throw new RuntimeConfigError('runtime_config_conflict');
    }
    const active = envelope.active;
    const role = ROLE_BY_LIST[input.list];
    const existingBinding = input.bindingId
      ? active.modelAPI.bindings.find(item => item.id === input.bindingId)
      : undefined;
    const existingProfile = existingBinding
      ? this.profileFor(active, existingBinding.profileId)
      : undefined;

    const profileId = existingProfile?.id ?? `profile-${newId()}`;
    const secretRef =
      input.credential.action === 'remove'
        ? null
        : existingProfile?.secretRef ?? null;
    const profile = this.buildProfile(input, {
      id: profileId,
      secretRef,
      generation: existingProfile?.generation ?? 1,
    });

    const plaintext =
      input.credential.action === 'replace' ? input.credential.plaintext : undefined;
    await this.repo.putProfile(profile, plaintext);

    const binding: ModelBindingV1 = {
      id: existingBinding?.id ?? `binding-${newId()}`,
      role,
      profileId,
      modelId: input.selectedModelId,
      maxSteps: existingBinding?.maxSteps ?? DEFAULT_MAX_STEPS,
    };
    await this.repo.putBinding(binding);

    return this.read({list: input.list, bindingId: binding.id});
  }

  async selectBinding(input: {
    list: ModelListKey;
    bindingId: string;
    expectedRevision: number;
  }): Promise<ModelConfigListViewState> {
    const role = ROLE_BY_LIST[input.list];
    await this.repo.compareAndActivate(input.expectedRevision, current => {
      const chosen = current.modelAPI.bindings.find(
        item => item.id === input.bindingId,
      );
      if (!chosen) {
        return current;
      }
      const rest = current.modelAPI.bindings.filter(
        item => item.id !== input.bindingId,
      );
      // Move the chosen binding to the front of its role so it reads as in-use.
      const others = rest.filter(item => item.role !== role);
      const sameRole = rest.filter(item => item.role === role);
      return {
        ...current,
        modelAPI: {
          ...current.modelAPI,
          bindings: [chosen, ...sameRole, ...others],
        },
      };
    });
    return this.readList(input.list);
  }

  async deleteBinding(input: {
    list: ModelListKey;
    bindingId: string;
    expectedRevision: number;
  }): Promise<ModelConfigListViewState> {
    const envelope = await this.repo.load();
    const binding = envelope.active.modelAPI.bindings.find(
      item => item.id === input.bindingId,
    );
    await this.repo.compareAndActivate(input.expectedRevision, current => ({
      ...current,
      modelAPI: {
        ...current.modelAPI,
        bindings: current.modelAPI.bindings.filter(
          item => item.id !== input.bindingId,
        ),
      },
    }));
    if (binding) {
      try {
        await this.repo.removeProfile(binding.profileId);
      } catch {
        // Profile may still back another binding; leave it in place.
      }
    }
    return this.readList(input.list);
  }

  private buildProfile(
    input: ModelCatalogRefreshInput | ModelConfigSaveInput,
    opts: {id: string; secretRef: string | null; generation?: number},
  ): ModelEndpointProfileV1 {
    const generation = opts.generation ?? 1;
    if (input.mode === 'preset') {
      return {
        id: opts.id,
        label: PROVIDER_PRESET_DISPLAY[input.presetId].label,
        mode: 'preset',
        preset: input.presetId,
        baseURLOverride: input.baseUrlOverride,
        region: null,
        channel: null,
        secretRef: opts.secretRef,
        generation,
      };
    }
    return {
      id: opts.id,
      label: input.customProviderLabel || '自定义服务商',
      mode: 'custom',
      custom: {
        protocol: input.protocol,
        baseURL: input.baseUrl,
        auth: input.auth,
        chatPath: input.chatPath,
        modelListPath: input.modelListPath,
        declaredCapabilities: input.declaredCapabilities,
      },
      region: null,
      channel: null,
      secretRef: opts.secretRef,
      generation,
    };
  }
}

function createProductionRuntimePorts(): AppFacadePorts {
  const storage = AsyncStorage as unknown as ConstructorParameters<
    typeof AsyncStorageRuntimeConfigRepository
  >[0]['storage'];
  const catalogStorage = AsyncStorage as unknown as ConstructorParameters<
    typeof AsyncStorageModelCatalogCache
  >[0];
  const now = () => Date.now();
  const credentials = new NativeCredentialStore();
  const retirements = new AsyncStorageCredentialRetirementRepository(storage, now);
  const catalogCache = new AsyncStorageModelCatalogCache(catalogStorage, now);
  const registry = createModelProviderRegistry({
    credentials,
    fetchImpl: globalThis.fetch as unknown as ProviderFetch,
    cache: catalogCache,
    now,
  });
  const repo = new AsyncStorageRuntimeConfigRepository({
    storage,
    credentials,
    retirements,
    now,
    newId,
    catalogCache,
  });
  const eligibility = new NativeLocalModelEligibilityChecker();
  const operateEvents = new TaskUiEventBus();
  const operate = new RuntimeOperatePort(repo, operateEvents, registry, eligibility);
  const companion = new RuntimeCompanionPort(repo);
  const visualAgentTools = new RuntimeVisualAgentToolsPort(repo, credentials);
  const errands = new RuntimeErrandPort(repo);
  const privacy = new RuntimePrivacyPort(repo);
  const activity = new RuntimeActivityPort(repo, errands);
  wireHeadlessOperate(operate);

  return {
    operate,
    operateEvents,
    companion,
    phoneOperate: new RuntimePhoneOperatePort(repo, eligibility),
    visualAgentTools,
    modelConfig: new RuntimeModelConfigPort(repo, registry, credentials),
    errands,
    privacy,
    activity,
  };
}

export const appFacades: AppFacades = createAppFacades(
  createProductionRuntimePorts(),
);
