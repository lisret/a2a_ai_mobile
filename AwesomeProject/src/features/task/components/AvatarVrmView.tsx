import React, {useEffect, useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import type {AvatarMood} from './avatarTypes';
import {getElelVrmWebViewSource} from './vrmViewerSource';

type ViewerMessage =
  | {type: 'ready'}
  | {type: 'error'; message?: string}
  | {type: 'press'}
  | {type: 'longpress'};

interface AvatarVrmViewProps {
  mood: AvatarMood;
  onReady?: () => void;
  onError?: (message: string) => void;
  onPress?: () => void;
  onLongPress?: () => void;
}

export const AvatarVrmView: React.FC<AvatarVrmViewProps> = ({
  mood,
  onReady,
  onError,
  onPress,
  onLongPress,
}) => {
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    const js = `window.__setMood && window.__setMood(${JSON.stringify(mood)}); true;`;
    webRef.current?.injectJavaScript(js);
  }, [mood]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as ViewerMessage;
      if (data.type === 'ready') {
        onReady?.();
        const js = `window.__setMood && window.__setMood(${JSON.stringify(mood)}); true;`;
        webRef.current?.injectJavaScript(js);
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
        originWhitelist={['*']}
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
        onMessage={handleMessage}
        onError={event => onError?.(event.nativeEvent.description)}
        onHttpError={() => onError?.('http error')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
