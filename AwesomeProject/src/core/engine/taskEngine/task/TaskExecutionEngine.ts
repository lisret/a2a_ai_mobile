/**
 * 任务执行引擎（兼容外壳 / compatibility shell）
 *
 * The legacy multi-module engine (screenshot → inference → action loop) is
 * removed. Execution now flows through the single shared `OperateTaskRunner`
 * against one immutable session lease. This shell only delegates to that runner
 * so the historical export keeps type-checking; the live runner is injected by
 * the UI Task 8 composition root.
 */

import type {OperateSessionLease} from '@core/engine/operateRuntime/contracts/OperateSessionContracts';
import type {OperateTaskOutcome} from '@core/engine/operateRuntime/runner/OperateTaskPorts';
import type {OperateTaskRunnerPort} from '@features/task/services/OperateTaskEntryPorts';
import type {AIModel} from '@shared/types/Model';

/**
 * Retained for backwards-compatible imports. The engine no longer owns a task
 * loop; task text is loaded by the runner's port, never passed here.
 */
export interface TaskExecutionEngineConfig {
  taskId: string;
  modelId: string;
  model: AIModel;
  maxSteps?: number;
  maxConsecutiveErrors?: number;
}

export class TaskExecutionEngine {
  constructor(private readonly runner?: OperateTaskRunnerPort) {}

  /**
   * Delegates to the shared runner for one already-claimed session lease.
   */
  async execute(lease: OperateSessionLease): Promise<OperateTaskOutcome> {
    if (!this.runner) {
      // Loud-unwired until UI Task 8 composes the live runner.
      throw new Error('task_execution_engine_not_wired');
    }
    return this.runner.run(lease);
  }
}
