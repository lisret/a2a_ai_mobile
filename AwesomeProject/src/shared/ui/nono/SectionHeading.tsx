import React from 'react';
import {StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import {NONO_COLORS} from './tokens';

interface SectionHeadingProps {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  title,
  hint,
  action,
  style,
  testID,
}) => {
  return (
    <View testID={testID} style={[styles.row, style]}>
      <Text style={styles.title}>{title}</Text>
      {action ?? (hint ? <Text style={styles.hint}>{hint}</Text> : null)}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    color: NONO_COLORS.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: NONO_COLORS.muted,
    fontSize: 10,
  },
});
