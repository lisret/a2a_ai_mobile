// Owns construction of `RegistryModelChatAdapter` and `SnapshotAgentRuntimeAdapter`
// from the Task 4A registry plus local-perception dependencies, and injects
// only the resulting `SnapshotAgentRuntimePort` into the runner. Does not wrap
// or re-implement any Task 4A transport.
import type {RuntimeViewportAdapter} from '@core/engine/agentRuntime/runtime/AgentRuntime';
import type {AgentRuntimeFactoryDependencies} from '@core/engine/agentRuntime/runtime/AgentRuntimeFactory';
import type {ModelProviderRegistry} from '@core/engine/operateRuntime/model/ModelProviderContracts';
import {
  RegistryModelChatAdapter,
  type OperateTaskRunnerPorts,
} from './OperateTaskPorts';
import {SnapshotAgentRuntimeAdapter} from './SnapshotAgentRuntimeAdapter';
import {OperateTaskRunner} from './OperateTaskRunner';

export const defaultDelay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('operate_task_aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error('operate_task_aborted'));
    };
    signal.addEventListener('abort', onAbort, {once: true});
  });

export interface OperateTaskRunnerFactoryDependencies {
  readonly registry: ModelProviderRegistry;
  readonly localPerceptionProviderFactory: AgentRuntimeFactoryDependencies['localPerceptionProviderFactory'];
  readonly viewportAdapter: RuntimeViewportAdapter;
  readonly invalidateLocalEligibility: AgentRuntimeFactoryDependencies['invalidateLocalEligibility'];
  readonly instruction: OperateTaskRunnerPorts['instruction'];
  readonly screenshot: OperateTaskRunnerPorts['screenshot'];
  readonly visualAgentRegistry: OperateTaskRunnerPorts['visualAgentRegistry'];
  readonly visualAgentImage: OperateTaskRunnerPorts['visualAgentImage'];
  readonly visualAgentApproval: OperateTaskRunnerPorts['visualAgentApproval'];
  readonly action: OperateTaskRunnerPorts['action'];
  readonly confirmation: OperateTaskRunnerPorts['confirmation'];
  readonly history: OperateTaskRunnerPorts['history'];
  readonly events: OperateTaskRunnerPorts['events'];
  readonly now?: () => number;
  readonly delay?: OperateTaskRunnerPorts['delay'];
}

export const createOperateTaskRunner = (
  dependencies: OperateTaskRunnerFactoryDependencies,
): OperateTaskRunner => {
  const now = dependencies.now ?? Date.now;
  const chat = new RegistryModelChatAdapter(dependencies.registry);
  const snapshotAgentRuntime = new SnapshotAgentRuntimeAdapter(
    chat,
    dependencies.localPerceptionProviderFactory,
    dependencies.viewportAdapter,
    dependencies.invalidateLocalEligibility,
    now,
  );
  return new OperateTaskRunner({
    instruction: dependencies.instruction,
    screenshot: dependencies.screenshot,
    snapshotAgentRuntime,
    visualAgentRegistry: dependencies.visualAgentRegistry,
    visualAgentImage: dependencies.visualAgentImage,
    visualAgentApproval: dependencies.visualAgentApproval,
    action: dependencies.action,
    confirmation: dependencies.confirmation,
    history: dependencies.history,
    events: dependencies.events,
    now,
    delay: dependencies.delay ?? defaultDelay,
  });
};
