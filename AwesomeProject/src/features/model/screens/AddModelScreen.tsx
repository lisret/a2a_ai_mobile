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
import type {ModelCatalogViewState} from '../../../application/facades/UiRuntimeContracts';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'AddModel'>;

const EMPTY_CATALOG: ModelCatalogViewState = {
  requestGeneration: 0,
  status: 'empty',
  models: [],
};

export const AddModelScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const list = route.params?.list ?? 'unified';
  const companion = list === 'companion';
  const {modelConfig} = useAppFacades();

  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<ModelDraftState>({
    mode: 'preset',
    presetId: 'openai',
    baseUrlOverride: '',
    custom: DEFAULT_CUSTOM_PROVIDER,
    modelId: '',
  });
  const [catalog, setCatalog] = useState<ModelCatalogViewState>(EMPTY_CATALOG);
  // Add always starts a fresh credential (replace with empty input); never keep.
  const [secret, setSecret] = useState('');
  const [presets, setPresets] = useState(
    [] as Awaited<ReturnType<typeof modelConfig.getViewState>>['presets'],
  );
  const generation = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      modelConfig.getViewState({list}).then(next => {
        if (!active) {
          return;
        }
        setRevision(next.revision);
        setPresets(next.presets);
        setDraft(current => ({
          ...current,
          mode: next.mode,
          presetId: next.selectedPresetId ?? next.presets[0]?.id ?? 'openai',
          baseUrlOverride: next.baseUrl,
          custom: next.custom ?? DEFAULT_CUSTOM_PROVIDER,
          modelId: next.modelId,
        }));
        setCatalog(next.catalog);
      });
      return () => {
        active = false;
      };
    }, [modelConfig, list]),
  );

  const refresh = async () => {
    generation.current += 1;
    const requestGeneration = generation.current;
    const next = await modelConfig.refreshCatalog(
      buildRefreshInput(draft, {
        list,
        requestGeneration,
        credential: {action: 'replace', plaintext: secret},
      }),
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
          expectedRevision: revision,
          credential: {action: 'replace', plaintext: secret},
        }),
      );
      setSecret('');
      navigation.goBack();
    } catch (error) {
      console.error('保存模型失败');
      showCustomAlert('错误', '保存失败');
    }
  };

  return (
    <PageLayout
      title={companion ? '新增陪伴模型' : '新增模型'}
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
              onCustomChange={custom => setDraft(current => ({...current, custom}))}
            />

            <View style={styles.field}>
              <Text style={styles.label}>API Key</Text>
              <TextInput
                testID="credential-input"
                style={styles.input}
                value={secret}
                onChangeText={setSecret}
                placeholder="仅保存在这台手机"
                placeholderTextColor={COLORS.text.disabled}
                secureTextEntry
              />
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
