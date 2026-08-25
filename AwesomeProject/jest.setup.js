/**
 * Jest 测试环境设置
 */

/* eslint-env jest */

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getAllKeys: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
}));

const {NativeModules} = require('react-native');
NativeModules.AccessibilityModule = {};
NativeModules.AccessibilityActionModule = {};
NativeModules.ADBModule = {};
NativeModules.LocalPackModule = {};
NativeModules.SherpaAsrModule = {};

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useFocusEffect: (effect) => React.useEffect(effect, []),
  };
});

jest.mock('react-native-vector-icons/FontAwesome', () => 'Icon');

// react-native-webview ships ESM that Jest's transformIgnorePatterns does not
// transform; stub it as a host component so screens embedding the avatar render.
jest.mock('react-native-webview', () => 'WebView');
