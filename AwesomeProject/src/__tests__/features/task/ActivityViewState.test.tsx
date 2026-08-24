import React from 'react';
import {render, waitFor, fireEvent} from '@testing-library/react-native';
import {TaskHistoryScreenTab} from '../../../features/task/screens/TaskHistoryScreenTab';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {AppFacades} from '../../../application/facades/UiRuntimeContracts';

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

function makeFacades(): AppFacades {
  return {
    activity: {
      getViewState: jest.fn().mockResolvedValue({
        status: 'ready', memoryEnabled: true, memoryLocationLabel: '仅这台手机', preferences: [], errands: [], tasks: [],
      }),
      forgetPreference: jest.fn(),
      deleteTask: jest.fn(),
    },
  } as unknown as AppFacades;
}

test('renders empty activity states from the facade without injecting seed memories', async () => {
  const facades = makeFacades();
  const activity = render(
    <AppFacadesProvider value={facades}>
      <TaskHistoryScreenTab />
    </AppFacadesProvider>,
  );
  await waitFor(() => expect(activity.getByText('还没有称呼或偏好')).toBeTruthy());
  expect(activity.queryByText('咖啡少糖')).toBeNull();
});

test('surfaces a safe load error with a working 重试 instead of empty-store copy', async () => {
  const getViewState = jest.fn().mockRejectedValue(new Error('boom'));
  const facades = {
    activity: {getViewState, forgetPreference: jest.fn(), deleteTask: jest.fn()},
  } as unknown as AppFacades;

  const screen = render(
    <AppFacadesProvider value={facades}>
      <TaskHistoryScreenTab />
    </AppFacadesProvider>,
  );
  await waitFor(() => expect(screen.getByText('暂时读不到活动记录')).toBeTruthy());
  // A failed load must not masquerade as a genuinely empty store.
  expect(screen.queryByText('还没有称呼或偏好')).toBeNull();
  expect(screen.getByText('重试')).toBeTruthy();
  expect(getViewState).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText('重试'));
  await waitFor(() => expect(getViewState).toHaveBeenCalledTimes(2));
});
