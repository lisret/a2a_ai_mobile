// Runtime-foundation Task 6 resolver: joins the active RuntimeConfig into one
// immutable `ResolvedOperateSessionV1` with no live lookups after creation.
// Wave 1B Agent B scope: session contracts/resolver/store/runtime façade only.
import type {AgentConfigV2} from '../../agentRuntime/domain';
import type {LocalModelEligibility} from '../../agentRuntime/localModel/LocalModelEligibility';
import type {RuntimeRouteConfigV1} from '../contracts/RuntimeConfigContracts';
import type {
  ModelBindingV1,
  ModelEndpointProfileV1,
  ModelProviderRegistry,
  ModelRole,
  ProviderExecutionTargetV1,
  ProviderModelDescriptor,
} from '../model/ModelProviderContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentToolRegistry,
} from '../visualAgent/VisualAgentContracts';
import type {
  ResolvedModelBindingSnapshotV1,
  ResolvedOperateSessionV1,
  ResolvedVisualAgentSnapshotV1,
} from '../contracts/OperateSessionContracts';

export interface LocalEligibilityPort {
  check(modelId: 'minicpm-v-4.6-q4'): Promise<LocalModelEligibility>;
}

export interface OperateSessionResolverDeps {
  readonly modelProviderRegistry: ModelProviderRegistry;
  readonly visualAgentToolRegistry: VisualAgentToolRegistry;
  readonly localEligibility: LocalEligibilityPort;
}

export interface OperateSessionResolveInput {
  readonly taskId: string;
  readonly sessionRevision: number;
  readonly configRevision: number;
  readonly active: RuntimeRouteConfigV1;
  readonly createdAtMs: number;
  readonly signal: AbortSignal;
}

export type OperateSessionResolution =
  | {readonly ok: true; readonly session: ResolvedOperateSessionV1}
  | {readonly ok: false; readonly code: string};

type ModelBindingResolution =
  | {readonly ok: true; readonly snapshot: ResolvedModelBindingSnapshotV1}
  | {readonly ok: false; readonly code: string};

type VisualAgentResolution =
  | {readonly ok: true; readonly snapshot: ResolvedVisualAgentSnapshotV1}
  | {readonly ok: false; readonly code: string};

const ROLES_BY_MODE: Readonly<Record<AgentConfigV2['activeMode'], readonly ModelRole[]>> = {
  cloud_direct: ['direct'],
  cloud_split: ['vision', 'split_planner'],
  local_vision_cloud_planner: ['local_planner'],
};

const IMAGE_REQUIRED_ROLES: ReadonlySet<ModelRole> = new Set(['direct', 'vision']);

function sessionBindingKeyForRole(role: ModelRole): 'direct' | 'vision' | 'planner' {
  switch (role) {
    case 'direct':
      return 'direct';
    case 'vision':
      return 'vision';
    case 'split_planner':
    case 'local_planner':
      return 'planner';
    default:
      throw new Error(`operate_session_unsupported_role:${role}`);
  }
}

function deriveCapabilityTrust(
  profile: ModelEndpointProfileV1,
  descriptor: ProviderModelDescriptor,
): ProviderExecutionTargetV1['capabilityTrust'] {
  if (profile.mode === 'custom') {
    return 'user_declared_unverified';
  }
  switch (descriptor.metadataSource) {
    case 'remote':
      return 'verified_remote';
    case 'signed_static':
      return 'verified_signed';
    default:
      return 'user_declared_unverified';
  }
}

function isSecretRefValid(
  profile: ModelEndpointProfileV1,
  registry: ModelProviderRegistry,
): boolean {
  if (profile.secretRef !== null) {
    return true;
  }
  if (profile.mode === 'custom') {
    return profile.custom.auth.kind === 'none';
  }
  const registration = registry.listPresets().find(preset => preset.preset === profile.preset);
  return registration !== undefined && registration.credentialRequirement !== 'required';
}

function targetSupportsImage(target: ProviderExecutionTargetV1): boolean {
  return target.inputModalities.includes('image') && target.capabilities.vision !== false;
}

function errorCodeOf(error: unknown, fallback: string): string {
  if (error && typeof (error as {code?: unknown}).code === 'string') {
    return (error as {code: string}).code;
  }
  return fallback;
}

function isNegotiatedCapabilitySubset(
  negotiated: VisualAgentCapabilitySet,
  requested: VisualAgentCapabilitySet,
): boolean {
  return (Object.keys(negotiated) as (keyof VisualAgentCapabilitySet)[]).every(
    key => !negotiated[key] || requested[key],
  );
}

/** Copies only the frozen `ProviderExecutionTargetV1` fields; no RuntimeConfig or registry reads. */
export function executionTargetFromModelSnapshot(
  snapshot: ResolvedModelBindingSnapshotV1,
): ProviderExecutionTargetV1 {
  return {
    provider: snapshot.provider,
    transportAdapterId: snapshot.transportAdapterId,
    protocol: snapshot.protocol,
    baseURL: snapshot.baseURL,
    auth: snapshot.auth,
    chatPath: snapshot.chatPath,
    region: snapshot.region,
    channel: snapshot.channel,
    secretRef: snapshot.secretRef,
    inputModalities: snapshot.inputModalities,
    outputModalities: snapshot.outputModalities,
    capabilities: snapshot.capabilities,
    capabilityTrust: snapshot.capabilityTrust,
  };
}

/** Reconstructs the exact `ModelBindingV1` the snapshot was created from, preserving `bindingId`. */
export function bindingFromModelSnapshot(
  snapshot: ResolvedModelBindingSnapshotV1,
): ModelBindingV1 {
  return {
    id: snapshot.bindingId,
    role: snapshot.role,
    profileId: snapshot.profileId,
    modelId: snapshot.modelId,
    maxSteps: snapshot.maxSteps,
  };
}

export class OperateSessionResolver {
  constructor(private readonly deps: OperateSessionResolverDeps) {}

  async resolve(input: OperateSessionResolveInput): Promise<OperateSessionResolution> {
    const {taskId, sessionRevision, configRevision, active, createdAtMs, signal} = input;

    if (active.visualAgent.enabled) {
      const visualResult = await this.resolveVisualAgent(active, signal);
      if (!visualResult.ok) {
        return visualResult;
      }
      return {
        ok: true,
        session: deepFreeze({
          schemaVersion: 1,
          taskId,
          sessionRevision,
          configRevision,
          channel: 'visual_agent',
          modelBindings: {},
          visualAgent: visualResult.snapshot,
          createdAtMs,
        }),
      };
    }

    const mode = active.modelAPI.agentConfig.activeMode;

    if (mode === 'local_vision_cloud_planner') {
      const eligibility = await this.deps.localEligibility.check('minicpm-v-4.6-q4');
      if (eligibility.state !== 'ready') {
        return {ok: false, code: 'local_model_not_ready'};
      }
    }

    const modelBindings: Record<string, ResolvedModelBindingSnapshotV1> = {};
    for (const role of ROLES_BY_MODE[mode]) {
      const result = this.resolveModelBinding(role, active);
      if (!result.ok) {
        return result;
      }
      modelBindings[sessionBindingKeyForRole(role)] = result.snapshot;
    }

    return {
      ok: true,
      session: deepFreeze({
        schemaVersion: 1,
        taskId,
        sessionRevision,
        configRevision,
        channel: mode,
        modelBindings,
        ...(mode === 'local_vision_cloud_planner'
          ? {localModelId: 'minicpm-v-4.6-q4' as const}
          : {}),
        createdAtMs,
      }),
    };
  }

  private resolveModelBinding(
    role: ModelRole,
    active: RuntimeRouteConfigV1,
  ): ModelBindingResolution {
    const binding = active.modelAPI.bindings.find(candidate => candidate.role === role);
    if (!binding) {
      return {ok: false, code: 'model_binding_missing'};
    }
    const profile = active.modelAPI.profiles.find(candidate => candidate.id === binding.profileId);
    if (!profile) {
      return {ok: false, code: 'model_profile_missing'};
    }
    if (!isSecretRefValid(profile, this.deps.modelProviderRegistry)) {
      return {ok: false, code: 'model_profile_secret_missing'};
    }

    const catalog = this.deps.modelProviderRegistry.resolveCatalog(profile);
    const descriptor = catalog.describeManualModel(profile, binding.modelId);
    const capabilityTrust = deriveCapabilityTrust(profile, descriptor);
    const target = this.deps.modelProviderRegistry.resolveExecutionTarget(
      profile,
      descriptor,
      capabilityTrust,
    );

    if (IMAGE_REQUIRED_ROLES.has(role) && !targetSupportsImage(target)) {
      return {ok: false, code: 'model_binding_vision_unsupported'};
    }

    return {
      ok: true,
      snapshot: {
        ...target,
        role,
        bindingId: binding.id,
        profileId: profile.id,
        modelId: binding.modelId,
        maxSteps: binding.maxSteps,
      },
    };
  }

  private async resolveVisualAgent(
    active: RuntimeRouteConfigV1,
    signal: AbortSignal,
  ): Promise<VisualAgentResolution> {
    const profile = active.visualAgent.profiles.find(
      candidate =>
        candidate.profileId === active.visualAgent.activeProfileId && candidate.enabled,
    );
    if (!profile) {
      return {ok: false, code: 'visual_agent_invalid_profile'};
    }

    let adapter;
    try {
      adapter = this.deps.visualAgentToolRegistry.require(profile.toolId);
    } catch (error) {
      return {ok: false, code: errorCodeOf(error, 'visual_agent_adapter_not_found')};
    }

    const port = adapter.create(profile);
    let negotiated: VisualAgentCapabilitySet;
    try {
      negotiated = await port.connect(profile, signal);
    } catch (error) {
      return {ok: false, code: errorCodeOf(error, 'visual_agent_disconnected')};
    }

    if (
      !negotiated.imageInput ||
      !negotiated.structuredAction ||
      !isNegotiatedCapabilitySubset(negotiated, profile.requestedCapabilities)
    ) {
      return {ok: false, code: 'visual_agent_capability_unsupported'};
    }

    return {
      ok: true,
      snapshot: {
        profileId: profile.profileId,
        toolId: profile.toolId,
        connector: profile.connector,
        negotiatedCapabilities: negotiated,
      },
    };
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
