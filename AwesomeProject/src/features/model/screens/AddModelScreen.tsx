import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@shared/types/navigation';
import { modelService } from '../services/ModelService';
import { COLORS } from '@shared/constants';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { PageLayout } from '@shared/components/PageLayout';
import type { AIModelFormData } from '@shared/types/Model';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'AddModel'>;

export const AddModelScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const importedData = route.params?.importedData;

  const [provider, setProvider] = useState<'openai' | 'zhipu' | 'modelscope' | 'huggingface' | 'custom'>('openai');

  const [formData, setFormData] = useState<AIModelFormData>({
    name: importedData?.name || '',
    provider: importedData?.provider || 'openai',
    apiUrl: importedData?.apiUrl || 'https://api.openai.com/v1',
    apiKey: importedData?.apiKey || '',
    modelName: importedData?.modelName || 'ZhipuAI/AutoGLM-Phone-9B',
    maxSteps: importedData?.maxSteps || 99,
    description: importedData?.description || '',
  });

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
    
    setFormData(prev => ({ ...prev, provider: newProvider, apiUrl: newUrl }));
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.apiKey.trim()) {
      Alert.alert('提示', '请填写完整信息');
      return;
    }

    try {
      await modelService.addModel({
        ...formData,
        provider: provider,
        name: formData.name.trim(),
        apiUrl: formData.apiUrl.trim(),
        apiKey: formData.apiKey.trim(),
      });
      navigation.goBack();
    } catch (error) {
      console.error('保存模型失败:', error);
      Alert.alert('错误', '保存失败');
    }
  };

  return (
    <PageLayout title="新增模型" showBackButton backgroundColor={COLORS.background.default}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.introCard}>
            <Text style={styles.introKicker}>NEW MODEL</Text>
            <Text style={styles.introTitle}>给 NoNo 接上一个大脑</Text>
            <Text style={styles.introBody}>密钥只会保存在本机。添加后可在模型页设为当前使用。</Text>
          </View>
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
            <TouchableOpacity 
              style={styles.helperLink}
              onPress={() => navigation.navigate('APIKeyGuide')}>
              <AppIcon name={IconNames.info} size={12} color={COLORS.primary} />
              <Text style={styles.helperText}>如何获取 API 密钥？</Text>
            </TouchableOpacity>
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
      </KeyboardAvoidingView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  introCard: {
    marginBottom: 20,
    padding: 20,
    borderRadius: 28,
    backgroundColor: COLORS.ink,
  },
  introKicker: {
    color: '#aca7ea',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  introTitle: {
    marginTop: 6,
    color: '#ffffff',
    fontSize: 23,
    lineHeight: 26,
    fontWeight: '800',
  },
  introBody: {
    marginTop: 8,
    color: '#c9cad4',
    fontSize: 11,
    lineHeight: 16,
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
    borderRadius: 14,
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
  helperLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  helperText: {
    fontSize: 12,
    color: COLORS.primary,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.background.light,
  },
  saveButton: {
    backgroundColor: COLORS.ink,
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
