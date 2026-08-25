import React from 'react';
import {Platform} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {HomeScreen} from '../../../features/task/screens/HomeScreen';
import {AppFacadesProvider} from '../../../application/facades/AppFacadesContext';
import type {AppFacades} from '../../../application/facades/UiRuntimeContracts';

jest.mock('../../../features/task/asr/SpeechRouter', () => ({
  startUtterance: jest.fn(),
  stopUtterance: jest.fn(),
}));
jest.mock('../../../features/task/asr/AsrModelStore', () => ({ensureBuiltinAsr: jest.fn()}));
jest.mock('../../../features/task/asr/SilentAsrUpgrade', () => ({maybeSilentUpgradeAsr: jest.fn()}));
jest.mock('../../../features/task/avatar/AvatarPackStore', () => ({
  resolveAvatarGltfUri: jest.fn().mockResolvedValue('file:///avatar/model.glb'),
  rollbackAvatarToBuiltin: jest.fn(),
}));
jest.mock('react-native-permissions', () => ({
  request: jest.fn().mockResolvedValue('granted'),
  check: jest.fn().mockResolvedValue('granted'),
  PERMISSIONS: {ANDROID: {RECORD_AUDIO: 'android.permission.RECORD_AUDIO'}},
  RESULTS: {GRANTED: 'granted', DENIED: 'denied', BLOCKED: 'blocked', UNAVAILABLE: 'unavailable'},
}));

const speechRouter = require('../../../features/task/asr/SpeechRouter');
const asrStore = require('../../../features/task/asr/AsrModelStore');
const silentUpgrade = require('../../../features/task/asr/SilentAsrUpgrade');
const avatarStore = require('../../../features/task/avatar/AvatarPackStore');
const permissions = require('react-native-permissions');

function setPlatform(os: 'android' | 'ios'): void {
  Object.defineProperty(Platform, 'OS', {value: os, configurable: true});
}

function buildCompanion(over: Partial<Record<string, unknown>> = {}) {
  return {
    getViewState: jest.fn().mockResolvedValue({phase: 'idle', modelLabel: '陪伴模型'}),
    submitTranscript: jest.fn().mockResolvedValue({
      id: 'turn-2',
      transcript: '打开设置',
      reply: '准备操作',
      intent: 'operate',
    }),
    confirmProposal: jest.fn(),
    dismissTurn: jest.fn(),
    ...over,
  };
}

function buildFacades(companion: ReturnType<typeof buildCompanion>): AppFacades {
  return {
    companion,
    operate: {getViewState: jest.fn().mockResolvedValue({phase: 'idle', steps: []})},
  } as unknown as AppFacades;
}

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform('android');
  avatarStore.resolveAvatarGltfUri.mockResolvedValue('file:///avatar/model.glb');
  permissions.request.mockResolvedValue('granted');
});

test('routes final ASR text into CompanionFacade and applies active avatar URI', async () => {
  const companion = buildCompanion();
  const screen = render(
    <AppFacadesProvider value={buildFacades(companion)}>
      <HomeScreen />
    </AppFacadesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId('nono-avatar-3d').props.gltfUri).toBe(
      'file:///avatar/model.glb',
    ),
  );
  fireEvent.press(screen.getByLabelText('和 NoNo 说话'));
  await waitFor(() => expect(speechRouter.startUtterance).toHaveBeenCalled());
  const onEvent = speechRouter.startUtterance.mock.calls[0][0];
  await act(async () => {
    await onEvent({type: 'final', text: '打开设置', engine: 'builtin'});
  });
  expect(companion.submitTranscript).toHaveBeenCalledWith('打开设置');
});

test('denied microphone never starts ASR nor fabricates a transcript', async () => {
  permissions.request.mockResolvedValue('denied');
  const companion = buildCompanion();
  const screen = render(
    <AppFacadesProvider value={buildFacades(companion)}>
      <HomeScreen />
    </AppFacadesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId('nono-avatar-3d').props.gltfUri).toBe(
      'file:///avatar/model.glb',
    ),
  );
  fireEvent.press(screen.getByLabelText('和 NoNo 说话'));
  await waitFor(() => expect(permissions.request).toHaveBeenCalled());
  expect(speechRouter.startUtterance).not.toHaveBeenCalled();
  expect(companion.submitTranscript).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText('需要麦克风才能说话')).toBeTruthy());
});

test('partial ASR events only update the dock, never submit', async () => {
  const companion = buildCompanion();
  const screen = render(
    <AppFacadesProvider value={buildFacades(companion)}>
      <HomeScreen />
    </AppFacadesProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText('和 NoNo 说话')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('和 NoNo 说话'));
  await waitFor(() => expect(speechRouter.startUtterance).toHaveBeenCalled());
  const onEvent = speechRouter.startUtterance.mock.calls[0][0];
  await act(async () => {
    await onEvent({type: 'partial', text: '打开', engine: 'builtin'});
  });
  await waitFor(() => expect(screen.getByText('打开')).toBeTruthy());
  expect(companion.submitTranscript).not.toHaveBeenCalled();
});

test('empty final transcript does not submit', async () => {
  const companion = buildCompanion();
  const screen = render(
    <AppFacadesProvider value={buildFacades(companion)}>
      <HomeScreen />
    </AppFacadesProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText('和 NoNo 说话')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('和 NoNo 说话'));
  await waitFor(() => expect(speechRouter.startUtterance).toHaveBeenCalled());
  const onEvent = speechRouter.startUtterance.mock.calls[0][0];
  await act(async () => {
    await onEvent({type: 'final', text: '   ', engine: 'builtin'});
  });
  expect(companion.submitTranscript).not.toHaveBeenCalled();
});

test('unmount stops any active utterance', async () => {
  const companion = buildCompanion();
  const screen = render(
    <AppFacadesProvider value={buildFacades(companion)}>
      <HomeScreen />
    </AppFacadesProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText('和 NoNo 说话')).toBeTruthy());
  screen.unmount();
  expect(speechRouter.stopUtterance).toHaveBeenCalled();
});

test('avatar load failure rolls back to builtin and clears the URI', async () => {
  const companion = buildCompanion();
  const screen = render(
    <AppFacadesProvider value={buildFacades(companion)}>
      <HomeScreen />
    </AppFacadesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId('nono-avatar-3d').props.gltfUri).toBe(
      'file:///avatar/model.glb',
    ),
  );
  await act(async () => {
    screen.getByTestId('nono-avatar-3d').props.onGltfFailed();
  });
  expect(avatarStore.rollbackAvatarToBuiltin).toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByTestId('nono-avatar-3d').props.gltfUri).toBeNull(),
  );
});

test('iOS keeps builtin, shows the Android-only notice, and never touches Android modules', async () => {
  setPlatform('ios');
  const companion = buildCompanion();
  const screen = render(
    <AppFacadesProvider value={buildFacades(companion)}>
      <HomeScreen />
    </AppFacadesProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText('和 NoNo 说话')).toBeTruthy());
  expect(screen.getByTestId('nono-avatar-3d').props.gltfUri).toBeNull();
  fireEvent.press(screen.getByLabelText('和 NoNo 说话'));
  await waitFor(() =>
    expect(screen.getByText('当前版本听写仅支持 Android')).toBeTruthy(),
  );
  expect(speechRouter.startUtterance).not.toHaveBeenCalled();
  expect(asrStore.ensureBuiltinAsr).not.toHaveBeenCalled();
  expect(silentUpgrade.maybeSilentUpgradeAsr).not.toHaveBeenCalled();
  expect(avatarStore.resolveAvatarGltfUri).not.toHaveBeenCalled();
  expect(permissions.request).not.toHaveBeenCalled();
});
