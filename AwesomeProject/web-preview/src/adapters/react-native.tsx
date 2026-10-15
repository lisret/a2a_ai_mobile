import React, {useEffect} from 'react';
import {createPortal} from 'react-dom';
import * as RNW from 'react-native-web';
export * from 'react-native-web';

export const previewPlatform =
  new URLSearchParams(location.search).get('platform') === 'ios'
    ? 'ios'
    : 'android';
export const Platform = {
  ...RNW.Platform,
  OS: previewPlatform,
  Version: previewPlatform === 'ios' ? 17 : 34,
  select: (options: Record<string, unknown>) =>
    options[previewPlatform] ?? options.native ?? options.default,
};
export const StatusBar = Object.assign(() => null, {
  currentHeight: 24,
  setBarStyle() {},
  setBackgroundColor() {},
});
export const Alert = {
  alert(title: string, message?: string, buttons?: unknown[]) {
    window.dispatchEvent(
      new CustomEvent('nono-preview:alert', {
        detail: {title, message, buttons},
      }),
    );
  },
};
// Confine dialogs to the phone canvas instead of the desktop browser window.
export function Modal({
  visible = true,
  children,
  transparent,
  onRequestClose,
  onShow,
}: any) {
  useEffect(() => {
    if (!visible) return;
    onShow?.();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onRequestClose?.();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [visible, onRequestClose]);
  const host = document.getElementById('phone-overlays');
  if (!visible || !host) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        background: transparent ? 'transparent' : '#f8f7f3',
        pointerEvents: 'auto',
      }}>
      {children}
    </div>,
    host,
  );
}
export const NativeModules = {};
const listeners = new Map<string, Set<Function>>();
export const DeviceEventEmitter = {
  addListener(name: string, callback: Function) {
    const entries = listeners.get(name) ?? new Set();
    entries.add(callback);
    listeners.set(name, entries);
    return {remove: () => entries.delete(callback)};
  },
  emit(name: string, value: unknown) {
    listeners.get(name)?.forEach(callback => callback(value));
  },
  removeAllListeners(name: string) {
    listeners.delete(name);
  },
};
export class NativeEventEmitter {
  addListener = DeviceEventEmitter.addListener;
  removeAllListeners = DeviceEventEmitter.removeAllListeners;
}
