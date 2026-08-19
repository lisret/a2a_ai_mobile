/**
 * Jest 测试环境设置
 */

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

jest.mock('react-native-svg', () => {
  const React = require('react');
  const Mock = props => React.createElement('svg', props, props.children);
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

jest.mock('react-native-vector-icons/FontAwesome', () => 'Icon');

jest.mock('react-native-webview', () => {
  const {View} = require('react-native');
  return {
    __esModule: true,
    default: View,
    WebView: View,
  };
});
