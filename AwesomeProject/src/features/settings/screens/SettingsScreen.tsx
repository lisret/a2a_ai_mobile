import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@shared/types/navigation';
import { settingsService } from '../services/SettingsService';
import { searchBoxPositionService } from '../services/SearchBoxPositionService';
import { PageLayout } from '@shared/components/PageLayout';
import { COLORS, SHADOWS } from '@shared/constants';
import { AppIcon, IconNames } from '@shared/components/Icon';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// ... (rest of the component logic remains the same, focusing on styles)

export const SettingsScreen: React.FC = () => {
  // ... (state and handlers remain the same)
  const navigation = useNavigation<NavigationProp>();
  const [adbFallbackEnabled, setAdbFallbackEnabled] = useState(false);
  const [taskCompletionSoundEnabled, setTaskCompletionSoundEnabled] = useState(false);
  const [searchBoxPosition, setSearchBoxPosition] = useState('');
  const [searchBoxModalVisible, setSearchBoxModalVisible] = useState(false);
  const [searchBoxInputValue, setSearchBoxInputValue] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const adbEnabled = await settingsService.getADBFallbackEnabled();
      setAdbFallbackEnabled(adbEnabled);
      
      const soundEnabled = await settingsService.getTaskCompletionSoundEnabled();
      setTaskCompletionSoundEnabled(soundEnabled);
      
      const position = await searchBoxPositionService.getSearchBoxPosition();
      setSearchBoxPosition(position || '');
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  };

  const handleADBFallbackToggle = async (value: boolean) => {
    try {
      await settingsService.setADBFallbackEnabled(value);
      setAdbFallbackEnabled(value);
    } catch (error) {
      console.error('保存设置失败:', error);
      Alert.alert('错误', '保存设置失败，请重试');
    }
  };

  const handleTaskCompletionSoundToggle = async (value: boolean) => {
    try {
      await settingsService.setTaskCompletionSoundEnabled(value);
      setTaskCompletionSoundEnabled(value);
    } catch (error) {
      console.error('保存设置失败:', error);
      Alert.alert('错误', '保存设置失败，请重试');
    }
  };

  const handleOpenSearchBoxModal = () => {
    setSearchBoxInputValue(searchBoxPosition);
    setSearchBoxModalVisible(true);
  };

  const handleSaveSearchBoxPosition = async () => {
    try {
      if (searchBoxInputValue.trim()) {
        await searchBoxPositionService.saveSearchBoxPosition(searchBoxInputValue.trim());
        setSearchBoxPosition(searchBoxInputValue.trim());
      } else {
        await searchBoxPositionService.deleteSearchBoxPosition();
        setSearchBoxPosition('');
      }
      setSearchBoxModalVisible(false);
    } catch (error) {
      console.error('保存搜索框位置失败:', error);
      Alert.alert('错误', '保存搜索框位置失败，请重试');
    }
  };

  const handleCancelSearchBoxModal = () => {
    setSearchBoxInputValue(searchBoxPosition);
    setSearchBoxModalVisible(false);
  };

  return (
    <PageLayout title="设置" backgroundColor={COLORS.background.default}>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* 功能介绍 */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>功能介绍</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              • 任务执行时会自动切换到后台运行，不影响您使用其他应用{'\n'}
              • 通过通知栏和悬浮窗实时查看任务执行状态{'\n'}
              • 支持随时中断任务执行{'\n'}
              • 所有任务历史自动保存，方便查看和回顾
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>应用设置</Text>
          
          <View style={styles.settingsGroup}>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={handleOpenSearchBoxModal}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>手机应用搜索框</Text>
                <Text style={styles.settingDescription}>
                  设置搜索框位置
                </Text>
              </View>
              <AppIcon name={IconNames.arrowRight} size={16} color={COLORS.text.secondary} />
            </TouchableOpacity>

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>ADB 兜底运行</Text>
                <Text style={styles.settingDescription}>
                  无障碍服务失败时使用 ADB
                </Text>
              </View>
              <Switch
                value={adbFallbackEnabled}
                onValueChange={handleADBFallbackToggle}
                trackColor={{ false: '#E5E7EB', true: COLORS.success }}
              />
            </View>

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>任务完成提示音</Text>
                <Text style={styles.settingDescription}>
                  任务完成时播放提示音
                </Text>
              </View>
              <Switch
                value={taskCompletionSoundEnabled}
                onValueChange={handleTaskCompletionSoundToggle}
                trackColor={{ false: '#E5E7EB', true: COLORS.success }}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.settingsGroup}>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => navigation.navigate('DebugLog')}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>调试日志</Text>
                <Text style={styles.settingDescription}>
                  查看应用运行日志
                </Text>
              </View>
              <AppIcon name={IconNames.arrowRight} size={16} color={COLORS.text.secondary} />
            </TouchableOpacity>

            <View style={[styles.settingItem, { borderBottomWidth: 0 }]}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>自动保存任务历史</Text>
              </View>
              <Switch
                value={true}
                onValueChange={() => {}}
                trackColor={{ false: '#E5E7EB', true: COLORS.success }}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.settingsGroup}>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>关于</Text>
              <Text style={styles.settingValue}>v0.0.12</Text>
            </View>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>作者</Text>
              <Text style={styles.settingValue}>LiZheng</Text>
            </View>
            <View style={[styles.settingItem, { borderBottomWidth: 0 }]}>
              <Text style={styles.settingLabel}>邮箱</Text>
              <Text style={[styles.settingValue, { fontSize: 12 }]}>1443376351@qq.com</Text>
            </View>
          </View>
        </View>

        {/* 搜索框位置设置弹窗 */}
        <Modal
          visible={searchBoxModalVisible}
          transparent
          animationType="fade"
          onRequestClose={handleCancelSearchBoxModal}>
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={handleCancelSearchBoxModal}>
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>设置搜索框位置描述</Text>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={handleCancelSearchBoxModal}>
                  <Text style={styles.modalCloseText}>×</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.modalHint}>
                  请输入搜索框位置描述，例如："搜索框在首页左侧页面的顶部"
                </Text>
                <TextInput
                  style={styles.modalTextInput}
                  value={searchBoxInputValue}
                  onChangeText={setSearchBoxInputValue}
                  placeholder="请输入搜索框位置描述..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={4}
                  autoFocus
                />
              </View>
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancelButton]}
                  onPress={handleCancelSearchBoxModal}>
                  <Text style={styles.modalCancelButtonText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalConfirmButton]}
                  onPress={handleSaveSearchBoxPosition}>
                  <Text style={styles.modalConfirmButtonText}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 80,
  },
  infoSection: {
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: COLORS.background.blue,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  infoText: {
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 22,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text.primary, // Demo uses text-main for group labels? No, uses label inside.
    // Actually Demo doesn't have explicit section titles outside groups except for "应用设置" implied context
    // But let's keep it clean
    marginBottom: 8,
    marginLeft: 4,
  },
  settingsGroup: {
    backgroundColor: COLORS.background.card,
    borderRadius: 12,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.medium,
  },
  settingInfo: {
    flex: 1,
    paddingRight: 16,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text.primary,
  },
  settingDescription: {
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  settingValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingValue: {
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end', // Bottom sheet style
  },
  modalContent: {
    backgroundColor: COLORS.background.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: '100%',
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 20,
    color: COLORS.text.secondary,
  },
  modalBody: {
    marginBottom: 24,
  },
  modalHint: {
    fontSize: 14,
    color: COLORS.text.primary,
    marginBottom: 8,
    fontWeight: '500',
  },
  modalTextInput: {
    fontSize: 14,
    color: COLORS.text.primary,
    minHeight: 100,
    padding: 12,
    backgroundColor: COLORS.background.light,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: COLORS.background.default,
  },
  modalCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  modalConfirmButton: {
    backgroundColor: COLORS.primary,
  },
  modalConfirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

