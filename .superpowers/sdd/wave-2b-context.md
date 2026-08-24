# Wave 2B adapter context (frozen; do not widen)

baseSha / `codex/checkpoint-v1-wave2a` = `a5e36ddec7635a2aa4406ee6bda4852b742d9c93`

## Already exists — consume, do not edit

- `@core/engine/operateRuntime/visualAgent/VisualAgentContracts.ts` — nine frozen names + validators
- `@core/engine/operateRuntime/visualAgent/VisualAgentToolRegistry.ts`
- `AwesomeProject/src/connectorBridge/visualAgent/ports/VisualAgentUpstreamPort.ts`
  - `VisualAgentUpstreamPort.open({protocol, binding, signal})`
  - `VisualAgentBindingPort.read(bindingId, toolId)`
  - protocols include `gateway_ws`, `cli_exec_jsonl`, `agent_cli_ndjson`, `acp_json_rpc_stdio`, `app_server_json_rpc_stdio`, `gateway_json_rpc_stdio`, `gateway_json_rpc_ws`, `cloud_agents_http`, `runs_http_sse`, `dsh_cli`, `custom_bridge`
- `AwesomeProject/src/connectorBridge/visualAgent/conformance/VisualAgentAdapterConformance.ts`
  - export `defineVisualAgentAdapterConformance(fixture, options)`
  - fixture must supply `adapter`, `profile`, `binding`, `upstream`, `supportedCapabilities`, `fallbackSpy.callCount()`, and emit helpers
  - options: `{requiredStatuses, negotiatedCapabilities}`
- `AwesomeProject/src/connectorBridge/visualAgent/protocol/VisualAgentProtocolCodec.ts`
  - `encodeVisualAgentMessage` / `decodeVisualAgentMessage` / `createVisualAgentProtocolTaskTracker`
- `CapabilityError` from `@core/engine/capabilities/shared/CapabilityError` — throw this; `error.message`/`error.code` equals the generic code
- `TimerPort` from `@core/engine/capabilities/shared/CapabilityPorts` — `{schedule(handler, delayMs): () => void}`

## Profile connector (already frozen)

```ts
profile.connector = {kind: 'connector_bridge', bridgeUrl, bindingId, secretRef}
```

Adapter-specific gateway/CLI/ACP/HTTP settings live only in the Bridge binding addressed by `bindingId`. Do not add those fields onto `VisualAgentProfileV1`.

## Hard rules

- Mobile never spawns `codex`/`cursor-agent`/`dsh`/`hermes` or opens a product Gateway. All IO goes through injected `VisualAgentUpstreamPort`.
- Requested capability `true` + negotiated `false` → throw `visual_agent_capability_unsupported` before `execute`.
- `imageInput` and `structuredAction` must be true to activate an operation profile in tests that require them.
- Disconnect / protocol error → generic codes only; `fallbackSpy` must stay at 0.
- Do not edit another adapter directory, frozen contracts, the shared conformance runner, UI/screens, or shared-hotspot files.
- Do not create `VisualAgentAdapterConformance.test.ts` (Task 12 owns the aggregate suite).
- Your unit tests MUST call `defineVisualAgentAdapterConformance` against your own fixture.
- Commit only the files listed in your brief. Do not push, merge, or rebase the integration branch.
- Record `WorkPackageEvidence` in the report (`baseSha` must equal `a5e36ddec7635a2aa4406ee6bda4852b742d9c93`).

## Jest / deps

`AwesomeProject/node_modules` is already symlinked. Run tests from `AwesomeProject/` with `--runInBand`. Also run `npx tsc --noEmit`.
