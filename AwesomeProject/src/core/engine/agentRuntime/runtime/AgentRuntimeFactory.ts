import type {
  CredentialResolver,
  PerceptionInput,
  PerceptionProvider,
} from '../contracts/AgentContracts';
import {sanitizeObservation} from '../contracts/PlannerPayload';
import type {ModelConnection} from '../domain/AgentTypes';
import {DirectAgentPipeline} from '../pipelines/DirectAgentPipeline';
import {SplitAgentPipeline} from '../pipelines/SplitAgentPipeline';
import {CloudPerceptionProvider} from '../providers/CloudPerceptionProvider';
import {OpenAICompatibleDirectProvider} from '../providers/OpenAICompatibleDirectProvider';
import {OpenAICompatiblePlannerProvider} from '../providers/OpenAICompatiblePlannerProvider';
import type {OpenAICompatibleTransport} from '../providers/OpenAICompatibleTransport';
import {
  AgentRuntime,
  AgentRuntimeAbortError,
  type RuntimeConfigurationSource,
  type RuntimePipelineFactory,
  type RuntimeViewportAdapter,
} from './AgentRuntime';

export const LOCAL_PERCEPTION_UNAVAILABLE =
  'local_perception_unavailable' as const;

export class LocalPerceptionUnavailableError extends Error {
  readonly name = 'LocalPerceptionUnavailableError';
  readonly code = LOCAL_PERCEPTION_UNAVAILABLE;

  constructor() {
    super(LOCAL_PERCEPTION_UNAVAILABLE);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface AgentRuntimeFactoryDependencies {
  readonly configSource: RuntimeConfigurationSource;
  readonly credentialResolver: CredentialResolver;
  readonly transport: OpenAICompatibleTransport;
  readonly localPerceptionProviderFactory: (
    modelId: 'minicpm-v-4.6-q4',
  ) => PerceptionProvider;
  readonly viewportAdapter: RuntimeViewportAdapter;
  readonly invalidateLocalEligibility: (
    errorCode: typeof LOCAL_PERCEPTION_UNAVAILABLE,
  ) => unknown | PromiseLike<unknown>;
  readonly now?: () => number;
}

class GuardedLocalPerceptionProvider implements PerceptionProvider {
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

const createPipelineFactory = (
  dependencies: AgentRuntimeFactoryDependencies,
): RuntimePipelineFactory => ({
  createDirect: (connection: ModelConnection) =>
    new DirectAgentPipeline(
      new OpenAICompatibleDirectProvider(
        connection,
        dependencies.credentialResolver,
        dependencies.transport,
      ),
    ),
  createCloudSplit: (
    visionConnection: ModelConnection,
    plannerConnection: ModelConnection,
  ) =>
    new SplitAgentPipeline(
      new CloudPerceptionProvider(
        visionConnection,
        dependencies.credentialResolver,
        dependencies.transport,
      ),
      new OpenAICompatiblePlannerProvider(
        plannerConnection,
        dependencies.credentialResolver,
        dependencies.transport,
      ),
    ),
  createLocalSplit: (plannerConnection, localModelId) =>
    new SplitAgentPipeline(
      new GuardedLocalPerceptionProvider(
        () => dependencies.localPerceptionProviderFactory(localModelId),
        dependencies.invalidateLocalEligibility,
      ),
      new OpenAICompatiblePlannerProvider(
        plannerConnection,
        dependencies.credentialResolver,
        dependencies.transport,
      ),
    ),
});

export const createAgentRuntime = (
  dependencies: AgentRuntimeFactoryDependencies,
): AgentRuntime =>
  new AgentRuntime({
    configSource: dependencies.configSource,
    credentialResolver: dependencies.credentialResolver,
    pipelineFactory: createPipelineFactory(dependencies),
    viewportAdapter: dependencies.viewportAdapter,
    ...(dependencies.now === undefined ? {} : {now: dependencies.now}),
  });
