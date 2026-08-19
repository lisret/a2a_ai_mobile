import React from 'react';
import {FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {PageLayout} from '@shared/components/PageLayout';
import {NoNoMascot} from '@shared/components/NoNoMascot';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {StatusBadge} from '@shared/ui/nono';
import {COLORS} from '@shared/constants';

export type ActivityFilter = 'all' | 'success' | 'failed';

export type ActivityItemViewModel = {
  id: string;
  title: string;
  timeLabel: string;
  stepsLabel: string;
  status: 'success' | 'failed' | 'cancelled' | 'running';
  statusLabel: string;
};

export type NoNoActivityViewProps = {
  filter: ActivityFilter;
  items: readonly ActivityItemViewModel[];
  emptyTitle: string;
  emptyMessage: string;
  refreshing: boolean;
  pendingDeleteId: string | null;
  onFilterChange(filter: ActivityFilter): void;
  onRefresh(): void;
  onOpen(id: string): void;
  onRequestDelete(id: string): void;
  onConfirmDelete(): void;
  onCancelDelete(): void;
};

const FILTERS: ReadonlyArray<[ActivityFilter, string]> = [
  ['all', '全部'],
  ['success', '已完成'],
  ['failed', '失败'],
];

export const NoNoActivityView: React.FC<NoNoActivityViewProps> = ({
  filter,
  items,
  emptyTitle,
  emptyMessage,
  refreshing,
  pendingDeleteId,
  onFilterChange,
  onRefresh,
  onOpen,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}) => {
  return (
    <PageLayout
      title="活动"
      kicker="TASK TIMELINE"
      headerAccessory={<NoNoMascot size={50} />}
      backgroundColor={COLORS.background.default}>
      <FlatList
        data={items as ActivityItemViewModel[]}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View style={styles.filterRow}>
            {FILTERS.map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.filterChip, filter === key && styles.filterChipActive]}
                onPress={() => onFilterChange(key)}
                accessibilityRole="button"
                accessibilityLabel={label}>
                <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptyBody}>{emptyMessage}</Text>
          </View>
        }
        renderItem={({item}) => {
          const tone =
            item.status === 'failed'
              ? 'failed'
              : item.status === 'success'
                ? 'success'
                : 'running';
          return (
            <TouchableOpacity
              style={styles.taskItem}
              onPress={() => onOpen(item.id)}
              onLongPress={() => onRequestDelete(item.id)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`删除 ${item.title}`}>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{item.timeLabel}</Text>
                <StatusBadge label={item.statusLabel} tone={tone} />
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{item.stepsLabel}</Text>
                <Text style={styles.metaText}>查看详情 ›</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

      <ConfirmModal
        visible={pendingDeleteId !== null}
        title="删除任务"
        message="确定要删除这条任务记录吗？删除后无法恢复。"
        confirmText="确认删除"
        cancelText="取消"
        danger
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
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
  emptyCard: {
    padding: 15,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  emptyTitle: {color: COLORS.text.primary, fontSize: 13, fontWeight: '700'},
  emptyBody: {marginTop: 4, color: COLORS.text.secondary, fontSize: 10, lineHeight: 14},
});
