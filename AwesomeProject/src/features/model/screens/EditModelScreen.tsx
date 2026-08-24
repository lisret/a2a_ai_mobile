import React, {useCallback, useRef, useState} from 'react';
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
import {useNavigation, useRoute, useFocusEffect} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import type {RootStackParamList} from '@shared/types/navigation';
import {COLORS} from '@shared/constants';
import {PageLayout} from '@shared/components/PageLayout';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {showCustomAlert} from '@shared/utils/alert';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import {ApiProviderSelector} from '../components/ApiProviderSelector';
import {ModelNameSelector} from '../components/ModelNameSelector';
import {
  DEFAULT_CUSTOM_PROVIDER,
  buildRefreshInput,
  buildSaveInput,
  type ModelDraftState,
} from '../services/ModelListService';
import type {
  CredentialEditIntent,
  ModelCatalogViewState,
} from '../../../application/facades/UiRuntimeContracts';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'EditModel'>;

const EMPTY_CATALOG: ModelCatalogViewState = {
  requestGeneration: 0,
  status: 'empty',
  models: [],
};

type CredentialAction = 'keep' | 'replace' | 'remove';

export const EditModelScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const {bindingId, list = 'unified'} = route.params;
  const companion = list === 'companion';
  const {modelConfig} = useAppFacades();

  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<ModelDraftState>({
    mode: 'preset',
    presetId: 'openai',
    baseUrlOverride: '',
    custom: DEFAULT_CUSTOM_PROVIDER,
    modelId: '',
  });
  const [catalog, setCatalog] = useState<ModelCatalogViewState>(EMPTY_CATALOG);
  const [credentialLabel, setCredentialLabel] = useState<string | undefined>();
  // Edit starts at keep: the secret input is empty and never rehydrated.
  const [credentialAction, setCredentialAction] = useState<CredentialAction>('keep');
  const [secret, setSecret] = useState('');
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);
  const [presets, setPresets] = useState(
    [] as Awaited<ReturnType<typeof modelConfig.getViewState>>['presets'],
  );
  const generation = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      modelConfig.getViewState({list, bindingId}).then(next => {
        if (!active) {
          return;
        }
        setRevision(next.revision);
        setPresets(next.presets);
        setDraft({
          mode: next.mode,
          presetId: next.selectedPresetId ?? next.presets[0]?.id ?? 'openai',
          baseUrlOverride: next.baseUrl,
          custom: next.custom ?? DEFAULT_CUSTOM_PROVIDER,
          modelId: next.modelId,
        });
        setCatalog(next.catalog);
        setCredentialLabel(
          next.credential.state === 'ready' ? next.credential.maskedLabel : undefined,
        );
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [modelConfig, list, bindingId]),
  );

  const credentialIntent = (): CredentialEditIntent => {
    if (credentialAction === 'replace') {
      return {action: 'replace', plaintext: secret};
    }
    if (credentialAction === 'remove') {
      return {action: 'remove'};
    }
    return {action: 'keep'};
  };

  const refresh = async () => {
    generation.current += 1;
    const requestGeneration = generation.current;
    const credential =
      credentialAction === 'replace'
        ? ({action: 'replace', plaintext: secret} as const)
        : ({action: 'keep'} as const);
    const next = await modelConfig.refreshCatalog(
      buildRefreshInput(draft, {list, bindingId, requestGeneration, credential}),
    );
    if (next.requestGeneration >= catalog.requestGeneration) {
      setCatalog(next);
    }
  };

  const handleSave = async () => {
    if (!draft.modelId.trim()) {
      showCustomAlert('提示', '请填写模型 ID');
      return;
    }
    try {
      await modelConfig.save(
        buildSaveInput(draft, {
          list,
          bindingId,
          expectedRevision: revision,
          credential: credentialIntent(),
        }),
      );
      setSecret('');
      navigation.goBack();
    } catch (error) {
      console.error('更新模型失败');
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
                <ApiProviderSelector
                  mode={draft.mode}
                  presets={presets}
                  selectedPresetId={draft.presetId}
                  onSelectPreset={id =>
                    setDraft(current => ({...current, mode: 'preset', presetId: id}))
                  }
                  onSelectCustom={() =>
                    setDraft(current => ({...current, mode: 'custom'}))
                  }
                  custom={draft.custom}
                  onCustomChange={custom =>
                    setDraft(current => ({...current, custom}))
                  }
                />

                <View style={styles.field}>
                  <Text style={styles.label}>API Key</Text>
                  {credentialAction === 'replace' ? (
                    <TextInput
                      testID="credential-input"
                      style={styles.input}
                      value={secret}
                      onChangeText={setSecret}
                      placeholder="输入新的密钥"
                      placeholderTextColor={COLORS.text.disabled}
                      secureTextEntry
                    />
                  ) : (
                    <Text style={styles.credentialSummary}>
                      {credentialAction === 'remove'
                        ? '将移除已保存的密钥'
                        : credentialLabel
                        ? `已保存：${credentialLabel}`
                        : '未设置密钥'}
                    </Text>
                  )}
                  <View style={styles.credentialActions}>
                    <TouchableOpacity
                      testID="credential-keep"
                      style={[
                        styles.miniButton,
                        credentialAction === 'keep' && styles.miniButtonActive,
                      ]}
                      onPress={() => {
                        setCredentialAction('keep');
                        setSecret('');
                      }}>
                      <Text style={styles.miniText}>保持不变</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="credential-replace"
                      style={[
                        styles.miniButton,
                        credentialAction === 'replace' && styles.miniButtonActive,
                      ]}
                      onPress={() => {
                        setCredentialAction('replace');
                        setSecret('');
                      }}>
                      <Text style={styles.miniText}>更换密钥</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="credential-remove"
                      style={[
                        styles.miniButton,
                        credentialAction === 'remove' && styles.miniButtonActive,
                      ]}
                      onPress={() => setRemoveConfirmVisible(true)}>
                      <Text style={styles.miniText}>移除密钥</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <ModelNameSelector
                  catalog={catalog}
                  modelId={draft.modelId}
                  onModelIdChange={modelId =>
                    setDraft(current => ({...current, modelId}))
                  }
                  onRefresh={refresh}
                />

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
      <ConfirmModal
        visible={removeConfirmVisible}
        title="移除已保存的密钥？"
        message="移除后需要重新输入密钥才能继续使用该模型。"
        confirmText="确认移除"
        cancelText="取消"
        onConfirm={() => {
          setCredentialAction('remove');
          setSecret('');
          setRemoveConfirmVisible(false);
        }}
        onCancel={() => setRemoveConfirmVisible(false)}
        danger
      />
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
  credentialSummary: {
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  credentialActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miniButton: {
    minHeight: 32,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: '#f1f0f7',
    justifyContent: 'center',
  },
  miniButtonActive: {
    backgroundColor: '#dcd8fb',
  },
  miniText: {
    color: '#575967',
    fontSize: 10,
    fontWeight: '700',
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
