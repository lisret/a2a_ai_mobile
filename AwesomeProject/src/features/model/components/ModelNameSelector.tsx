import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { COLORS } from '@shared/constants';
import { fetchModelList, type ModelInfo } from '../services/ModelListService';
import type { APIProvider } from '@shared/constants/apiProviders';

interface ModelNameSelectorProps {
  selectedModelName: string;
  onSelectModel: (modelName: string) => void;
  provider: APIProvider | null;
  apiKey: string;
  apiUrl: string;
  error?: string;
}

export const ModelNameSelector: React.FC<ModelNameSelectorProps> = ({
  selectedModelName,
  onSelectModel,
  provider,
  apiKey,
  apiUrl,
  error,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [inputMode, setInputMode] = useState<'select' | 'custom'>('select');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [customModelName, setCustomModelName] = useState('');

  // 当切换到自定义模式时，清空选中的模型
  useEffect(() => {
    if (inputMode === 'custom') {
      setCustomModelName(selectedModelName || '');
    }
  }, [inputMode, selectedModelName]);

  // 当 provider、apiKey 或 apiUrl 变化时，尝试获取模型列表
  useEffect(() => {
    if (inputMode === 'select' && provider && apiKey && apiKey.trim()) {
      loadModels();
    } else {
      setModels([]);
    }
  }, [provider, apiKey, apiUrl, inputMode]);

  const loadModels = async () => {
    if (!provider || !apiKey || !apiKey.trim()) {
      setModels([]);
      return;
    }

    setLoading(true);
    try {
      const modelList = await fetchModelList(provider, apiKey, apiUrl);
      setModels(modelList);
    } catch (error) {
      console.error('获取模型列表失败:', error);
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectModel = (model: ModelInfo) => {
    onSelectModel(model.id);
    setModalVisible(false);
  };

  const handleSwitchToCustom = () => {
    setInputMode('custom');
    setCustomModelName(selectedModelName || '');
  };

  const handleSwitchToSelect = () => {
    setInputMode('select');
    // 如果当前有选中的模型，保留；否则清空
    if (!selectedModelName) {
      onSelectModel('');
    }
  };

  const handleCustomModelChange = (value: string) => {
    setCustomModelName(value);
    onSelectModel(value);
  };

  const handleRefresh = () => {
    if (provider && apiKey && apiKey.trim()) {
      loadModels();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>模型名称</Text>
        <View style={styles.switchContainer}>
          <TouchableOpacity
            style={[
              styles.switchButton,
              inputMode === 'select' && styles.switchButtonActive,
            ]}
            onPress={handleSwitchToSelect}>
            <Text
              style={[
                styles.switchButtonText,
                inputMode === 'select' && styles.switchButtonTextActive,
              ]}>
              选择
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.switchButton,
              inputMode === 'custom' && styles.switchButtonActive,
            ]}
            onPress={handleSwitchToCustom}>
            <Text
              style={[
                styles.switchButtonText,
                inputMode === 'custom' && styles.switchButtonTextActive,
              ]}>
              自定义输入
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {inputMode === 'select' ? (
        <TouchableOpacity
          style={[styles.selector, !!error && styles.selectorError]}
          onPress={() => {
            if (provider && apiKey && apiKey.trim()) {
              setModalVisible(true);
              loadModels();
            } else {
              // 如果没有 API 密钥，提示用户先输入
              setInputMode('custom');
            }
          }}>
          <Text style={[styles.selectorText, !selectedModelName && styles.selectorPlaceholder]}>
            {selectedModelName || '请选择模型（需要先输入API密钥）'}
          </Text>
          <AppIcon name={IconNames.chevronDown} size={12} color={COLORS.text.secondary} />
        </TouchableOpacity>
      ) : (
        <TextInput
          style={[styles.input, !!error && styles.inputError]}
          placeholder="例如：ZhipuAI/AutoGLM-Phone-9B"
          value={customModelName}
          onChangeText={handleCustomModelChange}
          autoCapitalize="none"
        />
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择模型</Text>
              <View style={styles.modalHeaderRight}>
                <TouchableOpacity
                  style={styles.refreshButton}
                  onPress={handleRefresh}
                  disabled={loading}>
                  <AppIcon
                    name={IconNames.refresh}
                    size={18}
                    color={loading ? COLORS.text.secondary : COLORS.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setModalVisible(false)}>
                  <AppIcon name={IconNames.close} size={18} color={COLORS.text.secondary} />
                </TouchableOpacity>
              </View>
            </View>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>正在获取模型列表...</Text>
              </View>
            ) : models.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  无法获取模型列表{'\n'}
                  请检查API密钥是否正确，或使用自定义输入
                </Text>
              </View>
            ) : (
              <FlatList
                data={models}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modelItem,
                      selectedModelName === item.id && styles.modelItemSelected,
                    ]}
                    onPress={() => handleSelectModel(item)}>
                    <View style={styles.modelInfo}>
                      <Text style={styles.modelName}>{item.name}</Text>
                      {item.description && (
                        <Text style={styles.modelDescription}>{item.description}</Text>
                      )}
                      <Text style={styles.modelId} numberOfLines={1}>
                        {item.id}
                      </Text>
                    </View>
                    {selectedModelName === item.id && (
                      <AppIcon name={IconNames.check} size={20} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  switchContainer: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    padding: 2,
  },
  switchButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  switchButtonActive: {
    backgroundColor: '#2563eb',
  },
  switchButtonText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  switchButtonTextActive: {
    color: '#ffffff',
  },
  selector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  selectorError: {
    borderColor: '#dc2626',
  },
  selectorText: {
    fontSize: 16,
    color: '#111827',
    flex: 1,
  },
  selectorPlaceholder: {
    color: '#9ca3af',
  },
  input: {
    width: '100%',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  inputError: {
    borderColor: '#dc2626',
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  refreshButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  modelItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modelItemSelected: {
    backgroundColor: '#f0f7ff',
  },
  modelInfo: {
    flex: 1,
    marginRight: 12,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  modelDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  modelId: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
});

