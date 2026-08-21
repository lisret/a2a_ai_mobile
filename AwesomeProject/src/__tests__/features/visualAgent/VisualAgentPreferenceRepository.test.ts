// Task 12 remote preference adapter. It is a `PreferenceRepository` backed only
// by the negotiated Connector Bridge preference command; it fails closed with
// `preference_remote_unavailable` whenever preferences were not negotiated or a
// remote command fails, and never caches remote data on the device.
import {VisualAgentPreferenceRepository} from '@features/visualAgent/data/VisualAgentPreferenceRepository';
import type {
  VisualAgentCapabilitySet,
  VisualAgentConnectionState,
  VisualAgentExecutionPort,
} from '@core/engine/operateRuntime/visualAgent/VisualAgentContracts';

const allCapabilities: VisualAgentCapabilitySet = {
  imageInput: true,
  structuredAction: true,
  stream: true,
  cancel: true,
  approval: true,
  resume: true,
  steer: true,
  preferences: true,
};

const ready = (
  overrides: Partial<VisualAgentCapabilitySet> = {},
): VisualAgentConnectionState => ({
  status: 'ready',
  negotiatedCapabilities: {...allCapabilities, ...overrides},
});

function makeClient(): jest.Mocked<
  Pick<VisualAgentExecutionPort, 'getConnectionState' | 'requestPreferences'>
> {
  return {
    getConnectionState: jest.fn().mockReturnValue(ready()),
    requestPreferences: jest.fn(),
  };
}

function makeIds(): {next: () => string} {
  let n = 0;
  return {
    next: () => {
      n += 1;
      return `pref-${n}`;
    },
  };
}

describe('VisualAgentPreferenceRepository', () => {
  it('projects remote list records into sanitized preferences', async () => {
    const client = makeClient();
    client.requestPreferences.mockResolvedValue({
      type: 'list',
      preferences: [
        {
          id: 'p1',
          kind: 'preference',
          title: 'Tea',
          summary: 'Green tea, no sugar',
          createdAtEpochMs: 1,
          updatedAtEpochMs: 2,
        },
      ],
    });
    const repository = new VisualAgentPreferenceRepository(
      client as unknown as VisualAgentExecutionPort,
      makeIds(),
    );

    await expect(repository.list()).resolves.toEqual([
      {
        id: 'p1',
        kind: 'preference',
        title: 'Tea',
        summary: 'Green tea, no sugar',
        createdAtEpochMs: 1,
        updatedAtEpochMs: 2,
      },
    ]);
    expect(client.requestPreferences).toHaveBeenCalledWith(
      {type: 'list'},
      expect.anything(),
    );
  });

  it('fails preference operations when preferences were not negotiated', async () => {
    const client = makeClient();
    client.getConnectionState.mockReturnValue(ready({preferences: false}));
    const repository = new VisualAgentPreferenceRepository(
      client as unknown as VisualAgentExecutionPort,
      makeIds(),
    );

    await expect(repository.list()).rejects.toThrow('preference_remote_unavailable');
    expect(client.requestPreferences).not.toHaveBeenCalled();
  });

  it('fails preference operations when the connection is not ready', async () => {
    const client = makeClient();
    client.getConnectionState.mockReturnValue({status: 'disconnected'});
    const repository = new VisualAgentPreferenceRepository(
      client as unknown as VisualAgentExecutionPort,
      makeIds(),
    );

    await expect(repository.list()).rejects.toThrow('preference_remote_unavailable');
  });

  it('maps every remote failure to preference_remote_unavailable', async () => {
    const client = makeClient();
    client.requestPreferences.mockRejectedValue(new Error('socket exploded'));
    const repository = new VisualAgentPreferenceRepository(
      client as unknown as VisualAgentExecutionPort,
      makeIds(),
    );

    await expect(repository.list()).rejects.toThrow('preference_remote_unavailable');
  });

  it('sends upsert, delete, and clear commands for the matching operations', async () => {
    const client = makeClient();
    client.requestPreferences.mockImplementation(async (command: unknown) => {
      const typed = command as {type: string};
      if (typed.type === 'upsert') {
        return {
          type: 'upsert',
          preference: {
            id: 'pref-1',
            kind: 'name',
            title: 'Ann',
            summary: 'Call me Ann',
            createdAtEpochMs: 5,
            updatedAtEpochMs: 5,
          },
        };
      }
      return {type: typed.type};
    });
    const repository = new VisualAgentPreferenceRepository(
      client as unknown as VisualAgentExecutionPort,
      makeIds(),
    );

    await expect(
      repository.upsertConfirmed({kind: 'name', title: 'Ann', summary: 'Call me Ann'}),
    ).resolves.toEqual({
      id: 'pref-1',
      kind: 'name',
      title: 'Ann',
      summary: 'Call me Ann',
      createdAtEpochMs: 5,
      updatedAtEpochMs: 5,
    });
    expect(client.requestPreferences).toHaveBeenLastCalledWith(
      {
        type: 'upsert',
        preference: {id: 'pref-1', kind: 'name', title: 'Ann', summary: 'Call me Ann'},
      },
      expect.anything(),
    );

    await repository.delete('p2');
    expect(client.requestPreferences).toHaveBeenLastCalledWith(
      {type: 'delete', preferenceId: 'p2'},
      expect.anything(),
    );

    await repository.forgetAll();
    expect(client.requestPreferences).toHaveBeenLastCalledWith(
      {type: 'clear'},
      expect.anything(),
    );
  });
});
