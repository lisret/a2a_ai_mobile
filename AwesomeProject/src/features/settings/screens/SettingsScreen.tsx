import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@shared/types/navigation';
import { settingsService } from '../services/SettingsService';
import { searchBoxPositionService } from '../services/SearchBoxPositionService';
import { accessibilityService, floatingWindowService } from '@core/ability';
import { NoNoSettingsView } from '../components/NoNoSettingsView';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const SettingsScreen: React.FC = () => {
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
    <NoNoSettingsView
      adbFallbackEnabled={adbFallbackEnabled}
      completionSoundEnabled={taskCompletionSoundEnabled}
      searchBoxPosition={searchBoxPosition}
      searchDraft={searchBoxInputValue}
      searchModalVisible={searchBoxModalVisible}
      onToggleAdb={handleADBFallbackToggle}
      onToggleSound={handleTaskCompletionSoundToggle}
      onOpenSearchEditor={handleOpenSearchBoxModal}
      onSearchDraftChange={setSearchBoxInputValue}
      onSaveSearchPosition={handleSaveSearchBoxPosition}
      onCancelSearchPosition={handleCancelSearchBoxModal}
      onOpenOverlaySettings={() => {
        floatingWindowService.openOverlayPermissionSettings().catch(() => {});
      }}
      onOpenNotificationSettings={() => {
        accessibilityService.openNotificationSettings().catch(() => {});
      }}
      onOpenAccessibilitySettings={() => {
        accessibilityService.openSettings().catch(() => {});
      }}
      onOpenDebugLogs={() => navigation.navigate('DebugLog')}
    />
  );
};
