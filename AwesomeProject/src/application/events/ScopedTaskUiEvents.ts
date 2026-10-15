import type {
  TaskUiEvent,
  TaskUiEventSource,
  Unsubscribe,
} from '../facades/UiRuntimeContracts';

export class ScopedTaskUiEvents {
  constructor(private readonly source: TaskUiEventSource) {}

  subscribe(
    taskId: string,
    sessionRevision: number,
    listener: (event: TaskUiEvent) => void,
  ): Unsubscribe {
    let lastSequence = -1;
    return this.source.subscribe(event => {
      if (event.taskId !== taskId || event.sessionRevision !== sessionRevision) {
        return;
      }
      if (!Number.isInteger(event.sequence) || event.sequence <= lastSequence) {
        return;
      }
      lastSequence = event.sequence;
      listener(event);
    });
  }
}
