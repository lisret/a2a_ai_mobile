import React from 'react';
import {View} from 'react-native-web';
import {previewPlatform} from './react-native';
export const SafeAreaProvider = ({children}: any) => <>{children}</>;
export const SafeAreaView = View;
export const useSafeAreaInsets = () => ({
  top: previewPlatform === 'ios' ? 47 : 24,
  bottom: previewPlatform === 'ios' ? 34 : 24,
  left: 0,
  right: 0,
});
export const useSafeAreaFrame = () => ({x: 0, y: 0, width: 390, height: 844});
