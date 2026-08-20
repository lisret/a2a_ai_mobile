import React from 'react';
import {ScrollView, Text, StyleSheet} from 'react-native';
import {PageLayout} from '@shared/components/PageLayout';
import {AppMark} from '@shared/components/AppMark';
import {InfoCard} from '@features/capability/components/CapabilityCards';
import {COLORS} from '@shared/constants';

export const AboutScreen: React.FC = () => (
  <PageLayout title="关于 NoNo" showBackButton>
    <ScrollView contentContainerStyle={styles.content}>
      <AppMark size={84} />
      <Text style={styles.name}>NoNo</Text>
      <Text style={styles.meta}>陪伴助手 · 替你操作手机</Text>
      <InfoCard
        title="两套大脑"
        body="设置里的陪伴模型负责说话；能力里的操作模型负责看屏和点应用。"
      />
      <InfoCard
        title="隐私默认"
        body="记忆默认只留在这台手机。打开 OpenClaw 时，只有操作截图会去网关。"
      />
    </ScrollView>
  </PageLayout>
);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
    alignItems: 'center',
  },
  name: {
    marginTop: 12,
    color: COLORS.text.primary,
    fontSize: 22,
    fontWeight: '800',
  },
  meta: {
    marginTop: 6,
    marginBottom: 18,
    color: COLORS.text.secondary,
    fontSize: 12,
  },
});
