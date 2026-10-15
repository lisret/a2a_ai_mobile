import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {HomeScreen} from '../../../features/task/screens/HomeScreen';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {AppFacades} from '../../../application/facades/UiRuntimeContracts';

test('starts the exact heard instruction and cancels the exact returned task', async () => {
  const listener = jest.fn();
  const operate = {
    getViewState: jest.fn().mockResolvedValue({phase: 'idle', steps: []}),
    start: jest.fn().mockResolvedValue({kind: 'started', taskId: 'task-7', sessionRevision: 4}),
    cancel: jest.fn().mockResolvedValue(undefined),
    subscribeTask: jest.fn((_id, _revision, next) => { listener.mockImplementation(next); return jest.fn(); }),
  };
  const companion = {
    getViewState: jest.fn().mockResolvedValue({
      phase: 'ready',
      turn: {id: 'turn-1', transcript: '打开设置', reply: '准备操作', intent: 'operate'},
    }),
    submitTranscript: jest.fn(), confirmProposal: jest.fn(), dismissTurn: jest.fn(),
  };
  const facades = {operate, companion, errands: {createFromProposal: jest.fn()}} as unknown as AppFacades;
  const screen = render(<AppFacadesProvider value={facades}><HomeScreen /></AppFacadesProvider>);
  await waitFor(() => expect(screen.getByText('开始操作')).toBeTruthy());
  fireEvent.press(screen.getByText('开始操作'));
  await waitFor(() => expect(operate.start).toHaveBeenCalledWith('打开设置'));
  expect(operate.subscribeTask).toHaveBeenCalledWith('task-7', 4, expect.any(Function));
});
