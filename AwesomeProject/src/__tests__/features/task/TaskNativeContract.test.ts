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
  it('stops the active service without starting a service from the background', () => {
    const manager = fs.readFileSync(
      path.resolve('android/app/src/main/java/com/awesomeproject/utils/ServiceManager.kt'),
      'utf8',
    );
    const start = manager.indexOf('fun stopTaskExecutionService(');
    const end = manager.indexOf('fun startBackgroundTask(');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const stop = manager.slice(start, end);
    expect(stop).toContain('context.stopService(Intent(');
    expect(stop).not.toContain('context.startService(intent)');
    expect(stop).toContain('TaskServiceLifecycle.stop(taskId, sessionRevision)');
    expect(manager).toContain('TaskServiceLifecycle.start(taskId, sessionRevision)');
  });
  it('does not let delayed LAN service delivery create a new authorization generation', () => {
    const service = fs.readFileSync(
      path.resolve('android/app/src/main/java/com/awesomeproject/lanmcp/LanMcpService.kt'),
      'utf8',
    );
    expect(service).not.toContain('generation.markStarted()');
    expect(service).toContain('getLongExtra(EXTRA_GENERATION');
  });
  it('does not stop a newer queued Android start while handling an older intent', () => {
    for (const file of ['service/TaskExecutionService.kt', 'lanmcp/LanMcpService.kt']) {
      const source = fs.readFileSync(
        path.resolve('android/app/src/main/java/com/awesomeproject', file), 'utf8',
      );
      const handler = source.slice(source.indexOf('override fun onStartCommand('), source.indexOf('override fun onBind('));
      expect(handler).not.toContain('stopSelf()');
      expect(handler).toContain('stopSelf(startId)');
    }
  });

});
