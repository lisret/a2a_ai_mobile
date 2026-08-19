import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
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

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ActivityFilter = 'all' | 'success' | 'failed';

export const TaskHistoryScreenTab: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [model, setModel] = useState<AIModel | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const loadData = useCallback(async () => {
    try {
      const selectedModel = await modelService.getSelectedModel();
      setModel(selectedModel);
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
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const filteredTasks = tasks.filter(task => filter === 'all' || task.status === filter);

  return (
    <PageLayout
      title="活动"
      kicker="TASK TIMELINE"
      headerAccessory={<NoNoMascot size={50} />}
      backgroundColor={COLORS.background.default}>
      <FlatList
        data={filteredTasks}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View style={styles.filterRow}>
            {([['all', '全部'], ['success', '已完成'], ['failed', '失败']] as const).map(
              ([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterChip, filter === key && styles.filterChipActive]}
                  onPress={() => setFilter(key)}>
                  <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ),
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>暂无匹配记录</Text>
            <Text style={styles.emptyBody}>
              {model ? '完成一个任务后会出现在这里。' : '请先选择一个模型。'}
            </Text>
          </View>
        }
        renderItem={({item}) => {
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
                <Text style={styles.metaText}>{item.output?.steps?.length || 0} 个步骤</Text>
                <Text style={styles.metaText}>查看详情 ›</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      />

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
  listContent: {paddingHorizontal: 18, paddingBottom: 120},
  filterRow: {flexDirection: 'row', gap: 8, marginBottom: 13},
  filterChip: {
    minHeight: 34,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
  },
  filterChipActive: {backgroundColor: COLORS.ink},
  filterText: {color: COLORS.text.secondary, fontSize: 10, fontWeight: '700'},
  filterTextActive: {color: '#ffffff'},
  taskItem: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  metaRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  metaText: {color: COLORS.text.secondary, fontSize: 9},
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
  badgeText: {color: COLORS.success, fontSize: 8, fontWeight: '800'},
  badgeDanger: {backgroundColor: '#ffebe5'},
  badgeDangerText: {color: COLORS.error},
  emptyCard: {
    padding: 15,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  emptyTitle: {color: COLORS.text.primary, fontSize: 13, fontWeight: '700'},
  emptyBody: {marginTop: 4, color: COLORS.text.secondary, fontSize: 10, lineHeight: 14},
});
