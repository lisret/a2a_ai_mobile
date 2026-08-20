import {AppState, type AppStateStatus, Platform} from 'react-native';
import {accessibilityService, adbService} from '@core/ability';
import {permissionService, PermissionStatus} from '@shared/services/PermissionService';
import {showCustomAlert, hideCustomAlert} from '@shared/utils/alert';
import {nonoConfigService} from './NonoConfigService';

let isChecking = false;
let hasCheckedNotification = false;
let hasShownPermissionAlert = false;
let permissionWasGranted = false;

export function resetOperatePermissionGateForTests() {
  isChecking = false;
  hasCheckedNotification = false;
  hasShownPermissionAlert = false;
  permissionWasGranted = false;
}

async function isPhoneOperateOn(): Promise<boolean> {
  const flags = await nonoConfigService.getCapabilities();
  return flags.phoneOperate;
}

const CHECKING_ALERT_OPTIONS = {
  loading: true,
  dismissable: false,
} as const;

function showCheckingAlert(message: string) {
  showCustomAlert('检测权限中', message, [], CHECKING_ALERT_OPTIONS);
}

const checkAccessibilityPermission = async (silent: boolean = false): Promise<boolean> => {
  if (isChecking) {
    return false;
  }

  try {
    isChecking = true;

    const isEnabled = silent
      ? (
          await permissionService.checkPermission(
            'android.permission.BIND_ACCESSIBILITY_SERVICE',
          )
        ).status === PermissionStatus.GRANTED
      : await accessibilityService.isEnabled(1, 0);
    if (!silent) {
      void permissionService.checkPermission(
        'android.permission.BIND_ACCESSIBILITY_SERVICE',
      );
    }

    if (!isEnabled) {
      const wasGranted = permissionWasGranted;

      if (silent && !wasGranted) {
        isChecking = false;
        return false;
      }

      if (hasShownPermissionAlert && wasGranted) {
        isChecking = false;
        return false;
      }

      hasShownPermissionAlert = true;

      const message = wasGranted
        ? '检测到无障碍服务被关闭。\n\n可能是系统自动关闭的（某些定制系统会定期清理未使用的无障碍服务）。\n\n为了正常使用自动化功能，请重新开启无障碍服务。\n\n开启步骤：\n1. 点击"去开启"按钮\n2. 在设置中找到本应用\n3. 开启无障碍服务开关\n4. 返回应用即可使用'
        : '为了正常使用自动化功能，请先开启无障碍服务。\n\n开启步骤：\n1. 点击"去开启"按钮\n2. 在设置中找到本应用\n3. 开启无障碍服务开关\n4. 返回应用即可使用\n\n应用需要无障碍权限来：\n• 获取屏幕截图\n• 执行点击、滑动等操作\n• 启动其他应用';

      showCustomAlert(
        '需要无障碍权限',
        message,
        [
          {
            text: '去开启',
            onPress: async () => {
              await accessibilityService.openSettings().catch(error => {
                console.error('打开无障碍设置失败:', error);
              });

              let checkCount = 0;
              const maxChecks = 30;

              const checkPermissionOnReturn = async () => {
                checkCount++;
                if (checkCount > maxChecks) {
                  return;
                }

                const result = await permissionService.checkPermission(
                  'android.permission.BIND_ACCESSIBILITY_SERVICE',
                );

                if (result.status === PermissionStatus.GRANTED) {
                  showCustomAlert('无障碍已开启', '现在可以用自动化功能了。');
                  permissionWasGranted = true;
                  hasShownPermissionAlert = false;
                  isChecking = false;
                } else {
                  setTimeout(checkPermissionOnReturn, 1000);
                }
              };

              const subscription = AppState.addEventListener(
                'change',
                async (nextAppState: AppStateStatus) => {
                  if (nextAppState === 'active') {
                    await checkPermissionOnReturn();
                    subscription.remove();
                  }
                },
              );

              setTimeout(checkPermissionOnReturn, 2000);
            },
          },
          {
            text: '稍后',
            style: 'cancel',
            onPress: () => {
              isChecking = false;
            },
          },
        ],
        {
          onDismiss: () => {
            isChecking = false;
          },
        },
      );
      return false;
    }

    permissionWasGranted = true;
    hasShownPermissionAlert = false;
    isChecking = false;
    return true;
  } catch (error) {
    console.error('检查无障碍权限失败:', error);
    isChecking = false;
    hideCustomAlert();
    return false;
  }
};

const checkNotificationPermission = async () => {
  if (hasCheckedNotification) {
    return;
  }

  try {
    const hasPermission = await accessibilityService.hasNotificationPermission();

    if (!hasPermission) {
      hasCheckedNotification = true;
      showCustomAlert(
        '需要通知权限',
        '为了正常接收任务完成通知，请开启通知权限。\n\n应用需要通知权限来：\n• 显示任务完成通知\n• 在通知栏显示任务执行状态\n• 及时提醒您任务进度',
        [
          {
            text: '去开启',
            onPress: async () => {
              try {
                await accessibilityService.requestNotificationPermission();
                setTimeout(async () => {
                  const hasPermissionNow =
                    await accessibilityService.hasNotificationPermission();
                  if (!hasPermissionNow) {
                    await accessibilityService.openNotificationSettings();
                  }
                }, 500);
              } catch (error) {
                console.error('请求通知权限失败:', error);
                accessibilityService.openNotificationSettings().catch(err => {
                  console.error('打开通知设置失败:', err);
                });
              }
            },
          },
          {
            text: '稍后',
            style: 'cancel',
            onPress: () => {
              hasCheckedNotification = false;
            },
          },
        ],
        {
          onDismiss: () => {
            hasCheckedNotification = false;
          },
        },
      );
    } else {
      hasCheckedNotification = true;
      hideCustomAlert();
    }
  } catch (error) {
    console.error('检查通知权限失败:', error);
    hasCheckedNotification = true;
    hideCustomAlert();
  }
};

async function runOperatePermissionChecks(silentAccessibility: boolean) {
  if (Platform.OS !== 'android') {
    hideCustomAlert();
    return;
  }
  const wasGranted = await permissionService.hasPermissionBeenGranted(
    'android.permission.BIND_ACCESSIBILITY_SERVICE',
  );
  permissionWasGranted = wasGranted;
  const accessibilityOk = await checkAccessibilityPermission(silentAccessibility);
  if (accessibilityOk) {
    await checkNotificationPermission();
  }
}

export async function maybeRequestOperatePermissionsOnLaunch() {
  if (!(await isPhoneOperateOn())) {
    return;
  }
  const wasGranted = await permissionService.hasPermissionBeenGranted(
    'android.permission.BIND_ACCESSIBILITY_SERVICE',
  );
  await runOperatePermissionChecks(wasGranted);
}

export async function requestOperatePermissions() {
  hasShownPermissionAlert = false;
  hasCheckedNotification = false;
  showCheckingAlert('正在确认无障碍和通知权限。');
  await runOperatePermissionChecks(false);
}

export async function requestAdbFallbackPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  showCheckingAlert('正在确认 ADB 是否可用。');
  const probe = await adbService.probeAvailability();
  if (!probe.module) {
    showCustomAlert(
      '无法使用 ADB 兜底',
      '当前应用没有可用的 ADB 模块。重新安装后再试。',
    );
    return false;
  }
  if (!probe.shell) {
    showCustomAlert(
      'ADB 命令没有权限',
      '模块在，但执行 shell 失败。需要无线调试或系统授权后才能在无障碍失败时兜底。',
    );
    return false;
  }
  hideCustomAlert();
  return true;
}

export function subscribeOperatePermissionStatus() {
  return permissionService.onPermissionStatusChange(
    'android.permission.BIND_ACCESSIBILITY_SERVICE',
    status => {
      if (status === PermissionStatus.GRANTED) {
        permissionWasGranted = true;
        hasShownPermissionAlert = false;
      } else if (
        status === PermissionStatus.DENIED &&
        permissionWasGranted
      ) {
        hasShownPermissionAlert = false;
      }
    },
  );
}
