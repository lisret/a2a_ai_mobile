import React, {forwardRef} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet} from 'react-native';
import {COLORS, UI_CONFIG} from '@shared/constants';
import {NONO_COLORS, NONO_RADII} from '@shared/ui/nono';

interface AvatarInputDockProps {
  value: string;
  onChangeText: (text: string) => void;
  onStart: () => void;
  onClear?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export const AvatarInputDock = forwardRef<TextInput, AvatarInputDockProps>(
  (
    {
      value,
      onChangeText,
      onStart,
      onClear,
      disabled = false,
      placeholder = '想让我干什么…',
    },
    ref,
  ) => {
    const canSend = !disabled && !!value.trim();

    return (
      <View style={styles.dock}>
        <TextInput
          ref={ref}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.text.disabled}
          multiline
          maxLength={UI_CONFIG.INPUT_MAX_LENGTH}
          editable={!disabled}
          textAlignVertical="center"
          accessibilityLabel="任务输入"
        />
        {onClear && value.length > 0 ? (
          <TouchableOpacity onPress={onClear} style={styles.clearBtn} accessibilityRole="button">
            <Text style={styles.clearText}>清空</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onStart}
          disabled={!canSend}
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="让 NoNo 开始">
          <Text style={styles.sendText}>让 NoNo 开始</Text>
        </TouchableOpacity>
      </View>
    );
  },
);

AvatarInputDock.displayName = 'AvatarInputDock';

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    gap: 8,
    shadowColor: '#222339',
    shadowOffset: {width: 0, height: 12},
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 88,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text.primary,
    paddingVertical: 8,
  },
  clearBtn: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text.secondary,
  },
  sendBtn: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: NONO_RADII.pill,
    backgroundColor: NONO_COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1b1d30',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  sendBtnDisabled: {
    opacity: 0.38,
    shadowOpacity: 0,
    elevation: 0,
  },
  sendText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
