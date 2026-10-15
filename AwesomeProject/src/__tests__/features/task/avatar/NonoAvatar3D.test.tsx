import React from 'react';
import {AccessibilityInfo, AppState} from 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import {NonoAvatar3D} from '../../../../features/task/components/NonoAvatar3D';
const mockInject = jest.fn();
jest.mock('react-native-webview', () => {
  const React = require('react');
  const {View} = require('react-native');
  return React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({injectJavaScript: mockInject}));
    return <View {...props} testID="avatar-webview" />;
  });
});
beforeEach(() => mockInject.mockClear());
test('changing mood preserves model; ready replays current state without losing it', () => {
  const fail = jest.fn();
  const screen = render(
    <NonoAvatar3D
      mood="idle"
      gltfUri="file:///model.glb"
      onGltfFailed={fail}
    />,
  );
  mockInject.mockClear();
  screen.rerender(
    <NonoAvatar3D
      mood="listen"
      gltfUri="file:///model.glb"
      onGltfFailed={fail}
    />,
  );
  expect(mockInject.mock.calls.map(([s]) => s).join('')).toContain(
    'setMood("listen")',
  );
  expect(mockInject.mock.calls.map(([s]) => s).join('')).not.toContain(
    'loadGltf',
  );
  fireEvent(screen.getByTestId('avatar-webview'), 'message', {
    nativeEvent: {data: JSON.stringify({type: 'avatar-ready'})},
  });
  expect(mockInject.mock.calls.map(([s]) => s).join('')).toContain(
    'loadGltf("file:///model.glb")',
  );
});
test('renderer failures show native fallback while model failures report to host', () => {
  const fail = jest.fn();
  const screen = render(
    <NonoAvatar3D mood="idle" gltfUri={null} onGltfFailed={fail} />,
  );
  fireEvent(screen.getByTestId('avatar-webview'), 'message', {
    nativeEvent: {data: JSON.stringify({type: 'avatar-load-failed'})},
  });
  expect(fail).toHaveBeenCalledTimes(1);
  fireEvent(screen.getByTestId('avatar-webview'), 'message', {
    nativeEvent: {data: JSON.stringify({type: 'avatar-render-failed'})},
  });
  expect(screen.getByTestId('avatar-render-fallback')).toBeTruthy();
  expect(screen.queryByTestId('avatar-webview')).toBeNull();
});

test('canvas tap reaches chat through WebView without a blocking touch overlay', () => {
  const onPress = jest.fn();
  const screen = render(
    <NonoAvatar3D
      mood="idle"
      gltfUri={null}
      onGltfFailed={jest.fn()}
      onPress={onPress}
    />,
  );
  fireEvent(screen.getByTestId('avatar-webview'), 'message', {
    nativeEvent: {data: JSON.stringify({type: 'avatar-press'})},
  });
  expect(onPress).toHaveBeenCalledTimes(1);
  fireEvent(screen.getByLabelText('和 NoNo 说话'), 'accessibilityTap');
  expect(onPress).toHaveBeenCalledTimes(2);
  expect(
    screen.getByTestId('nono-avatar-3d').props.onTouchMove,
  ).toBeUndefined();
});

test('explicit reaction presses replay without reloading the model', () => {
  const fail = jest.fn();
  const screen = render(
    <NonoAvatar3D
      mood="wink"
      reactionKey={1}
      gltfUri={null}
      onGltfFailed={fail}
    />,
  );
  mockInject.mockClear();
  screen.rerender(
    <NonoAvatar3D
      mood="wink"
      reactionKey={2}
      gltfUri={null}
      onGltfFailed={fail}
    />,
  );
  expect(mockInject.mock.calls.map(([s]) => s).join('')).toContain(
    'playMood("wink")',
  );
  expect(mockInject.mock.calls.map(([s]) => s).join('')).not.toContain(
    'useBuiltin',
  );
  expect(mockInject.mock.calls.map(([s]) => s).join('')).not.toContain(
    'loadGltf',
  );
});

test('offscreen hosts stop rendering and cannot request pet AI', () => {
  const requestPetIntent = jest.fn();
  const screen = render(
    <NonoAvatar3D
      mood="idle"
      gltfUri={null}
      active={false}
      requestPetIntent={requestPetIntent}
      onGltfFailed={jest.fn()}
    />,
  );
  expect(mockInject.mock.calls.map(([s]) => s).join('')).toContain(
    'setActive(false)',
  );
  fireEvent(screen.getByTestId('avatar-webview'), 'message', {
    nativeEvent: {
      data: JSON.stringify({
        type: 'avatar-intent-request',
        context: {temperament: 'calm', idleSeconds: 20, lastAction: null},
      }),
    },
  });
  expect(requestPetIntent).not.toHaveBeenCalled();
});

test('pet requests are throttled and an interaction cancels/invalidates the late AI response', async () => {
  let resolve: (v: any) => void = () => {};
  const requestPetIntent = jest.fn(
    (_context: any, _signal: AbortSignal) =>
      new Promise<any>(r => {
        resolve = r;
      }),
  );
  const screen = render(
    <NonoAvatar3D
      mood="idle"
      gltfUri={null}
      requestPetIntent={requestPetIntent}
      onGltfFailed={jest.fn()}
    />,
  );
  const message = (type: string) =>
    fireEvent(screen.getByTestId('avatar-webview'), 'message', {
      nativeEvent: {
        data: JSON.stringify({
          type,
          context: {temperament: 'calm', idleSeconds: 20, lastAction: null},
        }),
      },
    });
  await act(async () => {
    message('avatar-intent-request');
    message('avatar-intent-request');
  });
  expect(requestPetIntent).toHaveBeenCalledTimes(1);
  message('avatar-interaction');
  expect(requestPetIntent.mock.calls[0][1].aborted).toBe(true);
  mockInject.mockClear();
  await act(async () => resolve({temperament: 'playful'}));
  expect(mockInject.mock.calls.map(([s]) => s).join('')).not.toContain(
    'setPetTemperament',
  );
});

test('valid AI intent reaches the visible builtin model', async () => {
  const requestPetIntent = jest
    .fn()
    .mockResolvedValue({temperament: 'curious'});
  const screen = render(
    <NonoAvatar3D
      mood="idle"
      gltfUri={null}
      requestPetIntent={requestPetIntent}
      onGltfFailed={jest.fn()}
    />,
  );
  await act(async () =>
    fireEvent(screen.getByTestId('avatar-webview'), 'message', {
      nativeEvent: {
        data: JSON.stringify({
          type: 'avatar-intent-request',
          context: {temperament: 'calm', idleSeconds: 20, lastAction: null},
        }),
      },
    }),
  );
  expect(mockInject.mock.calls.map(([s]) => s).join('')).toContain(
    'setPetTemperament("curious")',
  );
});

const petMessage = (screen: ReturnType<typeof render>) =>
  fireEvent(screen.getByTestId('avatar-webview'), 'message', {
    nativeEvent: {
      data: JSON.stringify({
        type: 'avatar-intent-request',
        context: {temperament: 'calm', idleSeconds: 20, lastAction: null},
      }),
    },
  });

test.each(['background', 'manual', 'model', 'reduced', 'timeout', 'unmount'])(
  '%s cancels AI and rejects late answers',
  async reason => {
    jest.useFakeTimers();
    let resolve: (value: any) => void = () => {};
    const requestPetIntent = jest.fn(
      (_context: any, _signal: AbortSignal) =>
        new Promise<any>(r => {
          resolve = r;
        }),
    );
    const props = {
      mood: 'idle' as const,
      gltfUri: null,
      requestPetIntent,
      onGltfFailed: jest.fn(),
    };
    const screen = render(<NonoAvatar3D {...props} />);
    await act(async () => {
      petMessage(screen);
    });
    expect(requestPetIntent).toHaveBeenCalledTimes(1);
    await act(async () => {
      if (reason === 'background')
        (AppState.addEventListener as jest.Mock).mock.calls.at(-1)[1](
          'background',
        );
      if (reason === 'manual')
        screen.rerender(<NonoAvatar3D {...props} mood="listen" />);
      if (reason === 'model')
        screen.rerender(
          <NonoAvatar3D {...props} gltfUri="file:///other.glb" />,
        );
      if (reason === 'reduced')
        (AccessibilityInfo.addEventListener as jest.Mock).mock.calls.at(-1)[1](
          true,
        );
      if (reason === 'timeout') jest.advanceTimersByTime(10001);
      if (reason === 'unmount') screen.unmount();
    });
    expect(requestPetIntent.mock.calls[0][1].aborted).toBe(true);
    mockInject.mockClear();
    await act(async () => {
      resolve({temperament: 'playful'});
    });
    expect(
      mockInject.mock.calls.map(([script]) => script).join(''),
    ).not.toContain('setPetTemperament');
    screen.unmount();
    jest.useRealTimers();
  },
);

test('malformed AI output is ignored and completed requests stay throttled', async () => {
  const requestPetIntent = jest
    .fn()
    .mockResolvedValue({temperament: 'curious);alert(1)'});
  const screen = render(
    <NonoAvatar3D
      mood="idle"
      gltfUri={null}
      requestPetIntent={requestPetIntent}
      onGltfFailed={jest.fn()}
    />,
  );
  mockInject.mockClear();
  await act(async () => {
    petMessage(screen);
  });
  await act(async () => {
    petMessage(screen);
  });
  expect(requestPetIntent).toHaveBeenCalledTimes(1);
  expect(
    mockInject.mock.calls.map(([script]) => script).join(''),
  ).not.toContain('setPetTemperament');
});

test.each([
  'listen',
  'thinking',
  'success',
  'error',
  'confirm',
  'surprised',
  'shy',
  'laugh',
  'fold',
  'unfold',
])('AI still accepts local state after %s', async lastAction => {
  const requestPetIntent = jest.fn().mockResolvedValue(null);
  const screen = render(
    <NonoAvatar3D
      mood="idle"
      gltfUri={null}
      requestPetIntent={requestPetIntent}
      onGltfFailed={jest.fn()}
    />,
  );
  await act(async () =>
    fireEvent(screen.getByTestId('avatar-webview'), 'message', {
      nativeEvent: {
        data: JSON.stringify({
          type: 'avatar-intent-request',
          context: {temperament: 'calm', idleSeconds: 20, lastAction},
        }),
      },
    }),
  );
  expect(requestPetIntent).toHaveBeenCalledTimes(1);
  expect(requestPetIntent.mock.calls[0][0].lastAction).toBe(lastAction);
});
