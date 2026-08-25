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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@shared/types/navigation';
import { settingsService } from '../services/SettingsService';
import { searchBoxPositionService } from '../services/SearchBoxPositionService';
import { PageLayout } from '@shared/components/PageLayout';
import { AppMark } from '@shared/components/AppMark';
import { COLORS } from '@shared/constants';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { modelService } from '@features/model/services/ModelService';
import {
  getActiveAvatarId,
  listAvatarLooks,
} from '@features/task/avatar/AvatarPackStore';
import type { AIModel } from '@shared/types/Model';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// ... (rest of the component logic remains the same, focusing on styles)

export const SettingsScreen: React.FC = () => {
  // ... (state and handlers remain the same)
  const navigation = useNavigation<NavigationProp>();
  const [taskCompletionSoundEnabled, setTaskCompletionSoundEnabled] = useState(false);
  const [searchBoxPosition, setSearchBoxPosition] = useState('');
  const [searchBoxModalVisible, setSearchBoxModalVisible] = useState(false);
  const [searchBoxInputValue, setSearchBoxInputValue] = useState('');
  const [companion, setCompanion] = useState<AIModel | null>(null);
  const [lookTitle, setLookTitle] = useState('默认角色');

  useEffect(() => {
    loadSettings();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      modelService.getSelectedModel('companion').then(setCompanion);
      void getActiveAvatarId().then(id => {
        const look = listAvatarLooks().find(item => item.id === id);
        setLookTitle(look?.title ?? '默认角色');
      });
    }, []),
  );

  const loadSettings = async () => {
    try {
      const soundEnabled = await settingsService.getTaskCompletionSoundEnabled();
      setTaskCompletionSoundEnabled(soundEnabled);
      
      const position = await searchBoxPositionService.getSearchBoxPosition();
      setSearchBoxPosition(position || '');
      setCompanion(await modelService.getSelectedModel('companion'));
    } catch (error) {
      console.error('加载设置失败:', error);
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
    <PageLayout
      title="设置"
      kicker="这台应用"
      headerAccessory={<AppMark size={48} />}
      backgroundColor={COLORS.background.default}>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>陪伴</Text>
          <Text style={styles.sectionHint}>首页说话</Text>
        </View>
        <TouchableOpacity
          style={[styles.settingRow, companion ? styles.companionActive : undefined]}
          onPress={() => navigation.navigate('CompanionConfig')}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>
              {companion?.name || '还没有对话模型'}
            </Text>
            <Text style={styles.settingDescription}>
              {companion
                ? `${companion.provider || '自定义'} · 只用于对话，不用于点应用`
                : '配好对话模型后，才能在首页和角色说话'}
            </Text>
          </View>
          <Text style={styles.linkChevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => navigation.navigate('AvatarLooks')}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>{lookTitle}</Text>
            <Text style={styles.settingDescription}>
              只换首页角色长什么样，不改说话用的模型
            </Text>
          </View>
          <View style={styles.lookMeta}>
            <Text style={styles.lookMetaLabel}>角色外观</Text>
            <Text style={styles.linkChevron}>›</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>执行偏好</Text>
          <Text style={styles.sectionHint}>本机设置</Text>
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>完成提示音</Text>
            <Text style={styles.settingDescription}>任务结束时轻声提醒</Text>
          </View>
          <Switch
            value={taskCompletionSoundEnabled}
            onValueChange={handleTaskCompletionSoundToggle}
            trackColor={{false: '#d8d7df', true: COLORS.violet}}
            thumbColor="#ffffff"
          />
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>自动保存活动</Text>
            <Text style={styles.settingDescription}>只保存经过清理的任务摘要</Text>
          </View>
          <Switch
            value={true}
            onValueChange={() => {}}
            trackColor={{false: '#d8d7df', true: COLORS.violet}}
            thumbColor="#ffffff"
          />
        </View>
        <TouchableOpacity style={styles.settingRow} onPress={handleOpenSearchBoxModal}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>搜索框位置</Text>
            <Text style={styles.settingDescription}>
              {searchBoxPosition || '设置搜索框位置描述'}
            </Text>
          </View>
          <AppIcon name={IconNames.arrowRight} size={16} color={COLORS.text.secondary} />
        </TouchableOpacity>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>支持</Text>
          <Text style={styles.sectionHint}>本地诊断</Text>
        </View>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => navigation.navigate('DebugLog')}>
          <Text style={styles.linkText}>调试日志</Text>
          <Text style={styles.linkChevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => navigation.navigate('About')}>
          <Text style={styles.linkText}>关于 NoNo</Text>
          <Text style={styles.linkChevron}>›</Text>
        </TouchableOpacity>

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
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  sectionHeading: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  sectionHint: {
    color: COLORS.text.secondary,
    fontSize: 10,
  },
  settingRow: {
    minHeight: 64,
    marginBottom: 10,
    padding: 15,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  settingInfo: {
    flex: 1,
    paddingRight: 12,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  settingDescription: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    color: COLORS.text.secondary,
  },
  companionActive: {
    borderWidth: 1,
    borderColor: 'rgba(117,107,240,0.38)',
  },
  lookMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  lookMetaLabel: {
    color: COLORS.text.secondary,
    fontSize: 10,
    fontWeight: '700',
  },
  linkRow: {
    minHeight: 62,
    marginBottom: 10,
    paddingHorizontal: 15,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.84)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkText: {
    color: COLORS.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  linkChevron: {
    color: '#9a9ca7',
    fontSize: 18,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(19,20,34,0.28)',
    justifyContent: 'flex-end',
    padding: 14,
  },
  modalContent: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 26,
    width: '100%',
    padding: 20,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
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
    marginBottom: 18,
  },
  modalHint: {
    fontSize: 12,
    color: COLORS.text.secondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  modalTextInput: {
    fontSize: 14,
    color: COLORS.text.primary,
    minHeight: 100,
    padding: 12,
    backgroundColor: COLORS.background.light,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 9,
  },
  modalButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#f1f0f7',
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#575967',
  },
  modalConfirmButton: {
    backgroundColor: COLORS.violet,
  },
  modalConfirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

