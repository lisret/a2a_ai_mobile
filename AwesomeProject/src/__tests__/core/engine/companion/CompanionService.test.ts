import {CompanionService} from '@core/engine/companion/application/CompanionService';
import type {
  CompanionModelOutput,
  CompanionModelPort,
} from '@core/engine/companion/ports/CompanionModelPort';
import type {Clock, IdGenerator} from '@core/engine/capabilities/shared/CapabilityPorts';
import type {
  ConfirmedPreferenceDraft,
  Preference,
} from '@core/engine/preference/domain/Preference';
import type {PreferenceRepository} from '@core/engine/preference/ports/PreferenceRepository';

const makeClock = (): Clock => {
  let t = 0;
  return {now: () => (t += 1)};
};

const makeIds = (): IdGenerator => {
  let n = 0;
  return {next: () => `id-${(n += 1)}`};
};

const makePreferences = (): jest.Mocked<PreferenceRepository> => ({
  list: jest.fn<Promise<readonly Preference[]>, []>(async () => []),
  upsertConfirmed: jest.fn<Promise<Preference>, [ConfirmedPreferenceDraft]>(
    async () => ({
      id: 'x',
      kind: 'preference',
      title: 't',
      summary: 's',
      createdAtEpochMs: 1,
      updatedAtEpochMs: 1,
    }),
  ),
  delete: jest.fn<Promise<void>, [string]>(async () => undefined),
  forgetAll: jest.fn<Promise<void>, []>(async () => undefined),
});

const modelReturning = (output: CompanionModelOutput): CompanionModelPort => ({
  complete: jest.fn(async () => output),
});

describe('CompanionService', () => {
  it('does not persist while submitting and confirms once', async () => {
    const preferences = makePreferences();
    const service = new CompanionService({
      model: modelReturning({
        intent: 'preference',
        reply: '好的，记住了',
        proposal: {kind: 'preference', title: '咖啡', summary: '少糖'},
      }),
      preferences,
      clock: makeClock(),
      ids: makeIds(),
    });

    const turn = await service.submit({
      conversationId: 'c1',
      text: '以后咖啡少糖',
      recentReplies: [],
    });

    expect(preferences.upsertConfirmed).not.toHaveBeenCalled();
    await expect(service.confirm(turn.proposal!.id)).resolves.toEqual({
      kind: 'preference',
      title: '咖啡',
      summary: '少糖',
    });
    await expect(service.confirm(turn.proposal!.id)).rejects.toThrow(
      'proposal_not_found',
    );
  });

  it('projects confirmed preference summaries into the model request without leaking untrusted fields', async () => {
    const preferences = makePreferences();
    preferences.list.mockResolvedValueOnce([
      {
        id: 'p1',
        kind: 'preference',
        title: '咖啡',
        summary: '少糖',
        createdAtEpochMs: 1,
        updatedAtEpochMs: 1,
      },
    ]);
    const model = modelReturning({intent: 'companion', reply: '在的'});
    const service = new CompanionService({
      model,
      preferences,
      clock: makeClock(),
      ids: makeIds(),
    });

    await service.submit({conversationId: 'c1', text: '你好', recentReplies: ['hi']});

    expect(model.complete).toHaveBeenCalledWith({
      conversationId: 'c1',
      text: '你好',
      recentReplies: ['hi'],
      confirmedPreferenceSummaries: ['少糖'],
    });
  });

  it('treats operate as an intent with no persisted proposal', async () => {
    const service = new CompanionService({
      model: modelReturning({intent: 'operate', reply: '需要我帮你操作吗'}),
      preferences: makePreferences(),
      clock: makeClock(),
      ids: makeIds(),
    });
    const turn = await service.submit({
      conversationId: 'c1',
      text: '帮我点一杯咖啡',
      recentReplies: [],
    });
    expect(turn.intent).toBe('operate');
    expect(turn.proposal).toBeUndefined();
  });

  it('rejects a model output whose proposal contradicts its intent', async () => {
    const service = new CompanionService({
      model: modelReturning({
        intent: 'companion',
        reply: 'x',
        proposal: {kind: 'preference', title: 'a', summary: 'b'},
      }),
      preferences: makePreferences(),
      clock: makeClock(),
      ids: makeIds(),
    });
    await expect(
      service.submit({conversationId: 'c1', text: 'x', recentReplies: []}),
    ).rejects.toThrow('companion_model_invalid');
  });

  it('dismiss removes the pending proposal without side effects', async () => {
    const preferences = makePreferences();
    const service = new CompanionService({
      model: modelReturning({
        intent: 'preference',
        reply: 'ok',
        proposal: {kind: 'preference', title: '咖啡', summary: '少糖'},
      }),
      preferences,
      clock: makeClock(),
      ids: makeIds(),
    });
    const turn = await service.submit({
      conversationId: 'c1',
      text: '以后咖啡少糖',
      recentReplies: [],
    });
    service.dismiss(turn.proposal!.id);
    expect(preferences.upsertConfirmed).not.toHaveBeenCalled();
    await expect(service.confirm(turn.proposal!.id)).rejects.toThrow(
      'proposal_not_found',
    );
  });
});
