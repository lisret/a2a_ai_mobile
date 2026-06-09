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
