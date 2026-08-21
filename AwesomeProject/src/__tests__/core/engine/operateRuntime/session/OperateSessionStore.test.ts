import AsyncStorage from '@react-native-async-storage/async-storage';
import {OperateSessionStore} from '../../../../../core/engine/operateRuntime/session/OperateSessionStore';
import type {ResolvedOperateSessionV1} from '../../../../../core/engine/operateRuntime/contracts/OperateSessionContracts';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function makeSession(overrides: Partial<ResolvedOperateSessionV1> = {}): ResolvedOperateSessionV1 {
  return {
    schemaVersion: 1,
    taskId: 'task-1',
    sessionRevision: 1,
    configRevision: 1,
    channel: 'cloud_direct',
    modelBindings: {
      direct: {
        role: 'direct',
        bindingId: 'binding:direct',
        profileId: 'profile:direct',
        modelId: 'gpt-4o',
        maxSteps: 20,
        provider: 'openai',
        transportAdapterId: 'openai',
        protocol: 'openai_chat_completions',
        baseURL: 'https://api.openai.com',
        auth: {kind: 'bearer'},
        chatPath: '/v1/chat/completions',
        region: null,
        channel: null,
        secretRef: 'model:direct-secret',
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        capabilities: {chat: true, vision: true, toolCalls: true, reasoning: 'unknown'},
        capabilityTrust: 'verified_remote',
      },
    },
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

describe('OperateSessionStore', () => {
  let backing: Record<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();
    backing = {};
    mockAsyncStorage.getItem.mockImplementation(async key => backing[key] ?? null);
    mockAsyncStorage.setItem.mockImplementation(async (key, value) => {
      backing[key] = value;
    });
  });

  it('persists a created session and loads it back frozen', async () => {
    const store = new OperateSessionStore();
    const session = makeSession();
    await expect(store.create(session)).resolves.toEqual({ok: true});

    const loaded = await store.load('task-1');
    expect(loaded?.session).toEqual(session);
    expect(Object.isFrozen(loaded?.session)).toBe(true);
    expect(loaded?.claim).toBeNull();
    expect(loaded?.terminal).toBeNull();
  });

  it('rejects a second session for the same taskId', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession());
    await expect(store.create(makeSession({sessionRevision: 2}))).resolves.toEqual({
      ok: false,
      code: 'operate_session_task_already_bound',
    });
  });

  it('allocates monotonically increasing session revisions that survive a restart', async () => {
    const storeBeforeRestart = new OperateSessionStore();
    await expect(storeBeforeRestart.nextSessionRevision()).resolves.toBe(1);
    await expect(storeBeforeRestart.nextSessionRevision()).resolves.toBe(2);

    const storeAfterRestart = new OperateSessionStore();
    await expect(storeAfterRestart.nextSessionRevision()).resolves.toBe(3);
  });

  it('claims a created session into a lease bound to that owner', async () => {
    const store = new OperateSessionStore();
    const session = makeSession();
    await store.create(session);

    const result = await store.claim('task-1', 1, 'foreground');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.lease.session).toEqual(session);
    expect(result.lease.owner).toBe('foreground');
    expect(result.lease.signal.aborted).toBe(false);
  });

  it('rejects a duplicate claim while one owner already holds the lease', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession());
    await store.claim('task-1', 1, 'foreground');

    await expect(store.claim('task-1', 1, 'headless')).resolves.toEqual({
      ok: false,
      code: 'operate_session_already_claimed',
    });
  });

  it('rejects a claim against a stale session revision', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession());

    await expect(store.claim('task-1', 99, 'foreground')).resolves.toEqual({
      ok: false,
      code: 'operate_session_stale_revision',
    });
  });

  it('rejects a claim for an unknown task', async () => {
    const store = new OperateSessionStore();
    await expect(store.claim('missing-task', 1, 'foreground')).resolves.toEqual({
      ok: false,
      code: 'operate_session_not_found',
    });
  });

  it('re-claims a session after an early release with no terminal transition', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession());
    const first = await store.claim('task-1', 1, 'foreground');
    if (!first.ok) throw new Error(first.code);
    await first.lease.release();

    const second = await store.claim('task-1', 1, 'headless');
    expect(second.ok).toBe(true);
  });

  it('marks a lease terminal exactly once', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession());
    const claimed = await store.claim('task-1', 1, 'foreground');
    if (!claimed.ok) throw new Error(claimed.code);

    await expect(claimed.lease.markTerminal('success')).resolves.toBe(true);
    await expect(claimed.lease.markTerminal('failed')).resolves.toBe(false);
  });

  it('rejects markTerminal against a stale session revision', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession());
    await expect(store.markTerminal('task-1', 99, 'success')).resolves.toBe(false);
  });

  it('tombstones a released terminal session and rejects claim replay', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession());
    const claimed = await store.claim('task-1', 1, 'foreground');
    if (!claimed.ok) throw new Error(claimed.code);
    await claimed.lease.markTerminal('success');
    await claimed.lease.release();

    await expect(store.claim('task-1', 1, 'foreground')).resolves.toEqual({
      ok: false,
      code: 'operate_session_already_terminal',
    });
  });

  it('is idempotent-safe when release is called twice', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession());
    const claimed = await store.claim('task-1', 1, 'foreground');
    if (!claimed.ok) throw new Error(claimed.code);
    await claimed.lease.markTerminal('success');
    await claimed.lease.release();
    await expect(claimed.lease.release()).resolves.toBeUndefined();
  });

  it('excludes terminal sessions from the nonterminal ref scan', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession({taskId: 'task-nonterminal', sessionRevision: 1}));
    await store.create(makeSession({taskId: 'task-terminal', sessionRevision: 2}));
    const claimed = await store.claim('task-terminal', 2, 'foreground');
    if (!claimed.ok) throw new Error(claimed.code);
    await claimed.lease.markTerminal('failed');

    const nonterminal = await store.listNonterminal();
    expect(nonterminal.map(session => session.taskId)).toEqual(['task-nonterminal']);
  });

  it('caps terminal tombstones at 100 and evicts the oldest first', async () => {
    const store = new OperateSessionStore();
    for (let index = 0; index < 101; index += 1) {
      const taskId = `task-${index}`;
      await store.create(makeSession({taskId, sessionRevision: 1}));
      const claimed = await store.claim(taskId, 1, 'foreground');
      if (!claimed.ok) throw new Error(claimed.code);
      await claimed.lease.markTerminal('success');
      await claimed.lease.release();
    }

    await expect(store.claim('task-0', 1, 'foreground')).resolves.toEqual({
      ok: false,
      code: 'operate_session_not_found',
    });
    await expect(store.claim('task-100', 1, 'foreground')).resolves.toEqual({
      ok: false,
      code: 'operate_session_already_terminal',
    });
  });

  it('never persists instruction, screenshot, or provider-response fields', async () => {
    const store = new OperateSessionStore();
    await store.create(makeSession());
    const raw = backing['@nono:operate_sessions:v1'];
    expect(raw).toBeDefined();
    expect(raw).not.toMatch(/instruction|screenshot|response/i);
  });
});
