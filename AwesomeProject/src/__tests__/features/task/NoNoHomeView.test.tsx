import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {NoNoHomeView} from '../../../features/task/components/NoNoHomeView';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn(), navigate: jest.fn()}),
  useIsFocused: () => true,
}));

test('Home shows Elel on the NoNo shell and dispatches input actions', () => {
  const callbacks = {
    onInputChange: jest.fn(),
    onClear: jest.fn(),
    onStart: jest.fn(),
    onRequestStop: jest.fn(),
    onConfirmStop: jest.fn(),
    onCancelStop: jest.fn(),
    onSuggestionSelect: jest.fn(),
    onAvatarPress: jest.fn(),
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
      bubble="点我，或在下面打字，剩下的交给我。"
      {...callbacks}
    />,
  );
  expect(view.getByText('NoNo')).toBeTruthy();
  expect(view.getByLabelText('Elel Silverbell')).toBeTruthy();
  expect(view.queryByText('今天想让手机替你完成什么？')).toBeNull();
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
