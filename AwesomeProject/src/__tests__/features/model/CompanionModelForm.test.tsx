import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import {AddModelScreen} from '../../../features/model/screens/AddModelScreen';
import {EditModelScreen} from '../../../features/model/screens/EditModelScreen';
import {CompanionConfigScreen} from '../../../features/settings/screens/CompanionConfigScreen';
import {COLORS} from '@shared/constants';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
let mockParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({goBack: mockGoBack, navigate: mockNavigate}),
    useRoute: () => ({params: mockParams}),
    useFocusEffect: (cb: () => void) => cb(),
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

function saveButtonStyle(screen: ReturnType<typeof render>) {
  const style = screen.getByTestId('model-form-save').props.style;
  return Array.isArray(style) ? Object.assign({}, ...style) : style;
}

jest.mock('../../../features/model/services/ModelService', () => ({
  modelService: {
    getAllModels: jest.fn(async () => []),
    getSelectedModel: jest.fn(async () => null),
    getModelById: jest.fn(async () => ({
      id: 'm1',
      name: 'NoNo Chat',
      provider: 'custom',
      apiUrl: 'https://chat.example.ai/v1',
      apiKey: 'sk-test',
      modelName: 'nono-chat-2',
      maxSteps: 99,
    })),
    addModel: jest.fn(),
    updateModel: jest.fn(),
    deleteModel: jest.fn(),
    setSelectedModel: jest.fn(),
  },
}));

describe('companion model form UI', () => {
  beforeEach(() => {
    mockParams = {};
    mockGoBack.mockReset();
    mockNavigate.mockReset();
  });

  it('uses companion copy and hides max steps on add', () => {
    mockParams = {list: 'companion'};
    const screen = render(<AddModelScreen />);

    expect(screen.getByText('新增陪伴模型')).toBeTruthy();
    expect(
      screen.getByText('这条配置只用于首页说话，不会拿去看屏或点应用。'),
    ).toBeTruthy();
    expect(screen.queryByText('最大执行步数')).toBeNull();
    expect(screen.getByPlaceholderText('例如：NoNo Chat')).toBeTruthy();
    expect(screen.getByText('配置名称')).toBeTruthy();
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

  it('keeps max steps on the phone-operate add form', () => {
    mockParams = {list: 'unified'};
    const screen = render(<AddModelScreen />);

    expect(screen.getByText('新增模型')).toBeTruthy();
    expect(screen.getByText('最大执行步数')).toBeTruthy();
    expect(screen.getByText('保存模型')).toBeTruthy();
    expect(saveButtonStyle(screen)).toEqual(
      expect.objectContaining({
        backgroundColor: COLORS.violet,
        borderRadius: 999,
        minHeight: 52,
      }),
    );
  });

  it('uses companion copy and hides max steps on edit', async () => {
    mockParams = {modelId: 'm1', list: 'companion'};
    const screen = render(<EditModelScreen />);

    expect(screen.getByText('编辑陪伴模型')).toBeTruthy();
    await waitFor(() => {
      expect(
        screen.getByText('这条配置只用于首页说话，不会拿去看屏或点应用。'),
      ).toBeTruthy();
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
  });

  it('shows the API key guide on the companion config page', () => {
    const screen = render(<CompanionConfigScreen />);
    expect(screen.getByText('陪伴模型')).toBeTruthy();
    expect(screen.getByText('API Key 获取指南')).toBeTruthy();
  });
});
