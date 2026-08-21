// The only production task loop (runtime-foundation Task 7). Every dependency
// is injected through `OperateTaskRunnerPorts`; no Hook, Headless, Screen, or
// compatibility engine may hold a second `while` loop or call
// `SnapshotAgentRuntimePort.decideStep` directly.
import type {
  Task,
  TaskAction,
  TaskStatus,
  TaskStep,
} from '@core/engine/taskEngine/types/Task';
import type {RuntimeHistoryEntry} from '@core/engine/agentRuntime/contracts/AgentContracts';
import type {OperateSessionLease} from '@core/engine/operateRuntime/contracts/OperateSessionContracts';
import type {
  VisualAgentCapabilitySet,
  VisualAgentExecutionPort,
  VisualAgentProfileV1,
  VisualAgentTaskEnvelopeV1,
  VisualAgentTaskEvent,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';
import type {
  DistributiveOmit,
  OperateTaskEvent,
  OperateTaskOutcome,
  OperateTaskRunnerPorts,
} from './OperateTaskPorts';

type EmitPayload = DistributiveOmit<
  OperateTaskEvent,
  'taskId' | 'sessionRevision' | 'sequence'
>;
type Emit = (event: EmitPayload) => Promise<void>;

const MAX_CONSECUTIVE_ERRORS = 3;
const STEP_DELAY_MS = 300;
const ERROR_RETRY_DELAY_MS = 500;

class OperateTaskAbortError extends Error {
  constructor() {
    super('operate_task_aborted');
  }
}

interface TaskPersistContext {
  readonly taskId: string;
  readonly modelId: string;
  readonly instruction: string;
  readonly createdAt: number;
}

const modelIdForSession = (session: OperateSessionLease['session']): string =>
  session.modelBindings.direct?.modelId ??
  session.modelBindings.vision?.modelId ??
  session.modelBindings.planner?.modelId ??
  session.localModelId ??
  session.visualAgent?.toolId ??
  'unknown';

const maxStepsForSession = (
  session: OperateSessionLease['session'],
): number => {
  switch (session.channel) {
    case 'cloud_direct':
      return session.modelBindings.direct?.maxSteps ?? 1;
    case 'cloud_split':
    case 'local_vision_cloud_planner':
      return session.modelBindings.planner?.maxSteps ?? 1;
    case 'visual_agent':
      return 1;
  }
};

const deferred = <T>(): {promise: Promise<T>; resolve: (value: T) => void} => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return {promise, resolve};
};

export class OperateTaskRunner {
  constructor(private readonly ports: OperateTaskRunnerPorts) {}

  async run(lease: OperateSessionLease): Promise<OperateTaskOutcome> {
    try {
      if (lease.session.channel === 'visual_agent') {
        return await this.runVisualAgent(lease);
      }
      return await this.runModelLoop(lease);
    } finally {
      await lease.release();
    }
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new OperateTaskAbortError();
    }
  }

  private buildTask(
    ctx: TaskPersistContext,
    steps: readonly TaskStep[],
    status: TaskStatus,
    error?: string,
    summary?: string,
  ): Task {
    const terminal = status === 'success' || status === 'failed';
    return {
      id: ctx.taskId,
      modelId: ctx.modelId,
      instruction: ctx.instruction,
      status,
      error,
      createdAt: ctx.createdAt,
      completedAt: terminal ? this.ports.now() : undefined,
      output: {steps: [...steps], summary},
    };
  }

  private async tryPersist(task: Task): Promise<boolean> {
    try {
      await this.ports.history.saveTask(task);
      return true;
    } catch {
      return false;
    }
  }

  private async runModelLoop(
    lease: OperateSessionLease,
  ): Promise<OperateTaskOutcome> {
    const {session, signal} = lease;
    const taskId = session.taskId;
    let sequence = 0;
    const emit: Emit = async event => {
      sequence += 1;
      await this.ports.events.emit({
        taskId,
        sessionRevision: session.sessionRevision,
        sequence,
        ...event,
      } as OperateTaskEvent);
    };

    const instruction = await this.ports.instruction.load(taskId);
    if (instruction === null || instruction.trim().length === 0) {
      return this.finishFailed(
        lease,
        [],
        'operate_task_instruction_missing',
        emit,
        {
          taskId,
          modelId: modelIdForSession(session),
          instruction: '',
          createdAt: this.ports.now(),
        },
      );
    }

    const existingTask = await this.ports.history.getTaskById(taskId);
    const ctx: TaskPersistContext = {
      taskId,
      modelId: modelIdForSession(session),
      instruction,
      createdAt: existingTask?.createdAt ?? this.ports.now(),
    };
    const maxSteps = maxStepsForSession(session);
    const steps: TaskStep[] = [];
    const history: RuntimeHistoryEntry[] = [];
    let consecutiveErrors = 0;

    const initialTask = this.buildTask(ctx, steps, 'running');
    const initialSaved = await this.tryPersist(initialTask);
    if (signal.aborted) {
      return this.finishCancelled(lease, steps, emit, ctx);
    }
    if (!initialSaved) {
      return this.finishFailed(
        lease,
        steps,
        'operate_task_initial_persist_failed',
        emit,
        ctx,
      );
    }
    await emit({type: 'taskStarted'});
    if (signal.aborted) {
      return this.finishCancelled(lease, steps, emit, ctx);
    }

    for (let step = 1; step <= maxSteps; step += 1) {
      if (signal.aborted) {
        return this.finishCancelled(lease, steps, emit, ctx);
      }
      await emit({type: 'stepStarted', step, maxSteps});
      if (signal.aborted) {
        return this.finishCancelled(lease, steps, emit, ctx);
      }

      try {
        const screenshotUri = await this.ports.screenshot.capture(signal);
        this.throwIfAborted(signal);

        const stepResult = await this.ports.snapshotAgentRuntime.decideStep(
          session,
          {
            screenshotUri,
            instruction,
            history: [...history],
            signal,
          },
        );
        this.throwIfAborted(signal);

        history.push({
          step,
          ...(stepResult.observation === undefined
            ? {}
            : {observation: stepResult.observation}),
          decision: stepResult.decision,
        });
        const taskAction: TaskAction = stepResult.taskAction;
        await emit({type: 'actionPlanned', step, action: taskAction});
        this.throwIfAborted(signal);

        if (taskAction.type === 'complete') {
          steps.push({
            step,
            action: taskAction.type,
            timestamp: this.ports.now(),
            actionDetails: taskAction,
          });
          return this.finishSuccess(
            lease,
            steps,
            emit,
            ctx,
            taskAction.message,
          );
        }

        if (taskAction.requiresConfirmation) {
          const confirmed = await this.ports.confirmation.confirm(
            taskAction,
            signal,
          );
          this.throwIfAborted(signal);
          if (!confirmed) {
            return this.finishFailed(
              lease,
              steps,
              'operate_task_confirmation_rejected',
              emit,
              ctx,
            );
          }
        }

        await this.ports.action.execute(taskAction, signal);
        this.throwIfAborted(signal);

        steps.push({
          step,
          action: taskAction.type,
          timestamp: this.ports.now(),
          actionDetails: taskAction,
        });
        const runningTask = this.buildTask(ctx, steps, 'running');
        const runningSaved = await this.tryPersist(runningTask);
        if (signal.aborted) {
          return this.finishCancelled(lease, steps, emit, ctx);
        }
        if (!runningSaved) {
          return this.finishFailed(
            lease,
            steps,
            'operate_task_step_persist_failed',
            emit,
            ctx,
          );
        }
        await emit({type: 'stepCompleted', step});
        this.throwIfAborted(signal);
        consecutiveErrors = 0;
        await this.ports.delay(STEP_DELAY_MS, signal);
        this.throwIfAborted(signal);
      } catch (error) {
        if (signal.aborted) {
          return this.finishCancelled(lease, steps, emit, ctx);
        }
        consecutiveErrors += 1;
        const message = error instanceof Error ? error.message : String(error);
        steps.push({
          step,
          action: `error:${message}`,
          timestamp: this.ports.now(),
        });
        const errorTask = this.buildTask(ctx, steps, 'running');
        const errorSaved = await this.tryPersist(errorTask);
        if (signal.aborted) {
          return this.finishCancelled(lease, steps, emit, ctx);
        }
        if (!errorSaved) {
          return this.finishFailed(
            lease,
            steps,
            'operate_task_error_persist_failed',
            emit,
            ctx,
          );
        }
        await emit({type: 'stepError', step, error: message});
        if (signal.aborted) {
          return this.finishCancelled(lease, steps, emit, ctx);
        }
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          return this.finishFailed(
            lease,
            steps,
            `operate_task_max_consecutive_errors:${MAX_CONSECUTIVE_ERRORS}`,
            emit,
            ctx,
          );
        }
        await this.ports.delay(ERROR_RETRY_DELAY_MS, signal);
        if (signal.aborted) {
          return this.finishCancelled(lease, steps, emit, ctx);
        }
      }
    }

    if (signal.aborted) {
      return this.finishCancelled(lease, steps, emit, ctx);
    }
    return this.finishFailed(
      lease,
      steps,
      `operate_task_max_steps:${maxSteps}`,
      emit,
      ctx,
    );
  }

  private async finishSuccess(
    lease: OperateSessionLease,
    steps: readonly TaskStep[],
    emit: Emit,
    ctx: TaskPersistContext,
    summary: string | undefined,
  ): Promise<OperateTaskOutcome> {
    const task = this.buildTask(
      ctx,
      steps,
      'success',
      undefined,
      summary || 'operate task completed',
    );
    const saved = await this.tryPersist(task);
    if (!saved) {
      return this.finishFailed(
        lease,
        steps,
        'operate_task_terminal_persist_failed',
        emit,
        ctx,
      );
    }
    await lease.markTerminal('success');
    await emit({type: 'taskCompleted', step: steps.length});
    return {kind: 'success'};
  }

  private async finishFailed(
    lease: OperateSessionLease,
    steps: readonly TaskStep[],
    error: string,
    emit: Emit,
    ctx: TaskPersistContext,
  ): Promise<OperateTaskOutcome> {
    const task = this.buildTask(ctx, steps, 'failed', error);
    await this.tryPersist(task);
    await lease.markTerminal('failed');
    await emit({type: 'taskFailed', error, isCancelled: false});
    return {kind: 'failed', error};
  }

  private async finishCancelled(
    lease: OperateSessionLease,
    steps: readonly TaskStep[],
    emit: Emit,
    ctx: TaskPersistContext,
  ): Promise<OperateTaskOutcome> {
    const reason = 'operate_task_cancelled';
    const task = this.buildTask(ctx, steps, 'failed', reason);
    await this.tryPersist(task);
    await lease.markTerminal('cancelled');
    await emit({type: 'taskFailed', error: reason, isCancelled: true});
    return {kind: 'cancelled', reason};
  }

  private async runVisualAgent(
    lease: OperateSessionLease,
  ): Promise<OperateTaskOutcome> {
    const {session, signal} = lease;
    const taskId = session.taskId;
    let sequence = 0;
    const emit = async (event: EmitPayload): Promise<void> => {
      sequence += 1;
      await this.ports.events.emit({
        taskId,
        sessionRevision: session.sessionRevision,
        sequence,
        ...event,
      } as OperateTaskEvent);
    };

    const visualAgent = session.visualAgent;
    if (!visualAgent) {
      await lease.markTerminal('failed');
      await emit({
        type: 'taskFailed',
        error: 'operate_task_visual_agent_missing',
        isCancelled: false,
      });
      return {kind: 'failed', error: 'operate_task_visual_agent_missing'};
    }

    const instruction = await this.ports.instruction.load(taskId);
    if (instruction === null || instruction.trim().length === 0) {
      await lease.markTerminal('failed');
      await emit({
        type: 'taskFailed',
        error: 'operate_task_instruction_missing',
        isCancelled: false,
      });
      return {kind: 'failed', error: 'operate_task_instruction_missing'};
    }

    const adapter = this.ports.visualAgentRegistry.require(visualAgent.toolId);
    const profile: VisualAgentProfileV1 = {
      schemaVersion: 1,
      profileId: visualAgent.profileId,
      toolId: visualAgent.toolId,
      enabled: true,
      connector: visualAgent.connector,
      requestedCapabilities: visualAgent.negotiatedCapabilities,
    };
    const execution: VisualAgentExecutionPort = adapter.create(profile);

    const outcomeGate = deferred<OperateTaskOutcome>();
    let settled = false;
    const settle = (outcome: OperateTaskOutcome): void => {
      if (!settled) {
        settled = true;
        outcomeGate.resolve(outcome);
      }
    };

    const unsubscribe = execution.subscribe(event => {
      this.handleVisualAgentEvent(event, execution, lease, emit, settle).catch(
        () => undefined,
      );
    });

    const onAbort = (): void => {
      execution
        .cancel({taskId, sessionRevision: session.sessionRevision}, signal)
        .catch(() => undefined);
    };
    signal.addEventListener('abort', onAbort, {once: true});

    try {
      if (signal.aborted) {
        onAbort();
      }
      const negotiated: VisualAgentCapabilitySet = await execution.connect(
        profile,
        signal,
      );
      this.throwIfAborted(signal);
      if (
        (visualAgent.negotiatedCapabilities.imageInput &&
          !negotiated.imageInput) ||
        (visualAgent.negotiatedCapabilities.structuredAction &&
          !negotiated.structuredAction)
      ) {
        throw new Error('visual_agent_capability_unsupported');
      }

      const image = await this.ports.visualAgentImage.capture(signal);
      this.throwIfAborted(signal);

      const envelope: VisualAgentTaskEnvelopeV1 = {
        protocolVersion: 1,
        taskId,
        sessionRevision: session.sessionRevision,
        profileId: visualAgent.profileId,
        instruction,
        idempotencyKey: `${taskId}:${session.sessionRevision}`,
        requiredCapabilities: visualAgent.negotiatedCapabilities,
        image,
      };
      await execution.execute(envelope, signal);
      this.throwIfAborted(signal);

      return await outcomeGate.promise;
    } catch (error) {
      if (!settled) {
        if (signal.aborted) {
          await lease.markTerminal('cancelled');
          await emit({
            type: 'taskFailed',
            error: 'operate_task_cancelled',
            isCancelled: true,
          });
          settle({kind: 'cancelled', reason: 'operate_task_cancelled'});
        } else {
          const message =
            error instanceof Error ? error.message : String(error);
          await lease.markTerminal('failed');
          await emit({type: 'taskFailed', error: message, isCancelled: false});
          settle({kind: 'failed', error: message});
        }
      }
      return outcomeGate.promise;
    } finally {
      signal.removeEventListener('abort', onAbort);
      unsubscribe();
    }
  }

  private async handleVisualAgentEvent(
    event: VisualAgentTaskEvent,
    execution: VisualAgentExecutionPort,
    lease: OperateSessionLease,
    emit: Emit,
    settle: (outcome: OperateTaskOutcome) => void,
  ): Promise<void> {
    if (event.type === 'status' && event.status === 'waiting_approval') {
      const decision = await this.ports.visualAgentApproval.decide(
        event.approvalId,
        lease.signal,
      );
      await execution.resolveApproval(
        {
          taskId: event.taskId,
          sessionRevision: event.sessionRevision,
          approvalId: event.approvalId,
          decision,
        },
        lease.signal,
      );
      return;
    }
    if (event.type !== 'terminal') {
      return;
    }
    if (event.status === 'completed') {
      await lease.markTerminal('success');
      await emit({type: 'taskCompleted', step: 0});
      settle({kind: 'success'});
    } else if (event.status === 'cancelled') {
      await lease.markTerminal('cancelled');
      await emit({
        type: 'taskFailed',
        error: 'operate_task_cancelled',
        isCancelled: true,
      });
      settle({kind: 'cancelled', reason: 'operate_task_cancelled'});
    } else {
      await lease.markTerminal('failed');
      await emit({
        type: 'taskFailed',
        error: event.errorCode,
        isCancelled: false,
      });
      settle({kind: 'failed', error: event.errorCode});
    }
  }
}
