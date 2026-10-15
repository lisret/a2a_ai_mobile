/**
 * NoNoCredentialStoreTests.m
 * XCTest coverage for the iOS Keychain credential boundary (SecureCredentialModule ABI).
 *
 * Named tests per runtime-foundation Task 2 Step 3:
 *   - testPutGetDeleteRoundTrip
 *   - testPutOverwritesExistingValue
 *   - testMissingValueResolvesNull
 *   - testInvalidReferenceRejectsWithStableCode
 *   - testErrorsDoNotContainReferenceOrPlaintext
 */

#import <XCTest/XCTest.h>
#import <React/RCTBridgeModule.h>

#import "NoNoCredentialStore.h"

// RCT_REMAP_METHOD generates these Objective-C selectors; expose them for direct invocation.
@interface NoNoCredentialStore (Testing)
- (void)isAvailableWithResolver:(RCTPromiseResolveBlock)resolve
                       rejecter:(RCTPromiseRejectBlock)reject;
- (void)secretRef:(NSString *)secretRef
        plaintext:(NSString *)plaintext
      putResolver:(RCTPromiseResolveBlock)resolve
      putRejecter:(RCTPromiseRejectBlock)reject;
- (void)secretRef:(NSString *)secretRef
      getResolver:(RCTPromiseResolveBlock)resolve
      getRejecter:(RCTPromiseRejectBlock)reject;
- (void)secretRef:(NSString *)secretRef
   deleteResolver:(RCTPromiseResolveBlock)resolve
   deleteRejecter:(RCTPromiseRejectBlock)reject;
@end

@interface NoNoCredentialStoreTests : XCTestCase
@property (nonatomic, strong) NoNoCredentialStore *store;
@property (nonatomic, copy) NSString *secretRef;
@end

@implementation NoNoCredentialStoreTests

- (void)setUp
{
  [super setUp];
  self.store = [NoNoCredentialStore new];
  self.secretRef =
      [NSString stringWithFormat:@"test.%@", [[NSUUID UUID] UUIDString].lowercaseString];
}

- (void)tearDown
{
  [self deleteRef:self.secretRef];
  [super tearDown];
}

#pragma mark - Synchronous promise helpers

- (id)putRef:(NSString *)ref value:(NSString *)value error:(NSString **)outCode
{
  __block id resolved = nil;
  __block NSString *code = nil;
  [self.store secretRef:ref
              plaintext:value
            putResolver:^(id result) { resolved = result ?: [NSNull null]; }
            putRejecter:^(NSString *c, NSString *m, NSError *e) { code = c; }];
  if (outCode) {
    *outCode = code;
  }
  return resolved;
}

- (id)getRef:(NSString *)ref error:(NSString **)outCode
{
  __block id resolved = nil;
  __block NSString *code = nil;
  [self.store secretRef:ref
            getResolver:^(id result) { resolved = result ?: [NSNull null]; }
            getRejecter:^(NSString *c, NSString *m, NSError *e) { code = c; }];
  if (outCode) {
    *outCode = code;
  }
  return resolved;
}

- (void)deleteRef:(NSString *)ref
{
  [self.store secretRef:ref
         deleteResolver:^(id result) {}
         deleteRejecter:^(NSString *c, NSString *m, NSError *e) {}];
}

#pragma mark - Tests

- (void)testPutGetDeleteRoundTrip
{
  NSString *putCode = nil;
  [self putRef:self.secretRef value:@"super-secret-token" error:&putCode];
  XCTAssertNil(putCode, @"put should resolve");

  NSString *getCode = nil;
  id value = [self getRef:self.secretRef error:&getCode];
  XCTAssertNil(getCode, @"get should resolve");
  XCTAssertEqualObjects(value, @"super-secret-token");

  [self deleteRef:self.secretRef];

  id afterDelete = [self getRef:self.secretRef error:NULL];
  XCTAssertEqualObjects(afterDelete, [NSNull null], @"deleted value resolves null");
}

- (void)testPutOverwritesExistingValue
{
  [self putRef:self.secretRef value:@"first-value" error:NULL];
  [self putRef:self.secretRef value:@"second-value" error:NULL];

  id value = [self getRef:self.secretRef error:NULL];
  XCTAssertEqualObjects(value, @"second-value", @"update-before-add overwrites");
}

- (void)testMissingValueResolvesNull
{
  id value = [self getRef:self.secretRef error:NULL];
  XCTAssertEqualObjects(value, [NSNull null], @"missing key resolves null, not reject");
}

- (void)testInvalidReferenceRejectsWithStableCode
{
  NSString *invalidRef = @"bad ref!";

  NSString *putCode = nil;
  [self putRef:invalidRef value:@"whatever" error:&putCode];
  XCTAssertEqualObjects(putCode, @"E_INVALID_SECRET_REF");

  NSString *getCode = nil;
  [self getRef:invalidRef error:&getCode];
  XCTAssertEqualObjects(getCode, @"E_INVALID_SECRET_REF");
}

- (void)testErrorsDoNotContainReferenceOrPlaintext
{
  NSString *invalidRef = @"leaky ref token";
  NSString *plaintext = @"top-secret-plaintext";

  __block NSString *code = nil;
  __block NSString *message = nil;
  [self.store secretRef:invalidRef
              plaintext:plaintext
            putResolver:^(id result) {}
            putRejecter:^(NSString *c, NSString *m, NSError *e) {
              code = c;
              message = m;
            }];

  XCTAssertEqualObjects(code, @"E_INVALID_SECRET_REF");
  XCTAssertEqualObjects(message, @"E_INVALID_SECRET_REF");
  XCTAssertFalse([message containsString:invalidRef], @"message must not leak the ref");
  XCTAssertFalse([message containsString:plaintext], @"message must not leak plaintext");
}

@end
