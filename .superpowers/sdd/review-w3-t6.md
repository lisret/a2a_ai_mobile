# Review: UI Wave 3 Task 6 — Wire Model Configuration, Fix Navigation Typing, Render Phone Operate Readiness

Base: `593cf41384dd00d0ce2d414b216bc2bb9165c55c`
Head: `869c8c99bd781d930cb7b7e4053507936fc972ff`

## Verdict

- **Spec:** PASS
- **Quality:** Changes requested

## Summary

The core deliverables described in the brief are implemented and demonstrated by the four new test files: nested `MainTabs`/`VisualAgentTools`/canonical `EditModel`/`APIKeyGuide` navigation typing, blocked-draft-never-activates PhoneOperate behavior with the cloud-fallback copy removed, a facade-driven preset/custom model-config UI with an exhaustive 11-preset guide catalog, keep-first credential handling on Edit, a UI-only `mapProviderCatalog` mapper, and a stale-request race test against the (pre-existing) `DefaultModelConfigFacade`. Global constraints (no `NonoConfigService`/`ModelService` imports in screens, no plaintext rehydration, `manual-model-id` present in every catalog status, only `phoneOperate`+`modelConfig` production ports wired, `DEMO_TURNS`/TaskExecutionEngine untouched) all hold per direct source inspection. However, several correctness/quality gaps — two self-disclosed by the report, three found independently — should be resolved or explicitly accepted by the coordinator before merge.

## Critical

None found.

## Important

1. **`RuntimePhoneOperatePort.activate()` silently drops `expectedRevision`.** The `PhoneOperateApplicationPort.activate(mode, expectedRevision)` contract takes a revision for optimistic concurrency (mirroring `VisualAgentToolsApplicationPort`'s pattern and `modelConfig.selectBinding/deleteBinding`'s use of `compareAndActivate`), but the implementation (`createAppFacades.ts`, `RuntimePhoneOperatePort.activate`) ignores `_expectedRevision` entirely and calls `nonoConfigService.saveActiveMode(mode)` unconditionally. Concurrent/stale activations can silently clobber each other with no conflict signal. Not self-flagged in the report.

2. **`RuntimeModelConfigPort.save()` also ignores `input.expectedRevision`.** `save()` uses `repo.putProfile`/`repo.putBinding`, which are documented in `RuntimeConfigRepository.ts` as revision-free (`mutateActiveNow`), unlike `selectBinding`/`deleteBinding` which correctly use `compareAndActivate`. This is self-disclosed in the report (Concern #3) but left unresolved — worth a coordinator decision on whether Task 6 or a follow-up task should close this gap, since the frozen `ModelConfigSaveInput` requires `expectedRevision` from every caller, implying a guarantee that currently isn't honored.

3. **Screen-local `requestGeneration` counters can collide with `DefaultModelConfigFacade`'s persistent per-key generation memory, causing spurious "stale" catalog results.** `DefaultModelConfigFacade.refreshCatalog` (pre-existing, not in this diff) keys its monotonic-generation guard by `` `${list}::${bindingId ?? ''}` `` and never resets that map for the app's lifetime. `AddModelScreen`/`EditModelScreen` each mount a fresh `useRef` counter starting at 0. For `AddModelScreen`, `bindingId` is always `undefined`, so every "Add" session for a given `list` shares the same facade key. After one Add session drives the counter past e.g. 3 and the user backs out, a brand-new Add session for the same list restarts locally at 1 — its first (and possibly several subsequent) real refresh requests will be rejected by the facade as stale (`{status:'stale', models:[]}`) purely because the facade's remembered maximum is higher than the new screen's fresh local counter. This is self-healing (enough refreshes eventually exceed the old max) but is a real, un-flagged UX bug for repeat "Add new model" flows within one app session.

4. **`CompanionModelForm.test.tsx` (pre-existing, out-of-file-list) is now broken.** It renders `AddModelScreen`/`EditModelScreen` without an `AppFacadesProvider`, and references `maxSteps`, which no longer exists on the frozen `ModelConfigSaveInput`. Since these screens are now facade-driven, 3 of its 4 tests will throw/fail. Self-disclosed in the report (Concern #2) as intentionally left unfixed (not in the Task 6 file list), but it represents a real regression to a previously-green suite that the Step-6 verification command (which only runs the four new/task-scoped suites) does not catch. Needs an explicit owner/follow-up before this is considered safe to merge into a branch that runs the full suite.

5. **`RootStackParamList.AddModel`'s `importedData?: Partial<AIModelFormData>` param shape is now dead but still credential-shaped.** `AIModelFormData` includes a plaintext `apiKey` field. `AddModelScreen` no longer reads `route.params?.importedData` at all (confirmed: no remaining reference in the component), and nothing in the codebase calls `navigate('AddModel', {importedData: …})` any more — but the route type still type-checks a caller passing `importedData: {apiKey: '...'}` through navigation params. The brief explicitly requires "navigation params 不得携带 credential" for the Add route's import-compatibility path; the type should have been removed or converted to a non-sensitive draft shape rather than left as inert dead code that still permits it structurally.

## Minor

1. **`mapLegacyProviderIdToPreset`/`normalizeApiKeyGuideDeepLink` are implemented and unit-tested but never wired into any real navigation entry point.** There is no `linking` config on `NavigationContainer` and no call site anywhere that passes `{providerId: ...}` to `APIKeyGuide`. The functions satisfy the literal `AppNavigatorTyping.test.tsx` coverage requirement from the brief but are currently dead code from a runtime-behavior standpoint (no legacy deep link can actually reach the app today to exercise them).
2. **The brief's mandated Step-6 `rg` scan over `HomeScreen.tsx` for `nonoConfigService` would fail as literally written.** `HomeScreen.tsx` still calls `nonoConfigService.getMemories/addMemory/getCapabilities` (pre-existing, unrelated to phone-operate). This is self-disclosed in the report (Concern #1) with a reasonable "out of Task 6 scope per coordinator resolution #1" justification; flagging so the coordinator can confirm the scan should be scoped down or the exception formally accepted rather than silently diverging from the written verification script.

⚠️ Two Important-severity concurrency/generation-tracking defects (Important #1, #3) were not surfaced by the implementer's self-review and are not covered by the brief's own test list; recommend the coordinator decide whether to fix now or accept as tracked follow-up debt before the phoneOperate/modelConfig production ports see real device traffic.
