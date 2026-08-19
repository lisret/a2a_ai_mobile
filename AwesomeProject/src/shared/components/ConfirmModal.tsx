import React from 'react';
import {Modal, View, Text, TouchableOpacity, StyleSheet} from 'react-native';
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
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onCancel}>
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttonGroup}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={onConfirm} activeOpacity={0.8}>
              <Text style={styles.confirmButtonText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(19,20,34,0.42)',
    justifyContent: 'flex-end',
    padding: 14,
  },
  sheet: {
    width: '100%',
    padding: 20,
    borderRadius: 26,
    backgroundColor: COLORS.ink,
  },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 99,
    backgroundColor: '#555869',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  message: {
    fontSize: 12,
    color: '#c4c6d0',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  confirmButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.coral,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4c271f',
  },
});
