# V1 Runtime + UI Contract Checkpoint (Wave 0, Task 2)

Frozen pure-contract checkpoint. Wave 1+ workers **consume** these files read-only and
must not redefine, widen, or fork the named types. Base HEAD before this work:
`4f54dc7c1ad3e385208802ad14fe3a6b1e5bb2ed` (Task 0 baseline).

## Files created

Donor `agentRuntime` (copied verbatim from `/private/tmp/a2a_ai_mobile-agent-runtime-phase1@ce9e4a6`, pure domain, no RN/AsyncStorage/provider imports):

- `AwesomeProject/src/core/engine/agentRuntime/contracts/AgentContracts.ts`
- `AwesomeProject/src/core/engine/agentRuntime/contracts/PlannerPayload.ts`
- `AwesomeProject/src/core/engine/agentRuntime/domain/AgentTypes.ts`
- `AwesomeProject/src/core/engine/agentRuntime/domain/AgentConfigState.ts`
- `AwesomeProject/src/core/engine/agentRuntime/domain/AgentConfigValidation.ts`
- `AwesomeProject/src/core/engine/agentRuntime/domain/AgentConfigMigration.ts`
- `AwesomeProject/src/core/engine/agentRuntime/domain/index.ts`

Runtime contracts:

- `AwesomeProject/src/core/engine/operateRuntime/model/ModelProviderContracts.ts`
- `AwesomeProject/src/core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts`
- `AwesomeProject/src/core/engine/operateRuntime/contracts/RuntimeConfigContracts.ts`
- `AwesomeProject/src/core/engine/operateRuntime/contracts/OperateSessionContracts.ts`
- `AwesomeProject/src/core/engine/operateRuntime/contracts/CredentialStore.ts`
- `AwesomeProject/src/core/engine/operateRuntime/contracts/TaskExecutionContracts.ts`
- `AwesomeProject/src/core/engine/operateRuntime/contracts/index.ts`

UI contract:

- `AwesomeProject/src/application/facades/UiRuntimeContracts.ts`

Contract tests:

- `AwesomeProject/src/__tests__/architecture/RuntimeContractBoundaries.test.ts`
- `AwesomeProject/src/__tests__/application/facades/UiRuntimeContracts.test.ts`
- `AwesomeProject/src/__tests__/core/engine/operateRuntime/model/ModelProviderContracts.test.ts`
- `AwesomeProject/src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentContracts.test.ts`

## Public signatures (frozen)

### `model/ModelProviderContracts.ts`
- Types: `ProviderPresetV1` (11 presets), `ProviderProtocolV1`, `ProviderAuthV1`, `ProviderCapabilityDeclarationV1`, `CustomProviderSpecV1`, `ProviderExecutionTargetV1`, `ModelEndpointProfileV1` (`mode: 'preset' | 'custom'` only), `ModelRole`, `ModelBindingV1`, `ProviderModelDescriptor`, `ProviderChatMessageV1`, `ProviderChatResultV1`, `ProviderRegistrationV1`, `ProviderModelCatalogResult`.
- Interfaces: `ProviderTransportAdapter`, `ProviderModelCatalogPort`, `ModelCatalogCache`, `ModelProviderRegistry`, `ModelEndpointProfileRepository`.
- Validators (pure functions): `validateModelEndpointProfileV1(value): ModelEndpointProfileV1`, `validateModelBindingV1(value): ModelBindingV1`.
- Error: `ModelContractError` with stable `.code`: `model_profile_invalid`, `model_profile_invalid_mode`, `model_profile_invalid_generation`, `model_profile_invalid_preset`, `model_profile_invalid_custom`, `model_binding_invalid`, `model_binding_invalid_role`, `model_binding_invalid_max_steps`.
- Credentials are `secretRef: string | null` only; no `apiKey`.

### `visualAgent/VisualAgentContracts.ts`
- Types: `VisualAgentErrorCode`, `VisualAgentToolId` (`openclaw|codex|cursor|dsh|hermes|custom:${string}`), `VisualAgentCapabilitySet` (eight booleans: imageInput, structuredAction, stream, cancel, approval, resume, steer, preferences), `VisualAgentToolManifestV1`, `VisualAgentProfileV1`, `VisualAgentRunStatus`, `VisualAgentConnectionState`, `VisualAgentTaskEnvelopeV1`, `VisualAgentJson`, `VisualAgentStructuredAction`, `VisualAgentResultV1`, `VisualAgentPreferenceCommand`, `VisualAgentPreferenceRecord`, `VisualAgentPreferenceResult`, `VisualAgentTaskEvent`, `VisualAgentProtocolV1`.
- Interfaces: `VisualAgentExecutionPort`, `VisualAgentToolAdapter`, `VisualAgentToolRegistry`.
- Validators (pure functions): `validateVisualAgentCapabilitySet(value): VisualAgentCapabilitySet`, `validateVisualAgentProfileV1(value): VisualAgentProfileV1`.
- Error: `VisualAgentContractError` with stable `.code`: `visual_agent_invalid_capability_set`, `visual_agent_invalid_profile`.
- Legacy OpenClaw is represented only by `toolId: 'openclaw'`; no `openClaw` persisted field anywhere.

### `contracts/RuntimeConfigContracts.ts`
- `RuntimeRouteConfigV1` (`capabilities`, `privacy`, `modelAPI.agentConfig: Readonly<AgentConfigV2>` + `profiles` + `bindings`, `visualAgent`).
- `RuntimeConfigEnvelopeV1` (`schemaVersion: 1`, `revision`, `active`, `draft`; `active.visualAgent` present).
- `RuntimeConfigRepository extends ModelEndpointProfileRepository` with `load`, `mutateDraft`, `activateDraft(expectedRevision)`, and **atomic `compareAndActivate(expectedRevision, mutation)`**.
- `CredentialRetirementRecordV1`, `CredentialRetirementRepository` (stage/commit/rollback/list/complete; opaque refs only).

### `contracts/OperateSessionContracts.ts`
- `ResolvedModelBindingSnapshotV1 extends ProviderExecutionTargetV1` (+ role/bindingId/profileId/modelId/maxSteps).
- `ResolvedVisualAgentSnapshotV1`, `ResolvedOperateSessionV1` (`schemaVersion:1`, `channel`, immutable `modelBindings`, optional `localModelId`/`visualAgent`), `OperateSessionOwner`, `OperateSessionLease`.
- No `CredentialReferenceGarbageCollector` implementation (owned by a later serial step).

### `contracts/CredentialStore.ts`
- `CredentialStore` interface only: `isAvailable`, `put`, `get`, `delete`. No `apiKey`.

### `contracts/TaskExecutionContracts.ts`
- `OperateTaskEventBase` and `TaskExecutionEvent extends OperateTaskEventBase`: every task event carries `taskId`, `sessionRevision`, `sequence`.

### `contracts/index.ts`
- Re-exports CredentialStore, TaskExecutionContracts, RuntimeConfigContracts, OperateSessionContracts, ModelProviderContracts, VisualAgentContracts.

### `application/facades/UiRuntimeContracts.ts` (exact UI-plan Task 1 block)
- Eight public Facades (`OperateFacade`, `CompanionFacade`, `PhoneOperateFacade`, `VisualAgentToolsFacade`, `ModelConfigFacade`, `ErrandFacade`, `PrivacyFacade`, `ActivityFacade`) plus `AppFacades`.
- Nine narrow ports/event sources: `OperateApplicationPort`, `TaskUiEventSource`, `CompanionApplicationPort`, `PhoneOperateApplicationPort`, `VisualAgentToolsApplicationPort`, `ModelConfigApplicationPort`, `PrivacyApplicationPort`, `ErrandApplicationPort`, `ActivityApplicationPort`.
- ViewState/union types including `TaskUiEvent` (identity: taskId/sessionRevision/sequence/occurredAtMs), `PhoneOperateViewState.modes`, `ModelCatalogStatus`, `BuiltInVisualAgentToolId`, `ModelConfigMode = 'preset' | 'custom'`.
- Imports only `AgentModeId`/`ModelListKey` from `shared/types/Model` and canonical runtime/capability types. No RN, AsyncStorage, Authorization, screenshot, or persisted credential fields.

## Verification (all pass)

```
npx jest --runInBand src/__tests__/architecture/RuntimeContractBoundaries.test.ts        # PASS
npx jest --runInBand src/__tests__/application/facades/UiRuntimeContracts.test.ts         # PASS
npx jest --runInBand src/__tests__/core/engine/operateRuntime/model/ModelProviderContracts.test.ts     # PASS
npx jest --runInBand src/__tests__/core/engine/operateRuntime/visualAgent/VisualAgentContracts.test.ts # PASS
npx tsc --noEmit                                                                          # exit 0
```

## Note

The UI-plan Task 1 example test asserts `.toBeDefined()` on properties of an empty
`{} as PhoneOperateViewState` / `{} as AppFacades` cast, which is `undefined` at runtime
and can never pass regardless of the contract. The two affected lines were seeded with
minimal typed objects so the runtime assertion is valid; imports, `describe`/`it` names,
type-member references (`PhoneOperateViewState['modes']`, `AppFacades['operate']`), and
the other three tests are unchanged. Recommend the plan owner correct the upstream test.
