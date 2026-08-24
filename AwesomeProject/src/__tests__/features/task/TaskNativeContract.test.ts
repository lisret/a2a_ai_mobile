import fs from 'node:fs';
import path from 'node:path';

describe('task-scoped runtime channel: native contract', () => {
  it('passes task identity through the Android service cancel intent', () => {
    const service = fs.readFileSync(
      path.resolve(
        'android/app/src/main/java/com/awesomeproject/service/TaskExecutionService.kt',
      ),
      'utf8',
    );
    const headless = fs.readFileSync(
      path.resolve(
        'android/app/src/main/java/com/awesomeproject/service/TaskExecutionHeadlessService.kt',
      ),
      'utf8',
    );
    expect(service).toMatch(/putString\("taskId"/);
    expect(service).toMatch(/putDouble\("sessionRevision"/);
    expect(headless).not.toMatch(/任务数据:\s*\$taskData/);
  });
});
