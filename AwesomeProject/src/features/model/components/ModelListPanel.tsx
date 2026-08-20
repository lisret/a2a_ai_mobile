import React, {useCallback, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import type {AIModel, ModelListKey} from '@shared/types/Model';
import {ModelItem} from './ModelItem';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {COLORS} from '@shared/constants';
import {modelService} from '../services/ModelService';
import {showCustomAlert} from '@shared/utils/alert';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface ModelListPanelProps {
  title: string;
  listKey: ModelListKey;
}

export const ModelListPanel: React.FC<ModelListPanelProps> = ({
  title,
  listKey,
}) => {
  const navigation = useNavigation<NavigationProp>();
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AIModel | null>(null);

  const load = useCallback(async () => {
    const [items, active] = await Promise.all([
      modelService.getAllModels(listKey),
      modelService.getSelectedModel(listKey),
    ]);
    setModels(items);
    setSelectedId(active?.id || null);
  }, [listKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleSelect = async (model: AIModel) => {
    setSelectedId(model.id);
    await modelService.setSelectedModel(model.id, listKey);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await modelService.deleteModel(deleteTarget.id, listKey);
      setDeleteTarget(null);
      await load();
    } catch {
      showCustomAlert('错误', '删除模型失败');
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity
          style={styles.add}
          onPress={() => navigation.navigate('AddModel', {list: listKey})}>
          <Text style={styles.addText}>＋ 新增</Text>
        </TouchableOpacity>
      </View>
      {models.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>还没有配置</Text>
          <Text style={styles.emptyBody}>新增一条后才能启用。</Text>
        </View>
      ) : (
        models.map(item => (
          <ModelItem
            key={item.id}
            model={item}
            isActive={item.id === selectedId}
            onPress={() => handleSelect(item)}
            onEdit={() =>
              navigation.navigate('EditModel', {modelId: item.id, list: listKey})
            }
            onDelete={() => setDeleteTarget(item)}
          />
        ))
      )}
      <ConfirmModal
        visible={!!deleteTarget}
        title="删除这个模型配置？"
        message={`${deleteTarget?.name || '该模型'} 将从本机移除。此操作不可撤销。`}
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        danger
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  heading: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: {
    color: COLORS.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  add: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: '#ebe8ff',
    justifyContent: 'center',
  },
  addText: {
    color: '#5d54cf',
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    padding: 15,
    marginBottom: 10,
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
  },
});
