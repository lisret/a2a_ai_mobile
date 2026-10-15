# V1 Wave 1 Runtime Foundation Gate

- Integration branch: `codex/v1-runtime-integration`
- Product baseline: `9ff7ba4cc4dc186b79b6e62181333ae6c9132f54`
- Gate SHA (`FOUNDATION_SHA`): `219f8931551424f3ca358915bdec30f07396e9cf`
- Wave 1A + Wave 1B (config, sessions, runner) already integrated before this join.

## Serial coordinator commits (this join)

| SHA | Summary |
| --- | --- |
| `af6b014` | feat: collect retired credential refs on cold start (Task 6 `CredentialReferenceGarbageCollector` + test) |
| `a66404a` | fix: sanitize runtime logs before every sink (Task 10 `sanitizeLog` + `DebugLogService` + compat re-export) |
| `7b0f85f` | feat: gate operate createSession behind cold-start reconciliation (Task 4 Step 5 admission ordering) |
| `d366982` | feat: share one session and runner across operate entry points (Tasks 8–9 adapters + minimal payload + native log removal) |
| `219f893` | style: apply prettier to new runtime foundation files |

## JavaScript / TypeScript gates (cannot be waived) — PASS

- `npx tsc --noEmit` → exit 0.
- `npm test -- --runInBand` → **47 suites / 426 tests passed** (baseline was 43/392; +4 suites, +34 tests).
- `npx eslint` on every new/changed file in this join → 0 errors, 0 warnings.
- `npx prettier --write` applied to all new files; they conform to repo config.

New suites added this join:
- `CredentialReferenceGarbageCollector.test.ts` (11 tests)
- `OperateRuntimeColdStart.test.ts` (3 tests)
- `sanitizeLog.test.ts` (13 tests)
- `OperateEntryAdapters.test.ts` (7 tests)

## Completed requirements

1. **Deferred credential retirement GC (Task 6 join).** `CredentialReferenceGarbageCollector.reconcileBeforeAcceptingTasks()` builds a reference set from active + draft model/visual profiles and every nonterminal session snapshot, then applies committed/staged replacement/removal logic against the Task 4B `CredentialRetirementRepository`. A ref held by active/draft config or a nonterminal session is never deleted; deletions are verified with `get(ref) == null`; a failed cleanup leaves the record intact and raises ref-free `credential_cleanup_required`. Logs carry only reason code + count.
2. **Cold-start ordering (Task 4 Step 5).** `OperateRuntimeColdStart.start()` runs config migrate/load → nonterminal session recovery → `reconcileBeforeAcceptingTasks()` and only then admits `createSession`; the gate stays closed on reconcile failure. Runtime config edits never invoke the collector, so an in-flight immutable session cannot lose its credential.
3. **Shared session + runner entry points (Tasks 8–9).** `ForegroundTaskExecutionAdapter` and `HeadlessTaskExecutionAdapter` both acquire one immutable session from `OperateRuntime` and drive the same `OperateTaskRunner.run(lease)`, mark the session terminal from the outcome, and release in `finally`. Neither constructs an `AIModel`, calls `modelInferenceModule`, reads current RuntimeConfig, or owns a second loop.
4. **Minimal Headless payload (Task 9).** `serializeHeadlessTaskData`/`parseTaskExecutionData` accept exactly `{taskId, sessionRevision}` (nonblank id, positive safe-integer revision); extra keys, missing keys, malformed JSON, blank id, and stale/non-positive/non-integer revisions are rejected. Serialized payload contains no instruction/model/apiKey/secretRef/screenshot/response.
5. **Native raw-payload log removed (Task 9 Step 5).** `Log.d(TAG, "任务数据: $taskData")` deleted from `TaskExecutionHeadlessService.kt`; a category-only line replaces it. `ServiceManager.kt` does not print its `taskData` argument.
6. **Log sanitization (Task 10).** Single recursive `sanitizeLog`/`sanitizeLogValue`/`sanitizeLogText` with depth 6 / 50 entries / 512-char string / 16 KiB caps and `[REDACTED]`/`[CONTENT_REDACTED]`/`[Circular]`/`[Truncated]` markers. `DebugLogService` sanitizes before the platform console, the in-memory sink, on legacy load (migrating + rewriting), and uses a rejection-safe write queue. `features/debug/services/logRedaction.ts` is now a compatibility re-export only.

## Native gates — WAIVED (native only)

| Gate | Status | Reason | Impact | Owner | Expiry |
| --- | --- | --- | --- | --- | --- |
| Android `:app:testDebugUnitTest :app:compileDebugKotlin :app:assembleDebug` | WAIVED | No JDK/Java runtime in this environment (`Unable to locate a Java Runtime`); gradle absent. | Kotlin change is a single log-line deletion; low risk but unverified by build. | Integration coordinator (next environment with JDK 17 + Android SDK) | 2026-09-04 |
| iOS `xcodebuild ... build` | WAIVED | Xcode 26.6 present but no RN CocoaPods/node build setup provisioned here; no iOS source changed in this join. | No iOS code touched this join; build parity unverified. | Integration coordinator (next macOS CI with pods installed) | 2026-09-04 |

## Known remaining serial integration work (tracked, NOT waived for JS gates)

The new single-runner entry adapters are implemented and tested, but the legacy
device loops are not yet physically deleted because rewiring them requires the
production runner composition root (real screenshot/action/instruction/registry
ports). Per this plan's own "Explicitly Out Of Scope", wiring model
services/screens to the new registries belongs to the later UI integration
plan. Remaining direct `modelInferenceModule.infer` sites and `taskId:'current'`
cancellations still present in untouched hotspots:

- `src/features/task/hooks/useTaskExecution.ts` (`modelInferenceModule.infer`, `taskId:'current'`)
- `src/features/task/services/TaskExecutionHeadless.ts` (`modelInferenceModule.infer`)
- `src/core/engine/taskEngine/task/TaskExecutionEngine.ts` (`modelInferenceModule.infer`)
- `src/features/task/screens/HomeScreen.tsx`, `TaskHistoryScreen.tsx` (`taskId:'current'`)

These are release blockers to be closed by the UI-integration wave that composes
the runner ports and replaces the legacy Hook/Headless/Home call sites with the
adapters above. Recorded here truthfully rather than hidden.

## Out of scope (unchanged from plan)

Real Companion/ASR, live OpenClaw session, Errand scheduler, Avatar packs, and
moving the legacy model UI/service writer to the profile repository remain
outside this foundation.
