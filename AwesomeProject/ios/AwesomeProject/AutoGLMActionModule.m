/**
 * AutoGLMActionModule.m
 * React Native Bridge Module — iOS 手势操作实现
 *
 * 对应 Android 的 AccessibilityActionModule.kt
 * iOS 端功能：
 *   - 点击/长按/双击/滑动（UIAccessibility + hitTest）
 *   - 文本输入（UIPasteboard + accessibility）
 *   - 返回/Home（navigation pop / suspend）
 *   - 应用启动（URL Scheme）
 *   - 应用列表（预置映射）
 */

#import "AutoGLMActionModule.h"
#import <UIKit/UIKit.h>
#import <React/RCTLog.h>

@implementation AutoGLMActionModule

RCT_EXPORT_MODULE(AccessibilityActionModule);

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

- (BOOL)performAccessibilityActionAtPoint:(CGPoint)point action:(NSString *)actionName
{
  UIWindow *window = [self getKeyWindow];
  if (!window) return NO;

  UIView *targetView = [window hitTest:point withEvent:nil];
  if (!targetView) {
    RCTLogWarn(@"[AutoGLM iOS] 坐标 (%.0f, %.0f) 处无可交互元素", point.x, point.y);
    return NO;
  }

  id accessibilityElement = targetView;
  if ([accessibilityElement respondsToSelector:@selector(accessibilityActivate)]) {
    UIAccessibilityPostNotification(UIAccessibilityScreenChangedNotification, accessibilityElement);
    BOOL activated = [accessibilityElement accessibilityActivate];
    if (activated) {
      RCTLogInfo(@"[AutoGLM iOS] accessibilityActivate 成功: %@", NSStringFromCGPoint(point));
      return YES;
    }
  }

  RCTLogWarn(@"[AutoGLM iOS] accessibilityActivate 不可用，坐标: %@", NSStringFromCGPoint(point));
  return NO;
}

// MARK: - 点击

RCT_EXPORT_METHOD(performClick:(nonnull NSNumber *)x
                  y:(nonnull NSNumber *)y
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    CGPoint point = CGPointMake([x floatValue], [y floatValue]);
    RCTLogInfo(@"[AutoGLM iOS] 执行点击: (%.0f, %.0f)", point.x, point.y);

    BOOL success = [self performAccessibilityActionAtPoint:point action:@"点击"];

    if (!success) {
      UIWindow *window = [self getKeyWindow];
      UIView *targetView = [window hitTest:point withEvent:nil];
      if (targetView) {
        if ([targetView isKindOfClass:[UIControl class]]) {
          [(UIControl *)targetView sendActionsForControlEvents:UIControlEventTouchUpInside];
          success = YES;
        } else if ([targetView isKindOfClass:[UIButton class]]) {
          [(UIButton *)targetView sendActionsForControlEvents:UIControlEventTouchUpInside];
          success = YES;
        }
      }
    }

    if (success) resolve(@YES);
    else {
      RCTLogWarn(@"[AutoGLM iOS] 点击失败: (%.0f, %.0f)", point.x, point.y);
      resolve(@NO);
    }
  });
}

// MARK: - 长按

RCT_EXPORT_METHOD(performLongPress:(nonnull NSNumber *)x
                  y:(nonnull NSNumber *)y
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    CGPoint point = CGPointMake([x floatValue], [y floatValue]);
    RCTLogInfo(@"[AutoGLM iOS] 执行长按: (%.0f, %.0f)", point.x, point.y);

    UIWindow *window = [self getKeyWindow];
    UIView *targetView = [window hitTest:point withEvent:nil];

    BOOL success = NO;
    if (targetView) {
      if ([targetView respondsToSelector:@selector(accessibilityActivate)]) {
        UIAccessibilityPostNotification(UIAccessibilityScreenChangedNotification, targetView);
        success = [targetView accessibilityActivate];
      }
      for (UIGestureRecognizer *gr in targetView.gestureRecognizers) {
        if ([gr isKindOfClass:[UILongPressGestureRecognizer class]]) {
          success = YES;
          break;
        }
      }
    }
    resolve(@(success));
  });
}

// MARK: - 双击

RCT_EXPORT_METHOD(performDoubleTap:(nonnull NSNumber *)x
                  y:(nonnull NSNumber *)y
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    CGPoint point = CGPointMake([x floatValue], [y floatValue]);
    RCTLogInfo(@"[AutoGLM iOS] 执行双击: (%.0f, %.0f)", point.x, point.y);

    BOOL firstSuccess = [self performAccessibilityActionAtPoint:point action:@"双击-1"];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.15 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      [self performAccessibilityActionAtPoint:point action:@"双击-2"];
    });
    resolve(@(firstSuccess));
  });
}

// MARK: - 滑动

RCT_EXPORT_METHOD(performSwipe:(nonnull NSNumber *)startX
                  startY:(nonnull NSNumber *)startY
                  endX:(nonnull NSNumber *)endX
                  endY:(nonnull NSNumber *)endY
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    CGFloat sx = [startX floatValue], sy = [startY floatValue];
    CGFloat ex = [endX floatValue], ey = [endY floatValue];
    RCTLogInfo(@"[AutoGLM iOS] 执行滑动: (%.0f, %.0f) -> (%.0f, %.0f)", sx, sy, ex, ey);

    UIWindow *window = [self getKeyWindow];
    CGPoint midPoint = CGPointMake(sx, sy);
    UIView *targetView = [window hitTest:midPoint withEvent:nil];

    BOOL success = NO;
    if (targetView) {
      CGFloat dx = ex - sx, dy = ey - sy;
      if (fabs(dy) > fabs(dx)) {
        UIAccessibilityScrollDirection direction = (dy > 0) ?
          UIAccessibilityScrollDirectionDown : UIAccessibilityScrollDirectionUp;
        success = UIAccessibilityScroll(direction);
      } else {
        UIAccessibilityScrollDirection direction = (dx > 0) ?
          UIAccessibilityScrollDirectionRight : UIAccessibilityScrollDirectionLeft;
        success = UIAccessibilityScroll(direction);
      }
    }

    if (!success) {
      UIAccessibilityPostNotification(UIAccessibilityPageScrolledNotification, nil);
      success = YES;
    }

    resolve(@(success));
  });
}

// MARK: - 文本输入

- (UIView *)findFirstResponderInView:(UIView *)view
{
  if (view.isFirstResponder) return view;
  for (UIView *subview in view.subviews) {
    UIView *found = [self findFirstResponderInView:subview];
    if (found) return found;
  }
  return nil;
}

RCT_EXPORT_METHOD(performTextInput:(NSString *)text
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    RCTLogInfo(@"[AutoGLM iOS] 执行文本输入: \"%@\"", text);

    [UIPasteboard generalPasteboard].string = text;

    UIWindow *window = [self getKeyWindow];
    BOOL success = NO;

    UIView *firstResponder = [self findFirstResponderInView:window];
    if (firstResponder) {
      if ([firstResponder respondsToSelector:@selector(setText:)]) {
        @try {
          [firstResponder performSelector:@selector(setText:) withObject:text];
          success = YES;
          RCTLogInfo(@"[AutoGLM iOS] 文本已设置到 firstResponder");
        } @catch (NSException *exception) {
          RCTLogWarn(@"[AutoGLM iOS] 设置文本失败: %@", exception.reason);
        }
      }

      if (!success && [firstResponder respondsToSelector:@selector(setAccessibilityValue:)]) {
        [firstResponder setAccessibilityValue:text];
        UIAccessibilityPostNotification(UIAccessibilityAnnouncementNotification, text);
        success = YES;
        RCTLogInfo(@"[AutoGLM iOS] 文本已通过 accessibility 设置");
      }
    }

    if (!success) {
      RCTLogWarn(@"[AutoGLM iOS] 文本输入失败: 未找到输入框");
    }

    resolve(@(success));
  });
}

// MARK: - 返回

RCT_EXPORT_METHOD(performBack:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    RCTLogInfo(@"[AutoGLM iOS] 执行返回操作");

    UIWindow *window = [self getKeyWindow];
    UIViewController *rootVC = window.rootViewController;
    if (!rootVC) {
      RCTLogWarn(@"[AutoGLM iOS] 返回操作失败: 无法获取 rootViewController");
      resolve(@NO);
      return;
    }
    while (rootVC.presentedViewController) {
      rootVC = rootVC.presentedViewController;
    }

    BOOL success = NO;
    if ([rootVC isKindOfClass:[UINavigationController class]]) {
      UINavigationController *nav = (UINavigationController *)rootVC;
      if (nav.viewControllers.count > 1) {
        [nav popViewControllerAnimated:YES];
        success = YES;
      }
    } else if (rootVC.navigationController) {
      if (rootVC.navigationController.viewControllers.count > 1) {
        [rootVC.navigationController popViewControllerAnimated:YES];
        success = YES;
      }
    } else if (rootVC.presentingViewController) {
      [rootVC dismissViewControllerAnimated:YES completion:nil];
      success = YES;
    }

    if (!success) {
      RCTLogWarn(@"[AutoGLM iOS] 返回操作失败: 无导航栈可回退");
    }

    resolve(@(success));
  });
}

// MARK: - Home

RCT_EXPORT_METHOD(performHome:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    RCTLogInfo(@"[AutoGLM iOS] 执行 Home 操作");
    @try {
      [[UIApplication sharedApplication] performSelector:@selector(suspend)];
      resolve(@YES);
    } @catch (NSException *exception) {
      RCTLogWarn(@"[AutoGLM iOS] Home 操作失败: %@", exception.reason);
      resolve(@NO);
    }
  });
}

// MARK: - 应用启动

RCT_EXPORT_METHOD(launchApp:(NSString *)packageName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    RCTLogInfo(@"[AutoGLM iOS] 尝试启动应用: %@", packageName);

    NSDictionary *schemeMap = @{
      @"com.tencent.xin": @"weixin://",
      @"com.tencent.mqq": @"mqq://",
      @"com.alibaba.taobao": @"taobao://",
      @"com.ss.iphone.ugc.Aweme": @"snssdk1128://",
      @"com.sina.weibo": @"sinaweibo://",
      @"com.baidu.search": @"baidu://",
      @"com.tencent.QQMusic": @"qqmusic://",
      @"com.netease.cloudmusic": @"orpheus://",
      @"com.bilibili": @"bilibili://",
      @"com.zhihu.ios": @"zhihu://",
      @"com.alipay.iphoneclient": @"alipay://",
      @"com.meituan.imeituan": @"imeituan://",
      @"com.dianping.dpscope": @"dianping://",
      @"com.jd.jdmobile": @"openApp.jdMobile://",
      @"com.suning.snmobile": @"suning://",
    };

    NSString *scheme = schemeMap[packageName];
    if (!scheme) {
      scheme = [NSString stringWithFormat:@"%@://", packageName];
    }

    NSURL *url = [NSURL URLWithString:scheme];
    if (!url) {
      reject(@"ERROR", [NSString stringWithFormat:@"无效的 URL Scheme: %@", scheme], nil);
      return;
    }

    if ([[UIApplication sharedApplication] canOpenURL:url]) {
      [[UIApplication sharedApplication] openURL:url options:@{} completionHandler:^(BOOL success) {
        if (success) {
          RCTLogInfo(@"[AutoGLM iOS] 应用启动成功: %@", packageName);
          resolve(@YES);
        } else {
          reject(@"ERROR", [NSString stringWithFormat:@"应用启动失败: %@", packageName], nil);
        }
      }];
    } else {
      reject(@"ERROR", [NSString stringWithFormat:@"应用未安装或不支持 URL Scheme: %@", packageName], nil);
    }
  });
}

// MARK: - 应用列表

RCT_EXPORT_METHOD(getAllInstalledApps:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSDictionary *appMap = @{
      @"微信": @"com.tencent.xin",
      @"QQ": @"com.tencent.mqq",
      @"淘宝": @"com.alibaba.taobao",
      @"抖音": @"com.ss.iphone.ugc.Aweme",
      @"微博": @"com.sina.weibo",
      @"百度": @"com.baidu.search",
      @"QQ音乐": @"com.tencent.QQMusic",
      @"网易云音乐": @"com.netease.cloudmusic",
      @"哔哩哔哩": @"com.bilibili",
      @"知乎": @"com.zhihu.ios",
      @"支付宝": @"com.alipay.iphoneclient",
      @"美团": @"com.meituan.imeituan",
      @"大众点评": @"com.dianping.dpscope",
      @"京东": @"com.jd.jdmobile",
      @"苏宁": @"com.suning.snmobile",
      @"设置": @"com.apple.Preferences",
      @"Safari": @"com.apple.mobilesafari",
      @"相机": @"com.apple.camera",
      @"照片": @"com.apple.mobileslideshow",
      @"时钟": @"com.apple.mobiletimer",
      @"日历": @"com.apple.mobilecal",
      @"备忘录": @"com.apple.mobilenotes",
      @"提醒事项": @"com.apple.reminders",
      @"地图": @"com.apple.Maps",
      @"天气": @"com.apple.weather",
      @"计算器": @"com.apple.calculator",
      @"钱包": @"com.apple.Passbook",
      @"App Store": @"com.apple.AppStore",
    };
    resolve(appMap);
  });
}

RCT_EXPORT_METHOD(getMainActivity:(NSString *)packageName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@"");
}

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
