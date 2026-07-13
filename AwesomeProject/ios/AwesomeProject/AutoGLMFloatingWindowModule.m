/**
 * AutoGLMFloatingWindowModule.m
 * React Native Bridge Module — iOS 悬浮窗实现
 *
 * 对应 Android 的 FloatingWindowModule.kt + FloatingWindowManager.kt
 * iOS 端使用独立的 UIWindow（windowLevel > UIWindowLevelNormal）实现悬浮窗
 */

#import "AutoGLMFloatingWindowModule.h"
#import <UIKit/UIKit.h>
#import <React/RCTLog.h>

@interface AutoGLMFloatingWindowModule ()

@property (nonatomic, strong) UIWindow *floatingWindow;
@property (nonatomic, strong) UILabel *statusLabel;

@end

@implementation AutoGLMFloatingWindowModule

RCT_EXPORT_MODULE(FloatingWindowModule);

RCT_EXPORT_METHOD(canDrawOverlays:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@YES);
}

RCT_EXPORT_METHOD(openOverlayPermissionSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@YES);
}

RCT_EXPORT_METHOD(showFloatingWindow:(NSString *)text
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    @try {
      if (self.floatingWindow) {
        [self.floatingWindow setHidden:YES];
        self.floatingWindow = nil;
        self.statusLabel = nil;
      }

      CGRect screenBounds = [UIScreen mainScreen].bounds;

      UIWindowScene *scene = nil;
      if (@available(iOS 13.0, *)) {
        for (UIWindowScene *s in [UIApplication sharedApplication].connectedScenes) {
          if (s.activationState == UISceneActivationStateForegroundActive) {
            scene = s;
            break;
          }
        }
      }

      if (scene) {
        self.floatingWindow = [[UIWindow alloc] initWithWindowScene:scene];
      } else {
        self.floatingWindow = [[UIWindow alloc] initWithFrame:screenBounds];
      }

      self.floatingWindow.windowLevel = UIWindowLevelAlert + 1;
      self.floatingWindow.backgroundColor = [UIColor clearColor];
      self.floatingWindow.userInteractionEnabled = NO;

      CGFloat containerWidth = screenBounds.size.width - 40;
      UIView *container = [[UIView alloc] initWithFrame:CGRectMake(20, 60, containerWidth, 60)];
      container.backgroundColor = [[UIColor blackColor] colorWithAlphaComponent:0.2];
      container.layer.cornerRadius = 10;
      container.clipsToBounds = YES;
      container.alpha = 0.85;

      self.statusLabel = [[UILabel alloc] initWithFrame:CGRectMake(10, 5, containerWidth - 20, 50)];
      self.statusLabel.text = text;
      self.statusLabel.textColor = [UIColor whiteColor];
      self.statusLabel.font = [UIFont systemFontOfSize:12];
      self.statusLabel.numberOfLines = 3;
      self.statusLabel.lineBreakMode = NSLineBreakByTruncatingTail;

      [container addSubview:self.statusLabel];
      [self.floatingWindow addSubview:container];
      [self.floatingWindow setHidden:NO];

      RCTLogInfo(@"[AutoGLM iOS] 悬浮窗已显示: %@", text);
      resolve(@YES);
    } @catch (NSException *exception) {
      RCTLogError(@"[AutoGLM iOS] 显示悬浮窗失败: %@", exception.reason);
      reject(@"ERROR", exception.reason ?: @"显示悬浮窗失败", nil);
    }
  });
}

RCT_EXPORT_METHOD(updateFloatingWindowText:(NSString *)text
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.statusLabel) {
      self.statusLabel.text = text;
      RCTLogInfo(@"[AutoGLM iOS] 悬浮窗文本已更新: %@", text);
      resolve(@YES);
    } else {
      resolve(@NO);
    }
  });
}

RCT_EXPORT_METHOD(hideFloatingWindow:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.floatingWindow) {
      [self.floatingWindow setHidden:YES];
      self.floatingWindow = nil;
      self.statusLabel = nil;
      RCTLogInfo(@"[AutoGLM iOS] 悬浮窗已隐藏");
      resolve(@YES);
    } else {
      resolve(@NO);
    }
  });
}

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
