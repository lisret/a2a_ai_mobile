// Runner-owned ports (runtime-foundation Task 7, Wave 1B Agent C scope).
// `OperateTaskRunner` is the only production task loop; every dependency below
// is injected so callers never construct a second loop or reach into a
// provider/transport implementation directly.
import type {TaskAction} from '@core/engine/taskEngine/types/Task';
import type {Task} from '@core/engine/taskEngine/types/Task';
import type {TaskInstructionPort} from '@core/engine/operateRuntime/ports/TaskInstructionPort';
import type {
  ModelBindingV1,
  ModelProviderRegistry,
  ProviderChatMessageV1,
  ProviderChatResultV1,
  ProviderExecutionTargetV1,
} from '@core/engine/operateRuntime/model/ModelProviderContracts';
import type {ResolvedModelBindingSnapshotV1} from '@core/engine/operateRuntime/contracts/OperateSessionContracts';
import type {
  VisualAgentTaskEnvelopeV1,
  VisualAgentTaskEvent,
  VisualAgentToolRegistry,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

export interface OperateTaskEventBase {
  readonly taskId: string;
  readonly sessionRevision: number;
  readonly sequence: number;
}

/** Distributes `Omit` over each member of a discriminated union instead of
 * collapsing to the members' common keys. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type OperateTaskEvent = OperateTaskEventBase &
  (
    | {readonly type: 'taskStarted'}
    | {
        readonly type: 'stepStarted';
        readonly step: number;
        readonly maxSteps: number;
      }
    | {
        readonly type: 'actionPlanned';
        readonly step: number;
        readonly action: TaskAction;
      }
    | {readonly type: 'stepCompleted'; readonly step: number}
    | {
        readonly type: 'stepError';
        readonly step: number;
        readonly error: string;
      }
    | {readonly type: 'taskCompleted'; readonly step: number}
    | {
        readonly type: 'taskFailed';
        readonly error: string;
        readonly isCancelled: boolean;
      }
    | {readonly type: 'visualAgentEvent'; readonly event: VisualAgentTaskEvent}
  );

export type OperateTaskOutcome =
  | {readonly kind: 'success'}
  | {readonly kind: 'failed'; readonly error: string}
  | {readonly kind: 'cancelled'; readonly reason: string};

/** The only Task 7 owner of the immutable snapshot-to-transport join. */
export interface RegistryModelChatPort {
  send(
    snapshot: ResolvedModelBindingSnapshotV1,
    messages: readonly ProviderChatMessageV1[],
    signal: AbortSignal,
  ): Promise<ProviderChatResultV1>;
}

export const executionTargetFromModelSnapshot = (
  snapshot: ResolvedModelBindingSnapshotV1,
): ProviderExecutionTargetV1 => ({
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
});

export const bindingFromModelSnapshot = (
  snapshot: ResolvedModelBindingSnapshotV1,
): ModelBindingV1 => ({
  id: snapshot.bindingId,
  role: snapshot.role,
  profileId: snapshot.profileId,
  modelId: snapshot.modelId,
  maxSteps: snapshot.maxSteps,
});

/**
 * Reconstructs the immutable execution target/binding from a frozen snapshot
 * and dispatches through the exact registry-resolved transport. Never calls
 * `resolveExecutionTarget`: that normalization already happened before the
 * session was persisted.
 */
export class RegistryModelChatAdapter implements RegistryModelChatPort {
  constructor(private readonly registry: ModelProviderRegistry) {}

  async send(
    snapshot: ResolvedModelBindingSnapshotV1,
    messages: readonly ProviderChatMessageV1[],
    signal: AbortSignal,
  ): Promise<ProviderChatResultV1> {
    const target = executionTargetFromModelSnapshot(snapshot);
    const binding = bindingFromModelSnapshot(snapshot);
    const transport = this.registry.resolveTransport(target);
    if (transport.id !== target.transportAdapterId) {
      throw new Error('model_transport_snapshot_mismatch');
    }
    return transport.sendChat({
      target,
      binding,
      messages,
      signal,
      timeoutMs: 30_000,
    });
  }
}

export interface OperateTaskHistoryPort {
  saveTask(task: Task): Promise<void>;
  getTaskById(taskId: string): Promise<Task | null>;
}

export interface OperateTaskRunnerPorts {
  readonly instruction: TaskInstructionPort;
  readonly screenshot: {
    capture(signal: AbortSignal): Promise<string>;
  };
  readonly snapshotAgentRuntime: import('./SnapshotAgentRuntimeAdapter').SnapshotAgentRuntimePort;
  readonly visualAgentRegistry: VisualAgentToolRegistry;
  readonly visualAgentImage: {
    capture(
      signal: AbortSignal,
    ): Promise<NonNullable<VisualAgentTaskEnvelopeV1['image']>>;
  };
  readonly visualAgentApproval: {
    decide(
      approvalId: string,
      signal: AbortSignal,
    ): Promise<'approve' | 'reject'>;
  };
  readonly action: {
    execute(action: TaskAction, signal: AbortSignal): Promise<void>;
  };
  readonly confirmation: {
    confirm(action: TaskAction, signal: AbortSignal): Promise<boolean>;
  };
  readonly history: OperateTaskHistoryPort;
  readonly events: {emit(event: OperateTaskEvent): void | Promise<void>};
  readonly now: () => number;
  readonly delay: (ms: number, signal: AbortSignal) => Promise<void>;
}
