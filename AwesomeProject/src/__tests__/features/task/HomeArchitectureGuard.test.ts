import fs from 'node:fs';
import path from 'node:path';

describe('Home architecture', () => {
  const source = fs.readFileSync(path.resolve('src/features/task/screens/HomeScreen.tsx'), 'utf8');

  it('has no demo turns, direct repositories, model selection, old hooks, or global events', () => {
    expect(source).not.toMatch(/DEMO_TURNS|listenTurn|listenTimer|setTimeout\(.*2600/);
    expect(source).not.toMatch(/modelService|nonoConfigService|taskHistoryService|useTaskExecution|useTaskExecutionWithBackground|DeviceEventEmitter/);
    expect(source).not.toMatch(/startBackgroundTask|executeTaskForeground|taskId:\s*['"]current['"]/);
    expect(source).toMatch(/useAppFacades/);
  });
});
