import fs from 'fs';
import path from 'path';
import React from 'react';
import {Platform} from 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import {AvatarLooksScreen} from '../../../../features/settings/screens/AvatarLooksScreen';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({goBack: jest.fn(), navigate: jest.fn()}),
    useIsFocused: () => true,
  };
});

jest.mock('../../../../features/task/avatar/AvatarPackStore', () => {
  const actual = jest.requireActual(
    '../../../../features/task/avatar/AvatarPackStore',
  );
  return {
    ...actual,
    installPinnedAvatar: jest.fn(() => new Promise(() => {})),
    getActiveAvatarId: jest.fn().mockResolvedValue('builtin'),
    resolveAvatarGltfUri: jest.fn().mockResolvedValue(null),
  };
});

jest.mock('../../../../features/task/avatar/LocalPack', () => ({
  localPack: {
    listFiles: jest.fn().mockResolvedValue([]),
    getNetworkType: jest.fn().mockResolvedValue('wifi'),
  },
}));

jest.mock('@features/task/components/NonoAvatar3D', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    NonoAvatar3D: () => React.createElement(View, {testID: 'avatar-3d-preview'}),
  };
});

jest.mock('@shared/components/PageLayout', () => {
  const React = require('react');
  const {View, Text} = require('react-native');
  return {
    PageLayout: ({
      title,
      children,
    }: {
      title: string;
      children: React.ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        children,
      ),
  };
});

describe('AvatarLooksScreen', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', {value: 'android', configurable: true});
  });

  it('puts the looks row under companion in Settings', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../../features/settings/screens/SettingsScreen.tsx',
      ),
      'utf8',
    );
    const companion = source.indexOf("navigate('CompanionConfig')");
    const looks = source.indexOf("navigate('AvatarLooks')");
    expect(source).toContain('角色外观');
    expect(source).toContain('只换首页角色长什么样，不改说话用的模型');
    expect(companion).toBeGreaterThan(-1);
    expect(looks).toBeGreaterThan(companion);
  });

  it('shows preview, builtin without download, and a confirm before installing', () => {
    const screen = render(<AvatarLooksScreen />);

    expect(screen.getByTestId('avatar-look-preview')).toBeTruthy();
    expect(screen.getByText('当前 · 默认角色')).toBeTruthy();

    expect(
      screen.queryByTestId('look-download-builtin'),
    ).toBeNull();
    expect(screen.getByTestId('look-current-builtin')).toBeTruthy();

    fireEvent.press(screen.getByTestId('look-download-box'));
    expect(screen.getByText('下载「测试盒」？')).toBeTruthy();
    expect(screen.getAllByText(/2 KB/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Wi-Fi/)).toBeTruthy();
    expect(screen.getByTestId('look-status-box').props.children).toBe(
      '未下载',
    );

    fireEvent.press(screen.getByText('取消'));
    expect(screen.queryByText('下载「测试盒」？')).toBeNull();
    expect(screen.getByTestId('look-download-box')).toBeTruthy();

    fireEvent.press(screen.getByTestId('look-download-box'));
    fireEvent.press(screen.getByText('确认下载'));
    expect(screen.getByText('下载中')).toBeTruthy();
    expect(screen.queryByText('下载「测试盒」？')).toBeNull();
    screen.unmount();
  });
});
