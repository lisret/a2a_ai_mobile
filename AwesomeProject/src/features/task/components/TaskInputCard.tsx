import React from 'react';
import {View, TextInput, TouchableOpacity, Text, StyleSheet} from 'react-native';
import {COLORS, UI_CONFIG} from '@shared/constants';

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
  placeholder = '例如：帮我找到周末去苏州的合适车次',
}) => {
  const canStart = Boolean(value.trim()) && !disabled;

  return (
    <View style={styles.card}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#a2a4ad"
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
          disabled={!canStart}
          style={[styles.runBtn, !canStart && styles.runBtnDisabled]}>
          <Text style={styles.runBtnText}>让 NoNo 开始</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.88)',
    shadowColor: '#222339',
    shadowOffset: {width: 0, height: 18},
    shadowOpacity: 0.11,
    shadowRadius: 19,
    elevation: 6,
  },
  input: {
    minHeight: 110,
    fontSize: 16,
    lineHeight: 25,
    color: COLORS.text.primary,
    marginBottom: 12,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearBtn: {
    minHeight: 36,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  clearText: {
    fontSize: 12,
    color: COLORS.text.secondary,
    fontWeight: '700',
  },
  runBtn: {
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: COLORS.ink,
    justifyContent: 'center',
    shadowColor: '#1b1d30',
    shadowOffset: {width: 0, height: 11},
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  runBtnDisabled: {
    opacity: 0.38,
    shadowOpacity: 0,
    elevation: 0,
  },
  runBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
