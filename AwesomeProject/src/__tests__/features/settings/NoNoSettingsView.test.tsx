import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {NoNoSettingsView} from '../../../features/settings/components/NoNoSettingsView';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn(), navigate: jest.fn()}),
  useIsFocused: () => true,
}));

test('Settings delegates existing toggle, modal and debug-log behavior', () => {
  const onToggleAdb = jest.fn();
  const onOpenSearchEditor = jest.fn();
  const view = render(
    <NoNoSettingsView
      adbFallbackEnabled={false}
      completionSoundEnabled
      searchBoxPosition="顶部"
      searchDraft="顶部"
      searchModalVisible={false}
      onToggleAdb={onToggleAdb}
      onToggleSound={jest.fn()}
      onOpenSearchEditor={onOpenSearchEditor}
      onSearchDraftChange={jest.fn()}
      onSaveSearchPosition={jest.fn()}
      onCancelSearchPosition={jest.fn()}
      onOpenOverlaySettings={jest.fn()}
      onOpenNotificationSettings={jest.fn()}
      onOpenAccessibilitySettings={jest.fn()}
      onOpenDebugLogs={jest.fn()}
    />,
  );
  fireEvent(view.getByLabelText('ADB 兜底运行'), 'valueChange', true);
  expect(onToggleAdb).toHaveBeenCalledWith(true);
  fireEvent.press(view.getByLabelText('编辑手机应用搜索框位置'));
  expect(onOpenSearchEditor).toHaveBeenCalledTimes(1);
});
