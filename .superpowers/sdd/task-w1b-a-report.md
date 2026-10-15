# Task W1B-A Report — Provider Registry, Catalog, Runtime Config, Migration

## WorkPackageEvidence

- **baseSha (literal, 40-char):** `b10515b49d2f12c72859d4b1e025f715425ecbd1`
- **Branch:** `codex/v1-w1b-config-migration`
- **Worktree:** `/Users/a/Desktop/code/tool/a2a_ai_mobile/.worktrees/v1-w1b-config-migration`
- **Plan:** `docs/superpowers/plans/2026-08-20-v1-runtime-foundation.md` Tasks 4A + 4B

## Scope delivered

### Task 4A — Provider foundation (`operateRuntime/model/**`)
- `ModelProviderRegistry.ts` — built-in presets, `resolveExecutionTarget` (frozen `ProviderExecutionTargetV1`), transport + catalog resolution.
- `ProviderCapabilityCatalogV1.ts` (staticCatalog) — signed static capability catalog, versioned.
- `transports/` — `providerHttp.ts` shared HTTP core (HTTPS enforcement, origin/path-traversal guards, size cap, timeout, stable `provider_transport_*` error codes) + OpenAI / Anthropic / Gemini / Custom adapters.
- `ProviderModelCatalogService.ts` + `ModelCatalogCache.ts` — remote enumeration, signed-static fallback, pagination, freshness/staleness TTLs, generation-guarded cache writes (only `ready`/`empty` persisted). States: `ready | unsupported | auth_failed | network_failed | empty`.
- `model/index.ts` barrel.

### Task 4B — Runtime config, migration, visual agent (`operateRuntime/config/**`, `visualAgent/**`, `agentRuntime/config/**`)
- `RuntimeConfigRepository.ts` — one-queue serialized CAS; `compareAndActivate` proven atomic (single enqueued read-modify-write via `mutateActiveNow`); profile/binding projection; retirement staged before put, committed after config write; new-secret rollback on secure readback failure.
- `RuntimeConfigMigrationV1.ts` — transactional legacy→`RuntimeConfigEnvelopeV1` migration; profile dedup, preset-alias mapping, secure credential handling, plaintext-token rejection, OpenClaw→`VisualAgentProfileV1(toolId:'openclaw')`, rollback on write failure.
- `CredentialRetirementRepository.ts` — durable stage/commit/rollback ledger of opaque refs; never deletes a live ref inline.
- `RuntimeConfigValidation.ts`, `RuntimeConfigStorageKeys.ts`, `LegacyOpenClawBindingPort.ts`, `ConnectorBridgeLegacyOpenClawBindingClient.ts`, `operateRuntime/config/index.ts`.
- `VisualAgentToolRegistry.ts` — immutable registry with manifest/protocol conformance.
- `agentRuntime/config/RegistryModelConnectionTester.ts` — bridges legacy `ModelConnection` through `ModelProviderRegistry`; ported `AgentConfigController.ts` + `NativeLocalModelEligibilityChecker.ts`.

## Consume read-only (unmodified, not git-added)
- `operateRuntime/model/ModelProviderContracts.ts`
- `operateRuntime/visualAgent/VisualAgentContracts.ts`
- Frozen `operateRuntime/contracts/**`

Confirmed matching the plan — no BLOCKED condition.

## Verification
- **Task 4A tests:** 5 suites, 37 tests — PASS.
- **Task 4B tests:** 8 suites, 94 tests — PASS.
- **tsc:** `tsc --noEmit -p tsconfig.json` clean.
- **Secret scan:** no plaintext tokens/keys in owned sources; credentials only `secretRef: string | null`.

## Concerns / wiring notes
- Add/Edit Screens, selectors, capability Screens, existing storage helpers intentionally untouched (forbidden). UI/wiring must call new registry + `RuntimeConfigRepository`; `RegistryModelConnectionTester` is the connection-test entrypoint.
- `AppAgentConfigController` (composition wrapper) deferred — not required by brief; the single `AgentConfigController` + tester + eligibility checker satisfy the controller deliverable.
- `RuntimeConfigMigrationV1` requires host to inject a `LegacyOpenClawBindingPort` (Connector Bridge client) and secure `CredentialStore` at wire time.
