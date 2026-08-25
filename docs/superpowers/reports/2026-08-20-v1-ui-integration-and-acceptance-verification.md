# V1 UI Integration and Acceptance Verification

- Base product SHA: 9ff7ba4cc4dc186b79b6e62181333ae6c9132f54
- Runtime checkpoint SHA: 65819743d14b303b11782dd863cdf0f7aedf7e83
- Candidate code SHA: NOT_RUN_PRE_CANDIDATE
- Test started at: NOT_RUN_PRE_CANDIDATE
- Test completed at: NOT_RUN_PRE_CANDIDATE
- Testing agent: NOT_ASSIGNED_PRE_CANDIDATE
- Android device: NOT_RUN_PRE_CANDIDATE
- iOS target: NOT_RUN_PRE_CANDIDATE
- Final result: NOT_RUN_PRE_CANDIDATE

## Commands and Results

| Command | Exit | Result | Evidence excerpt |
| --- | ---: | --- | --- |
| `node jest src/__tests__/integration --runInBand` (cwd AwesomeProject) | 0 | PRE-CANDIDATE PASS | 3 suites / 29 tests |
| `npx tsc --noEmit --pretty false` | 0 | PRE-CANDIDATE PASS | no diagnostics |
| `./gradlew :app:compileDebugKotlin` | n/a | WAIVED | no JDK on this machine |
| iOS XCTest | n/a | WAIVED | no Xcode / iOS dictation out of scope |

## User-path Matrix

| Scenario | Expected | Actual | Result | Evidence |
| --- | --- | --- | --- | --- |

## Waivers

| Gate | Reason | Impact | Owner | Manual follow-up date |
| --- | --- | --- | --- | --- |
| Android Gradle compile/assemble | Unable to locate a Java Runtime; `android/gradlew` not executable | Cannot produce debug APK on this host | integration coordinator | 2026-08-27 |
| iOS listen / XCTest | Product scope: 当前版本听写仅支持 Android; no Xcode | iOS dictation remains copy-only | integration coordinator | 2026-08-27 |
| Privacy rg SCAN1/2/3 raw exit | Hits are redaction destructure + versioned `NonoTaskCancelRequestedV1` + tests asserting absence of SpeechRecognizer/CDN | No plaintext credential or system ASR in persist/UI | integration coordinator | Task 12 re-run on candidate |

## Findings and Fixes

| Severity | Finding | Fix commit | Re-test |
| --- | --- | --- | --- |
