import React, { forwardRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { COLORS, SHADOWS, UI_CONFIG } from '@shared/constants';
import { AppIcon, IconNames } from '@shared/components/Icon';

interface AvatarInputDockProps {
  value: string;
  onChangeText: (text: string) => void;
  onStart: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export const AvatarInputDock = forwardRef<TextInput, AvatarInputDockProps>(
  (
    {
      value,
      onChangeText,
      onStart,
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
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={UI_CONFIG.INPUT_MAX_LENGTH}
          editable={!disabled}
          textAlignVertical="center"
        />
        <TouchableOpacity
          onPress={onStart}
          disabled={!canSend}
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          activeOpacity={0.8}>
          <AppIcon name={IconNames.send} size={16} color="#FFFFFF" />
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
    backgroundColor: COLORS.background.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    gap: 8,
    ...SHADOWS.default,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text.primary,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
