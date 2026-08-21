import {ScopedTaskUiEvents} from '../events/ScopedTaskUiEvents';
import type {
  OperateApplicationPort,
  OperateFacade,
  OperateTaskViewState,
  StartOperateResult,
  TaskUiEvent,
  TaskUiEventSource,
  Unsubscribe,
} from './UiRuntimeContracts';

export class DefaultOperateFacade implements OperateFacade {
  private readonly events: ScopedTaskUiEvents;

  constructor(
    private readonly port: OperateApplicationPort,
    source: TaskUiEventSource,
  ) {
    this.events = new ScopedTaskUiEvents(source);
  }

  getViewState(): Promise<OperateTaskViewState> {
    return this.port.getCurrent();
  }

  start(instruction: string): Promise<StartOperateResult> {
    const trimmed = instruction.trim();
    if (trimmed.length === 0) {
      throw new Error('Operate instruction must not be empty');
    }
    return this.port.start(trimmed);
  }

  cancel(taskId: string): Promise<void> {
    return this.port.cancel(taskId);
  }

  subscribeTask(
    taskId: string,
    sessionRevision: number,
    listener: (event: TaskUiEvent) => void,
  ): Unsubscribe {
    return this.events.subscribe(taskId, sessionRevision, listener);
  }
}
