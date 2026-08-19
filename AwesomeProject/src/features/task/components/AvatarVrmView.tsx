import React, {useEffect, useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import type {AvatarMood} from './avatarTypes';
import {getElelVrmWebViewSource} from './vrmViewerSource';

const LOAD_TIMEOUT_MS = 12000;

type ViewerMessage =
  | {type: 'ready'}
  | {type: 'error'; message?: string}
  | {type: 'press'}
  | {type: 'longpress'};

interface AvatarVrmViewProps {
  mood: AvatarMood;
  compact?: boolean;
  onReady?: () => void;
  onError?: (message: string) => void;
  onPress?: () => void;
  onLongPress?: () => void;
}

export const AvatarVrmView: React.FC<AvatarVrmViewProps> = ({
  mood,
  compact = false,
  onReady,
  onError,
  onPress,
  onLongPress,
}) => {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const injectState = () => {
    const js =
      `window.__setMood && window.__setMood(${JSON.stringify(mood)});` +
      `window.__setCompact && window.__setCompact(${compact ? 'true' : 'false'}); true;`;
    webRef.current?.injectJavaScript(js);
  };

  useEffect(() => {
    injectState();
  }, [mood, compact]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!readyRef.current) {
        onErrorRef.current?.('vrm timeout');
      }
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as ViewerMessage;
      if (data.type === 'ready') {
        readyRef.current = true;
        onReady?.();
        injectState();
        return;
      }
      if (data.type === 'error') {
        onError?.(data.message || 'vrm error');
        return;
      }
      if (data.type === 'press') {
        onPress?.();
        return;
      }
      if (data.type === 'longpress') {
        onLongPress?.();
      }
    } catch (error) {
      onError?.(String(error));
    }
  };

  return (
    <View style={styles.fill}>
      <WebView
        ref={webRef}
        source={getElelVrmWebViewSource()}
        style={styles.webview}
        containerStyle={styles.webview}
        originWhitelist={['*', 'file://*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        overScrollMode="never"
        scrollEnabled={false}
        bounces={false}
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        onError={event => onError?.(event.nativeEvent.description)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  webview: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
});
