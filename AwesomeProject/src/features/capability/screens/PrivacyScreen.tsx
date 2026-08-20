import React, {useCallback, useState} from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import {nonoConfigService} from '../services/NonoConfigService';
import {SettingToggle, InfoCard} from '../components/CapabilityCards';
import type {PrivacySettings} from '../types';

export const PrivacyScreen: React.FC = () => {
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [openclawOn, setOpenclawOn] = useState(false);

  const load = useCallback(async () => {
    const [nextPrivacy, flags] = await Promise.all([
      nonoConfigService.getPrivacy(),
      nonoConfigService.getCapabilities(),
    ]);
    setPrivacy(nextPrivacy);
    setOpenclawOn(flags.openclaw);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!privacy) return null;

  return (
    <PageLayout title="隐私" showBackButton>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingToggle
          title="记忆"
          body="称呼和偏好。交代的事是另一项能力，不在这里关。"
          value={privacy.memoryEnabled}
          onValueChange={async value => {
            setPrivacy(
              await nonoConfigService.setPrivacy({memoryEnabled: value}),
            );
          }}
        />
        <Text style={styles.heading}>记忆存在哪</Text>
        <View style={styles.seg}>
          {(
            [
              ['device', '仅这台手机'],
              ['openclaw', '随 OpenClaw 在网关'],
            ] as const
          ).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.segBtn,
                privacy.memoryLocation === key && styles.segBtnOn,
              ]}
              onPress={() =>
                nonoConfigService
                  .setPrivacy({memoryLocation: key})
                  .then(setPrivacy)
              }>
              <Text
                style={[
                  styles.segText,
                  privacy.memoryLocation === key && styles.segTextOn,
                ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.caption}>
          {privacy.memoryLocation === 'openclaw'
            ? '远程任务里的记忆会记在网关，不默认同步回本机。'
            : '三种本机运行方式下，记忆只留在这台手机。'}
        </Text>
        <InfoCard
          title="陪伴对话"
          body="说话内容发给设置里的陪伴模型，不走操作模型和 OpenClaw。"
        />
        <InfoCard
          title="替我操作手机"
          body="本地视觉：截图不离机。云端模式：截图会发给所选视觉模型。"
        />
        <InfoCard
          title="OpenClaw 远程"
          body={
            openclawOn
              ? '当前开着：操作时的屏幕画面会送到网关。陪伴对话仍留在本机陪伴模型。'
              : '当前关着：不会把截图送到网关。'
          }
        />
        <InfoCard
          title="记忆"
          body="称呼和偏好。不存原始截图、完整屏幕文字或 API Key。"
        />
        <TouchableOpacity
          style={styles.danger}
          onPress={() =>
            Alert.alert('忘掉全部称呼和偏好？', '交代的事不会被清掉。', [
              {text: '取消', style: 'cancel'},
              {
                text: '确认忘掉',
                style: 'destructive',
                onPress: () => nonoConfigService.forgetPreferences(),
              },
            ])
          }>
          <Text style={styles.dangerText}>忘掉全部称呼和偏好</Text>
        </TouchableOpacity>
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  heading: {
    marginTop: 8,
    marginBottom: 10,
    color: COLORS.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  caption: {
    marginBottom: 16,
    color: COLORS.text.secondary,
    fontSize: 11,
    lineHeight: 16,
  },
  seg: {
    marginBottom: 8,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  segBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnOn: {
    backgroundColor: COLORS.violet,
  },
  segText: {
    color: '#5d6070',
    fontSize: 12,
    fontWeight: '700',
  },
  segTextOn: {
    color: '#ffffff',
  },
  danger: {
    minHeight: 52,
    marginTop: 8,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff0ec',
  },
  dangerText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '700',
  },
});
