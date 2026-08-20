import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import {COLORS} from '@shared/constants';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  danger = false,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.8}>
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, danger && styles.dangerButton]}
              onPress={onConfirm}
              activeOpacity={0.8}>
              <Text
                style={[
                  styles.confirmButtonText,
                  danger && styles.dangerButtonText,
                ]}>
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
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
  sheet: {
    width: '100%',
    padding: 20,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.96)',
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
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  message: {
    fontSize: 12,
    color: COLORS.text.secondary,
    lineHeight: 18,
    marginBottom: 18,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 9,
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f0f7',
  },
  confirmButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.violet,
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
    color: COLORS.error,
  },
});
