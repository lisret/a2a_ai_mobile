import React, {useCallback, useState} from 'react';
import {ScrollView, View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import {SettingToggle, InfoCard} from '../components/CapabilityCards';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import type {
  ErrandItemViewState,
  ErrandsViewState,
} from '../../../application/facades/UiRuntimeContracts';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const LOADING_STATE: ErrandsViewState = {
  status: 'loading',
  enabled: false,
  pendingCount: 0,
  items: [],
};

const ERROR_STATE: ErrandsViewState = {
  status: 'error',
  enabled: false,
  pendingCount: 0,
  items: [],
  errorMessage: '暂时读不到交代列表',
};

const STATUS_LABELS: Record<ErrandItemViewState['status'], string> = {
  pending: '待办',
  leased: '进行中',
  failed: '失败',
  completed: '已完成',
  cancelled: '已取消',
};

export const ErrandsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const {errands} = useAppFacades();
  const [viewState, setViewState] = useState<ErrandsViewState | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setViewState(current => current ?? LOADING_STATE);
      errands
        .getViewState()
        .then(next => active && setViewState(next))
        .catch(() => active && setViewState(ERROR_STATE));
      return () => {
        active = false;
      };
    }, [errands]),
  );

  const state = viewState ?? LOADING_STATE;

  const toggle = (value: boolean) => {
    setViewState(current => (current ? {...current, enabled: value} : current));
    void errands
      .setEnabled(value)
      .then(setViewState)
      .catch(() => setViewState(ERROR_STATE));
  };

  return (
    <PageLayout title="交代的事" showBackButton>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingToggle
          title="接下交代"
          body="首页说话就可以交代。内容在活动 · 它还记得。"
          value={state.enabled}
          onValueChange={toggle}
        />

        {state.status === 'error' ? (
          <InfoCard title="暂时读不到交代列表" body="请稍后再试。" />
        ) : (
          <>
            <View style={styles.head}>
              <Text style={styles.heading}>在记着</Text>
              <Text style={styles.hint}>{state.pendingCount} 件待办</Text>
            </View>
            {state.items.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>还没有交代</Text>
                <Text style={styles.emptyBody}>
                  单次或定时交代会出现在这里。
                </Text>
              </View>
            ) : (
              state.items.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.item}
                  activeOpacity={0.85}
                  onPress={() =>
                    navigation.navigate('ErrandDetail', {errandId: item.id})
                  }>
                  <View style={styles.itemHead}>
                    <Text style={styles.kind}>
                      {item.kind === 'schedule' ? '定时' : '单次'}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        item.status === 'failed' && styles.badgeDanger,
                      ]}>
                      <Text
                        style={[
                          styles.badgeText,
                          item.status === 'failed' && styles.badgeDangerText,
                        ]}>
                        {STATUS_LABELS[item.status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemMeta}>{item.scheduleLabel}</Text>
                  {item.errorMessage ? (
                    <Text style={styles.itemError}>{item.errorMessage}</Text>
                  ) : null}
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        <InfoCard
          title="单次"
          body="说一次，记着去办。办完从交代里拿掉，进入「做过的事」。"
        />
        <InfoCard
          title="定时"
          body="到点再办。这一次办完仍留在交代里，直到你取消。"
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
  head: {
    marginTop: 8,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  heading: {
    color: COLORS.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: COLORS.text.secondary,
    fontSize: 10,
  },
  item: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kind: {
    color: COLORS.violet,
    fontSize: 9,
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#dcf2ec',
  },
  badgeText: {
    color: COLORS.success,
    fontSize: 8,
    fontWeight: '800',
  },
  badgeDanger: {
    backgroundColor: '#ffebe5',
  },
  badgeDangerText: {
    color: COLORS.error,
  },
  itemTitle: {
    marginVertical: 8,
    color: COLORS.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  itemMeta: {
    color: COLORS.text.secondary,
    fontSize: 10,
  },
  itemError: {
    marginTop: 6,
    color: COLORS.error,
    fontSize: 10,
  },
  emptyCard: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  emptyTitle: {
    color: COLORS.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyBody: {
    marginTop: 4,
    color: COLORS.text.secondary,
    fontSize: 10,
    lineHeight: 14,
  },
});
