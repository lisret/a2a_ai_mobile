import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppIcon, IconNames } from './Icon';

interface EmptyStateProps {
  icon?: string;
  iconName?: keyof typeof IconNames;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  iconName,
  title,
  subtitle,
  children,
}) => {
  return (
    <View style={styles.container}>
      {iconName ? (
        <AppIcon name={IconNames[iconName]} size={48} color="#d1d5db" style={styles.icon} />
      ) : icon ? (
        <Text style={styles.icon}>{icon}</Text>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
    color: '#d1d5db',
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

