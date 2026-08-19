import React from 'react';
import {FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {PageLayout} from '@shared/components/PageLayout';
import {AppMark} from '@shared/components/AppMark';
import {EmptyState} from '@shared/components/EmptyState';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {COLORS} from '@shared/constants';
import {ModelItem} from './ModelItem';
import type {AIModel} from '@shared/types/Model';

export type NoNoModelsViewProps = {
  models: readonly AIModel[];
  selectedModelId: string | null;
  refreshing: boolean;
  deleteModalVisible: boolean;
  modelToDeleteName?: string;
  onRefresh(): void;
  onAdd(): void;
  onSelect(model: AIModel): void;
  onEdit(modelId: string): void;
  onRequestDelete(model: AIModel): void;
  onConfirmDelete(): void;
  onCancelDelete(): void;
  onOpenApiGuide(): void;
};

export const NoNoModelsView: React.FC<NoNoModelsViewProps> = ({
  models,
  selectedModelId,
  refreshing,
  deleteModalVisible,
  modelToDeleteName,
  onRefresh,
  onAdd,
  onSelect,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onOpenApiGuide,
}) => {
  const activeModel = models.find(item => item.id === selectedModelId);

  return (
    <PageLayout
      title="模型"
      kicker="NONO INTELLIGENCE"
      headerAccessory={<AppMark size={48} />}
      backgroundColor={COLORS.background.default}>
      <FlatList
        data={models as AIModel[]}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>ACTIVE BRAIN</Text>
              <Text style={styles.heroTitle}>{activeModel?.name || '尚未选择模型'}</Text>
              <Text style={styles.heroBody}>
                {activeModel
                  ? `${activeModel.provider || '自定义'} · ${activeModel.modelName || activeModel.apiUrl}`
                  : '添加并启用模型后，NoNo 才能开始任务。'}
              </Text>
            </View>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>模型配置</Text>
              <TouchableOpacity style={styles.addButton} onPress={onAdd}>
                <Text style={styles.addButtonText}>＋ 新增</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            iconName="empty"
            title="请先配置 AI 模型"
            subtitle="添加并启用模型后，NoNo 才能开始任务。"
          />
        }
        renderItem={({item}) => (
          <ModelItem
            model={item}
            isActive={item.id === selectedModelId}
            onPress={() => onSelect(item)}
            onEdit={() => onEdit(item.id)}
            onDelete={() => onRequestDelete(item)}
          />
        )}
        ListFooterComponent={
          <TouchableOpacity style={styles.guideLink} onPress={onOpenApiGuide}>
            <Text style={styles.guideText}>API Key 获取指南</Text>
            <Text style={styles.guideChevron}>›</Text>
          </TouchableOpacity>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

      <ConfirmModal
        visible={deleteModalVisible}
        title="删除这个模型配置？"
        message={`${modelToDeleteName || '该模型'} 将从本机移除。此操作不可撤销。`}
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        danger
      />
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  hero: {
    marginTop: 7,
    marginBottom: 18,
    padding: 20,
    borderRadius: 28,
    backgroundColor: '#1b1d30',
  },
  heroKicker: {
    color: '#aca7ea',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  heroTitle: {
    maxWidth: 240,
    marginTop: 5,
    marginBottom: 8,
    color: '#ffffff',
    fontSize: 23,
    lineHeight: 26,
    fontWeight: '800',
  },
  heroBody: {
    maxWidth: 250,
    color: '#c9cad4',
    fontSize: 11,
    lineHeight: 16,
  },
  sectionHeading: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: COLORS.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  addButton: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: '#ebe8ff',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#5d54cf',
    fontSize: 12,
    fontWeight: '700',
  },
  guideLink: {
    minHeight: 62,
    marginTop: 18,
    paddingHorizontal: 15,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.84)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guideText: {
    color: COLORS.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  guideChevron: {
    color: '#9a9ca7',
    fontSize: 18,
  },
});
