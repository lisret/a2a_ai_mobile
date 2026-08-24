# Task 2: Freeze the V1 Runtime + UI Contract Checkpoint

Work from: `/Users/a/Desktop/code/tool/a2a_ai_mobile/.worktrees/v1-runtime-integration`
Branch: `codex/v1-runtime-integration` (do not switch branches)
Current HEAD before your first edit must remain the Task 0 checkpoint: `4f54dc7c1ad3e385208802ad14fe3a6b1e5bb2ed`

This is Wave 0 serial coordinator work. You create **pure TypeScript contracts, validators, and contract tests only**.

## Required reading (copy interfaces verbatim)

1. Master Task 2: `docs/superpowers/plans/2026-08-20-v1-complete-parallel-delivery.md` heading `### Task 2: Establish the Contract Checkpoint`
2. UI Task 1 exact block: `docs/superpowers/plans/2026-08-20-v1-ui-integration-and-acceptance.md` heading `### Task 1: Freeze UI Facade, ViewState, and Event Contracts` — copy the entire ` ```ts ` block into `AwesomeProject/src/application/facades/UiRuntimeContracts.ts` and the exact test into `AwesomeProject/src/__tests__/application/facades/UiRuntimeContracts.test.ts`
3. Model contracts: `docs/superpowers/plans/2026-08-20-v1-runtime-foundation.md` Task 4A `Produces` ts block → `AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderContracts.ts`
4. Visual + runtime config contracts: same file Task 4B `Produces` ts block (`VisualAgent*` through `CredentialRetirementRepository`) → split as specified below
5. Session contracts: same file Task 6 `Produces` ts block (`ResolvedOperateSessionV1` and related interfaces only; **do not** implement `CredentialReferenceGarbageCollector` class body)
6. CredentialStore interface only: same file Task 2 `export interface CredentialStore { ... }`
7. Task event base: same file Task 7 `OperateTaskEventBase`
8. Frozen AgentConfigV2 and agentRuntime ports: copy **only** these donor files from `/private/tmp/a2a_ai_mobile-agent-runtime-phase1` at `ce9e4a611b88d15ecba93fc83bbcab04f0b2b83b`:
   - `AwesomeProject/src/core/engine/agentRuntime/contracts/AgentContracts.ts`
   - `AwesomeProject/src/core/engine/agentRuntime/contracts/PlannerPayload.ts`
   - `AwesomeProject/src/core/engine/agentRuntime/domain/AgentTypes.ts`
   - `AwesomeProject/src/core/engine/agentRuntime/domain/AgentConfigState.ts`
   - `AwesomeProject/src/core/engine/agentRuntime/domain/AgentConfigValidation.ts`
   - `AwesomeProject/src/core/engine/agentRuntime/domain/AgentConfigMigration.ts`
   - `AwesomeProject/src/core/engine/agentRuntime/domain/index.ts`
   If a donor domain file imports React Native, AsyncStorage, or a provider implementation, stop and report BLOCKED. Domain files must stay pure.

## Exact output files

Create:

- `AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderContracts.ts`
- `AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts`
- `AwesomeProject/src/core/engine/operateRuntime/contracts/RuntimeConfigContracts.ts` (RuntimeRouteConfigV1, RuntimeConfigEnvelopeV1, RuntimeConfigRepository with `compareAndActivate`, CredentialRetirement* interfaces)
- `AwesomeProject/src/core/engine/operateRuntime/contracts/OperateSessionContracts.ts` (Resolved* session types, OperateSessionLease; no collector class implementation)
- `AwesomeProject/src/core/engine/operateRuntime/contracts/CredentialStore.ts` (interface only)
- `AwesomeProject/src/core/engine/operateRuntime/contracts/TaskExecutionContracts.ts` (`OperateTaskEventBase` plus `TaskExecutionEvent` as the frozen task event identity: every event has `taskId`, `sessionRevision`, `sequence`)
- `AwesomeProject/src/core/engine/operateRuntime/contracts/index.ts` (re-export the contract modules)
- `AwesomeProject/src/application/facades/UiRuntimeContracts.ts`
- `AwesomeProject/src/__tests__/application/facades/UiRuntimeContracts.test.ts` (exact UI-plan test)
- `AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelProviderContracts.test.ts` (validators + union rules)
- `AwesomeProject/src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentContracts.test.ts` (validators + eight capability booleans + `toolId:'openclaw'` only for legacy)
- `AwesomeProject/src/__tests__/architecture/RuntimeContractBoundaries.test.ts`
- `.superpowers/sdd/v1-runtime-contract-checkpoint.md`

Also add the donor `agentRuntime/contracts` and `agentRuntime/domain` files listed above.

## Hard rules

- Envelope field is `visualAgent`, never `openClaw`. Legacy OpenClaw is only `toolId: 'openclaw'`.
- Model profile mode is only `preset | custom`.
- Credentials in contracts are `secretRef: string | null` only. No `apiKey` fields.
- Implement the named validators (`validateModelEndpointProfileV1`, `validateModelBindingV1`, `validateVisualAgentCapabilitySet`, `validateVisualAgentProfileV1`) as pure functions. Reject invalid shapes with stable error codes. Do not persist, fetch, or touch native modules.
- `RuntimeConfigRepository.compareAndActivate(expectedRevision, mutation)` must exist on the interface.
- Do **not** add provider transports, tool adapters, repositories, composition roots, Screens, native files, or persistence implementations.
- Contract files must import no React, React Native, AsyncStorage, navigation, native module, Screen, or provider implementation.
- Follow TDD: write failing tests first, then contracts/validators.
- Do not edit shared hotspots (`HomeScreen.tsx`, ModelService, storage, native registration, etc.).
- Do not commit the copied `docs/superpowers/**` plan files or `.superpowers/sdd/progress.md`.

## RuntimeContractBoundaries.test.ts must prove

1. The frozen contract files exist and export the named types/interfaces/functions.
2. `RuntimeConfigEnvelopeV1` has `schemaVersion`, `revision`, `active`, `draft`; `active.visualAgent` exists; scanning those contract files for `openClaw` as a persisted field name fails (allow `openclaw` only as a `toolId` literal).
3. `RuntimeConfigRepository` includes `compareAndActivate`.
4. Reading each contract production file as text, none import `react`, `react-native`, `@react-native-async-storage`, navigation, or `NativeModules`.
5. `CredentialStore` / profile / session types never include `apiKey`.

## Verification (must pass)

```bash
cd AwesomeProject
npx jest --runInBand src/__tests__/architecture/RuntimeContractBoundaries.test.ts
npx jest --runInBand src/__tests__/application/facades/UiRuntimeContracts.test.ts
npx jest --runInBand src/__tests__/core/engine/operateRuntime/model/ModelProviderContracts.test.ts
npx jest --runInBand src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentContracts.test.ts
npx tsc --noEmit
```

Also run:

```bash
git diff --name-only 9ff7ba4cc4dc186b79b6e62181333ae6c9132f54...HEAD
```

Record the public signatures and that file list in `.superpowers/sdd/v1-runtime-contract-checkpoint.md`.

## Commit (exactly these commands after GREEN)

```bash
git add AwesomeProject/src/core/engine/agentRuntime/contracts AwesomeProject/src/core/engine/agentRuntime/domain AwesomeProject/src/core/engine/operateRuntime/contracts AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderContracts.ts AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts AwesomeProject/src/application/facades/UiRuntimeContracts.ts AwesomeProject/src/__tests__/architecture AwesomeProject/src/__tests__/application/facades/UiRuntimeContracts.test.ts AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelProviderContracts.test.ts AwesomeProject/src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentContracts.test.ts .superpowers/sdd/v1-runtime-contract-checkpoint.md
git commit -m "feat: freeze V1 runtime contracts"
git branch codex/checkpoint-v1-contracts
```

Expected: `git rev-parse codex/checkpoint-v1-contracts` equals `git rev-parse HEAD`. Do not rebase or advance that checkpoint after creating it.

## Report

Write the full report to `.superpowers/sdd/task-2-report.md` including RED/GREEN commands and outputs, files changed, and WorkPackageEvidence fields (`workPackage`, `baseSha`, `commitSha`, `ownedFiles`, `changedContracts`, `redCommands`, `greenCommands`, `manualChecks`, `knownGaps`, `rollbackCommit`).
