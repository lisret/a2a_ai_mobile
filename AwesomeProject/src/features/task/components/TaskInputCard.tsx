import React from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLORS, SHADOWS, UI_CONFIG } from '@shared/constants';
import { AppIcon, IconNames } from '@shared/components/Icon';

interface TaskInputCardProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  onStart: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export const TaskInputCard: React.FC<TaskInputCardProps> = ({
  value,
  onChangeText,
  onClear,
  onStart,
  disabled = false,
  placeholder = '例如：打开京东查询 iPhone 价格...',
}) => {
  return (
    <View style={styles.card}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        multiline
        maxLength={UI_CONFIG.INPUT_MAX_LENGTH}
        editable={!disabled}
        textAlignVertical="top"
      />
      <View style={styles.actionBar}>
        <TouchableOpacity onPress={onClear} style={styles.clearBtn}>
          <Text style={styles.clearText}>清空</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onStart}
          disabled={disabled || !value.trim()}
          style={[styles.runBtn, (!value.trim() || disabled) && styles.runBtnDisabled]}>
          <Text style={styles.runBtnText}>开始执行</Text>
          <AppIcon name={IconNames.arrowRight} size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'transparent', // Remove border to look cleaner
    ...SHADOWS.default,
  },
  input: {
    minHeight: 120,
    fontSize: 17,
    lineHeight: 26,
    color: COLORS.text.primary,
    marginBottom: 20,
    fontWeight: '400',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  clearText: {
    fontSize: 14,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },
  runBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 30, // Pill shape
    ...SHADOWS.default,
    shadowColor: COLORS.primary, // Colored shadow
    shadowOpacity: 0.3,
  },
  runBtnDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  runBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});

