import React, {useCallback, useState} from 'react';
import {ScrollView, View, Text, StyleSheet, Switch, TouchableOpacity} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import {nonoConfigService} from '../services/NonoConfigService';
import {requestOperatePermissions} from '../services/operatePermissions';
import {MODE_LABELS, type CapabilityFlags, type PrivacySettings} from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const CapabilitiesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [flags, setFlags] = useState<CapabilityFlags | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [modeLabel, setModeLabel] = useState('云端一体');
  const [errandCount, setErrandCount] = useState(0);
  const [gateway, setGateway] = useState('');

  const load = useCallback(async () => {
    const [nextFlags, nextPrivacy, agent, memories, openclaw] =
      await Promise.all([
        nonoConfigService.getCapabilities(),
        nonoConfigService.getPrivacy(),
        nonoConfigService.getAgentMode(),
        nonoConfigService.getMemories(),
        nonoConfigService.getOpenClaw(),
      ]);
    setFlags(nextFlags);
    setPrivacy(nextPrivacy);
    setModeLabel(MODE_LABELS[agent.activeMode]);
    setErrandCount(memories.filter(item => item.kind === 'errand').length);
    setGateway(openclaw.gateway);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggle = (key: keyof CapabilityFlags, value: boolean) => {
    setFlags(current => (current ? {...current, [key]: value} : current));
    if (key === 'phoneOperate' && value) {
      void requestOperatePermissions();
    }
    void nonoConfigService.setCapability(key, value).then(setFlags);
  };

  if (!flags || !privacy) return null;

  return (
    <PageLayout
      title="能力"
      kicker="它会做什么"
      backgroundColor={COLORS.background.default}>
      <ScrollView contentContainerStyle={styles.content}>
        <CapabilityCard
          title="替我操作手机"
          body="这台机自己看屏、点应用。对话模型在设置里单独配。"
          meta={flags.phoneOperate ? `已开 · ${modeLabel} ›` : '已关 ›'}
          value={flags.phoneOperate}
          onToggle={value => toggle('phoneOperate', value)}
          onPress={() => navigation.navigate('PhoneOperate')}
        />
        <CapabilityCard
          title="交代的事"
          body="你说一次要办，或到点再办。办完进「做过的事」。"
          meta={flags.errands ? `已开 · ${errandCount} 件在记着 ›` : '已关 ›'}
          value={flags.errands}
          onToggle={value => toggle('errands', value)}
          onPress={() => navigation.navigate('Errands')}
        />
        <CapabilityCard
          title="OpenClaw 远程"
          body="大脑在网关，这台手机当手脚；可进机群。"
          meta={flags.openclaw ? `已开 · ${gateway} ›` : '已关 ›'}
          value={flags.openclaw}
          onToggle={value => toggle('openclaw', value)}
          onPress={() => navigation.navigate('OpenClaw')}
        />
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Privacy')}
          activeOpacity={0.85}>
          <Text style={styles.title}>隐私</Text>
          <Text style={styles.body}>截图去哪、记忆存在哪、诊断包含什么。</Text>
          <Text style={styles.meta}>
            {privacy.memoryEnabled
              ? `记忆开启 · ${
                  privacy.memoryLocation === 'openclaw'
                    ? '随 OpenClaw 在网关'
                    : '仅这台手机'
                } ›`
              : '记忆已关闭 ›'}
          </Text>
        </TouchableOpacity>
        <View style={styles.card}>
          <Text style={styles.title}>后续能力</Text>
          <Text style={styles.body}>信息整理会放在这里。首页不用改。</Text>
        </View>
      </ScrollView>
    </PageLayout>
  );
};

const CapabilityCard = ({
  title,
  body,
  meta,
  value,
  onToggle,
  onPress,
}: {
  title: string;
  body: string;
  meta: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  onPress: () => void;
}) => (
  <View style={[styles.card, value && styles.cardActive]}>
    <View style={styles.topline}>
      <TouchableOpacity style={styles.copy} onPress={onPress} activeOpacity={0.8}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </TouchableOpacity>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{false: '#d8d7df', true: COLORS.violet}}
        thumbColor="#ffffff"
      />
    </View>
  </View>
);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingBottom: 120,
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
  topline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  copy: {
    flex: 1,
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
