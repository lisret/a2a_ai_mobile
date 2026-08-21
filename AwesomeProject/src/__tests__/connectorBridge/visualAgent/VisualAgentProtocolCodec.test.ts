import {
  createVisualAgentProtocolTaskTracker,
  decodeVisualAgentMessage,
  encodeVisualAgentMessage,
} from '../../../connectorBridge/visualAgent/protocol/VisualAgentProtocolCodec';
import type {
  VisualAgentCapabilitySet,
  VisualAgentTaskEvent,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

const caps: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

describe('decodeVisualAgentMessage', () => {
  it.each([
    'not-json',
    '{"version":2,"type":"session.ready","requestId":"r1","negotiatedCapabilities":{}}',
    JSON.stringify({
      version: 1,
      type: 'task.status',
      requestId: 'r1',
      event: {type: 'status', taskId: 't1', sessionRevision: 1, sequence: 1, status: 'unknown'},
    }),
  ])('rejects malformed frames without echoing input', raw => {
    expect(() => decodeVisualAgentMessage(raw)).toThrow('visual_agent_protocol_error');
  });

  it('rejects an unknown message type', () => {
    const raw = JSON.stringify({version: 1, type: 'task.unknown', requestId: 'r1'});
    expect(() => decodeVisualAgentMessage(raw)).toThrow('visual_agent_protocol_error');
  });

  it('rejects a frame with an extra, unexpected field', () => {
    const raw = JSON.stringify({
      version: 1,
      type: 'task.cancel',
      requestId: 'r1',
      taskId: 't1',
      sessionRevision: 1,
      extra: 'nope',
    });
    expect(() => decodeVisualAgentMessage(raw)).toThrow('visual_agent_protocol_error');
  });

  it('rejects a frame missing a required field', () => {
    const raw = JSON.stringify({version: 1, type: 'task.cancel', requestId: 'r1', taskId: 't1'});
    expect(() => decodeVisualAgentMessage(raw)).toThrow('visual_agent_protocol_error');
  });

  it('rejects a frame larger than 1 MiB', () => {
    const raw = JSON.stringify({
      version: 1,
      type: 'task.steer',
      requestId: 'r1',
      taskId: 't1',
      sessionRevision: 1,
      instruction: 'x'.repeat(2 * 1024 * 1024),
    });
    expect(() => decodeVisualAgentMessage(raw)).toThrow('visual_agent_protocol_error');
  });

  it('round-trips a session.open message', () => {
    const raw = encodeVisualAgentMessage({
      version: 1,
      type: 'session.open',
      requestId: 'r1',
      profileId: 'p1',
      toolId: 'codex',
      requestedCapabilities: caps,
    });
    expect(decodeVisualAgentMessage(raw)).toEqual({
      version: 1,
      type: 'session.open',
      requestId: 'r1',
      profileId: 'p1',
      toolId: 'codex',
      requestedCapabilities: caps,
    });
  });

  it('round-trips a task.completed terminal event', () => {
    const raw = encodeVisualAgentMessage({
      version: 1,
      type: 'task.completed',
      requestId: 'r1',
      event: {
        type: 'terminal',
        taskId: 't1',
        sessionRevision: 3,
        sequence: 5,
        status: 'completed',
        result: {summary: 'done'},
      },
    });
    expect(decodeVisualAgentMessage(raw)).toEqual(
      expect.objectContaining({type: 'task.completed'}),
    );
  });

  it('round-trips steer only for the correlated running task', () => {
    const tracker = createVisualAgentProtocolTaskTracker({taskId: 't1', sessionRevision: 3});
    const raw = encodeVisualAgentMessage({
      version: 1,
      type: 'task.steer',
      requestId: 'r2',
      taskId: 't1',
      sessionRevision: 3,
      instruction: '先查看右上角',
    });
    const decoded = decodeVisualAgentMessage(raw);
    expect(decoded).toEqual(
      expect.objectContaining({type: 'task.steer', taskId: 't1', sessionRevision: 3}),
    );
    expect(() => tracker.acceptSteer({taskId: 't1', sessionRevision: 4})).toThrow(
      'visual_agent_protocol_error',
    );
    expect(() => tracker.acceptSteer({taskId: 't2', sessionRevision: 3})).toThrow(
      'visual_agent_protocol_error',
    );
    expect(() => tracker.acceptSteer({taskId: 't1', sessionRevision: 3})).not.toThrow();
  });
});

describe('createVisualAgentProtocolTaskTracker', () => {
  const statusEvent = (sequence: number): VisualAgentTaskEvent => ({
    type: 'status',
    taskId: 't1',
    sessionRevision: 3,
    sequence,
    status: 'running',
  });

  const completed: VisualAgentTaskEvent = {
    type: 'terminal',
    taskId: 't1',
    sessionRevision: 3,
    sequence: 2,
    status: 'completed',
    result: {summary: 'done'},
  };

  const cancelledForSameTask: VisualAgentTaskEvent = {
    type: 'terminal',
    taskId: 't1',
    sessionRevision: 3,
    sequence: 3,
    status: 'cancelled',
  };

  it('accepts strictly increasing sequences for the correlated task/session', () => {
    const tracker = createVisualAgentProtocolTaskTracker({taskId: 't1', sessionRevision: 3});
    expect(() => tracker.accept(statusEvent(1))).not.toThrow();
    expect(() => tracker.accept(statusEvent(1))).toThrow('visual_agent_protocol_error');
  });

  it('rejects an event for a mismatched task/session', () => {
    const tracker = createVisualAgentProtocolTaskTracker({taskId: 't1', sessionRevision: 3});
    expect(() =>
      tracker.accept({...statusEvent(1), taskId: 'other'}),
    ).toThrow('visual_agent_protocol_error');
  });

  it('rejects a second terminal state for one task/session', () => {
    const tracker = createVisualAgentProtocolTaskTracker({taskId: 't1', sessionRevision: 3});
    tracker.accept(completed);
    expect(() => tracker.accept(cancelledForSameTask)).toThrow('visual_agent_protocol_error');
  });
});
