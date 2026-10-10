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
  it('delivers stop requests to the service for session identity validation', () => {
    const manager = fs.readFileSync(
      path.resolve('android/app/src/main/java/com/awesomeproject/utils/ServiceManager.kt'),
      'utf8',
    );
    const stop = manager.slice(
      manager.indexOf('fun stopTaskExecutionService('),
      manager.indexOf('fun startBackgroundTask('),
    );
    expect(stop).not.toContain('context.stopService(intent)');
    expect(stop).toContain('action = "STOP_SERVICE"');
    expect(stop).toContain('context.startService(intent)');
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
