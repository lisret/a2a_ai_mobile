# Capability-domain Task 12 report — Unified conformance gate, Connector Bridge client, public barrels, architecture guard

## WorkPackageEvidence

- **Repo / worktree:** `/Users/a/Desktop/code/tool/a2a_ai_mobile/.worktrees/v1-runtime-integration`
- **Branch:** `codex/v1-runtime-integration`
- **baseSha:** `c9dec764c5bfd1e25314ce9309ddfd56fbe02813` (verified `git rev-parse HEAD` at start == baseSha)
- **Commit:** `5a3bc0d4285c8d6d8b79e553af58f7dafbc3e217` — `test: enforce visual agent adapter conformance`
- **Checkpoint ancestry:** `git merge-base --is-ancestor codex/checkpoint-v1-wave1 HEAD` → OK (checkpoint is an ancestor).
- **Files created (15, all listed in the brief):**
  - `AwesomeProject/src/connectorBridge/visualAgent/BuiltInVisualAgentToolRegistry.ts`
  - `AwesomeProject/src/features/visualAgent/data/ConnectorBridgeTransport.ts`
  - `AwesomeProject/src/features/visualAgent/data/ConnectorBridgeVisualAgentClient.ts`
  - `AwesomeProject/src/features/visualAgent/data/VisualAgentPreferenceRepository.ts`
  - `AwesomeProject/src/features/visualAgent/application/VisualAgentViewState.ts`
  - `AwesomeProject/src/features/visualAgent/application/VisualAgentFacade.ts`
  - `AwesomeProject/src/features/visualAgent/index.ts`
  - `AwesomeProject/src/features/preference/index.ts`
  - `AwesomeProject/src/features/companion/index.ts`
  - `AwesomeProject/src/features/errand/index.ts`
  - `AwesomeProject/src/__tests__/connectorBridge/visualAgent/VisualAgentAdapterConformance.test.ts`
  - `AwesomeProject/src/__tests__/features/visualAgent/ConnectorBridgeVisualAgentClient.test.ts`
  - `AwesomeProject/src/__tests__/features/visualAgent/VisualAgentPreferenceRepository.test.ts`
  - `AwesomeProject/src/__tests__/features/visualAgent/VisualAgentFacade.test.ts`
  - `AwesomeProject/src/__tests__/architecture/CapabilityDomainBoundaries.test.ts`
- No existing adapter implementation, adapter fixture, frozen runner, contract, controller, or shared-hotspot file was modified. No composition-root file was added. No push/merge/rebase.

## Coordinator resolutions honored

1. **Derived options, no `switch (toolId)`.** The aggregate test derives `negotiatedCapabilities` from each fixture's `supportedCapabilities` and derives `requiredStatuses` from the capabilities the fixture can emit. There is no tool-name branch anywhere in the file; the only branches are on capability booleans.
2. **At most one terminal per runner call.** The default loop drives the `completed` terminal (plus `waiting_approval` only when `approval` is negotiated). Separate, capability-gated variants drive the `cancelled` terminal (cancel-capable fixtures) and the `failed`→`resume` terminal (resume-capable fixtures). `cancelled` and `completed` are never passed to one runner call.
3. **`registerCustomWithoutConformance('custom:sample')`** is a test-local helper that looks up an unregistered id in the immutable registry and surfaces `visual_agent_adapter_not_found`. No public mutable register exists.
4. **Barrels.** Preference/Companion/Errand barrels export only their existing Facade + ViewState. The Visual Agent barrel matches the brief exactly (nine frozen primary names + `VisualAgentToolManifestV1`/`VisualAgentRunStatus` + Facade/ViewState). No `features/openclaw` barrel.
5. **No composition roots created.** `createBuiltInVisualAgentToolRegistry` composes the five adapters with an "unavailable" transport by default; the coordinator injects live ports at composition time.
6. **Full `npm test -- --runInBand` run required and executed;** no Wave 0 failure or waiver appeared, and no Jest/TS config was weakened.

## TDD RED → GREEN

### RED

Command (brief Step 4):

```
cd AwesomeProject && npm test -- --runInBand \
  src/__tests__/connectorBridge/visualAgent/VisualAgentAdapterConformance.test.ts \
  src/__tests__/features/visualAgent/ConnectorBridgeVisualAgentClient.test.ts \
  src/__tests__/features/visualAgent/VisualAgentPreferenceRepository.test.ts \
  src/__tests__/features/visualAgent/VisualAgentFacade.test.ts \
  src/__tests__/architecture/CapabilityDomainBoundaries.test.ts
```

Result: **5 failed, 5 total; 0 tests** — every suite failed to run with `Cannot find module ...` for the not-yet-created BuiltIn registry / mobile client / preference repository / facade / barrels. This is the expected RED (missing shared conformance/mobile/barrel modules).

### GREEN (targeted)

Same command after implementation: **5 passed, 42 tests passed, 0 failed.**
(One intermediate failure — the architecture guard caught the literal token `VisualAgentAdapterRegistry` inside a code comment of `BuiltInVisualAgentToolRegistry.ts`; the comment was reworded to "no mutable adapter-registry type" and the suite went green. One intermediate `tsc` failure — the registry type had to be imported from `VisualAgentContracts` rather than the registry module; fixed.)

Each of the five built-ins runs the identical shared assertions through the frozen runner (`it.each` over all five fixtures), plus the capability-gated cancel/resume/steer-unsupported variants and the registry/manifest-freeze assertions.

## Step 9 — capability-domain + conformance gate

```
cd AwesomeProject && npm test -- --runInBand \
  src/__tests__/core/engine/capabilities src/__tests__/core/engine/preference \
  src/__tests__/core/engine/companion src/__tests__/core/engine/errand \
  src/__tests__/features/visualAgent src/__tests__/connectorBridge/visualAgent \
  src/__tests__/architecture/CapabilityDomainBoundaries.test.ts
```

Result: **Test Suites: 23 passed, 23 total; Tests: 162 passed, 162 total; 0 failed.** All five built-ins run the same conformance assertions.

## Step 10 — repository-wide static + Jest gates

`cd AwesomeProject && npx tsc --noEmit` → **exit 0, no diagnostics.**

`cd AwesomeProject && npm test -- --runInBand` → **Test Suites: 70 passed, 70 total; Tests: 588 passed, 588 total; 0 failed.** No Wave 0 environment waiver was needed or applied; no test configuration was altered.

## Step 11 — forbidden hotspots untouched

```
git diff --name-only codex/checkpoint-v1-wave1...HEAD -- \
  AwesomeProject/src/features/task/screens/HomeScreen.tsx \
  AwesomeProject/src/features/task/hooks/useTaskExecution.ts \
  AwesomeProject/src/features/task/useTaskExecutionWithBackground.ts \
  AwesomeProject/src/features/task/services/TaskExecutionHeadless.ts \
  AwesomeProject/src/core/engine/taskEngine/task/TaskExecutionEngine.ts \
  AwesomeProject/src/features/model/services/ModelService.ts \
  AwesomeProject/src/features/capability/services/NonoConfigService.ts \
  AwesomeProject/src/shared/utils/storage.ts \
  AwesomeProject/src/navigation/AppNavigator.tsx \
  AwesomeProject/android/app/src/main/java \
  AwesomeProject/ios/AwesomeProject
```

Result: **no output** (exit 0). The checkpoint is a confirmed ancestor of HEAD.

## What was implemented

- **Unified conformance gate** (`VisualAgentAdapterConformance.test.ts`): imports the Task 7 `defineVisualAgentAdapterConformance` runner unchanged; drives all five fixtures through it with fixture-derived options; adds capability-gated variants for the cancelled terminal, failed→resume, and steer-fail-closed; asserts the built-in registry lists exactly `['openclaw','codex','cursor','dsh','hermes']`, rejects unregistered custom ids with `visual_agent_adapter_not_found`, and freezes each adapter's manifest to the exact imported manifest object.
- **Built-in registry** (`BuiltInVisualAgentToolRegistry.ts`): composes the five canonical adapters into the frozen immutable `VisualAgentToolRegistry`; no public mutable register or adapter-registry type; adapters default to an "unavailable" transport (Connector Bridge composition injects live ports later).
- **Mobile Connector Bridge proxy** (`ConnectorBridgeTransport.ts` + `ConnectorBridgeVisualAgentClient.ts`): the only mobile `VisualAgentExecutionPort`. Opens exactly `{bridgeUrl, secretRef, signal}`, carries only `VisualAgentProtocolV1`, negotiates via `session.ready` before execute, correlates task events through the shared codec's task tracker, enforces a cancel timeout via the injected `TimerPort`, rejects pending preference/cancel/connect work on disconnect, and fails closed with `visual_agent_capability_unsupported` (sending nothing) when a capability was not negotiated. No product URL/CLI/endpoint appears in mobile inputs.
- **Remote preferences** (`VisualAgentPreferenceRepository.ts`): a `PreferenceRepository` that uses only `requestPreferences` after `preferences === true`, strictly projects preference fields, and maps every remote failure / bad shape / non-negotiated state to `preference_remote_unavailable`; never caches remotely.
- **Facade + ViewState** (`VisualAgentFacade.ts`, `VisualAgentViewState.ts`): UI-narrow seam over `VisualAgentProfileController.readActiveProjection` and the execution port; delegates every task action without fallback; exposes only generic tool/profile/capability/connection data and a generic blocker — no bridge URL, secret ref, upstream protocol/config, image, frame, or stack.
- **Public barrels** (`features/{visualAgent,preference,companion,errand}/index.ts`): Visual Agent barrel re-exports the nine frozen primary contracts type-only plus manifest/run-status and the UI-narrow Facade/ViewState; the other three export only their Facade + ViewState.
- **Architecture guard** (`CapabilityDomainBoundaries.test.ts`): scans capability-owned core/feature/bridge production files and asserts: mobile modules import no product transport / bridge-adapter / React Native / storage / navigation / Screen; no legacy OpenClaw migration symbols in the capability wave; the nine primary contracts (+ manifest/run-status) are declared only in `VisualAgentContracts.ts` and re-exported type-only by the barrel; adapter dirs == manifest ids == fixture ids == registry ids == the five canonical ids; and no `OpenClawFacade` / `VisualAgentAdapterRegistry` public symbol or `features/openclaw` barrel exists.

## Self-review

- **Assumption — `ViewState.enabled` source.** `VisualAgentProfileController` (frozen, not editable in this task) exposes no global `visualAgent.enabled` getter; its read-path methods are `readActiveProjection()` and `list()`. The Facade therefore derives `enabled` from the active profile's `enabled` field (looked up via `list()`, reading only the boolean, never surfacing the raw profile). `setEnabled` still delegates verbatim to `controller.setEnabled` (the global toggle). This is a minor semantic seam between the per-profile read and the global write; it is not asserted by any test and can be tightened once the controller exposes the global flag. Flagged for the coordinator.
- **Terminal coverage.** Per resolution 2, the default loop uses the `completed` terminal (exercising steer/preferences for capable adapters); cancel and resume terminals are exercised in separate capability-gated variants so no runner call receives mutually exclusive terminals.
- **`custom:` scaling.** Registering a new custom adapter requires adding its directory, fixture import, shared-suite entry, and a registry line together; the architecture test's four-set equality fails on any mismatch, enforcing the single-change rule.
- No shared-hotspot file, adapter impl/fixture, runner, or contract was touched; `git status` confirms the 15 committed files are all new and exactly the brief's list.
- Full `tsc --noEmit` clean and full `npm test` green (588/588), so the integration surface is consistent end-to-end.

---

## Review fix pass (two Important findings)

Follow-up commit on top of `5a3bc0d`. No push/merge/rebase; new commit (not amend).

### Finding 1 — `VisualAgentViewState.enabled` must be the global flag

- Added the smallest possible `readEnabled(): Promise<boolean>` to `VisualAgentProfileController` (it already `load()`s the envelope; returns `active.visualAgent.enabled`). Coordinator-blessed because Task 12 otherwise cannot observe the global flag.
- `VisualAgentFacade.project` now reads `enabled` via `controller.readEnabled()` (in parallel with `readActiveProjection`) instead of deriving it from the active profile's per-profile `enabled`. `canExecute = enabled(global) && connection === 'ready' && activeProfile !== null`. The `list()`-based per-profile derivation was removed from `project`.
- New test (`VisualAgentFacade.test.ts`): `setEnabled(false, 7)` → returned state and a subsequent `read()` both show `enabled: false` and `canExecute: false` (stateful controller stub whose `setEnabled` flips the flag `readEnabled` returns).
- New test (`VisualAgentProfileController.test.ts`): `readEnabled()` returns `true` for the default envelope and `false` when `visualAgent.enabled` is false.

### Finding 2 — `cancel` / `requestPreferences` must reject, not throw synchronously

- `ConnectorBridgeVisualAgentClient.cancel` and `requestPreferences` are now `async` (like their siblings), so the top-of-body `assertReady()` / `assertCapability()` throws surface as Promise rejections. The frozen `VisualAgentExecutionPort` signatures are unchanged (still `Promise<...>`); `requestPreferences`'s no-session guard now `throw`s inside the async body instead of returning `Promise.reject`.
- New test (`ConnectorBridgeVisualAgentClient.test.ts`): calling `cancel` before `connect` returns a `Promise` that `.rejects.toThrow('visual_agent_not_ready')` (asserted via `.rejects`, and `expect(pending).toBeInstanceOf(Promise)` proves no synchronous throw).

### Re-run evidence

```
cd AwesomeProject && npm test -- --runInBand \
  src/__tests__/features/visualAgent/VisualAgentFacade.test.ts \
  src/__tests__/features/visualAgent/ConnectorBridgeVisualAgentClient.test.ts \
  src/__tests__/features/visualAgent/VisualAgentProfileController.test.ts \
  src/__tests__/architecture/CapabilityDomainBoundaries.test.ts \
  && npx tsc --noEmit
```

Result: **Test Suites: 4 passed, 4 total; Tests: 32 passed, 32 total; 0 failed.** `npx tsc --noEmit` → exit 0, no diagnostics.

### Files changed in this pass

- `AwesomeProject/src/features/visualAgent/application/VisualAgentProfileController.ts` (added `readEnabled`)
- `AwesomeProject/src/features/visualAgent/application/VisualAgentFacade.ts` (`project` uses `readEnabled`)
- `AwesomeProject/src/features/visualAgent/data/ConnectorBridgeVisualAgentClient.ts` (`cancel`/`requestPreferences` now `async`)
- `AwesomeProject/src/__tests__/features/visualAgent/VisualAgentFacade.test.ts`
- `AwesomeProject/src/__tests__/features/visualAgent/ConnectorBridgeVisualAgentClient.test.ts`
- `AwesomeProject/src/__tests__/features/visualAgent/VisualAgentProfileController.test.ts`
