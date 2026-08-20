import React from 'react';
import {View, Text, TouchableOpacity, Switch, StyleSheet} from 'react-native';
import {COLORS} from '@shared/constants';

interface SettingToggleProps {
  title: string;
  body: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export const SettingToggle: React.FC<SettingToggleProps> = ({
  title,
  body,
  value,
  onValueChange,
}) => (
  <View style={styles.row}>
    <View style={styles.copy}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{false: '#d8d7df', true: COLORS.violet}}
      thumbColor="#ffffff"
    />
  </View>
);

interface InfoCardProps {
  title: string;
  body: string;
}

export const InfoCard: React.FC<InfoCardProps> = ({title, body}) => (
  <View style={styles.card}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.body}>{body}</Text>
  </View>
);

interface LinkCardProps {
  title: string;
  body: string;
  meta?: string;
  onPress: () => void;
  active?: boolean;
}

export const LinkCard: React.FC<LinkCardProps> = ({
  title,
  body,
  meta,
  onPress,
  active,
}) => (
  <TouchableOpacity
    style={[styles.card, active && styles.cardActive]}
    onPress={onPress}
    activeOpacity={0.85}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.body}>{body}</Text>
    {meta ? <Text style={styles.meta}>{meta}</Text> : null}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    marginBottom: 10,
    padding: 15,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  copy: {
    flex: 1,
    paddingRight: 12,
  },
  card: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  cardActive: {
    borderColor: 'rgba(117,107,240,0.38)',
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
  meta: {
    marginTop: 8,
    color: COLORS.text.secondary,
    fontSize: 10,
    fontWeight: '700',
  },
});
