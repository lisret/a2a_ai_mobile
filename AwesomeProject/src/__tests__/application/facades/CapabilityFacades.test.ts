import {DefaultPhoneOperateFacade} from '../../../application/facades/PhoneOperateFacade';
import {DefaultVisualAgentToolsFacade} from '../../../application/facades/VisualAgentToolsFacade';
import {DefaultModelConfigFacade} from '../../../application/facades/ModelConfigFacade';
import type {ModelCatalogViewState} from '../../../application/facades/UiRuntimeContracts';

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return {promise, resolve};
};

describe('capability facades', () => {
  it('refuses activation when the selected mode is not runnable', async () => {
    const state = {
      status: 'ready' as const,
      revision: 4,
      activeMode: 'cloud_direct' as const,
      draftMode: 'local_vision_cloud_planner' as const,
      adbFallbackEnabled: false,
      modes: {
        cloud_direct: {id: 'cloud_direct' as const, label: '云端一体', nodes: [], caption: '', runnable: true, blockers: []},
        cloud_split: {id: 'cloud_split' as const, label: '双云端', nodes: [], caption: '', runnable: true, blockers: []},
        local_vision_cloud_planner: {
          id: 'local_vision_cloud_planner' as const,
          label: '本地视觉', nodes: [], caption: '', runnable: false,
          blockers: [{code: 'local_model_not_ready' as const, message: '本地视觉模型未就绪'}],
        },
      },
    };
    const port = {read: jest.fn().mockResolvedValue(state), setDraft: jest.fn(), activate: jest.fn(), setAdbFallback: jest.fn()};
    const facade = new DefaultPhoneOperateFacade(port);
    await expect(facade.activateDraftMode(4)).rejects.toThrow('local_model_not_ready');
    expect(port.activate).not.toHaveBeenCalled();
  });

  it('blocks a profile that lacks either mandatory capability', async () => {
    const state = {
      status: 'ready' as const, revision: 8, enabled: true, activeProfileId: 'p-1',
      adapters: [{toolId: 'cursor' as const, builtIn: true, label: 'Cursor', readiness: 'ready' as const, maturity: 'beta' as const, capabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: false, resume: true, preferences: false}, configuredProfileCount: 1}],
      profiles: [{
        profileId: 'p-1', toolId: 'cursor' as const,
        displayName: 'Cursor', enabled: true, endpointLabel: 'local', readiness: 'ready' as const,
        maturity: 'beta' as const,
        requestedCapabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true},
        capabilities: {imageInput: true, structuredAction: false, stream: true, approval: true, cancel: true, steer: false, resume: false, preferences: false},
        runnable: false,
        blockers: [{code: 'visual_agent_capability_missing' as const, message: '缺少 structured_action'}],
      }],
      canOperate: false,
      blocker: {code: 'visual_agent_capability_missing' as const, message: '缺少 structured_action'},
    };
    const facade = new DefaultVisualAgentToolsFacade({read: jest.fn().mockResolvedValue(state)} as never);
    await expect(facade.getViewState()).resolves.toEqual(state);
  });

  it('saves a Connector Bridge profile through an explicit one-shot credential intent', async () => {
    const next = {
      status: 'ready' as const, revision: 9, enabled: true,
      adapters: [], profiles: [], canOperate: false,
    };
    const port = {saveProfile: jest.fn().mockResolvedValue(next)};
    const facade = new DefaultVisualAgentToolsFacade(port as never);
    const input = {
      toolId: 'codex' as const,
      enabled: true,
      bridgeUrl: 'https://bridge.example',
      bindingId: 'codex-main',
      credential: {action: 'replace' as const, plaintext: 'sentinel-bridge-secret'},
      requestedCapabilities: {imageInput: true, structuredAction: true, stream: true, approval: true, cancel: true, steer: true, resume: true, preferences: true},
    };
    const result = await facade.saveProfile(input, 8);
    expect(port.saveProfile).toHaveBeenCalledWith(input, 8);
    expect(JSON.stringify(result)).not.toContain('sentinel-bridge-secret');
  });

  it('marks a superseded model catalog response stale and never exposes replacement plaintext', async () => {
    const pending = deferred<ModelCatalogViewState>();
    const port = {
      read: jest.fn().mockResolvedValue({status: 'ready', credential: {state: 'ready'}}),
      fetchCatalog: jest.fn()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce({requestGeneration: 2, status: 'ready', models: [{id: 'gpt-5', label: 'gpt-5'}]}),
      save: jest.fn(),
    };
    const facade = new DefaultModelConfigFacade(port as never);
    const first = facade.refreshCatalog({list: 'unified', requestGeneration: 1, mode: 'preset', presetId: 'openai', baseUrlOverride: null, credential: {action: 'replace', plaintext: 'sentinel-secret'}});
    await expect(facade.refreshCatalog({list: 'unified', requestGeneration: 2, mode: 'preset', presetId: 'openai', baseUrlOverride: null, credential: {action: 'keep'}})).resolves.toMatchObject({requestGeneration: 2, status: 'ready'});
    pending.resolve({requestGeneration: 1, status: 'ready', models: [{id: 'old', label: 'old'}]});
    await expect(first).resolves.toMatchObject({requestGeneration: 1, status: 'stale', models: []});
    expect(JSON.stringify(await facade.getViewState({list: 'unified'}))).not.toContain('sentinel-secret');
  });
});
