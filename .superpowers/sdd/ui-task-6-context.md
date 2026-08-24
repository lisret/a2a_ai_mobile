# UI Task 6 context

Work from: `/Users/a/Desktop/code/tool/a2a_ai_mobile/.worktrees/v1-runtime-integration`
Branch: `codex/v1-runtime-integration`
baseSha: `593cf41384dd00d0ce2d414b216bc2bb9165c55c`

This is the first serial hotspot task after Wave 3 Facades. Screens consume `useAppFacades()`, never ApplicationPorts.

## Coordinator resolutions

1. `HomeScreen` Capabilities navigation is **already** `navigate('MainTabs', {screen: 'Capabilities'})`. Keep it. Do **not** remove `DEMO_TURNS` or change task execution (UI Task 8). Task 6 Home edits are only: keep nested nav, add VisualAgentTools alias consumers if Home links OpenClaw, and update any EditModel/`modelId` navigations you touch.
2. In `createAppFacades.ts`, replace **only** `phoneOperate` and `modelConfig` production ports with live adapters. Leave operate/companion/visualAgentTools/errands/privacy/activity as `app_facade_port_not_wired`.
3. Screens call Facade methods (`getViewState`, `activateDraftMode`, `refreshCatalog`, …). The port uses `read`/`setDraft`/`activate`/`fetchCatalog`.
4. `ModelListKey` → `ModelRole` mapping happens once at the ModelConfig ApplicationPort boundary (`unified→direct`, `splitVision→vision`, `splitPlanner→split_planner`, `localPlanner→local_planner`, `companion→companion`). Repositories keep `ModelRole`.
5. Runtime pieces already exist:
   - `AsyncStorageRuntimeConfigRepository` (`operateRuntime/config/RuntimeConfigRepository.ts`) — profiles/bindings + `compareAndActivate`
   - `createModelProviderRegistry` + `AsyncStorageModelCatalogCache`
   - `NativeCredentialStore` (`agentRuntime/credentials/NativeCredentialStore.ts`)
   - `NonoConfigService` for agent-mode persistence — Screen must not import it; the phoneOperate port may
   - `LocalModelEligibility` / native eligibility for local-vision runnable/blockers
6. Do not edit: `useTaskExecution.ts`, `TaskExecutionHeadless.ts`, `TaskExecutionEngine.ts`, `ModelService.ts`, `shared/types/Model.ts` (except if a type import is required — prefer not).
7. Do not create a second `UiRuntimeContracts`. Do not add `OpenClawFacade`.
8. If Step 2 `tsc` no longer shows Home TS2769, record that as already-fixed Wave 0 evidence; still add the compile-time helper test.
9. Commit only the files listed in the brief, message `feat: wire model config and runnable mode UI`.

## Hard product rules

- Unrunnable PhoneOperate draft never activates; no “仍走云端一体” fallback copy.
- Add/Edit never rehydrate plaintext. Edit starts at `keep`. Catalog every status keeps `testID="manual-model-id"`.
- Preset order: OpenAI, Anthropic, Gemini, DeepSeek, xAI, 百炼 Qwen, 智谱, Kimi, MiniMax, 火山 Doubao, ModelScope（兼容）.
- Custom fields must not be filled with default OpenAI protocol/auth/paths.
