import fs from 'node:fs';
import path from 'node:path';
import {DeviceEventEmitter} from 'react-native';
import {NativeTaskUiEventSource} from '../../../features/task/services/NativeTaskUiEventSource';
import {TASK_UI_EVENT_NAME} from '../../../features/task/services/TaskUiEventNames';
import type {TaskUiEvent} from '../../../application/facades/UiRuntimeContracts';

describe('task-scoped runtime channel: execution entrypoints', () => {
  it('contains no legacy global event names in execution entrypoints', () => {
    const files = [
      'src/features/task/hooks/useTaskExecution.ts',
      'src/features/task/useTaskExecutionWithBackground.ts',
      'src/features/task/services/TaskExecutionHeadless.ts',
      'src/core/engine/taskEngine/task/TaskExecutionEngine.ts',
      'src/core/engine/taskEngine/task/modules/TaskStateModule.ts',
      'src/core/engine/taskEngine/task/modules/CancellationModule.ts',
    ];
    const text = files
      .map(file => fs.readFileSync(path.resolve(file), 'utf8'))
      .join('\n');
    expect(text).not.toMatch(
      /TaskStarted|TaskStepStarted|TaskStepCompleted|TaskCompleted|TaskFailed|TaskCancelRequested|taskId:\s*['"]current['"]/,
    );
    expect(text).not.toMatch(/modelInferenceModule|while\s*\(step\s*</);
  });
});

describe('task-scoped runtime channel: NativeTaskUiEventSource fail-closed validation', () => {
  const validStarted = {
    type: 'started',
    taskId: 'task-1',
    sessionRevision: 1,
    sequence: 0,
    occurredAtMs: 1720000000000,
    maxSteps: 10,
  };

  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    DeviceEventEmitter.removeAllListeners(TASK_UI_EVENT_NAME);
  });

  function collectDelivered(raw: unknown): TaskUiEvent[] {
    const source = new NativeTaskUiEventSource();
    const delivered: TaskUiEvent[] = [];
    const unsubscribe = source.subscribe(event => delivered.push(event));
    try {
      DeviceEventEmitter.emit(TASK_UI_EVENT_NAME, raw);
    } finally {
      unsubscribe();
    }
    return delivered;
  }

  it('delivers a well-formed started event through the real source', () => {
    const delivered = collectDelivered(validStarted);
    expect(delivered).toEqual([validStarted]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('drops an event with an unknown type', () => {
    expect(collectDelivered({...validStarted, type: 'bogus'})).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('drops an event with an empty taskId', () => {
    expect(collectDelivered({...validStarted, taskId: ''})).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('drops an event with a non-positive sessionRevision', () => {
    expect(collectDelivered({...validStarted, sessionRevision: 0})).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('drops an event with a non-integer sequence', () => {
    expect(collectDelivered({...validStarted, sequence: 1.5})).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('drops an event with a negative sequence', () => {
    expect(collectDelivered({...validStarted, sequence: -1})).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('never logs the raw payload on drop, only the fixed reason code', () => {
    collectDelivered({...validStarted, taskId: '', secret: 'do-not-log'});
    const logged = warnSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('task_ui_event_rejected');
    expect(logged).not.toContain('do-not-log');
  });
});
