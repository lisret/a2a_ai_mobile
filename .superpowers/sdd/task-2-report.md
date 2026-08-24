# Task 2 Report: Freeze the V1 Runtime + UI Contract Checkpoint

**Status:** DONE_WITH_CONCERNS

## Summary

Froze the pure runtime and UI contract checkpoint for Wave 0. Created the model,
visual-agent, runtime-config, session, credential-store, and task-event contracts plus the
exact UI facade/ViewState/port contract, copied the 7 pure donor `agentRuntime` files, and
added four contract tests. Implemented the four named validators as pure functions with
stable, ref-free error codes. All required verification commands pass and TypeScript is
clean. Committed and created the immutable `codex/checkpoint-v1-contracts` branch.

## Commit

- `4a703e3` feat: freeze V1 runtime contracts
- Branch `codex/checkpoint-v1-contracts` == HEAD (`4a703e3`), parent `4f54dc7` (Task 0 baseline).

## RED evidence

Command:
```
npx jest --runInBand \
  src/__tests__/architecture/RuntimeContractBoundaries.test.ts \
  src/__tests__/application/facades/UiRuntimeContracts.test.ts \
  src/__tests__/core/engine/operateRuntime/model/ModelProviderContracts.test.ts \
  src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentContracts.test.ts
```
Output: `Test Suites: 4 failed, 4 total` — architecture/model/visual suites failed with
`Cannot find module ... ModelProviderContracts / VisualAgentContracts / contracts`; the UI
suite (type-only imports) loaded and failed only the plan's own `state.modes` assertion.

## GREEN evidence

- `npx jest --runInBand <all four suites>` → `Test Suites: 4 passed, 4 total`, `Tests: 50 passed`.
- `npx tsc --noEmit` → exit 0 (whole project).
- Purity scans clean: `UiRuntimeContracts.ts` has no `react-native|AsyncStorage|apiKey|Authorization|screenshot|modelResponse`; no contract file imports `react`/`react-native`/AsyncStorage/navigation/`NativeModules`; no `openClaw` persisted field; no `apiKey` under `operateRuntime`.

## Files changed (this commit — 20 files)

Contracts (production):
- `core/engine/operateRuntime/model/ModelProviderContracts.ts`
- `core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts`
- `core/engine/operateRuntime/contracts/{RuntimeConfigContracts,OperateSessionContracts,CredentialStore,TaskExecutionContracts,index}.ts`
- `application/facades/UiRuntimeContracts.ts`

Donor `agentRuntime` (pure, verbatim from `ce9e4a6`):
- `agentRuntime/contracts/{AgentContracts,PlannerPayload}.ts`
- `agentRuntime/domain/{AgentTypes,AgentConfigState,AgentConfigValidation,AgentConfigMigration,index}.ts`

Tests:
- `__tests__/architecture/RuntimeContractBoundaries.test.ts`
- `__tests__/application/facades/UiRuntimeContracts.test.ts`
- `__tests__/core/engine/operateRuntime/model/ModelProviderContracts.test.ts`
- `__tests__/core/engine/operateRuntime/visualAgent/VisualAgentContracts.test.ts`

Record:
- `.superpowers/sdd/v1-runtime-contract-checkpoint.md`

## WorkPackageEvidence

- **workPackage:** wave-0-task-2-contract-checkpoint
- **baseSha:** `4f54dc7c1ad3e385208802ad14fe3a6b1e5bb2ed`
- **commitSha:** `4a703e3bb4baa39db859fed5467c4924702acec8`
- **ownedFiles:** the 20 files listed above (donor `agentRuntime/{contracts,domain}`, `operateRuntime/{contracts,model/ModelProviderContracts.ts,visualAgent/VisualAgentContracts.ts}`, `application/facades/UiRuntimeContracts.ts`, the four contract tests, and `.superpowers/sdd/v1-runtime-contract-checkpoint.md`)
- **changedContracts:** ModelProviderContracts (+validators/`ModelContractError`), VisualAgentContracts (+validators/`VisualAgentContractError`), RuntimeConfigContracts (`RuntimeConfigEnvelopeV1`, `RuntimeConfigRepository.compareAndActivate`, CredentialRetirement*), OperateSessionContracts (Resolved*, `OperateSessionLease`), CredentialStore, TaskExecutionContracts (`OperateTaskEventBase`, `TaskExecutionEvent`), UiRuntimeContracts (8 Facades + 9 ports + ViewState/`TaskUiEvent`)
- **redCommands:** `npx jest --runInBand <four suites>` (module-not-found failures)
- **greenCommands:** `npx jest --runInBand <four suites>`; `npx tsc --noEmit`
- **manualChecks:** forbidden-token scan on `UiRuntimeContracts.ts`; forbidden-import scan across contract files; `openClaw` persisted-field scan; `apiKey` scan under `operateRuntime`; `git rev-parse codex/checkpoint-v1-contracts == HEAD`; confirmed no `docs/superpowers/**` or `progress.md` in commit
- **knownGaps:** see Concerns
- **rollbackCommit:** `4f54dc7c1ad3e385208802ad14fe3a6b1e5bb2ed`

## Concerns

1. **Plan's exact UI test contains a runtime-invalid assertion.** UI-plan Task 1's example
   test does `const state = {} as PhoneOperateViewState; expect(state.modes).toBeDefined();`
   (and the same for `facade.operate`). An empty cast object has `undefined` at those keys,
   so `.toBeDefined()` can never pass regardless of the frozen contract (verified: only that
   one assertion failed with correct contracts in place). To keep the checkpoint GREEN for
   every downstream wave, those two lines were seeded with minimal typed objects
   (`{modes: {} as PhoneOperateViewState['modes']} as PhoneOperateViewState`, likewise for
   `operate`). Imports, `describe`/`it` names, the type-member references, and the other
   three tests are byte-identical to the plan. Recommend the plan owner fix the upstream
   assertion. This is the only deviation from a verbatim copy.

2. **`TaskExecutionEvent` shape was under-specified by the plan.** The brief names it as "the
   frozen task event identity: every event has taskId, sessionRevision, sequence" but no plan
   block defines its members. Implemented minimally as
   `interface TaskExecutionEvent extends OperateTaskEventBase { readonly type: string }`,
   guaranteeing the three identity fields while leaving concrete event unions to later waves.

3. **Validator error codes were not enumerated by the plan.** The plan requires "stable error
   codes" but does not list them for the four validators. Chose stable, ref-free codes
   (documented in the checkpoint md and asserted by the tests): `model_profile_invalid*`,
   `model_binding_invalid*`, `visual_agent_invalid_capability_set`, `visual_agent_invalid_profile`.

4. **`LegacyOpenClawBindingPort` / `ConnectorBridgeLegacyOpenClawBindingClient` intentionally
   omitted.** They appear inside the Task 4B `Produces` block but are not in the brief's exact
   output-file list, and the client is an implementation (forbidden here). They will be created
   by the Wave-1B config worker.
