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

