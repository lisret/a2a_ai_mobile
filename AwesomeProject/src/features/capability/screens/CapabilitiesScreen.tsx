import React, {useCallback, useState} from 'react';
import {ScrollView, View, Text, StyleSheet, Switch, TouchableOpacity} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import type {
  ErrandsViewState,
  PhoneOperateViewState,
  PrivacyViewState,
  VisualAgentToolsViewState,
} from '../../../application/facades/UiRuntimeContracts';
import {requestOperatePermissions} from '../services/operatePermissions';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const CapabilitiesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const {phoneOperate, errands, visualAgentTools, privacy} = useAppFacades();

  const [phone, setPhone] = useState<PhoneOperateViewState | null>(null);
  const [errand, setErrand] = useState<ErrandsViewState | null>(null);
  const [tools, setTools] = useState<VisualAgentToolsViewState | null>(null);
  const [privacyState, setPrivacyState] = useState<PrivacyViewState | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = <T,>(
        read: () => Promise<T>,
        apply: (value: T) => void,
      ) => {
        read()
          .then(next => active && apply(next))
          .catch(() => {
            // A rejected read leaves that card blank rather than fabricating a
            // success; each Facade is independent.
          });
      };
      load(() => phoneOperate.getViewState(), setPhone);
      load(() => errands.getViewState(), setErrand);
      load(() => visualAgentTools.getViewState(), setTools);
      load(() => privacy.getViewState(), setPrivacyState);
      return () => {
        active = false;
      };
    }, [phoneOperate, errands, visualAgentTools, privacy]),
  );

  const phoneMeta = phone
    ? `${phone.modes[phone.activeMode].label} · ${
        phone.modes[phone.activeMode].runnable ? '可用' : '需配置'
      } ›`
    : '读取中 ›';

  const errandMeta = errand
    ? errand.enabled
      ? `已开 · ${errand.pendingCount} 件在记着 ›`
      : '已关 ›'
    : '读取中 ›';

  const activeProfile = tools?.profiles.find(
    profile => profile.profileId === tools.activeProfileId,
  );
  const toolsMeta = tools
    ? tools.enabled
      ? activeProfile
        ? `${activeProfile.displayName} · ${
            tools.canOperate ? '可操作' : '待连接'
          } ›`
        : '已开 · 未选择连接 ›'
      : '已关 ›'
    : '读取中 ›';

  const privacyMeta = privacyState
    ? privacyState.memoryEnabled
      ? `记忆开启 · ${
          privacyState.memoryLocation === 'visual_agent'
            ? '随视觉工具'
            : '仅这台手机'
        } ›`
      : '记忆已关闭 ›'
    : '读取中 ›';

  const toggleErrands = (value: boolean) => {
    setErrand(current => (current ? {...current, enabled: value} : current));
    void errands
      .setEnabled(value)
      .then(setErrand)
      .catch(() => {
        // Keep the last known state on failure; no silent success.
      });
  };

  const toggleTools = (value: boolean) => {
    if (!tools) {
      return;
    }
    if (value) {
      void requestOperatePermissions();
    }
    void visualAgentTools
      .setEnabled(value, tools.revision)
      .then(setTools)
      .catch(() => {
        // Optimistic-concurrency or read failure keeps the prior state.
      });
  };

  return (
    <PageLayout
      title="能力"
      kicker="它会做什么"
      backgroundColor={COLORS.background.default}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('PhoneOperate')}
          activeOpacity={0.85}>
          <Text style={styles.title}>替我操作手机</Text>
          <Text style={styles.body}>
            这台机自己看屏、点应用。对话模型在设置里单独配。
          </Text>
          <Text style={styles.meta}>{phoneMeta}</Text>
        </TouchableOpacity>

        <CapabilityCard
          title="交代的事"
          body="你说一次要办，或到点再办。办完进「做过的事」。"
          meta={errandMeta}
          value={errand?.enabled ?? false}
          onToggle={toggleErrands}
          onPress={() => navigation.navigate('Errands')}
        />

        <CapabilityCard
          title="视觉工具"
          body="接入外部视觉智能体，让它看屏、操作。可进机群。"
          meta={toolsMeta}
          value={tools?.enabled ?? false}
          onToggle={toggleTools}
          onPress={() => navigation.navigate('VisualAgentTools')}
        />

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Privacy')}
          activeOpacity={0.85}>
          <Text style={styles.title}>隐私</Text>
          <Text style={styles.body}>截图去哪、记忆存在哪、诊断包含什么。</Text>
          <Text style={styles.meta}>{privacyMeta}</Text>
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
