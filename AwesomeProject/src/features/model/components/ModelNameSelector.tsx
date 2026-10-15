import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {COLORS} from '@shared/constants';
import type {
  ModelCatalogStatus,
  ModelCatalogViewState,
} from '../../../application/facades/UiRuntimeContracts';

export interface ModelNameSelectorProps {
  catalog: ModelCatalogViewState;
  modelId: string;
  onModelIdChange: (modelId: string) => void;
  onRefresh: () => void;
}

// Distinct, safe copy per catalog status. Manual entry is always available, so
// none of these dead-ends the user.
const STATUS_COPY: Record<ModelCatalogStatus, string> = {
  loading: '正在读取当前凭证可用的模型…',
  ready: '选择一个模型，或在下方手动输入模型 ID。',
  unsupported: '该服务商未提供模型目录接口，请手动输入模型 ID。',
  auth_failed: '凭证未通过校验，无法读取模型目录，可手动输入模型 ID。',
  network_failed: '网络异常，暂时无法读取模型目录，可手动输入模型 ID。',
  empty: '未发现可用模型，请手动输入模型 ID。',
  stale: '当前展示的是缓存目录，可能已过期，可刷新或手动输入模型 ID。',
};

export const ModelNameSelector: React.FC<ModelNameSelectorProps> = ({
  catalog,
  modelId,
  onModelIdChange,
  onRefresh,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>当前凭证可用模型</Text>
        <TouchableOpacity
          testID="catalog-refresh"
          style={styles.refresh}
          onPress={onRefresh}
          disabled={catalog.status === 'loading'}>
          <Text style={styles.refreshText}>刷新</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.statusCopy}>{STATUS_COPY[catalog.status]}</Text>

      {catalog.status === 'loading' ? (
        <ActivityIndicator color={COLORS.primary} style={styles.loading} />
      ) : catalog.models.length > 0 ? (
        <View style={styles.list}>
          {catalog.models.map(model => (
            <TouchableOpacity
              key={model.id}
              testID={`catalog-model-${model.id}`}
              style={[
                styles.modelRow,
                modelId === model.id && styles.modelRowActive,
              ]}
              onPress={() => onModelIdChange(model.id)}>
              <Text style={styles.modelLabel}>{model.label}</Text>
              <Text style={styles.modelId} numberOfLines={1}>
                {model.id}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <TextInput
        testID="manual-model-id"
        style={styles.input}
        value={modelId}
        onChangeText={onModelIdChange}
        placeholder="手动输入模型 ID"
        autoCapitalize="none"
        placeholderTextColor={COLORS.text.disabled}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  refresh: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#ebe8ff',
    justifyContent: 'center',
  },
  refreshText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5d54cf',
  },
  statusCopy: {
    fontSize: 11,
    lineHeight: 15,
    color: COLORS.text.secondary,
  },
  loading: {
    marginVertical: 12,
  },
  list: {
    gap: 6,
  },
  modelRow: {
    minHeight: 44,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    backgroundColor: '#ffffff',
  },
  modelRowActive: {
    borderColor: COLORS.violet,
    backgroundColor: '#f0eefe',
  },
  modelLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  modelId: {
    marginTop: 2,
    fontSize: 10,
    color: COLORS.text.secondary,
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
});
