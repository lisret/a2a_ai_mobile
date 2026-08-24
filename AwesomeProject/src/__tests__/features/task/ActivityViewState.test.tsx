import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
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
