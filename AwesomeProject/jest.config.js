/**
 * Jest 测试配置
 *
 * - preset: react-native（内置 React Native 模拟环境）
 * - transformIgnorePatterns: 默认 node_modules 全部忽略，这里显式放行
 *   react-native / @react-native / @react-navigation 这三个包的 ESM 模块
 *   （React Native 生态中大多数库仍发布 CommonJS，不需要 transform）
 * - collectCoverageFrom: 只统计 src/ 下的 TS/TSX，排除类型声明和测试文件
 */
module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation)/)',
  ],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
