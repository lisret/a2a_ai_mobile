/**
 * Jest 测试环境设置
 */

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

// Mock React Native 模块
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.DeviceEventEmitter = {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeListener: jest.fn(),
    emit: jest.fn(),
  };
  return RN;
});

// Mock 原生模块
jest.mock('react-native/Libraries/BatchedBridge/NativeModules', () => ({
  AccessibilityModule: {},
  ADBModule: {},
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const {View} = require('react-native');
  const Mock = (props) => React.createElement(View, props, props.children);
  return {
    __esModule: true,
    default: Mock,
    Svg: Mock,
    Path: Mock,
    Circle: Mock,
    Rect: Mock,
    G: Mock,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
  SafeAreaProvider: ({children}) => children,
}));

