import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {COLORS} from '@shared/constants';

interface LoadErrorViewProps {
  title: string;
  body?: string;
  onRetry: () => void;
}

// Shared load-failure surface: a fixed, safe title plus a real 重试 control.
// Screens never render a raw Error object and never disguise a failed read as
// an empty state; tapping 重试 re-runs the same read lifecycle.
export const LoadErrorView: React.FC<LoadErrorViewProps> = ({
  title,
  body,
  onRetry,
}) => (
  <View style={styles.card}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.body}>{body ?? '请检查网络或稍后再试。'}</Text>
    <TouchableOpacity
      style={styles.retry}
      onPress={onRetry}
      accessibilityRole="button">
      <Text style={styles.retryText}>重试</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  card: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  title: {
    color: COLORS.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  body: {
    marginTop: 4,
    color: COLORS.text.secondary,
    fontSize: 10,
    lineHeight: 14,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 12,
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: COLORS.violet,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
