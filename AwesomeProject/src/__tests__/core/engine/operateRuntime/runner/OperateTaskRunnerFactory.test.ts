import {
  createOperateTaskRunner,
  defaultDelay,
} from '@core/engine/operateRuntime/runner/OperateTaskRunnerFactory';
import {OperateTaskRunner} from '@core/engine/operateRuntime/runner/OperateTaskRunner';
import type {ModelProviderRegistry} from '@core/engine/operateRuntime/model/ModelProviderContracts';

function createDependencies() {
  const registry: ModelProviderRegistry = {
    listPresets: jest.fn(),
    resolveExecutionTarget: jest.fn(),
    resolveTransport: jest.fn(),
    resolveCatalog: jest.fn(),
  };
  return {
    registry,
    localPerceptionProviderFactory: jest.fn(),
    viewportAdapter: {getDimensions: jest.fn()},
    invalidateLocalEligibility: jest.fn(),
    instruction: {load: jest.fn()},
    screenshot: {capture: jest.fn()},
    visualAgentRegistry: {require: jest.fn(), list: jest.fn()},
    visualAgentImage: {capture: jest.fn()},
    visualAgentApproval: {decide: jest.fn()},
    action: {execute: jest.fn()},
    confirmation: {confirm: jest.fn()},
    history: {saveTask: jest.fn(), getTaskById: jest.fn()},
    events: {emit: jest.fn()},
  };
}

describe('createOperateTaskRunner', () => {
  it('wires a single OperateTaskRunner instance from the injected dependencies', () => {
    const runner = createOperateTaskRunner(createDependencies());
    expect(runner).toBeInstanceOf(OperateTaskRunner);
  });
});

describe('defaultDelay', () => {
  it('resolves after the requested duration', async () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    const promise = defaultDelay(50, controller.signal);
    jest.advanceTimersByTime(50);
    await expect(promise).resolves.toBeUndefined();
    jest.useRealTimers();
  });

  it('rejects immediately for an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(defaultDelay(50, controller.signal)).rejects.toThrow(
      'operate_task_aborted',
    );
  });

  it('rejects and clears the timer when aborted mid-wait', async () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    const promise = defaultDelay(1_000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow('operate_task_aborted');
    jest.useRealTimers();
  });
});
