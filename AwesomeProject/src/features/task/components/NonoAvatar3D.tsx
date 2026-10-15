import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Platform,
  StyleSheet,
  View,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import WebView from 'react-native-webview';
import {
  useAvatarPresence,
  type RequestPetIntent,
} from '../avatar/useAvatarPresence';
import {NoNoMascot, type NoNoMood} from '@shared/components/NoNoMascot';

interface NonoAvatar3DProps {
  mood: NoNoMood;
  active?: boolean;
  requestPetIntent?: RequestPetIntent;
  gltfUri: string | null;
  onGltfFailed(): void;
  onPress?(): void;
  reactionKey?: number;
  pressLabel?: string;
  pressHint?: string;
  layout?: 'stage' | 'preview';
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
  gltfUri,
  onGltfFailed,
  onPress,
  reactionKey = 0,
  active = true,
  requestPetIntent,
  pressLabel = '和 NoNo 说话',
  pressHint = '轻点聊天，拖动模型旋转',
  layout = 'stage',
  style,
  width,
  height,
}) => {
  const webRef = useRef<WebView>(null);
  const [rendererFailed, setRendererFailed] = useState(false);

  const applyIntent = useCallback((value: string) => {
    webRef.current?.injectJavaScript(
      `window.NonoAvatar&&window.NonoAvatar.setPetTemperament(${JSON.stringify(
        value,
      )});true;`,
    );
  }, []);
  const presence = useAvatarPresence({
    active: active && !rendererFailed,
    gltfUri,
    mood,
    reactionKey,
    requestPetIntent,
    applyIntent,
  });
  const injectPresence = () => {
    webRef.current?.injectJavaScript(
      `if(window.NonoAvatar){window.NonoAvatar.setReducedMotion(${presence.reducedMotion});window.NonoAvatar.setActive(${presence.active});}true;`,
    );
  };
  const injectModel = () => {
    webRef.current?.injectJavaScript(
      gltfUri
        ? `window.NonoAvatar&&window.NonoAvatar.loadGltf(${JSON.stringify(
            gltfUri,
          )});true;`
        : 'window.NonoAvatar&&window.NonoAvatar.useBuiltin();true;',
    );
  };
  const injectMood = () => {
    webRef.current?.injectJavaScript(
      `window.NonoAvatar&&window.NonoAvatar.${
        reactionKey ? 'playMood' : 'setMood'
      }(${JSON.stringify(mood)});true;`,
    );
  };
  const injectLayout = () => {
    webRef.current?.injectJavaScript(
      `window.NonoAvatar&&window.NonoAvatar.setLayout(${JSON.stringify(
        layout,
      )});true;`,
    );
  };
  const injectState = () => {
    webRef.current?.injectJavaScript(
      `if(window.NonoAvatarFailed&&window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'avatar-render-failed'}));}true;`,
    );
    injectPresence();
    injectLayout();
    injectMood();
    injectModel();
  };
  // Model selection is independent of interaction state: a mood change never reloads GLB.
  useEffect(injectModel, [gltfUri]);
  useEffect(injectMood, [mood, reactionKey]);
  useEffect(injectLayout, [layout]);
  useEffect(injectPresence, [presence.active, presence.reducedMotion]);

  const boxStyle =
    width && height
      ? {width, height}
      : {width: '100%' as const, height: '100%' as const};

  return (
    <View
      testID="nono-avatar-3d"
      // Test seam: Home integration reads gltfUri / onGltfFailed off this host.
      {...({gltfUri, onGltfFailed} as Record<string, unknown>)}
      style={[styles.wrap, boxStyle, style]}
      collapsable={false}
      accessible={Boolean(onPress)}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? pressLabel : undefined}
      accessibilityHint={onPress ? pressHint : undefined}
      onAccessibilityTap={() => {
        presence.cancel();
        onPress?.();
      }}>
      {rendererFailed ? (
        <TouchableOpacity
          testID="avatar-render-fallback"
          style={styles.fallback}
          onPress={onPress}
          activeOpacity={0.9}>
          <NoNoMascot mood={mood} size={layout === 'preview' ? 84 : 150} />
        </TouchableOpacity>
      ) : (
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
          allowUniversalAccessFromFileURLs
          allowingReadAccessToURL="file:///android_asset/nono-avatar/"
          setSupportMultipleWindows={false}
          onError={() => setRendererFailed(true)}
          onLoadEnd={injectState}
          onMessage={event => {
            try {
              const payload = JSON.parse(String(event.nativeEvent.data));
              if (payload?.type === 'avatar-intent-request') {
                presence.request(payload.context);
              } else if (payload?.type === 'avatar-interaction') {
                presence.cancel();
              } else if (payload?.type === 'avatar-press') {
                presence.cancel();
                onPress?.();
              } else if (payload?.type === 'avatar-render-failed') {
                setRendererFailed(true);
              } else if (payload?.type === 'avatar-ready') {
                injectState();
              } else if (payload?.type === 'avatar-load-failed') {
                onGltfFailed();
              }
            } catch {
              // Non-JSON host messages are ignored; only avatar-load-failed is wired.
            }
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fallback: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  wrap: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f8f7f3',
  },
  web: {
    backgroundColor: '#f8f7f3',
  },
});
