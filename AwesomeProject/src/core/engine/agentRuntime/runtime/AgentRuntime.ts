import type {TaskAction} from '@core/engine/taskEngine/types/Task';

import type {
  AgentPipeline,
  CredentialResolver,
  RuntimeHistoryEntry,
  StepInput,
} from '../contracts/AgentContracts';
import type {AgentTaskConfigSnapshot} from '../domain/AgentConfigState';
import {validateAgentConfig} from '../domain/AgentConfigValidation';
import type {
  AgentConfigError,
  AgentMode,
  ModelConnection,
  Observation,
} from '../domain/AgentTypes';
import {
  toTaskAction,
  type ViewportDimensions,
} from '../adapters/TaskActionAdapter';
import {
  validateActionDecision,
  type ValidatedActionDecision,
} from '../policy/ActionDecisionValidator';

export type RuntimeTaskSnapshot = AgentTaskConfigSnapshot;

export interface RuntimeStepInput extends StepInput {
  readonly stateChangedSincePreviousAction?: boolean;
}

export interface RuntimeStepResult {
  readonly decision: ValidatedActionDecision;
  readonly observation?: Observation;
  readonly taskAction: TaskAction;
  readonly diagnostics: Readonly<{
    mode: AgentMode;
    durationMs: number;
  }>;
}

export interface RuntimeConfigurationSource {
  createTaskSnapshot(): AgentTaskConfigSnapshot;
}

export interface RuntimePipelineFactory {
  createDirect(connection: ModelConnection): AgentPipeline;
  createCloudSplit(
    visionConnection: ModelConnection,
    plannerConnection: ModelConnection,
  ): AgentPipeline;
  createLocalSplit(
    plannerConnection: ModelConnection,
    localModelId: 'minicpm-v-4.6-q4',
  ): AgentPipeline;
}

export interface RuntimeViewportAdapter {
  getDimensions(): ViewportDimensions | PromiseLike<ViewportDimensions>;
}

export type AgentRuntimeConfigurationErrorCode =
  | 'invalid_active_configuration'
  | 'credential_unavailable';

export const AGENT_RUNTIME_ABORTED = 'agent_runtime_aborted' as const;

export class AgentRuntimeAbortError extends Error {
  readonly name = 'AbortError';
  readonly code = AGENT_RUNTIME_ABORTED;

  constructor() {
    super(AGENT_RUNTIME_ABORTED);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AgentRuntimeConfigurationError extends Error {
  readonly name = 'AgentRuntimeConfigurationError';

  constructor(
    readonly code: AgentRuntimeConfigurationErrorCode,
    readonly validationErrors: readonly AgentConfigError[] = [],
  ) {
    super(code);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface AgentRuntimeDependencies {
  readonly configSource: RuntimeConfigurationSource;
  readonly credentialResolver: CredentialResolver;
  readonly pipelineFactory: RuntimePipelineFactory;
  readonly viewportAdapter: RuntimeViewportAdapter;
  readonly now?: () => number;
}

const cloneAndFreeze = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(item => cloneAndFreeze(item))) as T;
  }
  if (value !== null && typeof value === 'object') {
    const copy = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cloneAndFreeze(item),
      ]),
    );
    return Object.freeze(copy) as T;
  }
  return value;
};

const requiredConnectionIds = (
  snapshot: RuntimeTaskSnapshot,
): readonly string[] => {
  const {config} = snapshot;
  switch (config.activeMode) {
    case 'cloud_direct':
      return config.modeDrafts.cloudDirect.modelConnectionId
        ? [config.modeDrafts.cloudDirect.modelConnectionId]
        : [];
    case 'cloud_split':
      return [
        config.modeDrafts.cloudSplit.visionConnectionId,
        config.modeDrafts.cloudSplit.plannerConnectionId,
      ].filter((id): id is string => id !== undefined);
    case 'local_vision_cloud_planner':
      return config.modeDrafts.localVisionCloudPlanner.plannerConnectionId
        ? [config.modeDrafts.localVisionCloudPlanner.plannerConnectionId]
        : [];
  }
};

const connectionById = (
  snapshot: RuntimeTaskSnapshot,
  id: string | undefined,
): ModelConnection => {
  const connection = id === undefined ? undefined : snapshot.connections[id];
  if (connection === undefined) {
    throw new AgentRuntimeConfigurationError('invalid_active_configuration', [
      'connection_missing',
    ]);
  }
  return connection;
};

const previousDecision = (
  history: readonly RuntimeHistoryEntry[],
): RuntimeHistoryEntry['decision'] => {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].decision !== undefined) {
      return history[index].decision;
    }
  }
  return undefined;
};

const throwIfRuntimeAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new AgentRuntimeAbortError();
  }
};

export class AgentRuntime {
  private readonly now: () => number;

  constructor(private readonly dependencies: AgentRuntimeDependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  async createTaskSnapshot(): Promise<RuntimeTaskSnapshot> {
    const snapshot = cloneAndFreeze(
      this.dependencies.configSource.createTaskSnapshot(),
    );
    const validation = validateAgentConfig(
      snapshot.config,
      Object.values(snapshot.connections),
      snapshot.eligibility,
    );
    if (!validation.ok) {
      throw new AgentRuntimeConfigurationError(
        'invalid_active_configuration',
        Object.freeze([...validation.errors]),
      );
    }

    for (const id of new Set(requiredConnectionIds(snapshot))) {
      const connection = connectionById(snapshot, id);
      const credential = await this.dependencies.credentialResolver.resolve(
        connection.secretRef,
      );
      if (typeof credential !== 'string' || credential.trim().length === 0) {
        throw new AgentRuntimeConfigurationError('credential_unavailable');
      }
    }

    return snapshot;
  }

  async decideStep(
    snapshot: RuntimeTaskSnapshot,
    input: RuntimeStepInput,
  ): Promise<RuntimeStepResult> {
    throwIfRuntimeAborted(input.signal);
    const startedAt = this.now();
    const history = cloneAndFreeze(input.history);
    const pipelineInput: StepInput = Object.freeze({
      screenshotUri: input.screenshotUri,
      instruction: input.instruction,
      history,
      signal: input.signal,
    });
    const mode = snapshot.config.activeMode;
    const pipeline = this.pipelineFor(snapshot);
    let output: Awaited<ReturnType<AgentPipeline['decide']>>;
    try {
      output = await pipeline.decide(pipelineInput);
    } catch (error) {
      throwIfRuntimeAborted(input.signal);
      throw error;
    }
    throwIfRuntimeAborted(input.signal);
    const observation =
      mode === 'cloud_direct' ? undefined : output.observation;
    const decision = validateActionDecision(output.decision, observation, {
      previousDecision: previousDecision(history),
      stateChangedSincePreviousAction: input.stateChangedSincePreviousAction,
    });
    let viewport: ViewportDimensions;
    try {
      viewport = await this.dependencies.viewportAdapter.getDimensions();
    } catch (error) {
      throwIfRuntimeAborted(input.signal);
      throw error;
    }
    throwIfRuntimeAborted(input.signal);
    const taskAction = toTaskAction(decision, observation, viewport);
    const diagnostics = Object.freeze({
      mode,
      durationMs: Math.max(0, this.now() - startedAt),
    });

    return Object.freeze({
      decision,
      ...(observation === undefined ? {} : {observation}),
      taskAction,
      diagnostics,
    });
  }

  private pipelineFor(snapshot: RuntimeTaskSnapshot): AgentPipeline {
    const {config} = snapshot;
    switch (config.activeMode) {
      case 'cloud_direct':
        return this.dependencies.pipelineFactory.createDirect(
          connectionById(
            snapshot,
            config.modeDrafts.cloudDirect.modelConnectionId,
          ),
        );
      case 'cloud_split':
        return this.dependencies.pipelineFactory.createCloudSplit(
          connectionById(
            snapshot,
            config.modeDrafts.cloudSplit.visionConnectionId,
          ),
          connectionById(
            snapshot,
            config.modeDrafts.cloudSplit.plannerConnectionId,
          ),
        );
      case 'local_vision_cloud_planner':
        return this.dependencies.pipelineFactory.createLocalSplit(
          connectionById(
            snapshot,
            config.modeDrafts.localVisionCloudPlanner.plannerConnectionId,
          ),
          config.modeDrafts.localVisionCloudPlanner.localModelId,
        );
    }
  }
}
