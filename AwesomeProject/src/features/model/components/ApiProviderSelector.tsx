import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import { API_PROVIDERS, type APIProvider } from '@shared/constants/apiProviders';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { COLORS } from '@shared/constants';

interface ApiProviderSelectorProps {
  selectedProviderId: string | null;
  onSelectProvider: (provider: APIProvider) => void;
  customApiUrl: string;
  onCustomUrlChange: (url: string) => void;
}

export const ApiProviderSelector: React.FC<ApiProviderSelectorProps> = ({
  selectedProviderId,
  onSelectProvider,
  customApiUrl,
  onCustomUrlChange,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [inputMode, setInputMode] = useState<'select' | 'custom'>(
    selectedProviderId === 'custom' || !selectedProviderId ? 'custom' : 'select'
  );

  const selectedProvider = selectedProviderId
    ? API_PROVIDERS.find(p => p.id === selectedProviderId)
    : null;

  const handleSelectProvider = (provider: APIProvider) => {
    if (provider.id === 'custom') {
      setInputMode('custom');
      onSelectProvider(provider);
    } else {
      setInputMode('select');
      onSelectProvider(provider);
      onCustomUrlChange(provider.baseUrl);
    }
    setModalVisible(false);
  };

  const handleSwitchToCustom = () => {
    setInputMode('custom');
    const customProvider = API_PROVIDERS.find(p => p.id === 'custom');
    if (customProvider) {
      onSelectProvider(customProvider);
      // 切换到手动输入时清空API地址
      onCustomUrlChange('');
    }
  };

  const handleSwitchToSelect = () => {
    setInputMode('select');
    const defaultProvider = API_PROVIDERS[0];
    onSelectProvider(defaultProvider);
    onCustomUrlChange(defaultProvider.baseUrl);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>API提供商</Text>
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
              手动输入
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {inputMode === 'select' ? (
        <TouchableOpacity
          style={styles.selector}
          onPress={() => setModalVisible(true)}>
          <Text style={styles.selectorText}>
            {selectedProvider?.name || '请选择API提供商'}
          </Text>
          <AppIcon name={IconNames.chevronDown} size={12} color={COLORS.text.secondary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.customHintContainer}>
          <Text style={styles.customHint}>
            请在下方手动输入完整的API地址
          </Text>
        </View>
      )}

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
              <Text style={styles.modalTitle}>选择API提供商</Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setModalVisible(false)}>
                <AppIcon name={IconNames.close} size={18} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={API_PROVIDERS}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.providerItem,
                    selectedProviderId === item.id && styles.providerItemSelected,
                  ]}
                  onPress={() => handleSelectProvider(item)}>
                  <View style={styles.providerInfo}>
                    <Text style={styles.providerName}>{item.name}</Text>
                    {item.description && (
                      <Text style={styles.providerDescription}>
                        {item.description}
                      </Text>
                    )}
                    {item.baseUrl && (
                      <Text style={styles.providerUrl} numberOfLines={1}>
                        {item.baseUrl}
                      </Text>
                    )}
                  </View>
                  {selectedProviderId === item.id && (
                    <AppIcon name={IconNames.check} size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
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
  selectorText: {
    fontSize: 16,
    color: '#111827',
    flex: 1,
  },
  customHintContainer: {
    marginTop: 4,
    padding: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
  },
  customHint: {
    fontSize: 12,
    color: '#6b7280',
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
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  providerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  providerItemSelected: {
    backgroundColor: '#f0f7ff',
  },
  providerInfo: {
    flex: 1,
    marginRight: 12,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  providerDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  providerUrl: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
});

