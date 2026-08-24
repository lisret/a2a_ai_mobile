# UI Task 6 Report — Wire Model Configuration, Fix Navigation Typing, Render Phone Operate Readiness

## WorkPackageEvidence

- **baseSha:** `593cf41384dd00d0ce2d414b216bc2bb9165c55c`
- **Branch:** `codex/v1-runtime-integration`
- **Worktree:** `/Users/a/Desktop/code/tool/a2a_ai_mobile/.worktrees/v1-runtime-integration`
- **Commit message:** `feat: wire model config and runnable mode UI`

## TDD RED → GREEN

### RED
Wrote the four test files first:
- `src/__tests__/navigation/AppNavigatorTyping.test.tsx` — compile-time nested-nav/alias/param/deep-link helpers + legacy parser assertions.
- `src/__tests__/features/capability/PhoneOperateViewState.test.tsx` — unrunnable draft shows real blocker, activate button disabled, never calls `activateDraftMode`, no cloud-fallback copy, runnable draft activates with the loaded revision.
- `src/__tests__/features/model/ModelConfigViewState.test.tsx` — apiProviders preset order/labels/guides, `ApiProviderSelector` preset|custom discriminant, `ModelNameSelector` manual input across all statuses, facade-driven Add/Edit/List/APIKeyGuide, keep-first credential.
- `src/__tests__/features/model/ModelCatalogRace.test.ts` — `mapProviderCatalog` status mapping + `DefaultModelConfigFacade` generation race (older superseded request marked `stale`).

Initial run: PhoneOperate/model suites FAILED (screens still read `nonoConfigService`/hard-coded chips), as expected.

### V1 TS2769 evidence
`npx tsc --noEmit` returned **0 errors at baseline** — the V1 `navigation.navigate('Capabilities')` / TS2769 error was already fixed in Wave 0 (HomeScreen has no navigation calls at all; it does not link `Capabilities` or `OpenClaw`). Per resolution #8 this is recorded as already-fixed Wave-0 evidence; the compile-time helper test was still added.

### GREEN
```
Test Suites: 5 passed, 5 total
Tests:       43 passed, 43 total
```
Suites: `AppNavigatorTyping`, `PhoneOperateViewState`, `PhoneOperatePermission` (pre-existing, still green), `ModelConfigViewState`, `ModelCatalogRace`.

`npx tsc --noEmit --pretty false` → **exit 0, 0 errors** (full project).

## Scan results

- **Scan 2** (model screens/components + APIKeyGuideScreen for `providerRow|providerChip|huggingface|['openai'..'zhipu']|fetchModelList|modelService|AIModel|apiKey|ModelProviderRegistry`): **clean, no output.**
- **Scan 1** (`NonoConfigService|nonoConfigService|当前任务仍走云端一体|navigate('Capabilities')` over PhoneOperateScreen + HomeScreen):
  - `PhoneOperateScreen.tsx`: **clean** (no matches) — it is now fully `useAppFacades().phoneOperate`-driven, the cloud-fallback copy is removed, and there is no `navigate('Capabilities')`.
  - `HomeScreen.tsx`: **matches `nonoConfigService`** — but only in its **pre-existing memory/capabilities** code (`getMemories`/`addMemory`/`getCapabilities`), which is unrelated to phone-operate. See Concerns.

## Files changed (brief list)

Modified: `shared/types/navigation.ts`, `navigation/AppNavigator.tsx`, `features/capability/screens/PhoneOperateScreen.tsx`, `features/model/screens/AddModelScreen.tsx`, `features/model/screens/EditModelScreen.tsx`, `features/model/screens/ModelListScreen.tsx`, `features/model/components/ApiProviderSelector.tsx`, `features/model/components/ModelNameSelector.tsx`, `features/model/components/ModelListPanel.tsx`, `features/model/components/ModelItem.tsx`, `features/settings/screens/APIKeyGuideScreen.tsx`, `features/model/services/ModelListService.ts`, `shared/constants/apiProviders.ts`, `application/facades/createAppFacades.ts`.

New tests: the four files above.

`features/task/screens/HomeScreen.tsx` — **no changes required** (already nested-nav-correct, links neither `Capabilities` nor `OpenClaw`). Kept in the `git add` list per the brief (no-op).

## What was implemented

- **Navigation typing:** `EditModel: {bindingId; list?}`, `APIKeyGuide: {presetId?; mode?} | undefined`, canonical `VisualAgentTools: {initialPreset?} | undefined`; `OpenClaw` retained as a compatibility route whose screen immediately `replace`s to `VisualAgentTools {initialPreset:'openclaw'}`. Legacy `zhipu/moonshot` deep-link parser (`mapLegacyProviderIdToPreset`, `normalizeApiKeyGuideDeepLink`) maps once and drops unknowns. `AppNavigator` `MainTabs` unchanged body; separate Stack/Tab param lists.
- **PhoneOperate:** facade `PhoneOperateViewState` load via `useFocusEffect`; per-mode `runnable`/blockers rendered individually; `testID="activate-operate-mode"` with `disabled`/`accessibilityState.disabled`; unrunnable draft never activates; ADB toggle keeps the optimistic-then-permission ordering.
- **Model config:** `apiProviders.ts` is now UI-only (localized labels, credential guides, HTTPS host allow-list; no base URLs/auth/catalog; `custom` not a preset). `ApiProviderSelector`/`ModelNameSelector`/`ModelItem` are pure controlled components; `ModelListPanel`/`ModelListScreen` are facade-driven by `bindingId`+revision; `APIKeyGuideScreen` orders by `modelConfig` presets and reads guides from `apiProviders`; Add/Edit use `ModelConfigSaveInput`/`ModelCatalogRefreshInput` with monotonic `requestGeneration`, effect cleanup + facade stale guard, keep-first credential, no plaintext rehydration. `ModelListService` is a UI-only mapper + draft→input builders.
- **Live ports:** `createAppFacades.ts` now wires live `phoneOperate` (`RuntimePhoneOperatePort`) and `modelConfig` (`RuntimeModelConfigPort`) over `AsyncStorageRuntimeConfigRepository` + `createModelProviderRegistry` + `NativeCredentialStore` + `AsyncStorageModelCatalogCache` + `NonoConfigService` + `NativeLocalModelEligibilityChecker`, with the `ModelListKey → ModelRole` map applied once at the boundary. All other ports remain `app_facade_port_not_wired`.

## Self-review / Concerns

1. **Scan-1 vs resolution-#1 conflict (DOES NOT affect PhoneOperateScreen):** The mandated Scan-1 regex spans `HomeScreen.tsx` and matches its pre-existing `nonoConfigService` **memory/capabilities** usage. Resolution #1 scopes Home edits narrowly and forbids changing task execution; there is no wired facade for Home memories (companion/activity ports are still `not_wired`), so migrating that usage is out of Task 6 scope and would bind Home to an unwired graph. The substantive Task-6 target (`PhoneOperateScreen`) passes the scan cleanly. Flagging for the coordinator: either the scan is intentionally over-broad for Home, or Home-memory migration belongs to a later companion task.
2. **`CompanionModelForm.test.tsx` regression (out of file list):** This pre-existing test renders `AddModelScreen`/`EditModelScreen` without an `AppFacadesProvider`; since Add/Edit are now facade-driven per the brief, it throws `AppFacadesProvider is missing` (3 tests). It is not in the Task-6 file list, so it was not modified/committed. It must be updated to wrap in a provider (and drop `maxSteps`, which is no longer part of `ModelConfigSaveInput`) by the owning companion task.
3. **Live ModelConfig list semantics:** The runtime config stores one binding per role, while the UI list implies multiple candidates + selection. The port treats all bindings of a role as the list and the first as `selected`; `selectBinding` reorders to front, `deleteBinding` removes binding + profile. `save` ignores `expectedRevision` (repository `putProfile/putBinding` are revision-free); select/delete honor it via `compareAndActivate`. These semantics are untested by the Task-6 suites and should be exercised by a runtime integration test.
4. **Production ports are unverified by these tests** (all four suites inject fakes). Correctness of credential staging for catalog fetch, blocker projection, and eligibility gating needs device/integration QA.

## Status: DONE_WITH_CONCERNS

---

# Review-Fix Addendum (5 coordinator findings)

Follow-up commit addressing the important review findings on top of the original Task 6 work. New commit (not an amend).

## Changes

1. **`RuntimePhoneOperatePort.activate(mode, expectedRevision)` revision guard** (`createAppFacades.ts`): now `await this.repo.load()` and throws `RuntimeConfigError('runtime_config_conflict')` when `envelope.revision !== expectedRevision`, before writing the active mode. Uses the same stable code the repository's own `compareAndActivate` throws.
2. **`RuntimeModelConfigPort.save` honors `input.expectedRevision`** (`createAppFacades.ts`): an optimistic-concurrency gate at the top of `save` compares the loaded `envelope.revision` against `input.expectedRevision` and throws `RuntimeConfigError('runtime_config_conflict')` before any credential or config write, so a stale save never mutates the runtime config.
3. **Add/Edit `requestGeneration` seeded from `Date.now()`** (`AddModelScreen.tsx`, `EditModelScreen.tsx`): `generation` ref now initializes to `Date.now()` instead of `0`, so a fresh screen mount always produces a generation greater than any the singleton `DefaultModelConfigFacade` has already observed; it is never reset to 0 on focus.
4. **`CompanionModelForm.test.tsx` rewritten** (blessed extra test file): wrapped in `AppFacadesProvider` with a fake `modelConfig`, asserts companion vs unified copy (companion note vs unified note) and that max-steps chrome is hidden, and switched Edit route params from `modelId` to `bindingId` (also asserts `getViewState` is called with `{bindingId, list}`). NOTE: the new facade-driven forms no longer render a max-steps field at all (the frozen `ModelConfigSaveInput` contract has no `maxSteps`), so the test asserts absence rather than reintroducing removed chrome.
5. **`RootStackParamList.AddModel` narrowed** (`navigation.ts`): removed `importedData`; type is now `{list?: ModelListKey} | undefined` so navigation params can never carry `apiKey`/secrets. No source consumers referenced `importedData` (verified by repo-wide search).

## Covering tests (new)

`src/__tests__/features/model/RuntimePortsRevisionGuard.test.ts` (2 cases):
- `RuntimePhoneOperatePort.activate` rejects a stale `expectedRevision` with `runtime_config_conflict` and only reads (never writes).
- `RuntimeModelConfigPort.save` rejects a stale `expectedRevision` with `runtime_config_conflict` and calls neither `putProfile`/`putBinding`/`compareAndActivate`.

To make these cheap, the two port classes are now `export`ed from `createAppFacades.ts` (composition-root rule only forbids *screens* importing implementations; tests may).

## Verification

- `npx tsc --noEmit` → exit 0 (clean).
- `jest src/__tests__/features/model src/__tests__/features/capability src/__tests__/navigation` → **7 suites passed, 49 tests passed** (includes `CompanionModelForm.test.tsx` and the new `RuntimePortsRevisionGuard.test.ts`).

## Residual notes

- The `save` gate is a load-then-compare guard (writes still go through revision-free `putProfile`/`putBinding`). It guarantees "no write on mismatch" (the tested contract) but is not a single atomic CAS; select/delete continue to use true `compareAndActivate`. Full atomicity of the credential+projection path remains for runtime integration QA.
- `Date.now()` seeding assumes monotonic wall clock within a session; sufficient to stay ahead of the singleton facade's observed generations for the UI's stale-response guard.
