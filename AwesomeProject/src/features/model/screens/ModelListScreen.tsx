import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@shared/types/navigation';
import { ModelItem } from '../components/ModelItem';
import { FAB } from '@shared/components/FAB';
import { EmptyState } from '@shared/components/EmptyState';
import { ConfirmModal } from '@shared/components/ConfirmModal';
import { PageLayout } from '@shared/components/PageLayout';
import { COLORS } from '@shared/constants';
import { modelService } from '../services/ModelService';
import type { AIModel } from '@shared/types/Model';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const ModelListScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<AIModel | null>(null);

  const loadModels = useCallback(async () => {
    try {
      const allModels = await modelService.getAllModels();
      const activeModel = await modelService.getSelectedModel();
      setModels(allModels);
      setSelectedModelId(activeModel?.id || null);
    } catch (error) {
      console.error('加载模型列表失败:', error);
      Alert.alert('错误', '加载模型列表失败');
    }
  }, []);

  useEffect(() => {
    loadModels();
    
    // 监听页面焦点，返回时刷新列表
    const unsubscribe = navigation.addListener('focus', () => {
      loadModels();
    });
    
    return unsubscribe;
  }, [navigation, loadModels]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadModels();
    setRefreshing(false);
  }, [loadModels]);

  const handleAdd = () => {
    navigation.navigate('AddModel');
  };

  const handleModelPress = async (model: AIModel) => {
    // 点击模型，立即在UI上更新为选中状态（乐观更新）
    setSelectedModelId(model.id);

    // 异步保存到存储
    try {
      await modelService.setSelectedModel(model.id);
      // 不需要重新加载整个列表，状态已经更新了
    } catch (error) {
      console.error('设置选中模型失败:', error);
      Alert.alert('错误', '设置模型失败');
      // 如果失败，回滚状态（可选，或者重新加载）
      loadModels();
    }
  };

  const handleEdit = (model: AIModel) => {
    navigation.navigate('EditModel', { modelId: model.id });
  };

  const handleDelete = (model: AIModel) => {
    setModelToDelete(model);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!modelToDelete) return;
    
    try {
      await modelService.deleteModel(modelToDelete.id);
      setDeleteModalVisible(false);
      setModelToDelete(null);
      await loadModels();
      Alert.alert('成功', '模型已删除');
    } catch (error) {
      console.error('删除模型失败:', error);
      Alert.alert('错误', '删除模型失败');
    }
  };

  const cancelDelete = () => {
    setDeleteModalVisible(false);
    setModelToDelete(null);
  };

  return (
    <PageLayout title="模型管理" backgroundColor={COLORS.background.default}>
      {models.length === 0 ? (
        <EmptyState
          iconName="empty"
          title="请先配置 AI 模型"
          subtitle="配置模型后才能使用任务执行功能。点击右下角 '+' 按钮添加您的第一个 AI 模型。"
        />
      ) : (
        <FlatList
          data={models}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ModelItem
              model={item}
              isActive={item.id === selectedModelId}
              onPress={() => handleModelPress(item)}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}

      <FAB onPress={handleAdd} />
      
      <ConfirmModal
        visible={deleteModalVisible}
        title="确认删除"
        message={`确定要删除"${modelToDelete?.name}"吗？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        danger
      />
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: 20,
  },
});

