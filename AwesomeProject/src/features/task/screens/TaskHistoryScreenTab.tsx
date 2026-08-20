import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {NoNoMascot} from '@shared/components/NoNoMascot';
import {taskHistoryService} from '../services/TaskHistoryService';
import {modelService} from '@features/model/services/ModelService';
import {COLORS} from '@shared/constants';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {getTaskTitle} from '@shared/utils/taskHelpers';
import type {Task} from '@core/engine/taskEngine';
import type {AIModel} from '@shared/types/Model';
import {nonoConfigService} from '@features/capability/services/NonoConfigService';
import type {
  CapabilityFlags,
  MemoryItem,
  PrivacySettings,
} from '@features/capability/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ActivityTab = 'remember' | 'done';
type ActivityFilter = 'all' | 'success' | 'failed';

export const TaskHistoryScreenTab: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [model, setModel] = useState<AIModel | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [tab, setTab] = useState<ActivityTab>('remember');
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [flags, setFlags] = useState<CapabilityFlags | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [selectedModel, nextMemories, nextPrivacy, nextFlags] =
        await Promise.all([
          modelService.getSelectedModel(),
          nonoConfigService.getMemories(),
          nonoConfigService.getPrivacy(),
          nonoConfigService.getCapabilities(),
        ]);
      setModel(selectedModel);
      setMemories(nextMemories);
      setPrivacy(nextPrivacy);
      setFlags(nextFlags);

      if (selectedModel) {
        setTasks(await taskHistoryService.getTasksByModelId(selectedModel.id));
      } else {
        setTasks(await taskHistoryService.getAllTasks());
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const confirmDelete = async () => {
    if (!deleteTaskId) return;
    try {
      await taskHistoryService.deleteTask(deleteTaskId);
      setDeleteTaskId(null);
      await loadData();
    } catch (error) {
      console.error('删除任务失败:', error);
      Alert.alert('错误', '删除任务失败');
      setDeleteTaskId(null);
    }
  };

  const formatDemoTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(
      date.getHours(),
    ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const forgetMemory = (item: MemoryItem) => {
    Alert.alert('忘掉这条？', item.title, [
      {text: '取消', style: 'cancel'},
      {
        text: '忘掉',
        style: 'destructive',
        onPress: async () => {
          await nonoConfigService.deleteMemory(item.id);
          await loadData();
        },
      },
    ]);
  };

  const memoryOn = privacy?.memoryEnabled ?? true;
  const errandsOn = flags?.errands ?? true;
  const names = memoryOn ? memories.filter(item => item.kind === 'name') : [];
  const prefs = memoryOn
    ? memories.filter(item => item.kind === 'preference')
    : [];
  const errands = errandsOn
    ? memories.filter(item => item.kind === 'errand')
    : [];
  const locationLabel =
    privacy?.memoryLocation === 'openclaw' ? '随 OpenClaw 在网关' : '仅这台手机';

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true;
    return task.status === filter;
  });

  const renderTaskItem = ({item}: {item: Task}) => {
    const isFailed = item.status === 'failed';
    return (
      <TouchableOpacity
        style={styles.taskItem}
        onPress={() => navigation.navigate('TaskDetail', {taskId: item.id})}
        onLongPress={() => setDeleteTaskId(item.id)}
        activeOpacity={0.8}>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{formatDemoTime(item.createdAt)}</Text>
          <View style={[styles.badge, isFailed && styles.badgeDanger]}>
            <Text style={[styles.badgeText, isFailed && styles.badgeDangerText]}>
              {isFailed ? '失败' : item.status === 'success' ? '已完成' : '执行中'}
            </Text>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {getTaskTitle(item, 40)}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {item.output?.steps?.length || 0} 个步骤
          </Text>
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

  return (
    <PageLayout
      title="活动"
      kicker="共同经历"
      headerAccessory={<NoNoMascot size={50} />}
      backgroundColor={COLORS.background.default}>
      {tab === 'remember' ? (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }>
          {tabBar}
          <MemoryGroup
            title="称呼"
            hint={memoryOn ? locationLabel : '已关闭'}
            emptyTitle={memoryOn ? '还没有称呼' : '记忆已关闭'}
            emptyBody={
              memoryOn
                ? '确认过怎么叫它会出现在这里。'
                : '可在能力 · 隐私里打开。'
            }
            items={names}
            onForget={forgetMemory}
          />
          <MemoryGroup
            title="偏好"
            hint={`${prefs.length} 条`}
            emptyTitle={memoryOn ? '还没有偏好' : '记忆已关闭'}
            emptyBody={
              memoryOn
                ? '确认过的习惯会一条条列在这里。'
                : '可在能力 · 隐私里打开。'
            }
            items={prefs}
            onForget={forgetMemory}
          />
          <MemoryGroup
            title="交代的事"
            hint={errandsOn ? `${errands.length} 件` : '已关闭'}
            emptyTitle={errandsOn ? '还没有交代' : '能力已关闭'}
            emptyBody={
              errandsOn
                ? '单次或定时交代会出现在这里。'
                : '可在能力里打开「交代的事」。'
            }
            items={errands}
            onOpenErrand={id =>
              navigation.navigate('ErrandDetail', {errandId: id})
            }
          />
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
              <Text style={styles.emptyBody}>
                {model
                  ? '完成一个任务后会出现在这里。'
                  : '请先选择一个模型。'}
              </Text>
            </View>
          }
          renderItem={renderTaskItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
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

const MemoryGroup = ({
  title,
  hint,
  emptyTitle,
  emptyBody,
  items,
  onForget,
  onOpenErrand,
}: {
  title: string;
  hint: string;
  emptyTitle: string;
  emptyBody: string;
  items: MemoryItem[];
  onForget?: (item: MemoryItem) => void;
  onOpenErrand?: (id: string) => void;
}) => (
  <View style={styles.group}>
    <View style={styles.groupHead}>
      <Text style={styles.groupTitle}>{title}</Text>
      <Text style={styles.groupHint}>{hint}</Text>
    </View>
    {items.length === 0 ? (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={styles.emptyBody}>{emptyBody}</Text>
      </View>
    ) : (
      items.map(item =>
        item.kind === 'errand' ? (
          <TouchableOpacity
            key={item.id}
            style={styles.taskItem}
            onPress={() => onOpenErrand?.(item.id)}
            activeOpacity={0.8}>
            <View style={styles.metaRow}>
              <Text style={styles.kind}>
                {item.errandType === 'schedule' ? '定时' : '单次'}
              </Text>
              <Text style={styles.metaText}>编辑 ›</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.metaText}>
              {item.errandType === 'schedule'
                ? item.when || '到点再办'
                : '还没办 · 办完会进「做过的事」'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View key={item.id} style={styles.taskItem}>
            <Text style={styles.kind}>
              {item.kind === 'name' ? '称呼' : '偏好'}
            </Text>
            <Text style={styles.title}>{item.title}</Text>
            {item.body ? (
              <Text style={styles.emptyBody}>{item.body}</Text>
            ) : null}
            {onForget ? (
              <TouchableOpacity
                style={styles.forget}
                onPress={() => onForget(item)}>
                <Text style={styles.forgetText}>忘掉</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ),
      )
    )}
  </View>
);

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
