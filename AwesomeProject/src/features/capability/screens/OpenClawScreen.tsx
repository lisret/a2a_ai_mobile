import React, {useCallback, useState} from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import {nonoConfigService} from '../services/NonoConfigService';
import {SettingToggle, InfoCard} from '../components/CapabilityCards';
import type {CapabilityFlags, OpenClawConfig} from '../types';

export const OpenClawScreen: React.FC = () => {
  const [flags, setFlags] = useState<CapabilityFlags | null>(null);
  const [config, setConfig] = useState<OpenClawConfig | null>(null);

  const load = useCallback(async () => {
    const [nextFlags, nextConfig] = await Promise.all([
      nonoConfigService.getCapabilities(),
      nonoConfigService.getOpenClaw(),
    ]);
    setFlags(nextFlags);
    setConfig(nextConfig);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!flags || !config) return null;

  return (
    <PageLayout title="OpenClaw 远程" showBackButton>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingToggle
          title="使用远程大脑"
          body="只接管操作：点应用走网关。首页说话仍用设置里的陪伴模型。"
          value={flags.openclaw}
          onValueChange={async value => {
            setFlags(await nonoConfigService.setCapability('openclaw', value));
          }}
        />
        <InfoCard title="网关地址" body={config.gateway} />
        <InfoCard title="设备身份" body={config.deviceId} />
        <InfoCard title="集群" body={`${config.cluster} · 远程会话尚未接通`} />
        <InfoCard
          title="只接管操作"
          body="远程开启时，屏幕画面会送到网关，本机三种操作模式不参与该次任务。陪伴对话不走网关。"
        />
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
});
