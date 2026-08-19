import React from 'react';
import {StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import {NONO_COLORS} from './tokens';

type BadgeTone = 'success' | 'failed' | 'running' | 'neutral';

interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TONE = {
  success: {bg: '#dcf2ec', fg: '#267568'},
  failed: {bg: '#ffebe5', fg: NONO_COLORS.danger},
  running: {bg: '#e9e6ff', fg: '#5d55cb'},
  neutral: {bg: NONO_COLORS.cloud, fg: NONO_COLORS.muted},
} as const;

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  tone = 'neutral',
  style,
  testID,
}) => {
  const colors = TONE[tone];
  return (
    <View testID={testID} style={[styles.badge, {backgroundColor: colors.bg}, style]}>
      <Text style={[styles.text, {color: colors.fg}]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  text: {
    fontSize: 8,
    fontWeight: '800',
  },
});
