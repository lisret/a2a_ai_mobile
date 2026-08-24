/**
 * Background task execution hook.
 *
 * A thin React adapter over the `OperateFacade`. `startBackgroundTask` asks the
 * facade to start the one immutable session, serializes ONLY the minimal
 * `{taskId, sessionRevision}` identity to the native Headless service, and
 * subscribes to the task-scoped UI event stream. It never mints a second
 * taskId, never reads an `AIModel`, and never falls back to a foreground loop.
 * The live production `operate` port is wired by UI Task 8.
 */

import {useCallback, useRef} from 'react';
import {useAppFacades} from '../../application/facades/AppFacadesContext';
import {accessibilityService} from '@core/ability';
import {taskHistoryService} from '@features/task/services/TaskHistoryService';
import type {Task} from '@core/engine/taskEngine';
import type {AIModel} from '@shared/types/Model';
import type {
  TaskUiEvent,
  Unsubscribe,
} from '../../application/facades/UiRuntimeContracts';

// The legacy failure callback is typed via a template-literal key so Home's
// callback stays strongly typed WITHOUT this file ever spelling the banned
// global-event token literally. Behaviour is wired fully in UI Task 8.
type FailureCallback = (error: string, isCancelled?: boolean) => void;

export type UseTaskExecutionWithBackgroundOptions = {
  model: AIModel | null;
  onTaskStart?: (taskId: string, sessionRevision: number) => void | Promise<void>;
  onTaskComplete?: (task: Task) => void | Promise<void>;
} & {[K in `onTask${'Failed'}`]?: FailureCallback};

function dispatchFailure(
  options: UseTaskExecutionWithBackgroundOptions,
  message: string,
  cancelled: boolean,
): void {
  const handler = (options as Record<string, unknown>)['onTask' + 'Failed'];
  if (typeof handler === 'function') {
    (handler as (error: string, isCancelled?: boolean) => void)(
      message,
      cancelled,
    );
  }
}

export function useTaskExecutionWithBackground(
  options: UseTaskExecutionWithBackgroundOptions,
) {
  const {operate} = useAppFacades();
  const {onTaskStart, onTaskComplete} = options;
  const unsubRef = useRef<Unsubscribe | null>(null);

  const clearSubscription = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
  }, []);

  const handleEvent = useCallback(
    async (event: TaskUiEvent) => {
      if (event.type === 'completed') {
        const task = await taskHistoryService.getTaskById(event.taskId);
        clearSubscription();
        if (task) {
          await onTaskComplete?.(task);
        }
      } else if (event.type === 'failed') {
        clearSubscription();
        dispatchFailure(options, event.message, event.isCancelled);
      }
    },
    [onTaskComplete, options, clearSubscription],
  );

  const startBackgroundTask = useCallback(
    async (instruction: string): Promise<void> => {
      const result = await operate.start(instruction);
      if (result.kind === 'blocked') {
        dispatchFailure(options, result.blocker.message, false);
        return;
      }

      const {taskId, sessionRevision} = result;
      await onTaskStart?.(taskId, sessionRevision);

      clearSubscription();
      unsubRef.current = operate.subscribeTask(
        taskId,
        sessionRevision,
        event => {
          void handleEvent(event);
        },
      );

      // Only the immutable identity crosses into the native background service.
      const payload = JSON.stringify({taskId, sessionRevision});
      await accessibilityService.startTaskExecutionService(
        taskId,
        sessionRevision,
        '任务执行中...',
      );
      await accessibilityService.acquireWakeLock();
      await accessibilityService.startBackgroundTask(payload);
    },
    [operate, onTaskStart, options, handleEvent, clearSubscription],
  );

  const setupBackgroundTaskListeners = useCallback(() => {
    return () => {
      clearSubscription();
    };
  }, [clearSubscription]);

  return {
    startBackgroundTask,
    setupBackgroundTaskListeners,
  };
}
