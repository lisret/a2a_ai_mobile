import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@shared/types/navigation';
import { modelService } from '../services/ModelService';
import { COLORS, SHADOWS } from '@shared/constants';
import { AppIcon, IconNames } from '@shared/components/Icon';
import type { AIModelFormData } from '@shared/types/Model';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'EditModel'>;

export const EditModelScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const { modelId } = route.params;

  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<'openai' | 'zhipu' | 'modelscope' | 'huggingface' | 'custom'>('openai');

  const [formData, setFormData] = useState<AIModelFormData>({
    name: '',
    provider: 'openai',
    apiUrl: '',
    apiKey: '',
    modelName: '',
    maxSteps: 99,
    description: '',
  });

  useEffect(() => {
    loadModel();
  }, [modelId]);

  const loadModel = async () => {
    try {
      const model = await modelService.getModelById(modelId);
      if (model) {
        // 根据 apiUrl 推断提供商
        const url = model.apiUrl.toLowerCase();
        let inferredProvider: 'openai' | 'zhipu' | 'modelscope' | 'huggingface' | 'custom' = 'openai';
        if (url.includes('openai.com')) {
          inferredProvider = 'openai';
        } else if (url.includes('bigmodel.cn') || url.includes('zhipu')) {
          inferredProvider = 'zhipu';
        } else if (url.includes('modelscope.cn') || url.includes('modelscope')) {
          inferredProvider = 'modelscope';
        } else if (url.includes('huggingface.co') || url.includes('huggingface')) {
          inferredProvider = 'huggingface';
        } else {
          inferredProvider = 'custom';
        }
        
        setProvider(inferredProvider);
        setFormData({
          name: model.name,
          provider: model.provider || inferredProvider,
          apiUrl: model.apiUrl,
          apiKey: model.apiKey,
          modelName: model.modelName || 'ZhipuAI/AutoGLM-Phone-9B',
          maxSteps: model.maxSteps || 99,
          description: model.description || '',
        });
      } else {
        Alert.alert('错误', '模型不存在');
        navigation.goBack();
      }
    } catch (error) {
      console.error('加载模型失败:', error);
      Alert.alert('错误', '加载模型失败');
    } finally {
      setLoading(false);
    }
  };

  const updateProviderSettings = (newProvider: 'openai' | 'zhipu' | 'modelscope' | 'huggingface' | 'custom') => {
    setProvider(newProvider);
    let newUrl = '';
    if (newProvider === 'openai') {
      newUrl = 'https://api.openai.com/v1';
    } else if (newProvider === 'zhipu') {
      newUrl = 'https://open.bigmodel.cn/api/paas/v4';
    } else if (newProvider === 'modelscope') {
      newUrl = 'https://api-inference.modelscope.cn/v1';
    } else if (newProvider === 'huggingface') {
      newUrl = 'https://api-inference.huggingface.co';
    }
    
    if (newUrl) {
      setFormData(prev => ({ ...prev, provider: newProvider, apiUrl: newUrl }));
    } else {
      setFormData(prev => ({ ...prev, provider: newProvider }));
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.apiKey.trim()) {
      Alert.alert('提示', '请填写完整信息');
      return;
    }

    try {
      await modelService.updateModel(modelId, {
        ...formData,
        provider: provider,
      });
      navigation.goBack();
    } catch (error) {
      console.error('更新模型失败:', error);
      Alert.alert('错误', '更新失败');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <TouchableWithoutFeedback onPress={() => navigation.goBack()}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <View style={styles.sheetContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>编辑模型</Text>
          <TouchableOpacity 
            onPress={() => navigation.goBack()}
            style={styles.closeButton}>
            <AppIcon name={IconNames.close} size={20} color={COLORS.text.secondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>昵称</Text>
            <TextInput
              style={styles.input}
              placeholder="例如：我的 GPT-4"
              value={formData.name}
              onChangeText={text => setFormData({ ...formData, name: text })}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>提供商</Text>
            <View style={styles.providerRow}>
              {['openai', 'zhipu', 'modelscope', 'huggingface', 'custom'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.providerChip,
                    provider === p && styles.providerChipActive
                  ]}
                  onPress={() => updateProviderSettings(p as any)}>
                  <Text style={[
                    styles.providerText,
                    provider === p && styles.providerTextActive
                  ]}>
                    {p === 'openai' ? 'OpenAI' : 
                     p === 'zhipu' ? '智谱' : 
                     p === 'modelscope' ? '魔搭' : 
                     p === 'huggingface' ? 'HuggingFace' : 
                     '自定义'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>API 地址</Text>
            <TextInput
              style={styles.input}
              value={formData.apiUrl}
              onChangeText={text => setFormData({ ...formData, apiUrl: text })}
              placeholder="https://..."
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>API 密钥</Text>
            <TextInput
              style={styles.input}
              value={formData.apiKey}
              onChangeText={text => setFormData({ ...formData, apiKey: text })}
              placeholder="sk-..."
              placeholderTextColor="#9CA3AF"
              secureTextEntry
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>模型名称</Text>
            <TextInput
              style={styles.input}
              value={formData.modelName}
              onChangeText={text => setFormData({ ...formData, modelName: text })}
              placeholder="例如：gpt-4o, glm-4"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              defaultValue="ZhipuAI/AutoGLM-Phone-9B"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>最大执行步数</Text>
            <TextInput
              style={styles.input}
              value={String(formData.maxSteps)}
              onChangeText={text => setFormData({ ...formData, maxSteps: parseInt(text) || 99 })}
              keyboardType="number-pad"
              placeholder="99"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.buttonGroup}>
            <TouchableOpacity 
              style={[styles.button, styles.cancelButton]} 
              onPress={() => navigation.goBack()}>
              <Text style={styles.cancelButtonText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.saveButton]} 
              onPress={handleSave}>
              <Text style={styles.saveButtonText}>保存</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} /> 
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 24,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background.light,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: COLORS.text.primary,
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  providerChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: COLORS.background.light,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
  },
  providerChipActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  providerText: {
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  providerTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.background.light,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.default,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
