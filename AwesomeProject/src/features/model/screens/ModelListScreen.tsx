import React, {useState, useEffect, useCallback} from 'react';
import {Alert} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {modelService} from '../services/ModelService';
import {NoNoModelsView} from '../components/NoNoModelsView';
import type {AIModel} from '@shared/types/Model';

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

  const handleModelPress = async (model: AIModel) => {
    setSelectedModelId(model.id);
    try {
      await modelService.setSelectedModel(model.id);
    } catch (error) {
      console.error('设置选中模型失败:', error);
      Alert.alert('错误', '设置模型失败');
      loadModels();
    }
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

  return (
    <NoNoModelsView
      models={models}
      selectedModelId={selectedModelId}
      refreshing={refreshing}
      deleteModalVisible={deleteModalVisible}
      modelToDeleteName={modelToDelete?.name}
      onRefresh={handleRefresh}
      onAdd={() => navigation.navigate('AddModel')}
      onSelect={handleModelPress}
      onEdit={modelId => navigation.navigate('EditModel', {modelId})}
      onRequestDelete={model => {
        setModelToDelete(model);
        setDeleteModalVisible(true);
      }}
      onConfirmDelete={confirmDelete}
      onCancelDelete={() => {
        setDeleteModalVisible(false);
        setModelToDelete(null);
      }}
      onOpenApiGuide={() => navigation.navigate('APIKeyGuide')}
    />
  );
};
