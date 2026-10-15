/**
 * AutoGLMAccessibilityModule.m
 * React Native Bridge Module — iOS 实现
 *
 * 对应 Android 的 AccessibilityModule.kt + AccessibilityActionModule.kt
 * iOS 端功能：
 *   - 无障碍服务状态检查（iOS UIAccessibility 始终可用）
 *   - 屏幕截图（UIWindow 层级渲染 → base64）
 *   - 通知管理（UNUserNotificationCenter）
 *   - 后台任务（BGTaskScheduler）
 *   - 系统提示窗（UIAlertController）
 *   - 提示音（AudioServicesPlaySystemSound）
 */

#import "AutoGLMAccessibilityModule.h"
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>
#import <AudioToolbox/AudioToolbox.h>
#import <React/RCTLog.h>

@implementation AutoGLMAccessibilityModule

RCT_EXPORT_MODULE(AccessibilityModule);

// MARK: - 无障碍服务状态

RCT_EXPORT_METHOD(isEnabled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  BOOL isVoiceOverRunning = UIAccessibilityIsVoiceOverRunning();
  RCTLogInfo(@"[AutoGLM iOS] 无障碍状态: VoiceOver=%@, 框架始终可用", isVoiceOverRunning ? @"YES" : @"NO");
  resolve(@YES);
}

RCT_EXPORT_METHOD(openSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSURL *url = [NSURL URLWithString:UIApplicationOpenSettingsURLString];
    if ([[UIApplication sharedApplication] canOpenURL:url]) {
      [[UIApplication sharedApplication] openURL:url options:@{} completionHandler:^(BOOL success) {
        if (success) resolve(@YES);
        else reject(@"ERROR", @"无法打开设置页面", nil);
      }];
    } else {
      reject(@"ERROR", @"无法打开设置页面", nil);
    }
  });
}

RCT_EXPORT_METHOD(openNotificationSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSURL *url = [NSURL URLWithString:UIApplicationOpenSettingsURLString];
    if ([[UIApplication sharedApplication] canOpenURL:url]) {
      [[UIApplication sharedApplication] openURL:url options:@{} completionHandler:^(BOOL success) {
        resolve(@(success));
      }];
    } else {
      reject(@"ERROR", @"无法打开通知设置", nil);
    }
  });
}

// MARK: - 通知权限

RCT_EXPORT_METHOD(hasNotificationPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
    BOOL granted = (settings.authorizationStatus == UNAuthorizationStatusAuthorized ||
                    settings.authorizationStatus == UNAuthorizationStatusProvisional);
    RCTLogInfo(@"[AutoGLM iOS] 通知权限: %@", granted ? @"已授权" : @"未授权");
    resolve(@(granted));
  }];
}

RCT_EXPORT_METHOD(requestNotificationPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  UNAuthorizationOptions options = UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge;
  [center requestAuthorizationWithOptions:options completionHandler:^(BOOL granted, NSError *error) {
    if (error) {
      RCTLogError(@"[AutoGLM iOS] 请求通知权限失败: %@", error.localizedDescription);
      reject(@"ERROR", error.localizedDescription, error);
    } else {
      RCTLogInfo(@"[AutoGLM iOS] 通知权限请求结果: %@", granted ? @"已授权" : @"被拒绝");
      resolve(@(granted));
    }
  }];
}

// MARK: - 屏幕截图

- (UIWindow *)getKeyWindow
{
  if (@available(iOS 13.0, *)) {
    for (UIWindowScene *scene in [UIApplication sharedApplication].connectedScenes) {
      if (scene.activationState == UISceneActivationStateForegroundActive) {
        for (UIWindow *window in scene.windows) {
          if (window.isKeyWindow) return window;
        }
      }
    }
  }
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  return [UIApplication sharedApplication].keyWindow;
#pragma clang diagnostic pop
}

RCT_EXPORT_METHOD(captureScreen:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    @try {
      UIWindow *keyWindow = [self getKeyWindow];
      if (!keyWindow) {
        reject(@"ERROR", @"无法获取 keyWindow", nil);
        return;
      }

      UIGraphicsImageRendererFormat *format = [[UIGraphicsImageRendererFormat alloc] init];
      format.scale = [UIScreen mainScreen].scale;
      format.opaque = YES;

      CGSize size = keyWindow.bounds.size;
      UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:size format:format];

      UIImage *screenshot = [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
        [keyWindow drawViewHierarchyInRect:keyWindow.bounds afterScreenUpdates:NO];
      }];

      if (!screenshot) {
        reject(@"ERROR", @"截图生成失败", nil);
        return;
      }

      NSData *imageData = UIImageJPEGRepresentation(screenshot, 0.7);
      if (!imageData) {
        reject(@"ERROR", @"图片压缩失败", nil);
        return;
      }

      NSString *base64 = [imageData base64EncodedStringWithOptions:0];
      NSString *dataUri = [NSString stringWithFormat:@"data:image/jpeg;base64,%@", base64];

      RCTLogInfo(@"[AutoGLM iOS] 截图成功，尺寸: %.0fx%.0f, 大小: %lu bytes",
                 size.width, size.height, (unsigned long)imageData.length);
      resolve(dataUri);
    } @catch (NSException *exception) {
      RCTLogError(@"[AutoGLM iOS] 截图异常: %@", exception.reason);
      reject(@"ERROR", exception.reason ?: @"截图失败", nil);
    }
  });
}

RCT_EXPORT_METHOD(requestScreenshotPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@YES);
}

// MARK: - 前台/后台服务

// 任务通知 identifier 前缀，格式 `TaskExecutionService.${taskId}.${sessionRevision}`，
// 使每次不可变会话拥有唯一 identifier，避免跨会话误更新/误清除。
static NSString *const kTaskNotificationPrefix = @"TaskExecutionService.";

static NSString *TaskNotificationIdentifier(NSString *taskId, NSNumber *sessionRevision)
{
  return [NSString stringWithFormat:@"%@%@.%@", kTaskNotificationPrefix, taskId, sessionRevision];
}

RCT_EXPORT_METHOD(startTaskExecutionService:(NSString *)taskId
                  sessionRevision:(nonnull NSNumber *)sessionRevision
                  statusText:(NSString *)statusText
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
    UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
    content.title = @"任务执行中";
    content.body = statusText ?: @"正在执行自动化任务...";
    content.sound = nil;

    NSString *identifier = TaskNotificationIdentifier(taskId, sessionRevision);
    UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:identifier
                                                                          content:content
                                                                          trigger:nil];
    [center addNotificationRequest:request withCompletionHandler:^(NSError *error) {
      if (error) {
        RCTLogWarn(@"[AutoGLM iOS] 前台服务通知发送失败: %@", error.localizedDescription);
        reject(@"ERROR", error.localizedDescription, error);
      } else {
        RCTLogInfo(@"[AutoGLM iOS] 前台服务已启动");
        resolve(@YES);
      }
    }];
  });
}

RCT_EXPORT_METHOD(updateTaskExecutionService:(NSString *)taskId
                  sessionRevision:(nonnull NSNumber *)sessionRevision
                  statusText:(NSString *)statusText
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
    NSString *identifier = TaskNotificationIdentifier(taskId, sessionRevision);
    // 只操作本次会话的 exact identifier
    [center removeDeliveredNotificationsWithIdentifiers:@[identifier]];

    UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
    content.title = @"任务执行中";
    content.body = statusText ?: @"正在执行自动化任务...";

    UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:identifier
                                                                          content:content
                                                                          trigger:nil];
    [center addNotificationRequest:request withCompletionHandler:^(NSError *error) {
      if (error) {
        RCTLogWarn(@"[AutoGLM iOS] 更新前台服务通知失败: %@", error.localizedDescription);
        reject(@"ERROR", error.localizedDescription, error);
      } else {
        resolve(@YES);
      }
    }];
  });
}

// stop 只操作本次会话的 exact identifier `TaskExecutionService.${taskId}.${sessionRevision}`，
// 不做前缀清扫，避免误清其它会话或任务完成通知。
RCT_EXPORT_METHOD(stopTaskExecutionService:(NSString *)taskId
                  sessionRevision:(nonnull NSNumber *)sessionRevision
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
    NSString *identifier = TaskNotificationIdentifier(taskId, sessionRevision);
    [center removeDeliveredNotificationsWithIdentifiers:@[identifier]];
    [center removePendingNotificationRequestsWithIdentifiers:@[identifier]];
    RCTLogInfo(@"[AutoGLM iOS] 前台服务已停止");
    resolve(@YES);
  });
}

// MARK: - 任务完成通知

RCT_EXPORT_METHOD(showTaskCompletionNotification:(NSString *)title
                  message:(NSString *)message
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
    UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
    content.title = title ?: @"任务完成";
    content.body = message ?: @"自动化任务已执行完毕";
    content.sound = [UNNotificationSound defaultSound];

    NSString *identifier = [NSString stringWithFormat:@"TaskCompletion_%@", @([[NSDate date] timeIntervalSince1970])];
    UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:identifier
                                                                          content:content
                                                                          trigger:nil];
    [center addNotificationRequest:request withCompletionHandler:^(NSError *error) {
      if (error) {
        RCTLogWarn(@"[AutoGLM iOS] 任务完成通知发送失败: %@", error.localizedDescription);
        reject(@"ERROR", error.localizedDescription, error);
      } else {
        RCTLogInfo(@"[AutoGLM iOS] 任务完成通知已发送");
        resolve(@YES);
      }
    }];
  });
}

// MARK: - Toast 提示

RCT_EXPORT_METHOD(showToast:(NSString *)message
                  duration:(nonnull NSNumber *)duration
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UIWindow *keyWindow = [self getKeyWindow];
    if (!keyWindow) {
      reject(@"ERROR", @"无法获取 window", nil);
      return;
    }

    UILabel *toastLabel = [[UILabel alloc] init];
    toastLabel.text = message;
    toastLabel.textColor = [UIColor whiteColor];
    toastLabel.backgroundColor = [[UIColor blackColor] colorWithAlphaComponent:0.75];
    toastLabel.textAlignment = NSTextAlignmentCenter;
    toastLabel.font = [UIFont systemFontOfSize:14];
    toastLabel.numberOfLines = 0;
    toastLabel.layer.cornerRadius = 10;
    toastLabel.clipsToBounds = YES;

    CGSize maxSize = CGSizeMake(keyWindow.bounds.size.width - 60, CGFLOAT_MAX);
    CGRect textRect = [message boundingRectWithSize:maxSize
                                            options:NSStringDrawingUsesLineFragmentOrigin
                                         attributes:@{NSFontAttributeName: toastLabel.font}
                                            context:nil];
    CGFloat width = MIN(textRect.size.width + 30, keyWindow.bounds.size.width - 60);
    CGFloat height = textRect.size.height + 20;
    toastLabel.frame = CGRectMake((keyWindow.bounds.size.width - width) / 2,
                                   keyWindow.bounds.size.height - 150,
                                   width, height);

    [keyWindow addSubview:toastLabel];

    NSTimeInterval displayDuration = [duration intValue] == 1 ? 3.0 : 1.5;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(displayDuration * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      [UIView animateWithDuration:0.3 animations:^{
        toastLabel.alpha = 0;
      } completion:^(BOOL finished) {
        [toastLabel removeFromSuperview];
      }];
    });

    resolve(@YES);
  });
}

// MARK: - 系统提示窗

RCT_EXPORT_METHOD(showSystemDialog:(NSString *)title
                  message:(NSString *)message
                  buttonText:(NSString *)buttonText
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UIWindow *keyWindow = [self getKeyWindow];
    UIViewController *rootVC = keyWindow.rootViewController;
    if (!rootVC) {
      reject(@"ERROR", @"无法获取 rootViewController", nil);
      return;
    }

    while (rootVC.presentedViewController) {
      rootVC = rootVC.presentedViewController;
    }

    UIAlertController *alert = [UIAlertController alertControllerWithTitle:title
                                                                   message:message
                                                            preferredStyle:UIAlertControllerStyleAlert];
    NSString *btnText = buttonText ?: @"确定";
    [alert addAction:[UIAlertAction actionWithTitle:btnText style:UIAlertActionStyleDefault handler:nil]];

    [rootVC presentViewController:alert animated:YES completion:nil];
    resolve(@YES);
  });
}

// MARK: - 提示音

RCT_EXPORT_METHOD(playTaskCompletionSound:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  AudioServicesPlaySystemSound(1007);
  RCTLogInfo(@"[AutoGLM iOS] 提示音已播放");
  resolve(@YES);
}

// MARK: - WakeLock

RCT_EXPORT_METHOD(acquireWakeLock:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [UIApplication sharedApplication].idleTimerDisabled = YES;
    RCTLogInfo(@"[AutoGLM iOS] WakeLock 已获取（idleTimer 已禁用）");
    resolve(@YES);
  });
}

RCT_EXPORT_METHOD(releaseWakeLock:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [UIApplication sharedApplication].idleTimerDisabled = NO;
    RCTLogInfo(@"[AutoGLM iOS] WakeLock 已释放");
    resolve(@YES);
  });
}

// MARK: - 后台运行

RCT_EXPORT_METHOD(moveToBackground:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UIApplication sharedApplication] performSelector:@selector(suspend)];
    resolve(@YES);
  });
}

RCT_EXPORT_METHOD(startBackgroundTask:(NSString *)taskData
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  UIBackgroundTaskIdentifier bgTask = [[UIApplication sharedApplication] beginBackgroundTaskWithName:@"AutoGLMTask"
                                                                                    expirationHandler:^{
    RCTLogWarn(@"[AutoGLM iOS] 后台任务即将过期");
  }];

  if (bgTask == UIBackgroundTaskInvalid) {
    reject(@"ERROR", @"无法启动后台任务", nil);
    return;
  }

  RCTLogInfo(@"[AutoGLM iOS] 后台任务已启动，ID: %lu", (unsigned long)bgTask);
  resolve(@YES);
}

// MARK: - 屏幕尺寸

RCT_EXPORT_METHOD(getScreenSize:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    CGSize screenSize = [UIScreen mainScreen].bounds.size;
    CGFloat scale = [UIScreen mainScreen].scale;
    NSDictionary *size = @{
      @"width": @(screenSize.width * scale),
      @"height": @(screenSize.height * scale)
    };
    resolve(size);
  });
}

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
