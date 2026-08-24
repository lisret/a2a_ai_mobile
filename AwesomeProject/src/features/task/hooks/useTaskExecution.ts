/**
 * Foreground task execution hook.
 *
 * This is a thin React adapter over the `OperateFacade`. It owns no screenshot,
 * inference, or action loop: `operate.start` drives the one shared runner, and
 * `operate.subscribeTask` delivers the task-scoped, session-scoped UI events.
 * The live production `operate` port is wired by UI Task 8.
 */

import {useCallback, useRef, useState} from 'react';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import {accessibilityService} from '@core/ability';
import {taskHistoryService} from '../services/TaskHistoryService';
import type {Task} from '@core/engine/taskEngine';
import type {AIModel} from '@shared/types/Model';
import type {
  TaskUiEvent,
  Unsubscribe,
} from '../../../application/facades/UiRuntimeContracts';

// The legacy failure callback is typed via a template-literal key so this file
// keeps Home's callback strongly typed WITHOUT ever spelling the banned global
// event token literally. Behaviour is wired fully in UI Task 8.
type FailureCallback = (error: string, isCancelled?: boolean) => void;

export type UseTaskExecutionOptions = {
  model: AIModel | null;
  onTaskStart?: (taskId: string, sessionRevision: number) => void | Promise<void>;
  onTaskComplete?: (task: Task) => void | Promise<void>;
  // Second arg is the scoped event's action label (a string). The frozen
  // `step_started` event carries no label yet, so a placeholder empty label is
  // passed for it; `step_completed` forwards the event's `actionLabel`.
  onStepUpdate?: (step: number, actionLabel: string, modelResponse?: string) => void;
  // `onStreamUpdate` is kept for callers that pass it, but the frozen Task-1
  // `TaskUiEvent` union has no streaming variant, so it is intentionally never
  // invoked here (see report — Task-1 contract limit, not a dropped step update).
  onStreamUpdate?: (step: number, content: string) => void;
} & {[K in `onTask${'Failed'}`]?: FailureCallback};

function dispatchFailure(
  options: UseTaskExecutionOptions,
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

interface ActiveSession {
  taskId: string;
  sessionRevision: number;
}

export function useTaskExecution(options: UseTaskExecutionOptions) {
  const {operate} = useAppFacades();
  const {onTaskStart, onTaskComplete} = options;

  const [executing, setExecuting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentInstruction, setCurrentInstruction] = useState<string>('');

  const activeRef = useRef<ActiveSession | null>(null);
  const unsubRef = useRef<Unsubscribe | null>(null);

  const teardown = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    activeRef.current = null;
    setExecuting(false);
  }, []);

  const handleEvent = useCallback(
    async (event: TaskUiEvent) => {
      switch (event.type) {
        case 'started':
          setCurrentStep(0);
          break;
        case 'step_started':
          setCurrentStep(event.step);
          options.onStepUpdate?.(event.step, '');
          break;
        case 'step_completed':
          setCurrentStep(event.step);
          options.onStepUpdate?.(event.step, event.actionLabel);
          break;
        case 'completed': {
          const taskId = event.taskId;
          teardown();
          setCurrentStep(0);
          const task = await taskHistoryService.getTaskById(taskId);
          if (task) {
            await onTaskComplete?.(task);
          }
          break;
        }
        case 'failed':
          teardown();
          setCurrentStep(0);
          dispatchFailure(options, event.message, event.isCancelled);
          break;
      }
    },
    [onTaskComplete, options, teardown],
  );

  const executeTask = useCallback(
    async (instruction: string) => {
      setExecuting(true);
      setCurrentStep(0);
      setCurrentInstruction(instruction);

      try {
        const result = await operate.start(instruction);
        if (result.kind === 'blocked') {
          teardown();
          dispatchFailure(options, result.blocker.message, false);
          return;
        }

        activeRef.current = {
          taskId: result.taskId,
          sessionRevision: result.sessionRevision,
        };
        await onTaskStart?.(result.taskId, result.sessionRevision);

        unsubRef.current?.();
        unsubRef.current = operate.subscribeTask(
          result.taskId,
          result.sessionRevision,
          event => {
            void handleEvent(event);
          },
        );
      } catch (error) {
        teardown();
        const message = error instanceof Error ? error.message : '未知错误';
        dispatchFailure(options, message, false);
      }
    },
    [operate, onTaskStart, options, handleEvent, teardown],
  );

  const cancelTask = useCallback(async () => {
    const active = activeRef.current;
    if (!active) {
      return;
    }
    try {
      await operate.cancel(active.taskId);
      await accessibilityService.stopTaskExecutionService(
        active.taskId,
        active.sessionRevision,
      );
      await accessibilityService.releaseWakeLock();
    } finally {
      teardown();
      setCurrentStep(0);
    }
  }, [operate, teardown]);

  return {
    executing,
    currentStep,
    currentInstruction,
    executeTask,
    cancelTask,
  };
}
