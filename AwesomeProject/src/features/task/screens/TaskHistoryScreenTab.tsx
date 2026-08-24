import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {NoNoMascot} from '@shared/components/NoNoMascot';
import {COLORS} from '@shared/constants';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {LoadErrorView} from '@shared/components/LoadErrorView';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import type {
  ActivityTaskViewState,
  ActivityViewState,
  ErrandItemViewState,
  PreferenceViewState,
} from '../../../application/facades/UiRuntimeContracts';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ActivityTab = 'remember' | 'done';
type ActivityFilter = 'all' | 'success' | 'failed';

const LOADING_STATE: ActivityViewState = {
  status: 'loading',
  memoryEnabled: true,
  memoryLocationLabel: '仅这台手机',
  preferences: [],
  errands: [],
  tasks: [],
};

const ERROR_STATE: ActivityViewState = {
  status: 'error',
  memoryEnabled: true,
  memoryLocationLabel: '仅这台手机',
  preferences: [],
  errands: [],
  tasks: [],
  errorMessage: '暂时读不到活动记录',
};

export const TaskHistoryScreenTab: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const {activity} = useAppFacades();
  const [viewState, setViewState] = useState<ActivityViewState | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [tab, setTab] = useState<ActivityTab>('remember');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setViewState(current => current ?? LOADING_STATE);
      activity
        .getViewState()
        .then(next => active && setViewState(next))
        .catch(() => active && setViewState(ERROR_STATE));
      return () => {
        active = false;
      };
    }, [activity]),
  );

  const state = viewState ?? LOADING_STATE;

  const retry = useCallback(() => {
    setViewState(LOADING_STATE);
    activity
      .getViewState()
      .then(setViewState)
      .catch(() => setViewState(ERROR_STATE));
  }, [activity]);

  const confirmDelete = async () => {
    if (!deleteTaskId) {
      return;
    }
    try {
      setViewState(await activity.deleteTask(deleteTaskId));
    } catch {
      setViewState(ERROR_STATE);
    } finally {
      setDeleteTaskId(null);
    }
  };

  const forgetPreference = (item: PreferenceViewState) => {
    Alert.alert('忘掉这条？', item.title, [
      {text: '取消', style: 'cancel'},
      {
        text: '忘掉',
        style: 'destructive',
        onPress: async () => {
          try {
            setViewState(await activity.forgetPreference(item.id));
          } catch {
            setViewState(ERROR_STATE);
          }
        },
      },
    ]);
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(
      date.getHours(),
    ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const filteredTasks = state.tasks.filter(task => {
    if (filter === 'all') {
      return true;
    }
    return task.status === filter;
  });

  const renderTaskItem = ({item}: {item: ActivityTaskViewState}) => {
    const isFailed = item.status === 'failed';
    return (
      <TouchableOpacity
        style={styles.taskItem}
        onPress={() => navigation.navigate('TaskDetail', {taskId: item.id})}
        onLongPress={() => setDeleteTaskId(item.id)}
        activeOpacity={0.8}>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{formatTime(item.createdAtMs)}</Text>
          <View style={[styles.badge, isFailed && styles.badgeDanger]}>
            <Text style={[styles.badgeText, isFailed && styles.badgeDangerText]}>
              {isFailed ? '失败' : item.status === 'success' ? '已完成' : '执行中'}
            </Text>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{item.stepCount} 个步骤</Text>
          <Text style={styles.metaText}>查看详情 ›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const tabBar = (
    <View style={styles.seg}>
      {(
        [
          ['remember', '它还记得'],
          ['done', '做过的事'],
        ] as const
      ).map(([key, label]) => (
        <TouchableOpacity
          key={key}
          style={[styles.segBtn, tab === key && styles.segBtnOn]}
          onPress={() => setTab(key)}>
          <Text style={[styles.segText, tab === key && styles.segTextOn]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (state.status === 'error') {
    return (
      <PageLayout
        title="活动"
        kicker="共同经历"
        headerAccessory={<NoNoMascot size={50} />}
        backgroundColor={COLORS.background.default}>
        <View style={styles.listContent}>
          <LoadErrorView title="暂时读不到活动记录" onRetry={retry} />
        </View>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="活动"
      kicker="共同经历"
      headerAccessory={<NoNoMascot size={50} />}
      backgroundColor={COLORS.background.default}>
      {tab === 'remember' ? (
        <ScrollView contentContainerStyle={styles.listContent}>
          {tabBar}
          <View style={styles.group}>
            <View style={styles.groupHead}>
              <Text style={styles.groupTitle}>它还记得</Text>
              <Text style={styles.groupHint}>
                {state.memoryEnabled ? state.memoryLocationLabel : '已关闭'}
              </Text>
            </View>
            {state.preferences.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>
                  {state.memoryEnabled ? '还没有称呼或偏好' : '记忆已关闭'}
                </Text>
                <Text style={styles.emptyBody}>
                  {state.memoryEnabled
                    ? '确认过的称呼和习惯会出现在这里。'
                    : '可在能力 · 隐私里打开。'}
                </Text>
              </View>
            ) : (
              state.preferences.map(item => (
                <View key={item.id} style={styles.taskItem}>
                  <Text style={styles.kind}>
                    {item.kind === 'name' ? '称呼' : '偏好'}
                  </Text>
                  <Text style={styles.title}>{item.title}</Text>
                  {item.body ? (
                    <Text style={styles.emptyBody}>{item.body}</Text>
                  ) : null}
                  <TouchableOpacity
                    style={styles.forget}
                    onPress={() => forgetPreference(item)}>
                    <Text style={styles.forgetText}>忘掉</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <View style={styles.group}>
            <View style={styles.groupHead}>
              <Text style={styles.groupTitle}>交代的事</Text>
              <Text style={styles.groupHint}>{state.errands.length} 件</Text>
            </View>
            {state.errands.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>还没有交代</Text>
                <Text style={styles.emptyBody}>
                  单次或定时交代会出现在这里。
                </Text>
              </View>
            ) : (
              state.errands.map((item: ErrandItemViewState) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.taskItem}
                  onPress={() =>
                    navigation.navigate('ErrandDetail', {errandId: item.id})
                  }
                  activeOpacity={0.8}>
                  <View style={styles.metaRow}>
                    <Text style={styles.kind}>
                      {item.kind === 'schedule' ? '定时' : '单次'}
                    </Text>
                    <Text style={styles.metaText}>编辑 ›</Text>
                  </View>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.metaText}>{item.scheduleLabel}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={item => item.id}
          ListHeaderComponent={
            <View>
              {tabBar}
              <View style={styles.filterRow}>
                {(
                  [
                    ['all', '全部'],
                    ['success', '已完成'],
                    ['failed', '失败'],
                  ] as const
                ).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.filterChip,
                      filter === key && styles.filterChipActive,
                    ]}
                    onPress={() => setFilter(key)}>
                    <Text
                      style={[
                        styles.filterText,
                        filter === key && styles.filterTextActive,
                      ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>暂无匹配记录</Text>
              <Text style={styles.emptyBody}>完成一个任务后会出现在这里。</Text>
            </View>
          }
          renderItem={renderTaskItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      <ConfirmModal
        visible={deleteTaskId !== null}
        title="删除任务"
        message="确定要删除这条任务记录吗？删除后无法恢复。"
        confirmText="删除"
        cancelText="取消"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTaskId(null)}
      />
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  seg: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 16,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  segBtn: {
    flex: 1,
    minHeight: 40,
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
  group: {
    marginBottom: 8,
  },
  groupHead: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  groupTitle: {
    color: COLORS.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  groupHint: {
    color: COLORS.text.secondary,
    fontSize: 10,
  },
  kind: {
    color: COLORS.violet,
    fontSize: 9,
    fontWeight: '800',
  },
  forget: {
    alignSelf: 'flex-start',
    marginTop: 10,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: '#fff0ec',
  },
  forgetText: {
    color: COLORS.error,
    fontSize: 11,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 13,
  },
  filterChip: {
    minHeight: 34,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: COLORS.ink,
  },
  filterText: {
    color: COLORS.text.secondary,
    fontSize: 10,
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  taskItem: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaText: {
    color: COLORS.text.secondary,
    fontSize: 9,
  },
  title: {
    marginVertical: 10,
    color: COLORS.text.primary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
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
  emptyCard: {
    padding: 15,
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
