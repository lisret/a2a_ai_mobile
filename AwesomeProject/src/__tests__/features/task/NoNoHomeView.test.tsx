import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {NoNoHomeView} from '../../../features/task/components/NoNoHomeView';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn(), navigate: jest.fn()}),
  useIsFocused: () => true,
}));

test('Home dispatches input, suggestion, start and stop without owning execution', () => {
  const callbacks = {
    onInputChange: jest.fn(),
    onClear: jest.fn(),
    onStart: jest.fn(),
    onRequestStop: jest.fn(),
    onConfirmStop: jest.fn(),
    onCancelStop: jest.fn(),
    onSuggestionSelect: jest.fn(),
  };
  const view = render(
    <NoNoHomeView
      input=""
      executing={false}
      displayInstruction=""
      steps={[]}
      suggestions={[{label: '打开设置', value: '打开设置'}]}
      quickTasks={[]}
      stopConfirmVisible={false}
      {...callbacks}
    />,
  );
  expect(view.getByText('让 NoNo 开始')).toBeTruthy();
  fireEvent.press(view.getByRole('button', {name: '打开设置'}));
  expect(callbacks.onSuggestionSelect).toHaveBeenCalledWith('打开设置');

  view.rerender(
    <NoNoHomeView
      input="打开设置"
      executing
      displayInstruction="打开设置"
      currentStep={1}
      steps={[{step: 1, action: '启动应用', timestamp: Date.now()} as any]}
      suggestions={[]}
      quickTasks={[]}
      stopConfirmVisible={false}
      {...callbacks}
    />,
  );
  fireEvent.press(view.getByText('终止'));
  expect(callbacks.onRequestStop).toHaveBeenCalledTimes(1);
});
