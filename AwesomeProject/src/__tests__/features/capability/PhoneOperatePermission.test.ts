import fs from 'fs';
import path from 'path';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_CAPABILITIES} from '../../../features/capability/types';
import {nonoConfigService} from '../../../features/capability/services/NonoConfigService';
import {
  maybeRequestOperatePermissionsOnLaunch,
  requestOperatePermissions,
  requestAdbFallbackPermission,
  resetOperatePermissionGateForTests,
} from '../../../features/capability/services/operatePermissions';
import {permissionService} from '@shared/services/PermissionService';
import {hideCustomAlert, showCustomAlert} from '@shared/utils/alert';
import {adbService} from '@core/ability';

jest.mock('@shared/utils/alert', () => ({
  showCustomAlert: jest.fn(),
  hideCustomAlert: jest.fn(),
}));

jest.mock('@shared/services/PermissionService', () => ({
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
  },
  permissionService: {
    hasPermissionBeenGranted: jest.fn(async () => false),
    checkPermission: jest.fn(async () => ({status: 'denied'})),
    onPermissionStatusChange: jest.fn(() => () => {}),
  },
}));

jest.mock('@core/ability', () => ({
  accessibilityService: {
    isEnabled: jest.fn(async () => false),
    hasNotificationPermission: jest.fn(async () => true),
    openSettings: jest.fn(),
    requestNotificationPermission: jest.fn(),
    openNotificationSettings: jest.fn(),
  },
  adbService: {
    probeAvailability: jest.fn(async () => ({module: true, shell: true})),
  },
}));

describe('phone operate permission gate', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', {value: 'android'});
    resetOperatePermissionGateForTests();
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockReset();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (permissionService.checkPermission as jest.Mock).mockResolvedValue({
      status: 'denied',
    });
    (permissionService.hasPermissionBeenGranted as jest.Mock).mockResolvedValue(
      false,
    );
  });

  it('defaults the phone-operate capability to off', () => {
    expect(DEFAULT_CAPABILITIES.phoneOperate).toBe(false);
  });

  it('returns phoneOperate off when nothing is stored', async () => {
    const flags = await nonoConfigService.getCapabilities();
    expect(flags.phoneOperate).toBe(false);
  });

  it('does not check permissions on launch when the capability is off', async () => {
    await maybeRequestOperatePermissionsOnLaunch();
    expect(permissionService.checkPermission).not.toHaveBeenCalled();
    expect(showCustomAlert).not.toHaveBeenCalled();
  });

  it('checks permissions on launch when the capability is already on', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        phoneOperate: true,
        errands: true,
        openclaw: false,
      }),
    );
    await maybeRequestOperatePermissionsOnLaunch();
    expect(permissionService.checkPermission).toHaveBeenCalled();
    expect(adbService.probeAvailability).not.toHaveBeenCalled();
  });

  it('checks permissions when the user turns the capability on', async () => {
    await requestOperatePermissions();
    expect(permissionService.checkPermission).toHaveBeenCalled();
  });

  it('shows a checking dialog immediately when the user turns the capability on', async () => {
    await requestOperatePermissions();
    expect((showCustomAlert as jest.Mock).mock.calls[0]).toEqual([
      '检测权限中',
      expect.any(String),
      [],
      expect.objectContaining({loading: true, dismissable: false}),
    ]);
  });

  it('replaces the checking dialog with the accessibility prompt without extra delay', async () => {
    await requestOperatePermissions();
    expect(showCustomAlert).toHaveBeenCalledWith(
      '需要无障碍权限',
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );
  });

  it('does not show the checking dialog on launch', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        phoneOperate: true,
        errands: true,
        openclaw: false,
      }),
    );
    await maybeRequestOperatePermissionsOnLaunch();
    expect(showCustomAlert).not.toHaveBeenCalledWith(
      '检测权限中',
      expect.any(String),
      expect.anything(),
      expect.anything(),
    );
  });

  it('asks for permissions from the capabilities toggle without waiting on the switch', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../features/capability/screens/CapabilitiesScreen.tsx',
      ),
      'utf8',
    );
    // Capabilities is now ViewState-driven via `useAppFacades`; the device
    // permission request still fires immediately when a device-operating
    // capability is switched on, without waiting on the async facade write.
    expect(source).toContain('useAppFacades');
    expect(source).toContain('requestOperatePermissions()');
    expect(source).not.toContain('nonoConfigService');
  });

  it('keeps the ADB switch on the phone-operate page, not Settings', () => {
    const settings = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../features/settings/screens/SettingsScreen.tsx',
      ),
      'utf8',
    );
    const phone = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../features/capability/screens/PhoneOperateScreen.tsx',
      ),
      'utf8',
    );
    expect(settings).not.toContain('ADB 兜底');
    expect(phone).toContain('ADB 兜底');
    expect(phone).toContain('requestAdbFallbackPermission');
    const adbToggle = phone.slice(phone.indexOf('onValueChange={value => {'));
    expect(adbToggle.indexOf('setAdbFallbackEnabled(value)')).toBeLessThan(
      adbToggle.indexOf('requestAdbFallbackPermission'),
    );
  });

  it('does not probe ADB on launch', async () => {
    await maybeRequestOperatePermissionsOnLaunch();
    expect(adbService.probeAvailability).not.toHaveBeenCalled();
  });

  it('probes ADB only when the fallback is turned on', async () => {
    const allowed = await requestAdbFallbackPermission();
    expect(adbService.probeAvailability).toHaveBeenCalled();
    expect(allowed).toBe(true);
    expect((showCustomAlert as jest.Mock).mock.calls[0][0]).toBe('检测权限中');
    expect(hideCustomAlert).toHaveBeenCalled();
  });

  it('blocks ADB when the module is missing', async () => {
    (adbService.probeAvailability as jest.Mock).mockResolvedValueOnce({
      module: false,
      shell: false,
    });
    const allowed = await requestAdbFallbackPermission();
    expect(allowed).toBe(false);
    expect((showCustomAlert as jest.Mock).mock.calls[0][0]).toBe('检测权限中');
    expect(showCustomAlert).toHaveBeenCalledWith(
      '无法使用 ADB 兜底',
      expect.any(String),
    );
  });
});
