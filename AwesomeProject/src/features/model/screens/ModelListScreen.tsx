import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {ModelItem} from '../components/ModelItem';
import {EmptyState} from '@shared/components/EmptyState';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {PageLayout} from '@shared/components/PageLayout';
import {AppMark} from '@shared/components/AppMark';
import {COLORS} from '@shared/constants';
import {modelService} from '../services/ModelService';
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

  const handleAdd = () => {
    navigation.navigate('AddModel');
  };

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

  const activeModel = models.find(item => item.id === selectedModelId);

  return (
    <PageLayout
      title="模型"
      kicker="NONO INTELLIGENCE"
      headerAccessory={<AppMark size={48} />}
      backgroundColor={COLORS.background.default}>
      <FlatList
        data={models}
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
              <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
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
            onPress={() => handleModelPress(item)}
            onEdit={() => navigation.navigate('EditModel', {modelId: item.id})}
            onDelete={() => {
              setModelToDelete(item);
              setDeleteModalVisible(true);
            }}
          />
        )}
        ListFooterComponent={
          <TouchableOpacity
            style={styles.guideLink}
            onPress={() => navigation.navigate('APIKeyGuide')}>
            <Text style={styles.guideText}>API Key 获取指南</Text>
            <Text style={styles.guideChevron}>›</Text>
          </TouchableOpacity>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      />

      <ConfirmModal
        visible={deleteModalVisible}
        title="删除这个模型配置？"
        message={`${modelToDelete?.name || '该模型'} 将从本机移除。此操作不可撤销。`}
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteModalVisible(false);
          setModelToDelete(null);
        }}
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
