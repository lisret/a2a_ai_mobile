import React, {useCallback, useEffect, useState} from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import type {ErrandItemViewState} from '../../../application/facades/UiRuntimeContracts';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'ErrandDetail'>;

const STATUS_LABELS: Record<ErrandItemViewState['status'], string> = {
  pending: '待办',
  leased: '进行中',
  failed: '失败',
  completed: '已完成',
  cancelled: '已取消',
};

export const ErrandDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const {errandId} = useRoute<ScreenRoute>().params;
  const {errands} = useAppFacades();
  const [item, setItem] = useState<ErrandItemViewState | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    errands
      .getViewState()
      .then(state => {
        if (!active) {
          return;
        }
        const match = state.items.find(entry => entry.id === errandId) ?? null;
        setItem(match);
        setNotFound(match === null);
      })
      .catch(() => active && setNotFound(true));
    return () => {
      active = false;
    };
  }, [errandId, errands]);

  const editable = item?.status === 'pending';

  const save = useCallback(async () => {
    if (!item || !editable) {
      return;
    }
    const title = item.title.trim();
    if (!title) {
      Alert.alert('请写下要办的事');
      return;
    }
    if (item.kind === 'schedule' && !item.scheduleLabel.trim()) {
      Alert.alert('定时需要写下时间');
      return;
    }
    await errands.update({...item, title});
    navigation.goBack();
  }, [item, editable, errands, navigation]);

  if (notFound) {
    return (
      <PageLayout title="交代详情" showBackButton>
        <View style={styles.content}>
          <Text style={styles.label}>这件交代已不存在。</Text>
        </View>
      </PageLayout>
    );
  }

  if (!item) {
    return (
      <PageLayout title="交代详情" showBackButton>
        <View style={styles.content}>
          <Text style={styles.label}>读取中…</Text>
        </View>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="交代详情" showBackButton>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.stateRow}>
          <Text style={styles.stateText}>{STATUS_LABELS[item.status]}</Text>
        </View>
        {!editable ? (
          <Text style={styles.caption}>
            这件交代当前不可编辑，只能查看或取消。
          </Text>
        ) : null}

        <Text style={styles.label}>要办的事</Text>
        <TextInput
          style={[styles.input, !editable && styles.inputDisabled]}
          value={item.title}
          editable={editable}
          onChangeText={title => setItem({...item, title})}
        />
        <Text style={styles.label}>类型</Text>
        <View style={styles.seg}>
          {(
            [
              ['once', '单次'],
              ['schedule', '定时'],
            ] as const
          ).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              disabled={!editable}
              style={[styles.segBtn, item.kind === key && styles.segBtnOn]}
              onPress={() =>
                setItem({
                  ...item,
                  kind: key,
                  scheduleLabel: key === 'schedule' ? item.scheduleLabel : '',
                })
              }>
              <Text
                style={[styles.segText, item.kind === key && styles.segTextOn]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.caption}>
          {item.kind === 'schedule'
            ? '到点再办。这一次办完仍留在交代里，直到取消。'
            : '说一次，记着去办。办完进入「做过的事」。'}
        </Text>
        {item.kind === 'schedule' ? (
          <>
            <Text style={styles.label}>时间</Text>
            <TextInput
              style={[styles.input, !editable && styles.inputDisabled]}
              value={item.scheduleLabel}
              editable={editable}
              onChangeText={scheduleLabel => setItem({...item, scheduleLabel})}
              placeholder="例如 周五 18:00"
            />
          </>
        ) : null}
        {item.errorMessage ? (
          <Text style={styles.errorText}>{item.errorMessage}</Text>
        ) : null}

        {editable ? (
          <TouchableOpacity style={styles.primary} onPress={save}>
            <Text style={styles.primaryText}>保存</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.danger}
          onPress={() =>
            Alert.alert('取消这件交代？', '已经做过的记录仍留在「做过的事」。', [
              {text: '返回', style: 'cancel'},
              {
                text: '取消交代',
                style: 'destructive',
                onPress: async () => {
                  await errands.cancel(item.id);
                  navigation.goBack();
                },
              },
            ])
          }>
          <Text style={styles.dangerText}>取消这件交代</Text>
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
  stateRow: {
    marginBottom: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#eceaf6',
  },
  stateText: {
    color: COLORS.text.secondary,
    fontSize: 10,
    fontWeight: '800',
  },
  label: {
    marginBottom: 8,
    color: COLORS.text.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    minHeight: 48,
    marginBottom: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    color: COLORS.text.primary,
  },
  inputDisabled: {
    backgroundColor: '#f0eff5',
    color: COLORS.text.secondary,
  },
  caption: {
    marginTop: -8,
    marginBottom: 16,
    color: COLORS.text.secondary,
    fontSize: 11,
    lineHeight: 16,
  },
  seg: {
    marginBottom: 16,
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
  errorText: {
    marginBottom: 16,
    color: COLORS.error,
    fontSize: 11,
  },
  primary: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.violet,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  danger: {
    minHeight: 52,
    marginTop: 10,
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
