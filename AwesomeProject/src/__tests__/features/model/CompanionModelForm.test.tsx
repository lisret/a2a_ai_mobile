import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import {AddModelScreen} from '../../../features/model/screens/AddModelScreen';
import {EditModelScreen} from '../../../features/model/screens/EditModelScreen';
import {CompanionConfigScreen} from '../../../features/settings/screens/CompanionConfigScreen';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import {
  PROVIDER_PRESET_ORDER,
  PROVIDER_PRESET_DISPLAY,
} from '../../../shared/constants/apiProviders';
import {COLORS} from '@shared/constants';
import type {
  AppFacades,
  ModelCatalogViewState,
  ModelConfigViewState,
  ProviderPresetViewState,
} from '../../../application/facades/UiRuntimeContracts';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
let mockParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({goBack: mockGoBack, navigate: mockNavigate}),
    useRoute: () => ({params: mockParams}),
    useFocusEffect: (cb: () => void) => {
      const React = require('react');
      React.useEffect(() => cb(), []);
    },
  };
});

jest.mock('react-native-vector-icons/FontAwesome', () => 'Icon');

jest.mock('@shared/components/PageLayout', () => {
  const React = require('react');
  const {View, Text} = require('react-native');
  return {
    PageLayout: ({
      title,
      children,
    }: {
      title: string;
      children: React.ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        children,
      ),
  };
});

jest.mock('../../../features/model/components/ModelListPanel', () => {
  const React = require('react');
  const {View, Text} = require('react-native');
  return {
    ModelListPanel: ({title}: {title: string}) =>
      React.createElement(View, null, React.createElement(Text, null, title)),
  };
});

const presets: readonly ProviderPresetViewState[] = PROVIDER_PRESET_ORDER.map(
  id => ({
    id,
    label: PROVIDER_PRESET_DISPLAY[id].label,
    maturity: PROVIDER_PRESET_DISPLAY[id].maturity,
    catalogSupported: true,
  }),
);

const emptyCatalog: ModelCatalogViewState = {
  requestGeneration: 0,
  status: 'empty',
  models: [],
};

const COMPANION_NOTE = '这条配置只用于首页说话，不会拿去看屏或点应用。';
const UNIFIED_NOTE = '这条配置用于看屏和点应用，和设置里的陪伴模型不是同一份。';

function facadesWith(
  modelConfig: Partial<AppFacades['modelConfig']>,
): AppFacades {
  return {modelConfig} as unknown as AppFacades;
}

function fakeModelConfig(overrides?: Partial<ModelConfigViewState>) {
  const viewState: ModelConfigViewState = {
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
    ...overrides,
  };
  return {
    getViewState: jest.fn(async () => viewState),
    refreshCatalog: jest.fn(async () => emptyCatalog),
    save: jest.fn(async () => viewState),
  };
}

function saveButtonStyle(screen: ReturnType<typeof render>) {
  const style = screen.getByTestId('model-form-save').props.style;
  return Array.isArray(style) ? Object.assign({}, ...style) : style;
}

describe('companion model form UI', () => {
  beforeEach(() => {
    mockParams = {};
    mockGoBack.mockReset();
    mockNavigate.mockReset();
  });

  it('uses companion copy and hides max steps on add', () => {
    mockParams = {list: 'companion'};
    const screen = render(
      <AppFacadesProvider value={facadesWith(fakeModelConfig())}>
        <AddModelScreen />
      </AppFacadesProvider>,
    );

    expect(screen.getByText('新增陪伴模型')).toBeTruthy();
    expect(screen.getByText(COMPANION_NOTE)).toBeTruthy();
    expect(screen.queryByText(UNIFIED_NOTE)).toBeNull();
    expect(screen.queryByText('最大执行步数')).toBeNull();
    expect(screen.getByText('保存模型')).toBeTruthy();
    expect(screen.queryByText('取消')).toBeNull();
    expect(saveButtonStyle(screen)).toEqual(
      expect.objectContaining({
        backgroundColor: COLORS.violet,
        borderRadius: 999,
        minHeight: 52,
      }),
    );
  });

  it('uses phone-operate copy on the unified add form', () => {
    mockParams = {list: 'unified'};
    const screen = render(
      <AppFacadesProvider value={facadesWith(fakeModelConfig())}>
        <AddModelScreen />
      </AppFacadesProvider>,
    );

    expect(screen.getByText('新增模型')).toBeTruthy();
    expect(screen.getByText(UNIFIED_NOTE)).toBeTruthy();
    expect(screen.queryByText(COMPANION_NOTE)).toBeNull();
    expect(screen.getByText('保存模型')).toBeTruthy();
    expect(saveButtonStyle(screen)).toEqual(
      expect.objectContaining({
        backgroundColor: COLORS.violet,
        borderRadius: 999,
        minHeight: 52,
      }),
    );
  });

  it('uses companion copy and hides max steps on edit (by bindingId)', async () => {
    mockParams = {bindingId: 'binding-1', list: 'companion'};
    const modelConfig = fakeModelConfig({
      modelId: 'nono-chat-2',
      credential: {state: 'ready', maskedLabel: '••••1234'},
    });
    const screen = render(
      <AppFacadesProvider value={facadesWith(modelConfig)}>
        <EditModelScreen />
      </AppFacadesProvider>,
    );

    expect(screen.getByText('编辑陪伴模型')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(COMPANION_NOTE)).toBeTruthy();
    });
    expect(screen.queryByText('最大执行步数')).toBeNull();
    expect(screen.getByText('保存模型')).toBeTruthy();
    expect(screen.queryByText('取消')).toBeNull();
    expect(saveButtonStyle(screen)).toEqual(
      expect.objectContaining({
        backgroundColor: COLORS.violet,
        borderRadius: 999,
        minHeight: 52,
      }),
    );
    expect(modelConfig.getViewState).toHaveBeenCalledWith(
      expect.objectContaining({bindingId: 'binding-1', list: 'companion'}),
    );
  });

  it('shows the API key guide on the companion config page', () => {
    const screen = render(
      <AppFacadesProvider value={facadesWith(fakeModelConfig())}>
        <CompanionConfigScreen />
      </AppFacadesProvider>,
    );
    expect(screen.getByText('陪伴模型')).toBeTruthy();
    expect(screen.getByText('API Key 获取指南')).toBeTruthy();
  });
});
