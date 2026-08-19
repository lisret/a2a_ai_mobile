import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {NONO_COLORS, NONO_RADII} from './tokens';

interface PrimaryButtonProps extends PressableProps {
  label: string;
  busy?: boolean;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  label,
  busy = false,
  danger = false,
  disabled,
  style,
  accessibilityLabel,
  testID,
  ...pressableProps
}) => {
  const isDisabled = Boolean(disabled || busy);
  return (
    <Pressable
      {...pressableProps}
      testID={testID}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{disabled: isDisabled, busy}}
      style={[styles.button, danger && styles.danger, isDisabled && styles.disabled, style]}>
      <Text style={[styles.label, danger && styles.dangerLabel]}>{busy ? '处理中…' : label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: NONO_RADII.pill,
    backgroundColor: NONO_COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  danger: {
    backgroundColor: '#fff0ec',
  },
  disabled: {
    opacity: 0.38,
  },
  label: {
    color: NONO_COLORS.white,
    fontSize: 13,
    fontWeight: '700',
  },
  dangerLabel: {
    color: NONO_COLORS.danger,
  },
});
