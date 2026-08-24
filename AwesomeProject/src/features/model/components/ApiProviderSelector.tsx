import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Switch,
} from 'react-native';
import {COLORS} from '@shared/constants';
import type {
  ProviderAuthV1,
  ProviderProtocolV1,
} from '@core/engine/operateRuntime/model/ModelProviderContracts';
import type {
  CustomProviderConfigViewState,
  ProviderPresetId,
  ProviderPresetViewState,
} from '../../../application/facades/UiRuntimeContracts';

export interface ApiProviderSelectorProps {
  mode: 'preset' | 'custom';
  presets: readonly ProviderPresetViewState[];
  selectedPresetId?: ProviderPresetId;
  onSelectPreset: (id: ProviderPresetId) => void;
  onSelectCustom: () => void;
  custom?: CustomProviderConfigViewState;
  onCustomChange: (next: CustomProviderConfigViewState) => void;
}

const PROTOCOLS: readonly ProviderProtocolV1[] = [
  'openai_chat_completions',
  'openai_responses',
  'anthropic_messages',
  'gemini_generate_content',
  'custom_http_json',
];

const PROTOCOL_LABELS: Record<ProviderProtocolV1, string> = {
  openai_chat_completions: 'OpenAI Chat',
  openai_responses: 'OpenAI Responses',
  anthropic_messages: 'Anthropic',
  gemini_generate_content: 'Gemini',
  custom_http_json: '自定义 JSON',
};

type AuthKind = ProviderAuthV1['kind'];
const AUTH_KINDS: readonly AuthKind[] = ['none', 'bearer', 'header', 'query'];
const AUTH_LABELS: Record<AuthKind, string> = {
  none: '无',
  bearer: 'Bearer',
  header: '自定义 Header',
  query: 'Query 参数',
};

function nextAuth(kind: AuthKind, current: ProviderAuthV1): ProviderAuthV1 {
  switch (kind) {
    case 'none':
      return {kind: 'none'};
    case 'bearer':
      return {kind: 'bearer'};
    case 'header':
      return current.kind === 'header'
        ? current
        : {kind: 'header', headerName: 'Authorization', prefix: 'Bearer '};
    case 'query':
      return current.kind === 'query' ? current : {kind: 'query', queryName: 'key'};
  }
}

export const ApiProviderSelector: React.FC<ApiProviderSelectorProps> = ({
  mode,
  presets,
  selectedPresetId,
  onSelectPreset,
  onSelectCustom,
  custom,
  onCustomChange,
}) => {
  const patchCustom = (patch: Partial<CustomProviderConfigViewState>) => {
    if (!custom) {
      return;
    }
    onCustomChange({...custom, ...patch});
  };

  const patchCapability = (
    key: 'vision' | 'toolCalls' | 'reasoning',
    value: boolean,
  ) => {
    if (!custom) {
      return;
    }
    onCustomChange({
      ...custom,
      declaredCapabilities: {
        ...custom.declaredCapabilities,
        capabilities: {
          ...custom.declaredCapabilities.capabilities,
          [key]: value,
        },
      },
    });
  };

  const auth = custom?.auth ?? {kind: 'bearer'};

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <TouchableOpacity
          testID="provider-mode-preset"
          style={[styles.tab, mode === 'preset' && styles.tabActive]}
          onPress={() =>
            selectedPresetId
              ? onSelectPreset(selectedPresetId)
              : onSelectPreset(presets[0]?.id ?? 'openai')
          }>
          <Text style={[styles.tabText, mode === 'preset' && styles.tabTextActive]}>
            热门厂商
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="provider-mode-custom"
          style={[styles.tab, mode === 'custom' && styles.tabActive]}
          onPress={onSelectCustom}>
          <Text style={[styles.tabText, mode === 'custom' && styles.tabTextActive]}>
            完全自定义
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'preset' ? (
        <View style={styles.presetList}>
          {presets.map(preset => (
            <TouchableOpacity
              key={preset.id}
              testID={`preset-row-${preset.id}`}
              style={[
                styles.presetRow,
                selectedPresetId === preset.id && styles.presetRowActive,
              ]}
              onPress={() => onSelectPreset(preset.id)}>
              <Text style={styles.presetLabel}>{preset.label}</Text>
              {preset.maturity === 'compatibility' ? (
                <Text style={styles.presetHint}>兼容</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : custom ? (
        <View style={styles.customForm}>
          <Field label="服务商名称">
            <TextInput
              testID="custom-provider-label"
              style={styles.input}
              value={custom.providerLabel}
              onChangeText={text => patchCustom({providerLabel: text})}
              placeholder="例如：My LLM"
              placeholderTextColor={COLORS.text.disabled}
            />
          </Field>
          <Field label="服务地址 (Base URL)">
            <TextInput
              testID="custom-base-url"
              style={styles.input}
              value={custom.baseUrl}
              onChangeText={text => patchCustom({baseUrl: text})}
              placeholder="https://…"
              autoCapitalize="none"
              placeholderTextColor={COLORS.text.disabled}
            />
          </Field>

          <Field label="协议">
            <View style={styles.chipWrap}>
              {PROTOCOLS.map(protocol => (
                <TouchableOpacity
                  key={protocol}
                  testID={`custom-protocol-${protocol}`}
                  style={[
                    styles.chip,
                    custom.protocol === protocol && styles.chipActive,
                  ]}
                  onPress={() => patchCustom({protocol})}>
                  <Text
                    style={[
                      styles.chipText,
                      custom.protocol === protocol && styles.chipTextActive,
                    ]}>
                    {PROTOCOL_LABELS[protocol]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label="鉴权方式">
            <View style={styles.chipWrap}>
              {AUTH_KINDS.map(kind => (
                <TouchableOpacity
                  key={kind}
                  testID={`custom-auth-${kind}`}
                  style={[styles.chip, auth.kind === kind && styles.chipActive]}
                  onPress={() => patchCustom({auth: nextAuth(kind, auth)})}>
                  <Text
                    style={[
                      styles.chipText,
                      auth.kind === kind && styles.chipTextActive,
                    ]}>
                    {AUTH_LABELS[kind]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          {auth.kind === 'header' ? (
            <>
              <Field label="Header 名称">
                <TextInput
                  testID="custom-auth-header-name"
                  style={styles.input}
                  value={auth.headerName}
                  onChangeText={text =>
                    patchCustom({auth: {kind: 'header', headerName: text, prefix: auth.prefix}})
                  }
                  autoCapitalize="none"
                />
              </Field>
              <Field label="Header 前缀">
                <View style={styles.chipWrap}>
                  {(['', 'Bearer ', 'Token ', 'Basic '] as const).map(prefix => (
                    <TouchableOpacity
                      key={prefix || 'none'}
                      testID={`custom-auth-prefix-${prefix.trim() || 'none'}`}
                      style={[styles.chip, auth.prefix === prefix && styles.chipActive]}
                      onPress={() =>
                        patchCustom({
                          auth: {kind: 'header', headerName: auth.headerName, prefix},
                        })
                      }>
                      <Text
                        style={[
                          styles.chipText,
                          auth.prefix === prefix && styles.chipTextActive,
                        ]}>
                        {prefix.trim() || '无前缀'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
            </>
          ) : null}

          {auth.kind === 'query' ? (
            <Field label="Query 参数名">
              <TextInput
                testID="custom-auth-query-name"
                style={styles.input}
                value={auth.queryName}
                onChangeText={text => patchCustom({auth: {kind: 'query', queryName: text}})}
                autoCapitalize="none"
              />
            </Field>
          ) : null}

          <Field label="对话路径 (chatPath)">
            <TextInput
              testID="custom-chat-path"
              style={styles.input}
              value={custom.chatPath}
              onChangeText={text => patchCustom({chatPath: text})}
              autoCapitalize="none"
              placeholder="/v1/chat/completions"
              placeholderTextColor={COLORS.text.disabled}
            />
          </Field>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>提供模型目录接口</Text>
            <Switch
              testID="custom-has-model-list"
              value={custom.modelListPath !== null}
              onValueChange={value =>
                patchCustom({modelListPath: value ? '/v1/models' : null})
              }
            />
          </View>
          {custom.modelListPath !== null ? (
            <Field label="模型目录路径 (modelListPath)">
              <TextInput
                testID="custom-model-list-path"
                style={styles.input}
                value={custom.modelListPath}
                onChangeText={text => patchCustom({modelListPath: text})}
                autoCapitalize="none"
              />
            </Field>
          ) : null}

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>支持图片输入</Text>
            <Switch
              testID="custom-cap-image-input"
              value={custom.declaredCapabilities.inputModalities.includes('image')}
              onValueChange={value =>
                patchCustom({
                  declaredCapabilities: {
                    ...custom.declaredCapabilities,
                    inputModalities: value ? ['text', 'image'] : ['text'],
                    capabilities: {
                      ...custom.declaredCapabilities.capabilities,
                      vision: value ? true : custom.declaredCapabilities.capabilities.vision,
                    },
                  },
                })
              }
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>支持视觉</Text>
            <Switch
              testID="custom-cap-vision"
              value={custom.declaredCapabilities.capabilities.vision === true}
              onValueChange={value => patchCapability('vision', value)}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>支持工具调用</Text>
            <Switch
              testID="custom-cap-tool-calls"
              value={custom.declaredCapabilities.capabilities.toolCalls === true}
              onValueChange={value => patchCapability('toolCalls', value)}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>支持推理</Text>
            <Switch
              testID="custom-cap-reasoning"
              value={custom.declaredCapabilities.capabilities.reasoning === true}
              onValueChange={value => patchCapability('reasoning', value)}
            />
          </View>

          <Text style={styles.unverified}>
            能力为用户声明、未验证；仅在实际请求时才会生效。
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const Field: React.FC<{label: string; children: React.ReactNode}> = ({
  label,
  children,
}) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    gap: 10,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 14,
    backgroundColor: '#f1f0f7',
  },
  tab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.violet,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5d6070',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  presetList: {
    gap: 6,
  },
  presetRow: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  presetRowActive: {
    borderColor: COLORS.violet,
    backgroundColor: '#f0eefe',
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  presetHint: {
    fontSize: 10,
    color: COLORS.text.secondary,
  },
  customForm: {
    gap: 10,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#525461',
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    fontSize: 12,
    color: COLORS.text.primary,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    minHeight: 32,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#f1f0f7',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: COLORS.violet,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5d6070',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  toggleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 12,
    color: COLORS.text.primary,
  },
  unverified: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff4e6',
    color: '#8a5a1a',
    fontSize: 11,
    lineHeight: 15,
  },
});
