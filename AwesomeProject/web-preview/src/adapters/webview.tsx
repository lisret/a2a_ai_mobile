import React, {forwardRef, useImperativeHandle, useRef} from 'react';
import {View, StyleSheet} from 'react-native-web';

// The App owns the avatar host. Only its native WebView becomes a same-origin iframe.
const WebView = forwardRef<any, any>(
  ({source, style, containerStyle, onLoadEnd, onMessage}, ref) => {
    const iframe = useRef<HTMLIFrameElement>(null);
    const uri = String(source?.uri ?? '').replace(
      'file:///android_asset/',
      '/',
    );
    useImperativeHandle(ref, () => ({
      injectJavaScript(code: string) {
        const target = iframe.current?.contentWindow;
        if (target) (target as any).eval(code);
      },
    }));
    const loaded = () => {
      const target = iframe.current?.contentWindow as any;
      if (target)
        target.ReactNativeWebView = {
          postMessage: (data: string) => onMessage?.({nativeEvent: {data}}),
        };
      // Module scripts initialize before load, matching App's onLoadEnd.
      onLoadEnd?.();
    };
    return (
      <View style={[containerStyle, style, {overflow: 'hidden'}]}>
        <iframe
          ref={iframe}
          title="NoNo 3D 角色"
          src={uri.startsWith('/') ? uri : '/' + uri}
          onLoad={loaded}
          style={{
            ...StyleSheet.flatten(style),
            width: '100%',
            height: '100%',
            display: 'block',
            border: 0,
          }}
        />
      </View>
    );
  },
);
export default WebView;
