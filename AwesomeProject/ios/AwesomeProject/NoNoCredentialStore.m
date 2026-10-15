/**
 * NoNoCredentialStore.m
 * React Native Bridge Module — iOS Keychain 凭据存储实现
 *
 * Generic Password 条目，service = com.awesomeproject.nono.credentials，
 * account = secretRef，可访问性 kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly。
 * 写入采用 update-before-add。拒绝原因仅返回稳定错误码，绝不包含
 * OSStatus、secretRef 或明文。
 */

#import "NoNoCredentialStore.h"
#import <Security/Security.h>

static NSString *const kKeychainService = @"com.awesomeproject.nono.credentials";

// Stable, platform-agnostic error codes. Rejection message == code (no cause/ref/plaintext).
static NSString *const kCodeInvalidSecretRef = @"E_INVALID_SECRET_REF";
static NSString *const kCodeEmptyPlaintext = @"E_EMPTY_PLAINTEXT";
static NSString *const kCodeKeystoreUnavailable = @"E_KEYSTORE_UNAVAILABLE";
static NSString *const kCodeCredentialRead = @"E_CREDENTIAL_READ";
static NSString *const kCodeCredentialWrite = @"E_CREDENTIAL_WRITE";
static NSString *const kCodeCredentialDelete = @"E_CREDENTIAL_DELETE";

@implementation NoNoCredentialStore

RCT_EXPORT_MODULE(SecureCredentialModule);

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

#pragma mark - Bridge methods

RCT_REMAP_METHOD(isAvailable,
                 isAvailableWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@([self keychainAvailable]));
}

RCT_REMAP_METHOD(put,
                 secretRef:(NSString *)secretRef
                 plaintext:(NSString *)plaintext
                 putResolver:(RCTPromiseResolveBlock)resolve
                 putRejecter:(RCTPromiseRejectBlock)reject)
{
  if (![self isValidSecretRef:secretRef]) {
    reject(kCodeInvalidSecretRef, kCodeInvalidSecretRef, nil);
    return;
  }
  if ([self isBlankPlaintext:plaintext]) {
    reject(kCodeEmptyPlaintext, kCodeEmptyPlaintext, nil);
    return;
  }

  NSData *data = [plaintext dataUsingEncoding:NSUTF8StringEncoding];
  NSDictionary *query = [self baseQueryForSecretRef:secretRef];

  NSDictionary *updateAttrs = @{
    (__bridge id)kSecValueData : data,
    (__bridge id)kSecAttrAccessible : (__bridge id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
  };

  OSStatus status = SecItemUpdate((__bridge CFDictionaryRef)query,
                                  (__bridge CFDictionaryRef)updateAttrs);

  if (status == errSecItemNotFound) {
    NSMutableDictionary *addItem = [query mutableCopy];
    [addItem addEntriesFromDictionary:updateAttrs];
    status = SecItemAdd((__bridge CFDictionaryRef)addItem, NULL);
  }

  if (status == errSecSuccess) {
    resolve(nil);
    return;
  }
  reject([self writeCodeForStatus:status], [self writeCodeForStatus:status], nil);
}

RCT_REMAP_METHOD(get,
                 secretRef:(NSString *)secretRef
                 getResolver:(RCTPromiseResolveBlock)resolve
                 getRejecter:(RCTPromiseRejectBlock)reject)
{
  if (![self isValidSecretRef:secretRef]) {
    reject(kCodeInvalidSecretRef, kCodeInvalidSecretRef, nil);
    return;
  }

  NSMutableDictionary *query = [[self baseQueryForSecretRef:secretRef] mutableCopy];
  query[(__bridge id)kSecReturnData] = (__bridge id)kCFBooleanTrue;
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;

  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);

  if (status == errSecItemNotFound) {
    resolve([NSNull null]);
    return;
  }
  if (status == errSecSuccess) {
    NSData *data = (__bridge_transfer NSData *)result;
    NSString *value = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    resolve(value);
    return;
  }
  if (result != NULL) {
    CFRelease(result);
  }
  reject([self readCodeForStatus:status], [self readCodeForStatus:status], nil);
}

RCT_REMAP_METHOD(delete,
                 secretRef:(NSString *)secretRef
                 deleteResolver:(RCTPromiseResolveBlock)resolve
                 deleteRejecter:(RCTPromiseRejectBlock)reject)
{
  if (![self isValidSecretRef:secretRef]) {
    reject(kCodeInvalidSecretRef, kCodeInvalidSecretRef, nil);
    return;
  }

  NSDictionary *query = [self baseQueryForSecretRef:secretRef];
  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);

  if (status == errSecSuccess || status == errSecItemNotFound) {
    resolve(nil);
    return;
  }
  reject([self deleteCodeForStatus:status], [self deleteCodeForStatus:status], nil);
}

#pragma mark - Helpers

- (NSDictionary *)baseQueryForSecretRef:(NSString *)secretRef
{
  return @{
    (__bridge id)kSecClass : (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService : kKeychainService,
    (__bridge id)kSecAttrAccount : secretRef,
  };
}

// Mirrors the JS SECRET_REF_PATTERN: /^[a-z0-9][a-z0-9:._-]{2,127}$/i
- (BOOL)isValidSecretRef:(NSString *)secretRef
{
  if (![secretRef isKindOfClass:[NSString class]] || secretRef.length == 0) {
    return NO;
  }
  static NSRegularExpression *pattern = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    pattern = [NSRegularExpression regularExpressionWithPattern:@"^[a-z0-9][a-z0-9:._-]{2,127}$"
                                                        options:NSRegularExpressionCaseInsensitive
                                                          error:NULL];
  });
  NSRange range = NSMakeRange(0, secretRef.length);
  return [pattern numberOfMatchesInString:secretRef options:0 range:range] == 1;
}

- (BOOL)isBlankPlaintext:(NSString *)plaintext
{
  if (![plaintext isKindOfClass:[NSString class]]) {
    return YES;
  }
  NSCharacterSet *whitespace = [NSCharacterSet whitespaceAndNewlineCharacterSet];
  return [plaintext stringByTrimmingCharactersInSet:whitespace].length == 0;
}

- (BOOL)keychainAvailable
{
  NSDictionary *probe = @{
    (__bridge id)kSecClass : (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService : kKeychainService,
    (__bridge id)kSecMatchLimit : (__bridge id)kSecMatchLimitOne,
    (__bridge id)kSecReturnData : (__bridge id)kCFBooleanFalse,
  };
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)probe, NULL);
  return status == errSecSuccess || status == errSecItemNotFound;
}

- (NSString *)writeCodeForStatus:(OSStatus)status
{
  return [self isUnavailableStatus:status] ? kCodeKeystoreUnavailable : kCodeCredentialWrite;
}

- (NSString *)readCodeForStatus:(OSStatus)status
{
  return [self isUnavailableStatus:status] ? kCodeKeystoreUnavailable : kCodeCredentialRead;
}

- (NSString *)deleteCodeForStatus:(OSStatus)status
{
  return [self isUnavailableStatus:status] ? kCodeKeystoreUnavailable : kCodeCredentialDelete;
}

- (BOOL)isUnavailableStatus:(OSStatus)status
{
  return status == errSecNotAvailable || status == errSecInteractionNotAllowed;
}

@end
