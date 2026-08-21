// Snapshot-bound donor `AgentRuntime` adapter (runtime-foundation Task 7).
// Reconstructs a donor `RuntimeTaskSnapshot` from the immutable
// `ResolvedOperateSessionV1` and invokes the existing `AgentRuntime.decideStep`.
// Never reads RuntimeConfig, a profile repository, catalog state, or a
// feature model service; the registry-backed providers below only speak
// through the frozen `RegistryModelChatPort`.
import {
  AgentRuntime,
  AgentRuntimeAbortError,
  type RuntimeConfigurationSource,
  type RuntimePipelineFactory,
  type RuntimeStepInput,
  type RuntimeStepResult,
  type RuntimeViewportAdapter,
} from '@core/engine/agentRuntime/runtime/AgentRuntime';
import {
  LOCAL_PERCEPTION_UNAVAILABLE,
  LocalPerceptionUnavailableError,
  type AgentRuntimeFactoryDependencies,
} from '@core/engine/agentRuntime/runtime/AgentRuntimeFactory';
import type {
  AgentConfigV2,
  ModelConnection,
} from '@core/engine/agentRuntime/domain/AgentTypes';
import {
  AgentProviderError,
  type CredentialResolver,
  type DirectActionDecision,
  type DirectAgentProvider,
  type PerceptionInput,
  type PerceptionProvider,
  type PlannerInput,
  type PlannerProvider,
  type StepInput,
} from '@core/engine/agentRuntime/contracts/AgentContracts';
import {
  sanitizeObservation,
  sanitizePlannerInput,
} from '@core/engine/agentRuntime/contracts/PlannerPayload';
import {
  parseActionDecisionResponse,
  parseObservationResponse,
} from '@core/engine/agentRuntime/providers/OpenAICompatibleTransport';
import {DirectAgentPipeline} from '@core/engine/agentRuntime/pipelines/DirectAgentPipeline';
import {SplitAgentPipeline} from '@core/engine/agentRuntime/pipelines/SplitAgentPipeline';
import type {
  ResolvedModelBindingSnapshotV1,
  ResolvedOperateSessionV1,
} from '@core/engine/operateRuntime/contracts/OperateSessionContracts';
import type {RegistryModelChatPort} from './OperateTaskPorts';

export interface SnapshotAgentRuntimePort {
  decideStep(
    session: ResolvedOperateSessionV1,
    input: RuntimeStepInput,
  ): Promise<RuntimeStepResult>;
}

/** Wraps an already-extracted chat text as the OpenAI-shaped envelope the
 * frozen parse helpers expect, without re-implementing their JSON/fence
 * parsing or schema validation. */
const asChatCompletionEnvelope = (text: string): unknown => ({
  choices: [{message: {content: text}}],
});

const hasNormalizedCoordinates = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every(
    coordinate =>
      typeof coordinate === 'number' &&
      Number.isFinite(coordinate) &&
      coordinate >= 0 &&
      coordinate <= 1000,
  );

const DIRECT_SYSTEM_PROMPT =
  'Inspect the mobile screenshot and choose exactly one next action. ' +
  'Return one JSON ActionDecision and do not return an action sequence. ' +
  'A tap or input must contain normalized 0..1000 coordinates; targetId alone is invalid. ' +
  'Swipe is unsupported in direct mode.';
const VISION_SYSTEM_PROMPT =
  'Describe the current mobile screen as one JSON Observation object. ' +
  'Use normalized 0..1000 bounding boxes and stable element ids.';
const PLANNER_SYSTEM_PROMPT =
  'Choose exactly one next mobile action and return one JSON ActionDecision. ' +
  'Use targetId when the observation provides a stable element id.';

class RegistryDirectProvider implements DirectAgentProvider {
  constructor(
    private readonly chat: RegistryModelChatPort,
    private readonly snapshot: ResolvedModelBindingSnapshotV1,
  ) {}

  async decide(input: StepInput): Promise<DirectActionDecision> {
    const result = await this.chat.send(
      this.snapshot,
      [
        {role: 'system', text: DIRECT_SYSTEM_PROMPT},
        {
          role: 'user',
          text: JSON.stringify({
            instruction: input.instruction,
            history: input.history,
          }),
          imageDataURI: input.screenshotUri,
        },
      ],
      input.signal,
    );
    const decision = parseActionDecisionResponse(
      asChatCompletionEnvelope(result.text),
    );
    if (
      decision.action === 'swipe' ||
      ((decision.action === 'tap' || decision.action === 'input') &&
        !hasNormalizedCoordinates(decision.coordinates))
    ) {
      throw new AgentProviderError(
        'invalid_structured_response',
        'Provider returned invalid structured output',
      );
    }
    return decision as DirectActionDecision;
  }
}

class RegistryVisionProvider implements PerceptionProvider {
  constructor(
    private readonly chat: RegistryModelChatPort,
    private readonly snapshot: ResolvedModelBindingSnapshotV1,
  ) {}

  async observe(input: PerceptionInput) {
    const result = await this.chat.send(
      this.snapshot,
      [
        {role: 'system', text: VISION_SYSTEM_PROMPT},
        {
          role: 'user',
          text: JSON.stringify({instruction: input.instruction}),
          imageDataURI: input.screenshotUri,
        },
      ],
      input.signal,
    );
    return parseObservationResponse(asChatCompletionEnvelope(result.text));
  }
}

class RegistryPlannerProvider implements PlannerProvider {
  constructor(
    private readonly chat: RegistryModelChatPort,
    private readonly snapshot: ResolvedModelBindingSnapshotV1,
  ) {}

  async plan(input: PlannerInput) {
    const sanitized = sanitizePlannerInput(input);
    const result = await this.chat.send(
      this.snapshot,
      [
        {role: 'system', text: PLANNER_SYSTEM_PROMPT},
        {
          role: 'user',
          text: JSON.stringify({
            observation: sanitized.observation,
            instruction: sanitized.instruction,
            history: sanitized.history,
          }),
        },
      ],
      input.signal,
    );
    return parseActionDecisionResponse(asChatCompletionEnvelope(result.text));
  }
}

/** Mirrors the donor `GuardedLocalPerceptionProvider`: sanitizes the raw local
 * observation, fails closed to `local_perception_unavailable` on any local
 * inference error, and never falls back to a cloud vision call. */
class GuardedRegistryLocalPerceptionProvider implements PerceptionProvider {
  private delegate?: PerceptionProvider;

  constructor(
    private readonly createDelegate: () => PerceptionProvider,
    private readonly invalidate: AgentRuntimeFactoryDependencies['invalidateLocalEligibility'],
  ) {}

  async observe(input: PerceptionInput) {
    try {
      this.delegate ??= this.createDelegate();
      const rawObservation = await this.delegate.observe(input);
      if (input.signal.aborted) {
        throw new AgentRuntimeAbortError();
      }
      return sanitizeObservation(rawObservation);
    } catch (error) {
      if (input.signal.aborted) {
        throw error instanceof AgentRuntimeAbortError
          ? error
          : new AgentRuntimeAbortError();
      }
      try {
        await this.invalidate(LOCAL_PERCEPTION_UNAVAILABLE);
      } catch {
        // Preserve the local inference failure even when state invalidation fails.
      }
      throw new LocalPerceptionUnavailableError();
    }
  }
}

const CONNECTION_IDS = {
  direct: 'operate:direct',
  vision: 'operate:vision',
  planner: 'operate:planner',
} as const;

const stubConnection = (id: string): ModelConnection => ({
  id,
  providerId: 'operate-registry',
  baseUrl: '',
  modelName: '',
  secretRef: '',
  capabilities: {
    vision: true,
    jsonOutput: true,
    toolCalls: false,
    thinking: false,
  },
});

interface DonorSnapshot {
  readonly config: AgentConfigV2;
  readonly connections: Readonly<Record<string, ModelConnection>>;
}

const requireBinding = (
  snapshot: ResolvedModelBindingSnapshotV1 | undefined,
  role: string,
): ResolvedModelBindingSnapshotV1 => {
  if (!snapshot) {
    throw new Error(`operate_task_model_binding_missing:${role}`);
  }
  return snapshot;
};

const donorSnapshotFor = (session: ResolvedOperateSessionV1): DonorSnapshot => {
  switch (session.channel) {
    case 'cloud_direct': {
      const direct = requireBinding(session.modelBindings.direct, 'direct');
      return {
        config: {
          version: 2,
          activeMode: 'cloud_direct',
          modeDrafts: {
            cloudDirect: {modelConnectionId: CONNECTION_IDS.direct},
            cloudSplit: {},
            localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'},
          },
          maxSteps: direct.maxSteps,
        },
        connections: {
          [CONNECTION_IDS.direct]: stubConnection(CONNECTION_IDS.direct),
        },
      };
    }
    case 'cloud_split': {
      requireBinding(session.modelBindings.vision, 'vision');
      const planner = requireBinding(session.modelBindings.planner, 'planner');
      return {
        config: {
          version: 2,
          activeMode: 'cloud_split',
          modeDrafts: {
            cloudDirect: {},
            cloudSplit: {
              visionConnectionId: CONNECTION_IDS.vision,
              plannerConnectionId: CONNECTION_IDS.planner,
            },
            localVisionCloudPlanner: {localModelId: 'minicpm-v-4.6-q4'},
          },
          maxSteps: planner.maxSteps,
        },
        connections: {
          [CONNECTION_IDS.vision]: stubConnection(CONNECTION_IDS.vision),
          [CONNECTION_IDS.planner]: stubConnection(CONNECTION_IDS.planner),
        },
      };
    }
    case 'local_vision_cloud_planner': {
      const planner = requireBinding(session.modelBindings.planner, 'planner');
      return {
        config: {
          version: 2,
          activeMode: 'local_vision_cloud_planner',
          modeDrafts: {
            cloudDirect: {},
            cloudSplit: {},
            localVisionCloudPlanner: {
              localModelId: session.localModelId ?? 'minicpm-v-4.6-q4',
              plannerConnectionId: CONNECTION_IDS.planner,
            },
          },
          maxSteps: planner.maxSteps,
        },
        connections: {
          [CONNECTION_IDS.planner]: stubConnection(CONNECTION_IDS.planner),
        },
      };
    }
    case 'visual_agent':
      throw new Error(
        'operate_task_visual_agent_not_supported_by_snapshot_adapter',
      );
  }
};

export class SnapshotAgentRuntimeAdapter implements SnapshotAgentRuntimePort {
  constructor(
    private readonly chat: RegistryModelChatPort,
    private readonly localPerceptionProviderFactory: AgentRuntimeFactoryDependencies['localPerceptionProviderFactory'],
    private readonly viewportAdapter: RuntimeViewportAdapter,
    private readonly invalidateLocalEligibility: AgentRuntimeFactoryDependencies['invalidateLocalEligibility'],
    private readonly now: () => number = Date.now,
  ) {}

  async decideStep(
    session: ResolvedOperateSessionV1,
    input: RuntimeStepInput,
  ): Promise<RuntimeStepResult> {
    const snapshot = donorSnapshotFor(session);
    const pipelineFactory = this.pipelineFactoryFor(session);
    const configSource: RuntimeConfigurationSource = {
      createTaskSnapshot: () => snapshot,
    };
    const credentialResolver: CredentialResolver = {
      resolve: async () => {
        throw new Error('operate_task_runner_credential_resolver_unused');
      },
    };
    const runtime = new AgentRuntime({
      configSource,
      credentialResolver,
      pipelineFactory,
      viewportAdapter: this.viewportAdapter,
      now: this.now,
    });
    return runtime.decideStep(snapshot, input);
  }

  private pipelineFactoryFor(
    session: ResolvedOperateSessionV1,
  ): RuntimePipelineFactory {
    return {
      createDirect: () =>
        new DirectAgentPipeline(
          new RegistryDirectProvider(
            this.chat,
            requireBinding(session.modelBindings.direct, 'direct'),
          ),
        ),
      createCloudSplit: () =>
        new SplitAgentPipeline(
          new RegistryVisionProvider(
            this.chat,
            requireBinding(session.modelBindings.vision, 'vision'),
          ),
          new RegistryPlannerProvider(
            this.chat,
            requireBinding(session.modelBindings.planner, 'planner'),
          ),
        ),
      createLocalSplit: (_connection, localModelId) =>
        new SplitAgentPipeline(
          new GuardedRegistryLocalPerceptionProvider(
            () => this.localPerceptionProviderFactory(localModelId),
            this.invalidateLocalEligibility,
          ),
          new RegistryPlannerProvider(
            this.chat,
            requireBinding(session.modelBindings.planner, 'planner'),
          ),
        ),
    };
  }
}
