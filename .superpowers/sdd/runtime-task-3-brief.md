### Task 3: Port Local-Model Eligibility And Register Native Bridges

**Files:**

- Create: every Task 3 local-model file in the exact file graph.
- Modify: `AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt`.
- Test: local-model JS and Android tests.

**Interfaces:**

- Consumes: `localModelId: 'minicpm-v-4.6-q4'`, native device facts and explicit model operations.
- Produces: `LocalModelEligibility` DTO, `NativeLocalModelEligibilityChecker`, `SecureCredentialModule` and `LocalModelEligibilityModule` React packages.
- Failure contract: absent model operations or unavailable JNI returns a stable unavailable result; it must never invoke cloud perception.

- [ ] **Step 1: Restore tests and capture missing-module RED**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/localModel \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/bridge/AccessibilityPackageRegistrationTest.kt
cd AwesomeProject
npm test -- --runInBand --no-cache src/__tests__/core/engine/agentRuntime/localModel
```

Expected: FAIL because `LocalModelBridge`/`LocalModelEligibility` are missing.

- [ ] **Step 2: Restore final local-model implementation files**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation
git restore --source ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b -- \
  AwesomeProject/src/core/engine/agentRuntime/localModel \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalModelEligibilityModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel
```

- [ ] **Step 3: Apply only the two registration additions from `7867991`**

In V1 `AccessibilityPackage.createNativeModules`, append exactly:

```kotlin
SecureCredentialModule(reactContext),
LocalModelEligibilityModule(reactContext),
```

Do not restore the complete donor `AccessibilityPackage.kt`; retain every V1 module registration already present.

- [ ] **Step 4: Verify local fail-closed behavior and native compilation**

```bash
cd /private/tmp/a2a_ai_mobile-v1-runtime-foundation/AwesomeProject
npm test -- --runInBand --no-cache \
  src/__tests__/core/engine/agentRuntime/localModel \
  src/__tests__/core/engine/agentRuntime/runtime/RuntimePrivacy.test.ts
npx tsc --noEmit
cd android
./gradlew :app:testDebugUnitTest --tests 'com.awesomeproject.localmodel.*'
./gradlew :app:compileDebugKotlin
```

Expected: all JS/local-model JVM tests pass and Kotlin compiles. `RuntimePrivacy` must assert cloud planner/direct call count is zero after local construction, inference or schema failure.

- [ ] **Step 5: Commit**

```bash
git add AwesomeProject/src/core/engine/agentRuntime/localModel \
  AwesomeProject/src/__tests__/core/engine/agentRuntime/localModel \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/AccessibilityPackage.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/bridge/LocalModelEligibilityModule.kt \
  AwesomeProject/android/app/src/main/java/com/awesomeproject/localmodel \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/localmodel \
  AwesomeProject/android/app/src/test/java/com/awesomeproject/bridge/AccessibilityPackageRegistrationTest.kt
git commit -m "feat: port local model eligibility foundation"
```

---

