import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import type {RootStackParamList} from '@shared/types/navigation';
import {modelService} from '../services/ModelService';
import {COLORS} from '@shared/constants';
import {PageLayout} from '@shared/components/PageLayout';
import type {AIModelFormData} from '@shared/types/Model';
import {showCustomAlert} from '@shared/utils/alert';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'EditModel'>;

export const EditModelScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const {modelId, list = 'unified'} = route.params;
  const companion = list === 'companion';

  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<
    'openai' | 'zhipu' | 'modelscope' | 'huggingface' | 'custom'
  >('openai');

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
      const model = await modelService.getModelById(modelId, list);
      if (model) {
        const url = model.apiUrl.toLowerCase();
        let inferredProvider:
          | 'openai'
          | 'zhipu'
          | 'modelscope'
          | 'huggingface'
          | 'custom' = 'openai';
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
        showCustomAlert('错误', '模型不存在');
        navigation.goBack();
      }
    } catch (error) {
      console.error('加载模型失败:', error);
      showCustomAlert('错误', '加载模型失败');
    } finally {
      setLoading(false);
    }
  };

  const updateProviderSettings = (
    newProvider: 'openai' | 'zhipu' | 'modelscope' | 'huggingface' | 'custom',
  ) => {
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
      setFormData(prev => ({...prev, provider: newProvider, apiUrl: newUrl}));
    } else {
      setFormData(prev => ({...prev, provider: newProvider}));
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.apiKey.trim()) {
      showCustomAlert('提示', '请填写完整信息');
      return;
    }

    try {
      await modelService.updateModel(
        modelId,
        {
          ...formData,
          provider: provider,
        },
        list,
      );
      navigation.goBack();
    } catch (error) {
      console.error('更新模型失败:', error);
      showCustomAlert('错误', '更新失败');
    }
  };

  return (
    <PageLayout
      title={companion ? '编辑陪伴模型' : '编辑模型'}
      showBackButton
      backgroundColor={COLORS.background.default}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.formCard}>
            {loading ? (
              <Text style={styles.note}>正在加载…</Text>
            ) : (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>配置名称</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={
                      companion ? '例如：NoNo Chat' : '例如：NoNo Vision'
                    }
                    value={formData.name}
                    onChangeText={text =>
                      setFormData({...formData, name: text})
                    }
                    placeholderTextColor={COLORS.text.disabled}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>服务商</Text>
                  <View style={styles.providerRow}>
                    {[
                      'openai',
                      'zhipu',
                      'modelscope',
                      'huggingface',
                      'custom',
                    ].map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[
                          styles.providerChip,
                          provider === p && styles.providerChipActive,
                        ]}
                        onPress={() => updateProviderSettings(p as any)}>
                        <Text
                          style={[
                            styles.providerText,
                            provider === p && styles.providerTextActive,
                          ]}>
                          {p === 'openai'
                            ? 'OpenAI'
                            : p === 'zhipu'
                            ? '智谱'
                            : p === 'modelscope'
                            ? '魔搭'
                            : p === 'huggingface'
                            ? 'HuggingFace'
                            : '自定义'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>服务地址</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.apiUrl}
                    onChangeText={text =>
                      setFormData({...formData, apiUrl: text})
                    }
                    placeholder={
                      companion ? 'chat.example.ai/v1' : 'gateway.example.ai/v1'
                    }
                    placeholderTextColor={COLORS.text.disabled}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>API Key</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.apiKey}
                    onChangeText={text =>
                      setFormData({...formData, apiKey: text})
                    }
                    placeholder="仅保存在这台手机"
                    placeholderTextColor={COLORS.text.disabled}
                    secureTextEntry
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>模型标识</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.modelName}
                    onChangeText={text =>
                      setFormData({...formData, modelName: text})
                    }
                    placeholder={
                      companion ? '例如：nono-chat-2' : '例如：nono-vision-2'
                    }
                    placeholderTextColor={COLORS.text.disabled}
                    autoCapitalize="none"
                  />
                </View>

                {companion ? null : (
                  <View style={styles.field}>
                    <Text style={styles.label}>最大执行步数</Text>
                    <TextInput
                      style={styles.input}
                      value={String(formData.maxSteps)}
                      onChangeText={text =>
                        setFormData({
                          ...formData,
                          maxSteps: parseInt(text) || 99,
                        })
                      }
                      keyboardType="number-pad"
                      placeholder="99"
                      placeholderTextColor={COLORS.text.disabled}
                    />
                  </View>
                )}
                <Text style={styles.note}>
                  {companion
                    ? '这条配置只用于首页说话，不会拿去看屏或点应用。'
                    : '这条配置用于看屏和点应用，和设置里的陪伴模型不是同一份。'}
                </Text>

                <TouchableOpacity
                  testID="model-form-save"
                  style={styles.saveButton}
                  onPress={handleSave}>
                  <Text style={styles.saveButtonText}>保存模型</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  formCard: {
    padding: 15,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    gap: 10,
  },
  field: {
    gap: 6,
  },
  label: {
    color: '#525461',
    fontSize: 10,
    fontWeight: '700',
  },
  input: {
    height: 45,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    fontSize: 12,
    color: COLORS.text.primary,
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  providerChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#f1f0f7',
    justifyContent: 'center',
  },
  providerChipActive: {
    backgroundColor: COLORS.violet,
  },
  providerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5d6070',
  },
  providerTextActive: {
    color: '#ffffff',
  },
  note: {
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 15,
    color: '#59536f',
    backgroundColor: '#ebe8ff',
    fontSize: 10,
    lineHeight: 15,
  },
  saveButton: {
    minHeight: 52,
    marginTop: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.violet,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
