import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';

export const RemoteControlScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <PageLayout title="被操控模式" showBackButton>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="局域网模式"
          style={styles.button}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('LanMcp')}>
          <View style={styles.copy}>
            <Text style={styles.title}>局域网模式</Text>
            <Text style={styles.description}>与同一网络中的智能体连接</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="公网模式，暂不开放"
          accessibilityState={{disabled: true}}
          disabled
          style={[styles.button, styles.disabled]}>
          <View style={styles.copy}>
            <Text style={[styles.title, styles.muted]}>公网模式</Text>
            <Text style={styles.description}>跨网络连接远程智能体</Text>
          </View>
          <Text style={styles.badge}>暂不开放</Text>
        </TouchableOpacity>
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  content: {paddingHorizontal: 18, paddingTop: 8, paddingBottom: 40},
  button: {
    minHeight: 82,
    padding: 18,
    marginBottom: 12,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: {flex: 1},
  title: {fontSize: 15, fontWeight: '700', color: COLORS.text.primary},
  description: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.text.secondary,
  },
  chevron: {fontSize: 24, color: COLORS.text.secondary},
  disabled: {
    backgroundColor: 'rgba(235,234,239,0.6)',
    borderColor: 'transparent',
  },
  muted: {color: COLORS.text.secondary},
  badge: {fontSize: 10, color: COLORS.text.secondary},
});
