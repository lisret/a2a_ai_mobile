/**
 * Babel 配置
 *
 * - 使用 @react-native/babel-preset（包含 JSX、TypeScript、HMR 等）
 * - module-resolver 插件提供路径别名，与 tsconfig.json 的 paths 保持一致：
 *     @core       → src/core（能力层、引擎层）
 *     @features   → src/features（功能模块）
 *     @shared     → src/shared（类型、常量、工具）
 *     @navigation → src/navigation（导航配置）
 */
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.jsx', '.json', '.ts', '.tsx'],
        alias: {
          '@core': './src/core',
          '@features': './src/features',
          '@shared': './src/shared',
          '@navigation': './src/navigation',
        },
      },
    ],
  ],
};
