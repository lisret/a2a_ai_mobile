import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {PhoneOperateScreen} from '../../../features/capability/screens/PhoneOperateScreen';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {
  AppFacades,
  PhoneOperateViewState,
} from '../../../application/facades/UiRuntimeContracts';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({navigate: jest.fn(), goBack: jest.fn()}),
    useFocusEffect: (cb: () => void | (() => void)) => {
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

const blockedState: PhoneOperateViewState = {
  status: 'ready',
  revision: 12,
  activeMode: 'cloud_direct',
  draftMode: 'local_vision_cloud_planner',
  adbFallbackEnabled: false,
  modes: {
    cloud_direct: {
      id: 'cloud_direct',
      label: '云端一体',
      nodes: ['截图', '云端一体', '动作'],
      caption: '可运行',
      runnable: true,
      blockers: [],
    },
    cloud_split: {
      id: 'cloud_split',
      label: '双云端',
      nodes: ['截图', '云端视觉', '云端编排', '动作'],
      caption: '可运行',
      runnable: true,
      blockers: [],
    },
    local_vision_cloud_planner: {
      id: 'local_vision_cloud_planner',
      label: '本地视觉',
      nodes: ['截图', '本地视觉', '云端编排', '动作'],
      caption: '截图不离机',
      runnable: false,
      blockers: [
        {code: 'local_model_not_ready', message: '本地视觉模型未就绪'},
      ],
    },
  },
};

const runnableState: PhoneOperateViewState = {
  ...blockedState,
  draftMode: 'cloud_direct',
};

function makeFacades(phoneOperate: Partial<AppFacades['phoneOperate']>): AppFacades {
  return {phoneOperate} as unknown as AppFacades;
}

describe('PhoneOperateScreen', () => {
  it('shows the real blocker and never calls activate for an unrunnable draft', async () => {
    const phoneOperate = {
      getViewState: jest.fn().mockResolvedValue(blockedState),
      selectDraftMode: jest.fn(),
      activateDraftMode: jest.fn(),
      setAdbFallbackEnabled: jest.fn(),
    };
    const screen = render(
      <AppFacadesProvider value={makeFacades(phoneOperate)}>
        <PhoneOperateScreen />
      </AppFacadesProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('本地视觉模型未就绪')).toBeTruthy(),
    );
    expect(
      screen.getByTestId('activate-operate-mode').props.accessibilityState
        .disabled,
    ).toBe(true);
    fireEvent.press(screen.getByTestId('activate-operate-mode'));
    expect(phoneOperate.activateDraftMode).not.toHaveBeenCalled();
  });

  it('never renders the removed cloud-fallback copy', async () => {
    const phoneOperate = {
      getViewState: jest.fn().mockResolvedValue(blockedState),
      selectDraftMode: jest.fn(),
      activateDraftMode: jest.fn(),
      setAdbFallbackEnabled: jest.fn(),
    };
    const screen = render(
      <AppFacadesProvider value={makeFacades(phoneOperate)}>
        <PhoneOperateScreen />
      </AppFacadesProvider>,
    );
    await waitFor(() => expect(screen.getByText('本地视觉模型未就绪')).toBeTruthy());
    expect(screen.queryByText(/当前任务仍走云端一体/)).toBeNull();
  });

  it('activates a runnable draft with the loaded revision', async () => {
    const nextState: PhoneOperateViewState = {...runnableState, revision: 13};
    const phoneOperate = {
      getViewState: jest.fn().mockResolvedValue(runnableState),
      selectDraftMode: jest.fn(),
      activateDraftMode: jest.fn().mockResolvedValue(nextState),
      setAdbFallbackEnabled: jest.fn(),
    };
    const screen = render(
      <AppFacadesProvider value={makeFacades(phoneOperate)}>
        <PhoneOperateScreen />
      </AppFacadesProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId('activate-operate-mode').props.accessibilityState
          .disabled,
      ).toBe(false),
    );
    fireEvent.press(screen.getByTestId('activate-operate-mode'));
    await waitFor(() =>
      expect(phoneOperate.activateDraftMode).toHaveBeenCalledWith(12),
    );
  });
});
