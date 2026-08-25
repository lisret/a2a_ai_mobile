# V1 UI Integration and Acceptance Verification

- Base product SHA: 9ff7ba4cc4dc186b79b6e62181333ae6c9132f54
- Runtime checkpoint SHA: 65819743d14b303b11782dd863cdf0f7aedf7e83
- Candidate code SHA: 2964f93b2598aa821a58943585336498298361da
- Test started at: 2026-08-25T18:15:00+08:00
- Test completed at: 2026-08-25T18:20:00+08:00
- Testing agent: same-session coordinator (not an independent testing agent)
- Android device: WAIVED — adb/device/JDK not available on this host
- iOS target: WAIVED — no Xcode; dictation is Android-only
- Final result: WAIVED

## Commands and Results

| Command | Exit | Result | Evidence excerpt |
| --- | ---: | --- | --- |
| `git rev-parse codex/checkpoint-v1-candidate` | 0 | 2964f93b2598aa821a58943585336498298361da | frozen before this report-only commit |
| `node jest src/__tests__/integration --runInBand` | 0 | PASS | 3 suites / 29 tests |
| `node jest src/__tests__/features/task/HomeLocalExperienceIntegration.test.tsx --runInBand` | 0 | PASS | 7 tests at d07c014 |
| `npx tsc --noEmit --pretty false` | 0 | PASS | no diagnostics |
| `npm run lint` | 1 | WAIVED | V1 baseline prettier debt (~5921 errors); not introduced by this branch's Task 10/11 files |
| `./gradlew :app:testDebugUnitTest :app:compileDebugKotlin :app:assembleDebug` | n/a | WAIVED | Unable to locate a Java Runtime |
| iOS XCTest / workspace build | n/a | WAIVED | no Xcode |
| Xiaomi 9 device matrix | n/a | WAIVED | no adb device in this session |

## User-path Matrix

| Scenario | Expected | Actual | Result | Evidence |
| --- | --- | --- | --- | --- |
| Home Android tap avatar → listen → transcript → CompanionFacade | SpeechRouter + submitTranscript, no DEMO_TURNS | Jest HomeLocalExperience 7/7 | PASS (unit/integration only) | d07c014 tests |
| Home iOS tap avatar | 当前版本听写仅支持 Android | Jest iOS case | PASS (unit) / device WAIVED | HomeLocalExperience iOS test |
| Denied microphone | no startUtterance, copy 需要麦克风才能说话 | Jest | PASS (unit) | same |
| Avatar load fail | rollback + gltfUri null | Jest | PASS (unit) | same |
| Channel cloud_direct / cloud_split / local_vision_cloud_planner | only resolved ports | Jest 29 | PASS | RuntimeChannelEndToEnd |
| Visual adapter disconnect / missing capability | blocked, zero pipeline | Jest | PASS | same |
| Real device operate / companion / visual tools | fail-closed real ports | NOT RUN | WAIVED | no device; production companion/operate still loud-unwired |

## Waivers

| Gate | Reason | Impact | Owner | Manual follow-up date |
| --- | --- | --- | --- | --- |
| Android Gradle + APK | no JDK (`Unable to locate a Java Runtime`) | cannot install or run Xiaomi 9 matrix | integration coordinator | 2026-08-27 |
| iOS build / dictation | no Xcode; product scope Android-only listen | iOS cannot speak to Home | integration coordinator | 2026-08-27 |
| Independent testing agent | user authorized continuous same-session execution | acceptance is not a second-agent freeze | integration coordinator | before any merge |
| Full `npm run lint` | pre-existing V1 prettier/lint debt | not used as a green signal | integration coordinator | 2026-08-27 |
| Production companion/operate ports | still `app_facade_port_not_wired` | real-device Home/能力页 will fail-closed | integration coordinator | before merge |

## Findings and Fixes

| Severity | Finding | Fix commit | Re-test |
| --- | --- | --- | --- |
| Important | Production `createAppFacades` still leaves companion/operate/visual/errand/privacy/activity loud-unwired | none (out of Task 10/11 join) | required on next candidate if wired |
| Minor | Privacy `rg` over-matches redaction destructure, `NonoTaskCancelRequestedV1`, and absence-assertion tests | classified, not allowlisted | Task 12 device host |
