import React, {useEffect, useRef} from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import WebView from 'react-native-webview';
import type {NoNoMood} from '@shared/components/NoNoMascot';

interface NonoAvatar3DProps {
  mood: NoNoMood;
  layout?: 'stage' | 'preview';
  skinId?: string;
  style?: StyleProp<ViewStyle>;
  width?: number;
  height?: number;
}

const AVATAR_URI =
  Platform.OS === 'android'
    ? 'file:///android_asset/nono-avatar/avatar.html'
    : 'nono-avatar/avatar.html';

export const NonoAvatar3D: React.FC<NonoAvatar3DProps> = ({
  mood,
  layout = 'stage',
  skinId = 'builtin',
  style,
  width,
  height,
}) => {
  const webRef = useRef<WebView>(null);
  const size = useRef({width: 1, height: 1});

  const injectState = () => {
    webRef.current?.injectJavaScript(
      `window.NonoAvatar&&window.NonoAvatar.setLayout(${JSON.stringify(
        layout,
      )});window.NonoAvatar&&window.NonoAvatar.setSkin(${JSON.stringify(
        skinId,
      )});window.NonoAvatar&&window.NonoAvatar.setMood(${JSON.stringify(
        mood,
      )});true;`,
    );
  };

  useEffect(() => {
    injectState();
  }, [layout, mood, skinId]);

  const setLook = (event: GestureResponderEvent) => {
    const {locationX, locationY} = event.nativeEvent;
    const x = (locationX / size.current.width) * 2 - 1;
    const y = (locationY / size.current.height) * 2 - 1;
    webRef.current?.injectJavaScript(
      `window.NonoAvatar&&window.NonoAvatar.setLook(${x},${-y});true;`,
    );
  };

  const boxStyle =
    width && height
      ? {width, height}
      : {width: '100%' as const, height: '100%' as const};

  return (
    <View
      style={[styles.wrap, boxStyle, style]}
      collapsable={false}
      onLayout={event => {
        size.current = event.nativeEvent.layout;
      }}
      onTouchMove={layout === 'stage' ? setLook : undefined}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{uri: AVATAR_URI}}
        style={[boxStyle, styles.web]}
        containerStyle={[boxStyle, styles.web]}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        androidLayerType="hardware"
        javaScriptEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowingReadAccessToURL={AVATAR_URI}
        setSupportMultipleWindows={false}
        onLoadEnd={injectState}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f8f7f3',
  },
  web: {
    backgroundColor: '#f8f7f3',
  },
});
