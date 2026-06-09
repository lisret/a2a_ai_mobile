import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@shared/types/navigation';
import { PageLayout } from '@shared/components/PageLayout';
import { taskHistoryService } from '../services/TaskHistoryService';
import { COLORS, SHADOWS } from '@shared/constants';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { getTaskTitle, getStatusText, getStatusColor } from '@shared/utils/taskHelpers';
import { TaskStepDetail } from '../components/TaskStepDetail';
import type { Task, TaskStep } from '@core/engine/taskEngine';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'TaskDetail'>;

export const TaskDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const { taskId } = route.params;

  const [task, setTask] = useState<Task | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadTask();
  }, [taskId]);

  const loadTask = async () => {
    try {
      const loadedTask = await taskHistoryService.getTaskById(taskId);
      if (loadedTask) {
        setTask(loadedTask);
        // 默认折叠所有步骤
        setExpandedSteps(new Set());
      }
    } catch (error) {
      console.error('加载任务详情失败:', error);
    }
  };

  const toggleStep = (step: number) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(step)) {
        newSet.delete(step);
      } else {
        newSet.add(step);
      }
      return newSet;
    });
  };

  if (!task) {
    return (
      <PageLayout 
        title="任务详情" 
        backgroundColor={COLORS.background.default}
        showBackButton
        onBackPress={() => navigation.goBack()}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      </PageLayout>
    );
  }

  const isSuccess = task.status === 'success';
  const isFailed = task.status === 'failed';
  const steps = task.output?.steps || [];

  return (
    <PageLayout 
      title="任务详情" 
      backgroundColor={COLORS.background.default}
      showBackButton
      onBackPress={() => navigation.goBack()}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* 任务概览卡片 */}
        <View style={styles.overviewCard}>
          <View style={styles.overviewHeader}>
            <View style={[styles.statusBadge, { backgroundColor: isFailed ? COLORS.background.red : COLORS.background.blue }]}>
              <AppIcon
                name={isFailed ? IconNames.error : IconNames.success}
                size={16}
                color={isFailed ? COLORS.error : COLORS.success}
              />
              <Text style={[styles.statusText, { color: isFailed ? COLORS.error : COLORS.success }]}>
                {getStatusText(task.status)}
              </Text>
            </View>
            <Text style={styles.timeText}>
              {new Date(task.createdAt).toLocaleString('zh-CN')}
            </Text>
          </View>

          <Text style={styles.instructionTitle}>任务指令</Text>
          <Text style={styles.instructionText}>{task.instruction}</Text>

          {task.error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>错误信息</Text>
              <Text style={styles.errorText}>{task.error}</Text>
            </View>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>执行步骤数：</Text>
            <Text style={styles.metaValue}>{steps.length}</Text>
          </View>
        </View>

        {/* 执行步骤时间轴 */}
        {steps.length > 0 && (
          <View style={styles.stepsSection}>
            <Text style={styles.sectionTitle}>执行过程</Text>
            {steps.map((step, index) => (
              <TaskStepDetail
                key={step.step}
                step={step}
                isExpanded={expandedSteps.has(step.step)}
                onToggle={() => toggleStep(step.step)}
                isLast={index === steps.length - 1}
              />
            ))}
          </View>
        )}

        {steps.length === 0 && (
          <View style={styles.emptySteps}>
            <Text style={styles.emptyText}>暂无执行步骤</Text>
          </View>
        )}
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  overviewCard: {
    backgroundColor: COLORS.background.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    ...SHADOWS.default,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text.primary,
    lineHeight: 24,
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: COLORS.background.red,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.error,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.error,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.error,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  stepsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginBottom: 16,
  },
  emptySteps: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.text.secondary,
  },
});

