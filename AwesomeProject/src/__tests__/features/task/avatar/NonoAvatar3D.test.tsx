import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
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
