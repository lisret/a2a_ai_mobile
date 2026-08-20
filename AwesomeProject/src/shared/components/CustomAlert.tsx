import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  loading?: boolean;
  dismissable?: boolean;
  onDismiss?: () => void;
}

/**
 * 自定义Alert组件，样式与ConfirmModal保持一致
 */
export const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  buttons = [{ text: '确定' }],
  loading = false,
  dismissable = true,
  onDismiss,
}) => {
  const [isVisible, setIsVisible] = useState(visible);

  useEffect(() => {
    setIsVisible(visible);
  }, [visible]);

  const handleButtonPress = (button: AlertButton) => {
    const next = button.onPress;
    handleDismiss();
    if (next) {
      setTimeout(next, 0);
    }
  };

  const handleDismiss = () => {
    if (!dismissable && loading) {
      return;
    }
    setIsVisible(false);
    onDismiss?.();
  };

  // 如果没有取消按钮，默认按钮使用确认样式
  const hasCancelButton = buttons.some(btn => btn.style === 'cancel');
  const defaultButton = buttons.find(btn => !btn.style || btn.style === 'default') || buttons[0];
  const cancelButton = buttons.find(btn => btn.style === 'cancel');
  const destructiveButton = buttons.find(btn => btn.style === 'destructive');
  const canDismiss = dismissable !== false && !loading;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={canDismiss ? handleDismiss : () => {}}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={canDismiss ? handleDismiss : undefined}
        />
        <View style={styles.content}>
          <View style={styles.grab} />
          {loading ? (
            <ActivityIndicator
              color="#756bf0"
              style={styles.spinner}
              accessibilityLabel="正在检测权限"
            />
          ) : null}
          <Text style={styles.title}>{title}</Text>
          {message ? (
            <ScrollView
              style={[styles.messageScroll, loading && styles.loadingMessage]}
              bounces={false}
              showsVerticalScrollIndicator={false}>
              <Text style={styles.message}>{message}</Text>
            </ScrollView>
          ) : null}
          {loading || buttons.length === 0 ? null : (
          <View style={styles.buttonGroup}>
            {buttons.length === 1 ? (
              // 单个按钮
              <TouchableOpacity
                style={[styles.button, styles.singleButton, styles.confirmButton]}
                onPress={() => handleButtonPress(defaultButton)}
                activeOpacity={0.8}>
                <Text style={styles.confirmButtonText}>{defaultButton.text}</Text>
              </TouchableOpacity>
            ) : buttons.length === 2 ? (
              // 两个按钮
              <>
                {cancelButton && (
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={() => handleButtonPress(cancelButton)}
                    activeOpacity={0.8}>
                    <Text style={styles.cancelButtonText}>{cancelButton.text}</Text>
                  </TouchableOpacity>
                )}
                {(defaultButton || destructiveButton) && (
                  <TouchableOpacity
                    style={[
                      styles.button,
                      destructiveButton ? styles.dangerButton : styles.confirmButton,
                    ]}
                    onPress={() => handleButtonPress(destructiveButton || defaultButton!)}
                    activeOpacity={0.8}>
                    <Text
                      style={[
                        styles.confirmButtonText,
                        destructiveButton && styles.dangerButtonText,
                      ]}>
                      {(destructiveButton || defaultButton)?.text}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              // 多个按钮，垂直排列
              buttons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    styles.fullWidthButton,
                    button.style === 'cancel' && styles.cancelButton,
                    button.style === 'destructive' && styles.dangerButton,
                    !button.style && styles.confirmButton,
                  ]}
                  onPress={() => handleButtonPress(button)}
                  activeOpacity={0.8}>
                  <Text
                    style={[
                      button.style === 'cancel'
                        ? styles.cancelButtonText
                        : styles.confirmButtonText,
                      button.style === 'destructive' && styles.dangerButtonText,
                    ]}>
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(19,20,34,0.28)',
    justifyContent: 'flex-end',
    padding: 14,
  },
  content: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 26,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#534bbc',
    shadowOffset: {width: 0, height: 18},
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 99,
    backgroundColor: '#d8d7df',
    alignSelf: 'center',
    marginBottom: 16,
  },
  spinner: {
    alignSelf: 'center',
    marginBottom: 12,
  },
  loadingMessage: {
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#202231',
    marginBottom: 8,
  },
  messageScroll: {
    maxHeight: 240,
    marginBottom: 18,
  },
  message: {
    fontSize: 12,
    color: '#777a88',
    lineHeight: 18,
  },
  buttonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleButton: {
    maxWidth: '100%',
  },
  fullWidthButton: {
    width: '100%',
    marginBottom: 0,
  },
  cancelButton: {
    backgroundColor: '#f1f0f7',
  },
  confirmButton: {
    backgroundColor: '#756bf0',
  },
  dangerButton: {
    backgroundColor: '#fff0ec',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#575967',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  dangerButtonText: {
    color: '#a94e40',
  },
});

/**
 * 自定义Alert工具函数，API与React Native的Alert.alert保持一致
 */
let alertId = 0;
const alertInstances: Map<number, { setVisible: (visible: boolean) => void }> = new Map();

export const customAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: { onDismiss?: () => void }
): void => {
  const id = alertId++;
  // 这里需要全局状态管理，暂时使用简化的方式
  // 实际使用时，可以通过Context或全局状态管理来管理多个Alert实例
  console.warn('customAlert需要配合AlertProvider使用');
};
