import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {ApiProviderSelector} from '../../../features/model/components/ApiProviderSelector';
import {ModelNameSelector} from '../../../features/model/components/ModelNameSelector';
import {ModelListPanel} from '../../../features/model/components/ModelListPanel';
import {AddModelScreen} from '../../../features/model/screens/AddModelScreen';
import {EditModelScreen} from '../../../features/model/screens/EditModelScreen';
import {APIKeyGuideScreen} from '../../../features/settings/screens/APIKeyGuideScreen';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import {
  PROVIDER_PRESET_ORDER,
  PROVIDER_PRESET_DISPLAY,
  PROVIDER_CREDENTIAL_GUIDES,
  GENERIC_CUSTOM_CREDENTIAL_GUIDANCE,
  isAllowedGuideUrl,
} from '../../../shared/constants/apiProviders';
import type {
  AppFacades,
  CustomProviderConfigViewState,
  ModelCatalogViewState,
  ModelConfigListViewState,
  ModelConfigViewState,
  ProviderPresetViewState,
} from '../../../application/facades/UiRuntimeContracts';

let mockParams: Record<string, unknown> = {};
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack}),
    useRoute: () => ({params: mockParams}),
    useFocusEffect: (cb: () => void) => {
      const React = require('react');
      React.useEffect(() => cb(), []);
    },
  };
});

jest.mock('@shared/components/PageLayout', () => {
  const React = require('react');
  const {View, Text} = require('react-native');
  return {
    PageLayout: ({title, children}: {title: string; children: React.ReactNode}) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        children,
      ),
  };
});

const presets: readonly ProviderPresetViewState[] = PROVIDER_PRESET_ORDER.map(id => ({
  id,
  label: PROVIDER_PRESET_DISPLAY[id].label,
  maturity: PROVIDER_PRESET_DISPLAY[id].maturity,
  catalogSupported: true,
}));

const emptyCatalog: ModelCatalogViewState = {
  requestGeneration: 0,
  status: 'empty',
  models: [],
};

const customConfig: CustomProviderConfigViewState = {
  providerLabel: '',
  baseUrl: '',
  protocol: 'custom_http_json',
  auth: {kind: 'bearer'},
  chatPath: '/v1/chat',
  modelListPath: null,
  declaredCapabilities: {
    inputModalities: ['text'],
    outputModalities: ['text'],
    capabilities: {chat: true, vision: 'unknown', toolCalls: 'unknown', reasoning: 'unknown'},
  },
  capabilityTrust: 'user_declared_unverified',
};

function facadesWith(modelConfig: Partial<AppFacades['modelConfig']>): AppFacades {
  return {modelConfig} as unknown as AppFacades;
}

describe('provider preset catalog (apiProviders)', () => {
  it('lists the eleven presets in the canonical product order', () => {
    expect(PROVIDER_PRESET_ORDER).toEqual([
      'openai',
      'anthropic',
      'gemini',
      'deepseek',
      'xai',
      'alibaba_bailian_qwen',
      'zhipu_glm',
      'moonshot_kimi',
      'minimax',
      'volcano_ark_doubao',
      'modelscope',
    ]);
  });

  it('labels each preset with the localized product name', () => {
    expect(PROVIDER_PRESET_ORDER.map(id => PROVIDER_PRESET_DISPLAY[id].label)).toEqual([
      'OpenAI',
      'Anthropic',
      'Gemini',
      'DeepSeek',
      'xAI',
      '百炼 Qwen',
      '智谱',
      'Kimi',
      'MiniMax',
      '火山 Doubao',
      'ModelScope（兼容）',
    ]);
  });

  it('has an exhaustive credential guide whose console link is https + allow-listed', () => {
    for (const id of PROVIDER_PRESET_ORDER) {
      const guide = PROVIDER_CREDENTIAL_GUIDES[id];
      expect(guide).toBeDefined();
      expect(guide.consoleUrl.startsWith('https://')).toBe(true);
      expect(isAllowedGuideUrl(id, guide.consoleUrl)).toBe(true);
      expect(isAllowedGuideUrl(id, 'https://evil.example.com')).toBe(false);
      expect(isAllowedGuideUrl(id, guide.consoleUrl.replace('https://', 'http://'))).toBe(false);
    }
  });
});

describe('ApiProviderSelector (controlled preset | custom)', () => {
  it('shows only the preset/custom discriminant, never provider chips', () => {
    const screen = render(
      <ApiProviderSelector
        mode="preset"
        presets={presets}
        selectedPresetId="openai"
        onSelectPreset={jest.fn()}
        onSelectCustom={jest.fn()}
        custom={customConfig}
        onCustomChange={jest.fn()}
      />,
    );
    expect(screen.getByText('热门厂商')).toBeTruthy();
    expect(screen.getByText('完全自定义')).toBeTruthy();
    expect(screen.getByText('OpenAI')).toBeTruthy();
    expect(screen.getByText('ModelScope（兼容）')).toBeTruthy();
    expect(screen.queryByText('HuggingFace')).toBeNull();
    expect(screen.queryByText('选择')).toBeNull();
  });

  it('custom mode declares capabilities as unverified and never prefills OpenAI defaults', () => {
    const onCustomChange = jest.fn();
    const screen = render(
      <ApiProviderSelector
        mode="custom"
        presets={presets}
        onSelectPreset={jest.fn()}
        onSelectCustom={jest.fn()}
        custom={customConfig}
        onCustomChange={onCustomChange}
      />,
    );
    expect(screen.getByText(/用户声明.*未验证/)).toBeTruthy();
    const baseUrl = screen.getByTestId('custom-base-url');
    expect(baseUrl.props.value).toBe('');
    fireEvent.changeText(screen.getByTestId('custom-provider-label'), 'My LLM');
    expect(onCustomChange).toHaveBeenCalledWith(
      expect.objectContaining({providerLabel: 'My LLM'}),
    );
  });
});

describe('ModelNameSelector (controlled)', () => {
  const statuses: ModelCatalogViewState['status'][] = [
    'loading',
    'ready',
    'unsupported',
    'auth_failed',
    'network_failed',
    'empty',
    'stale',
  ];

  it('always keeps a manual model id input across every catalog status', () => {
    for (const status of statuses) {
      const screen = render(
        <ModelNameSelector
          catalog={{requestGeneration: 1, status, models: []}}
          modelId=""
          onModelIdChange={jest.fn()}
          onRefresh={jest.fn()}
        />,
      );
      expect(screen.getByText('当前凭证可用模型')).toBeTruthy();
      expect(screen.getByTestId('manual-model-id')).toBeTruthy();
      screen.unmount();
    }
  });

  it('fills the manual id when a catalog entry is chosen', () => {
    const onModelIdChange = jest.fn();
    const screen = render(
      <ModelNameSelector
        catalog={{
          requestGeneration: 1,
          status: 'ready',
          models: [{id: 'gpt-4o', label: 'gpt-4o'}],
        }}
        modelId=""
        onModelIdChange={onModelIdChange}
        onRefresh={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('catalog-model-gpt-4o'));
    expect(onModelIdChange).toHaveBeenCalledWith('gpt-4o');
  });
});

describe('AddModelScreen (facade-driven)', () => {
  beforeEach(() => {
    mockParams = {list: 'unified'};
    mockNavigate.mockReset();
    mockGoBack.mockReset();
  });

  it('renders presets from the facade and no legacy provider chips', async () => {
    const modelConfig = {
      getViewState: jest.fn(async (): Promise<ModelConfigViewState> => ({
        status: 'ready',
        revision: 3,
        mode: 'preset',
        selectedPresetId: 'openai',
        presets,
        providerLabel: 'OpenAI',
        baseUrl: '',
        modelId: '',
        credential: {state: 'missing'},
        catalog: emptyCatalog,
      })),
      refreshCatalog: jest.fn(async () => emptyCatalog),
      save: jest.fn(async () => ({} as ModelConfigViewState)),
    };
    const screen = render(
      <AppFacadesProvider value={facadesWith(modelConfig)}>
        <AddModelScreen />
      </AppFacadesProvider>,
    );
    await waitFor(() => expect(screen.getByText('热门厂商')).toBeTruthy());
    expect(screen.getByTestId('manual-model-id')).toBeTruthy();
    expect(screen.queryByText('HuggingFace')).toBeNull();
  });
});

describe('EditModelScreen (facade-driven, keep-first credential)', () => {
  beforeEach(() => {
    mockParams = {bindingId: 'binding-1', list: 'unified'};
    mockNavigate.mockReset();
    mockGoBack.mockReset();
  });

  it('starts at keep with an empty secret input and never rehydrates plaintext', async () => {
    const viewState: ModelConfigViewState = {
      status: 'ready',
      revision: 9,
      mode: 'preset',
      selectedPresetId: 'zhipu_glm',
      presets,
      providerLabel: '智谱',
      baseUrl: '',
      modelId: 'glm-4.5',
      credential: {state: 'ready', maskedLabel: '••••1234'},
      catalog: emptyCatalog,
    };
    const modelConfig = {
      getViewState: jest.fn(async () => viewState),
      refreshCatalog: jest.fn(async () => emptyCatalog),
      save: jest.fn(async () => viewState),
    };
    const screen = render(
      <AppFacadesProvider value={facadesWith(modelConfig)}>
        <EditModelScreen />
      </AppFacadesProvider>,
    );
    await waitFor(() => expect(screen.getByText('编辑模型')).toBeTruthy());
    // No plaintext ever hydrated into an input.
    expect(screen.queryByDisplayValue('••••1234')).toBeNull();
    // The replace field is hidden until the user explicitly asks to change it.
    expect(screen.queryByTestId('credential-input')).toBeNull();
    fireEvent.press(screen.getByTestId('credential-replace'));
    const secret = screen.getByTestId('credential-input');
    expect(secret.props.value).toBe('');
  });
});

describe('ModelListPanel (facade-driven binding list)', () => {
  it('selects and deletes bindings by canonical id + expected revision', async () => {
    const listView: ModelConfigListViewState = {
      status: 'ready',
      revision: 5,
      list: 'unified',
      items: [
        {
          bindingId: 'binding-1',
          endpointProfileId: 'profile-1',
          displayName: 'Vision',
          providerLabel: '智谱',
          modelId: 'glm-4.5',
          mode: 'preset',
          selected: false,
        },
      ],
    };
    const modelConfig = {
      getListViewState: jest.fn(async () => listView),
      selectBinding: jest.fn(async () => listView),
      deleteBinding: jest.fn(async () => listView),
    };
    const screen = render(
      <AppFacadesProvider value={facadesWith(modelConfig)}>
        <ModelListPanel title="一体化模型" listKey="unified" />
      </AppFacadesProvider>,
    );
    await waitFor(() => expect(screen.getByText('智谱 · glm-4.5')).toBeTruthy());
    fireEvent.press(screen.getByText('使用'));
    await waitFor(() =>
      expect(modelConfig.selectBinding).toHaveBeenCalledWith({
        list: 'unified',
        bindingId: 'binding-1',
        expectedRevision: 5,
      }),
    );
  });
});

describe('APIKeyGuideScreen (facade preset order + custom generic)', () => {
  beforeEach(() => {
    mockParams = {};
  });

  it('renders the canonical preset guides in order', async () => {
    const modelConfig = {
      getViewState: jest.fn(async (): Promise<ModelConfigViewState> => ({
        status: 'ready',
        revision: 1,
        mode: 'preset',
        presets,
        providerLabel: '',
        baseUrl: '',
        modelId: '',
        credential: {state: 'missing'},
        catalog: emptyCatalog,
      })),
    };
    const screen = render(
      <AppFacadesProvider value={facadesWith(modelConfig)}>
        <APIKeyGuideScreen />
      </AppFacadesProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(PROVIDER_CREDENTIAL_GUIDES.openai.title)).toBeTruthy(),
    );
    expect(
      screen.getByText(PROVIDER_CREDENTIAL_GUIDES.modelscope.title),
    ).toBeTruthy();
  });

  it('shows the generic guidance for custom mode instead of guessing a URL', async () => {
    mockParams = {mode: 'custom'};
    const modelConfig = {
      getViewState: jest.fn(async (): Promise<ModelConfigViewState> => ({
        status: 'ready',
        revision: 1,
        mode: 'custom',
        presets,
        providerLabel: '',
        baseUrl: '',
        modelId: '',
        credential: {state: 'missing'},
        catalog: emptyCatalog,
      })),
    };
    const screen = render(
      <AppFacadesProvider value={facadesWith(modelConfig)}>
        <APIKeyGuideScreen />
      </AppFacadesProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(GENERIC_CUSTOM_CREDENTIAL_GUIDANCE)).toBeTruthy(),
    );
  });
});
