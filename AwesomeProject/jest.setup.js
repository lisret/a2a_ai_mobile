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

jest.mock('react-native-vector-icons/FontAwesome', () => 'Icon');
