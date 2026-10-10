import React, {useCallback, useState} from 'react';
import {ScrollView, View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import {requestOperatePermissions} from '../services/operatePermissions';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import type {
  PhoneOperateViewState,
} from '../../../application/facades/UiRuntimeContracts';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const CapabilitiesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const {phoneOperate} = useAppFacades();

  const [phone, setPhone] = useState<PhoneOperateViewState | null>(null);
  const [phoneError, setPhoneError] = useState(false);

  const reloadPhone = useCallback(() => {
    setPhoneError(false);
    phoneOperate
      .getViewState()
      .then(setPhone)
      .catch(() => setPhoneError(true));
  }, [phoneOperate]);

  useFocusEffect(
    useCallback(() => {
      reloadPhone();
    }, [reloadPhone]),
  );

  const phoneMeta = phone
    ? `${phone.modes[phone.activeMode].label} · ${
        phone.modes[phone.activeMode].runnable ? '可用' : '需配置'
      } ›`
    : '读取中 ›';

  return (
    <PageLayout
      title="能力"
      showHeader={false}
      backgroundColor={COLORS.background.default}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => {
            navigation.navigate('PhoneOperate');
            void requestOperatePermissions();
          }}
          activeOpacity={0.85}>
          <Text style={styles.title}>操控手机</Text>
          <Text style={styles.body}>
            看懂屏幕，完成点击、滑动和输入。
          </Text>
          {phoneError ? (
            <RetryMeta onRetry={reloadPhone} />
          ) : (
            <Text style={styles.meta}>{phoneMeta}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('RemoteControl')}
          activeOpacity={0.85}>
          <Text style={styles.title}>被操控模式</Text>
          <Text style={styles.body}>作为节点，接收外部指令并执行手机操作。</Text>
          <Text style={styles.meta}>选择连接方式 ›</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.title}>后续能力</Text>
          <Text style={styles.body}>更多能力，陆续加入。</Text>
        </View>
      </ScrollView>
    </PageLayout>
  );
};

const RetryMeta = ({onRetry}: {onRetry: () => void}) => (
  <TouchableOpacity onPress={onRetry} activeOpacity={0.7}>
    <Text style={styles.retryMeta}>读取失败，点此重试</Text>
  </TouchableOpacity>
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
  retryMeta: {
    marginTop: 8,
    color: COLORS.error,
    fontSize: 10,
    fontWeight: '700',
  },
});
