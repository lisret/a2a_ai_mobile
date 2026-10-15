# V1 Wave 1A Integration

- Integration branch: `codex/v1-runtime-integration`
- Checkpoint SHA: pending this commit
- Child bases: all `4a703e3bb4baa39db859fed5467c4924702acec8` (`codex/checkpoint-v1-contracts`)
- Cherry-picked:
  - `codex/v1-w1a-runtime-core` → `39e9e8a` (AgentRuntime core)
  - `codex/v1-w1a-task-history` → `cde0658` + `c0dbef6` (history + finalScreenshot redact)
  - `codex/v1-w1a-native-security` → `7bc623e` + `2418b75` + `4193bc1` (credentials, local-model, iOS Keychain sources)

## Gates

- `npx jest --runInBand src/__tests__/core/engine/agentRuntime` → 13 suites / 110 tests PASS
- `npx jest --runInBand src/__tests__/services/TaskHistoryService.test.ts` → 20 tests PASS
- `npx jest --runInBand src/__tests__/core/engine/agentRuntime/credentials src/__tests__/core/engine/agentRuntime/localModel` → 16 tests PASS
- `npx tsc --noEmit` → exit 0
- Android `./gradlew testDebugUnitTest`: **WAIVED**
  - Reason: this worktree has no Java Runtime (`Unable to locate a Java Runtime`)
  - Impact: Kotlin unit tests and compileDebugKotlin not executed here
  - Owner: coordinator / next machine with JDK
  - Expiry: 2026-08-27
- iOS `xcodebuild` Keychain tests: **WAIVED**
  - Reason: no Xcode toolchain in this session; pbxproj registration is applied in this commit and still needs a simulator run
  - Impact: `NoNoCredentialStoreTests` not executed
  - Owner: coordinator / macOS with Xcode
  - Expiry: 2026-08-27

## Serial wiring applied

- `android/app/build.gradle`: `testImplementation("junit:junit:4.13.2")`
- `AccessibilityPackage.kt`: `SecureCredentialModule` + `LocalModelEligibilityModule(reactContext, UnavailableLocalModelOperations())`
- `project.pbxproj`: `NoNoCredentialStore.h/.m` in app target; `NoNoCredentialStoreTests.m` in test target
