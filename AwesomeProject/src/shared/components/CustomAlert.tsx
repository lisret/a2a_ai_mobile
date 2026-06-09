import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
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
  onDismiss,
}) => {
  const [isVisible, setIsVisible] = useState(visible);

  useEffect(() => {
    setIsVisible(visible);
  }, [visible]);

  const handleButtonPress = (button: AlertButton) => {
    setIsVisible(false);
    button.onPress?.();
    if (!button.onPress) {
      onDismiss?.();
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  // 如果没有取消按钮，默认按钮使用确认样式
  const hasCancelButton = buttons.some(btn => btn.style === 'cancel');
  const defaultButton = buttons.find(btn => !btn.style || btn.style === 'default') || buttons[0];
  const cancelButton = buttons.find(btn => btn.style === 'cancel');
  const destructiveButton = buttons.find(btn => btn.style === 'destructive');

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}
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
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleButton: {
    maxWidth: '100%',
  },
  fullWidthButton: {
    width: '100%',
    marginBottom: 8,
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  confirmButton: {
    backgroundColor: '#2563EB',
  },
  dangerButton: {
    backgroundColor: '#EF4444',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  dangerButtonText: {
    color: '#ffffff',
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
