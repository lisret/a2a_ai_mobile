import {parseHeadlessTaskIdentity} from '../../../features/task/services/TaskExecutionHeadless';

describe('task-scoped runtime channel: headless payload', () => {
  it('accepts exactly taskId and sessionRevision in Headless payload', () => {
    expect(
      parseHeadlessTaskIdentity(
        JSON.stringify({taskId: 'task-1', sessionRevision: 3}),
      ),
    ).toEqual({taskId: 'task-1', sessionRevision: 3});
    expect(() =>
      parseHeadlessTaskIdentity(
        JSON.stringify({taskId: 'task-1', sessionRevision: 3, instruction: 'secret'}),
      ),
    ).toThrow('invalid_headless_payload');
    expect(() =>
      parseHeadlessTaskIdentity(
        JSON.stringify({taskId: 'current', sessionRevision: 3}),
      ),
    ).toThrow('invalid_task_id');
  });
});
