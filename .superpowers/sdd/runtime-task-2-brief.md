### Task 2: Port CredentialStore And Add The iOS Keychain Boundary

**Files:**

- Create: all Task 2 credential files from the exact file graph.
- Modify: `AwesomeProject/ios/AwesomeProject.xcodeproj/project.pbxproj`.
- Test: `NativeCredentialStore.test.ts`, Android security tests, and `AwesomeProject/ios/AwesomeProjectTests/NoNoCredentialStoreTests.m`.

**Interfaces:**

- Consumes: opaque `secretRef`, transient plaintext only at method call boundaries.
- Produces:

```ts
export interface CredentialStore {
  isAvailable(): Promise<boolean>;
  put(secretRef: string, plaintext: string): Promise<void>;
  get(secretRef: string): Promise<string | null>;
  delete(secretRef: string): Promise<void>;
}
```

Native module ABI on both platforms is `SecureCredentialModule` with the same four Promise methods. Stable errors are `E_INVALID_SECRET_REF`, `E_EMPTY_PLAINTEXT`, `E_KEYSTORE_UNAVAILABLE`, `E_CREDENTIAL_READ`, `E_CREDENTIAL_WRITE`, and `E_CREDENTIAL_DELETE`; errors contain no ref, key, cause or stack.

- [ ] **Step 1: Restore the TypeScript and Android tests first, then capture RED**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/credentials/NativeCredentialStore.test.ts \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/security
cd AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/core/engine/agentRuntime/credentials/NativeCredentialStore.test.ts
```

Expected: FAIL because the credentials production module is missing.

- [ ] **Step 2: Restore the final phase1 TypeScript and Android implementation**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/core/engine/agentRuntime/credentials \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SecureCredentialModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/security
```

Expected: restored JS test passes. Do not register the native module yet; Task 3 is the sole owner of `AccessibilityPackage.kt`.

- [ ] **Step 3: Add iOS RED tests for stable Keychain behavior**

Create `AwesomeProject/ios/AwesomeProjectTests/NoNoCredentialStoreTests.m` in the existing `AwesomeProjectTests` target with methods `testPutGetDeleteRoundTrip`, `testPutOverwritesExistingValue`, `testMissingValueResolvesNull`, `testInvalidReferenceRejectsWithStableCode`, and `testErrorsDoNotContainReferenceOrPlaintext`. The bridge contract must be:

```objc
RCT_EXPORT_MODULE(SecureCredentialModule)
RCT_REMAP_METHOD(isAvailable,
                 isAvailableWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
RCT_REMAP_METHOD(put,
                 secretRef:(NSString *)secretRef
                 plaintext:(NSString *)plaintext
                 putResolver:(RCTPromiseResolveBlock)resolve
                 putRejecter:(RCTPromiseRejectBlock)reject)
RCT_REMAP_METHOD(get,
                 secretRef:(NSString *)secretRef
                 getResolver:(RCTPromiseResolveBlock)resolve
                 getRejecter:(RCTPromiseRejectBlock)reject)
RCT_REMAP_METHOD(delete,
                 secretRef:(NSString *)secretRef
                 deleteResolver:(RCTPromiseResolveBlock)resolve
                 deleteRejecter:(RCTPromiseRejectBlock)reject)
```

Run:

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
xcodebuild -project ios/AwesomeProject.xcodeproj -scheme AwesomeProject \
  -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  test -only-testing:AwesomeProjectTests/NoNoCredentialStoreTests
```

Expected RED: the named Keychain test target is selected and compilation/linking fails because `NoNoCredentialStore` is missing before implementation. If Xcode, the test target or that simulator is unavailable, record `NOT RUN` plus the exact error; do not report PASS.

- [ ] **Step 4: Implement the iOS Keychain module**

Use Generic Password items with service `com.awesomeproject.nono.credentials`, account=`secretRef`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, update-before-add, and fixed error codes. Never include `OSStatus`, ref or plaintext in the JavaScript rejection message. Add both files to the Xcode project.

- [ ] **Step 5: Verify JS, Android and iOS GREEN**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/core/engine/agentRuntime/credentials
npx tsc --noEmit
cd android
./gradlew :app:testDebugUnitTest --tests 'com.awesomeproject.security.*'
./gradlew :app:compileDebugKotlin
```

Expected: JS suite passes, Android security tests pass, Kotlin compile exits 0. Re-run the Task 2 xcodebuild command; expected PASS or explicitly recorded `NOT RUN`.

- [ ] **Step 6: Scan the credential boundary and commit**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
if rg -n 'Log\.|println|console\.|Throwable|printStackTrace' \
  AwesomeProject/src/core/engine/agentRuntime/credentials \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/security \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SecureCredentialModule.kt \
  AwesomeProject/ios/AwesomeProject/NoNoCredentialStore.*; then
  exit 1
else
  scan_status=$?; test "$scan_status" -eq 1 || exit "$scan_status"
fi
```

Expected: no production logging match. Then:

```bash
git add AwesomeProject/src/core/engine/agentRuntime/credentials \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/credentials \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/SecureCredentialModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/security \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/security \
  AwesomeProject/ios/AwesomeProject/NoNoCredentialStore.h \
  AwesomeProject/ios/AwesomeProject/NoNoCredentialStore.m \
  AwesomeProject/ios/AwesomeProjectTests/NoNoCredentialStoreTests.m \
  AwesomeProject/ios/AwesomeProject.xcodeproj/project.pbxproj
git commit -m "feat: add cross-platform secure credential store"
```

---

