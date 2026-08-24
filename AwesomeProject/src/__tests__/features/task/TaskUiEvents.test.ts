import fs from 'node:fs';
import path from 'node:path';

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
