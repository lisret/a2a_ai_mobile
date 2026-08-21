/**
 * NoNoCredentialStore.h
 * React Native Bridge Module — iOS Keychain 凭据存储
 *
 * 对应 Android 的 SecureCredentialModule.kt + AndroidKeystoreCredentialStore.kt
 * JS 侧模块名为 SecureCredentialModule（跨平台统一 ABI：isAvailable/put/get/delete）。
 */

#import <React/RCTBridgeModule.h>

@interface NoNoCredentialStore : NSObject <RCTBridgeModule>

@end
