// Wave 4B Task 11 Step 3 fixtures: deterministic fake native ports shared by
// the `createRuntimeHarness` implementations in this directory. Every fake
// here composes real production contracts/classes (`OperateSessionStore`,
// `OperateSessionResolver`, `OperateTaskRunner`) with in-memory/fake
// transports, registries, and visual-agent adapters. No production source is
// modified; no real timers or backdoors are introduced.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {executionTargetFromModelSnapshot, bindingFromModelSnapshot} from '@core/engine/operateRuntime/runner/OperateTaskPorts';
import type {
  ModelBindingV1,
  ModelEndpointProfileV1,
  ModelProviderRegistry,
  ModelRole,
  ProviderChatMessageV1,
  ProviderChatResultV1,
  ProviderExecutionTargetV1,
  ProviderModelDescriptor,
  ProviderPresetV1,
  ProviderRegistrationV1,
} from '@core/engine/operateRuntime/model/ModelProviderContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentExecutionPort,
  VisualAgentProfileV1,
  VisualAgentToolAdapter,
  VisualAgentToolId,
  VisualAgentToolRegistry,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {RuntimeRouteConfigV1} from '@core/engine/operateRuntime/contracts/RuntimeConfigContracts';
import type {ResolvedModelBindingSnapshotV1} from '@core/engine/operateRuntime/contracts/OperateSessionContracts';

/** Points the globally auto-mocked `AsyncStorage` (see jest.setup.js) at a
 * fresh in-memory backing so each harness instance gets isolated, durable
 * `OperateSessionStore`/`TaskHistoryService` storage instead of the bare
 * `jest.fn()` stubs (which never persist between calls). */
export function wireInMemoryAsyncStorage(): void {
  const backing = new Map<string, string>();
  const mocked = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  mocked.getItem.mockImplementation(async (key: string) =>
    backing.has(key) ? backing.get(key)! : null,
  );
  mocked.setItem.mockImplementation(async (key: string, value: string) => {
    backing.set(key, value);
  });
  mocked.removeItem.mockImplementation(async (key: string) => {
    backing.delete(key);
  });
}

export const ALL_CAPABILITIES_TRUE: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

export type TransportId = 'openai' | 'anthropic' | 'gemini' | 'custom';
const TRANSPORT_IDS: readonly TransportId[] = ['openai', 'anthropic', 'gemini', 'custom'];

export interface FakeTransport {
  readonly id: TransportId;
  readonly sendChat: jest.Mock<Promise<ProviderChatResultV1>, [unknown]>;
}

export interface FakeProviderSpec {
  readonly mode: 'preset' | 'custom';
  readonly preset?: ProviderPresetV1;
  readonly transportAdapterId: TransportId;
}

export const openAiPresetSpec: FakeProviderSpec = {mode: 'preset', preset: 'openai', transportAdapterId: 'openai'};

/** Builds a `ModelEndpointProfileV1` (preset or custom) plus registers its
 * `mode` in `profileModeByProfileId` so `dispatchCloudChat` can report the
 * mode the real dispatch path resolved through, without smuggling extra
 * fields through the frozen `ProviderExecutionTargetV1` snapshot boundary. */
export function buildModelProfile(
  profileId: string,
  label: string,
  spec: FakeProviderSpec,
  profileModeByProfileId: Map<string, 'preset' | 'custom'>,
): ModelEndpointProfileV1 {
  profileModeByProfileId.set(profileId, spec.mode);
  if (spec.mode === 'custom') {
    return {
      id: profileId,
      label,
      mode: 'custom',
      custom: {
        protocol: 'custom_http_json',
        baseURL: 'https://custom.example.test',
        auth: {kind: 'bearer'},
        chatPath: '/v1/chat',
        modelListPath: null,
        declaredCapabilities: {
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
          capabilities: {chat: true, vision: true, toolCalls: true, reasoning: 'unknown'},
        },
      },
      region: null,
      channel: null,
      secretRef: `secret:${profileId}`,
      generation: 1,
    };
  }
  return {
    id: profileId,
    label,
    mode: 'preset',
    preset: spec.preset ?? 'openai',
    baseURLOverride: null,
    region: null,
    channel: null,
    secretRef: `secret:${profileId}`,
    generation: 1,
  };
}

export function buildModelBinding(role: ModelRole, profileId: string, modelId: string): ModelBindingV1 {
  return {id: `binding:${role}`, role, profileId, modelId, maxSteps: 5};
}

export interface ResolveTransportCall {
  readonly mode: 'preset' | 'custom';
}

export interface FakeRegistryKit {
  readonly registry: ModelProviderRegistry;
  readonly transports: Readonly<Record<TransportId, FakeTransport>>;
  readonly resolveTransportSpy: jest.Mock<unknown, [ResolveTransportCall]>;
  readonly profileModeByProfileId: Map<string, 'preset' | 'custom'>;
}

/** A deterministic fake `ModelProviderRegistry`: no network, no real
 * transport implementation. `resolveExecutionTarget` derives the transport
 * id from the profile's mode/preset; `resolveTransport` records every call
 * (via `resolveTransportSpy`, exposed separately so callers can assert the
 * recorded `{mode}` without relying on excess fields surviving the frozen
 * `ProviderExecutionTargetV1` snapshot boundary) and returns the matching
 * fake transport. */
export function createFakeModelProviderRegistry(): FakeRegistryKit {
  const profileModeByProfileId = new Map<string, 'preset' | 'custom'>();
  const transports: Record<TransportId, FakeTransport> = Object.fromEntries(
    TRANSPORT_IDS.map(id => [
      id,
      {
        id,
        sendChat: jest.fn(async () => ({
          text: '{}',
          finishReason: 'stop',
          usage: {inputTokens: null, outputTokens: null},
        })),
      },
    ]),
  ) as unknown as Record<TransportId, FakeTransport>;

  const resolveTransportSpy = jest.fn((_call: ResolveTransportCall) => undefined);

  const registry = {
    listPresets: (): readonly ProviderRegistrationV1[] => [],
    resolveExecutionTarget: (
      profile: ModelEndpointProfileV1,
      descriptor: ProviderModelDescriptor,
      capabilityTrust: ProviderExecutionTargetV1['capabilityTrust'],
    ): ProviderExecutionTargetV1 => {
      const transportAdapterId: TransportId =
        profile.mode === 'custom'
          ? 'custom'
          : profile.preset === 'anthropic'
          ? 'anthropic'
          : profile.preset === 'gemini'
          ? 'gemini'
          : 'openai';
      return {
        provider: profile.mode === 'custom' ? 'custom' : profile.preset,
        transportAdapterId,
        protocol: profile.mode === 'custom' ? profile.custom.protocol : 'openai_chat_completions',
        baseURL: profile.mode === 'custom' ? profile.custom.baseURL : 'https://api.example.test',
        auth: {kind: 'bearer'},
        chatPath: profile.mode === 'custom' ? profile.custom.chatPath : '/v1/chat/completions',
        region: profile.region,
        channel: profile.channel,
        secretRef: profile.secretRef,
        inputModalities: descriptor.inputModalities,
        outputModalities: descriptor.outputModalities,
        capabilities: descriptor.capabilities,
        capabilityTrust,
      };
    },
    resolveTransport: (target: ProviderExecutionTargetV1) => {
      const mode = profileModeByProfileId.get(target.secretRef?.replace(/^secret:/, '') ?? '') ?? 'preset';
      resolveTransportSpy({...target, mode});
      return transports[target.transportAdapterId as TransportId];
    },
    resolveCatalog: (_profile: ModelEndpointProfileV1) => ({
      listModels: jest.fn(),
      describeManualModel: (_p: ModelEndpointProfileV1, modelId: string) => ({
        id: modelId,
        displayName: modelId,
        inputModalities: ['text', 'image'] as const,
        outputModalities: ['text'] as const,
        capabilities: {chat: true, vision: true, toolCalls: true, reasoning: 'unknown'} as const,
        contextWindow: null,
        maxOutputTokens: null,
        metadataSource: 'remote' as const,
      }),
    }),
  } as unknown as ModelProviderRegistry;

  return {registry, transports, resolveTransportSpy, profileModeByProfileId};
}

/** Reconstructs the frozen `ProviderExecutionTargetV1`/`ModelBindingV1` pair
 * from a resolved session snapshot exactly as the real
 * `RegistryModelChatAdapter` does, then dispatches through the fake registry
 * + transport so call counts and `resolveTransport` arguments reflect the
 * real per-role dispatch path. */
export async function dispatchCloudChat(
  kit: FakeRegistryKit,
  snapshot: ResolvedModelBindingSnapshotV1,
  signal: AbortSignal,
): Promise<ProviderChatResultV1> {
  const target = executionTargetFromModelSnapshot(snapshot);
  const binding = bindingFromModelSnapshot(snapshot);
  const transport = kit.registry.resolveTransport(target);
  const messages: readonly ProviderChatMessageV1[] = [];
  return transport.sendChat({target, binding, messages, signal, timeoutMs: 30_000});
}

export interface FakeVisualAgentSpec {
  readonly toolId: VisualAgentToolId;
  readonly readiness: 'disconnected' | 'ready';
  readonly imageInput: boolean;
  readonly structuredAction: boolean;
}

/** A deterministic fake `VisualAgentToolRegistry`. `connect()` rejects when
 * `readiness` is `'disconnected'`; when `'ready'`, it resolves with exactly
 * the negotiated `imageInput`/`structuredAction` the spec declares (the rest
 * of the capability set is left false), letting
 * `OperateSessionResolver.resolveVisualAgent`'s real gating logic decide
 * whether the session is blocked. */
export function createFakeVisualAgentRegistry(spec: FakeVisualAgentSpec | undefined): VisualAgentToolRegistry {
  return {
    require(toolId: VisualAgentToolId): VisualAgentToolAdapter {
      if (!spec || toolId !== spec.toolId) {
        throw new Error('visual_agent_adapter_not_found');
      }
      return {
        toolId: spec.toolId,
        manifest: {
          toolId: spec.toolId,
          displayName: spec.toolId,
          maturity: 'stable',
          adapterVersion: '1.0.0',
          protocolVersions: [1],
          declaredCapabilities: ALL_CAPABILITIES_TRUE,
        },
        create(_profile: VisualAgentProfileV1): VisualAgentExecutionPort {
          return {
            getConnectionState: () => ({status: 'disconnected'}),
            async connect(_p, _signal) {
              if (spec.readiness === 'disconnected') {
                throw new Error('visual_agent_disconnected');
              }
              return {
                imageInput: spec.imageInput,
                structuredAction: spec.structuredAction,
                stream: false,
                cancel: false,
                approval: false,
                resume: false,
                steer: false,
                preferences: false,
              };
            },
            async disconnect() {},
            async execute() {
              return {taskId: 'noop'};
            },
            async cancel() {},
            async resolveApproval() {},
            async resume() {},
            async steer() {},
            async requestPreferences() {
              return undefined;
            },
            subscribe() {
              return () => {};
            },
          };
        },
      };
    },
    list(): readonly VisualAgentToolId[] {
      return spec ? [spec.toolId] : [];
    },
  };
}

export function visualAgentRoute(spec: FakeVisualAgentSpec, profileId: string): RuntimeRouteConfigV1 {
  return {
    capabilities: {phoneOperate: true, errands: false},
    privacy: {memoryEnabled: false, memoryLocation: 'device', memoryProfileId: null},
    modelAPI: {
      agentConfig: {
        version: 2,
        activeMode: 'cloud_direct',
        modeDrafts: {cloudDirect: {}, cloudSplit: {}, localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'}},
        maxSteps: 5,
      },
      profiles: [],
      bindings: [],
    },
    visualAgent: {
      enabled: true,
      activeProfileId: profileId,
      profiles: [
        {
          schemaVersion: 1,
          profileId,
          toolId: spec.toolId,
          enabled: true,
          connector: {
            kind: 'connector_bridge',
            bridgeUrl: 'https://connector.example/bridge',
            bindingId: 'binding:visual',
            secretRef: null,
          },
          requestedCapabilities: ALL_CAPABILITIES_TRUE,
        },
      ],
    },
  };
}
