import {
  validateModelBindingV1,
  validateModelEndpointProfileV1,
} from '../../../../../core/engine/operateRuntime/model/ModelProviderContracts';
import type {
  ModelBindingV1,
  ModelEndpointProfileV1,
} from '../../../../../core/engine/operateRuntime/model/ModelProviderContracts';

const presetProfile: ModelEndpointProfileV1 = {
  id: 'profile-openai',
  label: 'OpenAI',
  mode: 'preset',
  preset: 'openai',
  baseURLOverride: null,
  region: null,
  channel: null,
  secretRef: 'model:openai',
  generation: 1,
};

const customProfile: ModelEndpointProfileV1 = {
  id: 'profile-custom',
  label: 'Custom',
  mode: 'custom',
  custom: {
    protocol: 'openai_chat_completions',
    baseURL: 'https://custom.example/v1',
    auth: {kind: 'bearer'},
    chatPath: '/chat/completions',
    modelListPath: null,
    declaredCapabilities: {
      inputModalities: ['text'],
      outputModalities: ['text'],
      capabilities: {
        chat: true,
        vision: 'unknown',
        toolCalls: 'unknown',
        reasoning: 'unknown',
      },
    },
  },
  region: null,
  channel: null,
  secretRef: 'model:custom',
  generation: 3,
};

const binding: ModelBindingV1 = {
  id: 'binding-direct',
  role: 'direct',
  profileId: 'profile-openai',
  modelId: 'gpt-4o',
  maxSteps: 8,
};

const expectCode = (fn: () => unknown, code: string): void => {
  expect(fn).toThrow();
  try {
    fn();
  } catch (error) {
    expect((error as {code?: string}).code).toBe(code);
  }
};

describe('validateModelEndpointProfileV1', () => {
  it('accepts a valid preset profile unchanged', () => {
    expect(validateModelEndpointProfileV1(presetProfile)).toBe(presetProfile);
  });

  it('accepts a valid custom profile unchanged', () => {
    expect(validateModelEndpointProfileV1(customProfile)).toBe(customProfile);
  });

  it('rejects any mode other than preset or custom', () => {
    expectCode(
      () => validateModelEndpointProfileV1({...presetProfile, mode: 'auto'}),
      'model_profile_invalid_mode',
    );
  });

  it('rejects a preset profile that also carries a custom block', () => {
    expectCode(
      () =>
        validateModelEndpointProfileV1({
          ...presetProfile,
          custom: customProfile.mode === 'custom' ? customProfile.custom : undefined,
        }),
      'model_profile_invalid_preset',
    );
  });

  it('rejects a custom profile that also carries a preset field', () => {
    expectCode(
      () => validateModelEndpointProfileV1({...customProfile, preset: 'openai'}),
      'model_profile_invalid_custom',
    );
  });

  it('rejects a non-positive generation', () => {
    expectCode(
      () => validateModelEndpointProfileV1({...presetProfile, generation: 0}),
      'model_profile_invalid_generation',
    );
  });

  it('rejects an unknown preset id', () => {
    expectCode(
      () => validateModelEndpointProfileV1({...presetProfile, preset: 'nope'}),
      'model_profile_invalid_preset',
    );
  });

  it('accepts a null secretRef only as a string-or-null field', () => {
    expect(
      validateModelEndpointProfileV1({...presetProfile, secretRef: null}),
    ).toBeDefined();
    expectCode(
      () => validateModelEndpointProfileV1({...presetProfile, secretRef: 123}),
      'model_profile_invalid',
    );
  });
});

describe('validateModelBindingV1', () => {
  it('accepts a valid binding unchanged', () => {
    expect(validateModelBindingV1(binding)).toBe(binding);
  });

  it('rejects an unknown role', () => {
    expectCode(
      () => validateModelBindingV1({...binding, role: 'planner'}),
      'model_binding_invalid_role',
    );
  });

  it('rejects a non-positive maxSteps', () => {
    expectCode(
      () => validateModelBindingV1({...binding, maxSteps: 0}),
      'model_binding_invalid_max_steps',
    );
  });

  it('rejects a missing modelId', () => {
    expectCode(
      () => validateModelBindingV1({...binding, modelId: ''}),
      'model_binding_invalid',
    );
  });
});
