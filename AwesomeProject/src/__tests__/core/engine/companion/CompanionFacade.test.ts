import {CompanionService} from '@core/engine/companion/application/CompanionService';
import type {
  CompanionModelOutput,
  CompanionModelPort,
} from '@core/engine/companion/ports/CompanionModelPort';
import {CompanionFacade} from '@features/companion/application/CompanionFacade';
import type {ErrandProposalPort} from '@features/companion/application/CompanionFacade';
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
    async draft => ({
      id: 'saved',
      kind: draft.kind,
      title: draft.title,
      summary: draft.summary,
      createdAtEpochMs: 1,
      updatedAtEpochMs: 1,
    }),
  ),
  delete: jest.fn<Promise<void>, [string]>(async () => undefined),
  forgetAll: jest.fn<Promise<void>, []>(async () => undefined),
});

const makeErrands = (): jest.Mocked<ErrandProposalPort> => ({
  create: jest.fn<Promise<{id: string}>, [{title: string; dueText: string}]>(
    async () => ({id: 'errand-1'}),
  ),
});

const makeFacade = (output: CompanionModelOutput) => {
  const preferences = makePreferences();
  const errandProposals = makeErrands();
  const model: CompanionModelPort = {complete: jest.fn(async () => output)};
  const service = new CompanionService({
    model,
    preferences,
    clock: makeClock(),
    ids: makeIds(),
  });
  const facade = new CompanionFacade({
    service,
    preferences,
    errandProposals,
    ids: makeIds(),
  });
  return {facade, preferences, errandProposals};
};

describe('CompanionFacade', () => {
  it('routes persistence only after explicit confirmation by turn id', async () => {
    const {facade, preferences} = makeFacade({
      intent: 'preference',
      reply: '好的',
      proposal: {kind: 'preference', title: '咖啡', summary: '少糖'},
    });

    const turn = await facade.submitTranscript('以后咖啡少糖');
    expect(turn.intent).toBe('preference');
    expect(preferences.upsertConfirmed).not.toHaveBeenCalled();

    await facade.confirmProposal(turn.id);
    expect(preferences.upsertConfirmed).toHaveBeenCalledTimes(1);
    expect(preferences.upsertConfirmed).toHaveBeenCalledWith({
      kind: 'preference',
      title: '咖啡',
      summary: '少糖',
    });
  });

  it('routes confirmed errand proposals to the errand port only', async () => {
    const {facade, preferences, errandProposals} = makeFacade({
      intent: 'errand',
      reply: '好的',
      proposal: {kind: 'errand', title: '买菜', dueText: '明天下午三点'},
    });
    const turn = await facade.submitTranscript('明天下午三点提醒我买菜');
    await facade.confirmProposal(turn.id);
    expect(errandProposals.create).toHaveBeenCalledWith({
      title: '买菜',
      dueText: '明天下午三点',
    });
    expect(preferences.upsertConfirmed).not.toHaveBeenCalled();
  });

  it('exposes a ready phase snapshot and never leaks proposal internals', async () => {
    const {facade} = makeFacade({intent: 'companion', reply: '在的'});
    const state0 = facade.getState();
    expect(state0.phase).toBe('idle');

    await facade.submitTranscript('你好');
    const state = facade.getState();
    expect(state.phase).toBe('ready');
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0].hasProposal).toBe(false);
    expect(JSON.stringify(state)).not.toMatch(/proposalId|action/i);
  });

  it('dismiss removes the pending proposal so confirmation fails', async () => {
    const {facade, preferences} = makeFacade({
      intent: 'preference',
      reply: 'ok',
      proposal: {kind: 'preference', title: '咖啡', summary: '少糖'},
    });
    const turn = await facade.submitTranscript('以后咖啡少糖');
    facade.dismissTurn(turn.id);
    await expect(facade.confirmProposal(turn.id)).rejects.toThrow(
      'proposal_not_found',
    );
    expect(preferences.upsertConfirmed).not.toHaveBeenCalled();
  });
});
