import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {NoNoActivityView} from '../../../features/task/components/NoNoActivityView';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn(), navigate: jest.fn()}),
  useIsFocused: () => true,
}));

test('Activity exposes status text and delegates deletion confirmation', () => {
  const onOpen = jest.fn();
  const onRequestDelete = jest.fn();
  const onConfirmDelete = jest.fn();
  const view = render(
    <NoNoActivityView
      filter="all"
      refreshing={false}
      pendingDeleteId={null}
      emptyTitle="暂无活动"
      emptyMessage="暂无活动"
      onRefresh={jest.fn()}
      onFilterChange={jest.fn()}
      onOpen={onOpen}
      onRequestDelete={onRequestDelete}
      onConfirmDelete={onConfirmDelete}
      onCancelDelete={jest.fn()}
      items={[
        {
          id: 't1',
          title: '打开设置',
          timeLabel: '09:41',
          stepsLabel: '2 个步骤',
          status: 'success',
          statusLabel: '已完成',
        },
      ]}
    />,
  );
  expect(view.getByText('已完成')).toBeTruthy();
  fireEvent(view.getByLabelText('删除 打开设置'), 'longPress');
  expect(onRequestDelete).toHaveBeenCalledWith('t1');

  view.rerender(
    <NoNoActivityView
      filter="all"
      refreshing={false}
      pendingDeleteId="t1"
      emptyTitle="暂无活动"
      emptyMessage="暂无活动"
      onRefresh={jest.fn()}
      onFilterChange={jest.fn()}
      onOpen={onOpen}
      onRequestDelete={onRequestDelete}
      onConfirmDelete={onConfirmDelete}
      onCancelDelete={jest.fn()}
      items={[]}
    />,
  );
  fireEvent.press(view.getByText('确认删除'));
  expect(onConfirmDelete).toHaveBeenCalledTimes(1);
});
