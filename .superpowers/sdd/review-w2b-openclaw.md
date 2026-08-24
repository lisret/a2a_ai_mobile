# Review: Task 9 — OpenClaw Gateway WebSocket Adapter (Wave 2B Worker A)

**Base:** `a5e36ddec7635a2aa4406ee6bda4852b742d9c93`
**Head:** `f143dfb3c4bb5cab85c940281d687da4e35a23ef`
**Diff reviewed:** `.superpowers/sdd/review-w2b-openclaw.diff` (4 new files, 1109 insertions, 0 deletions/modifications)

## Scope check

Files touched exactly match the brief's file list, with no edits to any pre-existing file:

- `AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw/OpenClawAdapter.ts` (new)
- `AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw/OpenClawBinding.ts` (new)
- `AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw/conformanceFixture.ts` (new)
- `AwesomeProject/src/__tests__/connectorBridge/visualAgent/openclaw/OpenClawAdapter.test.ts` (new)

No frozen contracts, other adapter directories, the shared conformance runner, `VisualAgentUpstreamPort.ts`, UI, or protocol codec were touched. No `VisualAgentAdapterConformance.test.ts` was created — the required test file calls `defineVisualAgentAdapterConformance(fixture, options)` directly against a locally owned `createOpenClawConformanceFixture()`. Scope is clean.

## Interface conformance (cross-checked against frozen contracts read directly from the worktree)

- `OpenClawBindingV1` matches the brief's literal type verbatim (`schemaVersion: 1`, `toolId: 'openclaw'`, `protocol: 'gateway_ws'`, `gatewayUrl/deviceId/cluster: string`, `secretRef: string | null`).
- `OpenClawAdapter` matches the brief's class shape: `toolId = 'openclaw' as const`, `manifest`, `constructor(bindings, upstream, timer)`, `create(profile): VisualAgentExecutionPort`.
- `toOpenClawUpstreamBinding` sanitizes to exactly `{gatewayUrl, deviceId, cluster, secretRef}` before calling `VisualAgentUpstreamPort.open(...)` — matches the "Consumes" line and the "sanitized binding" hard rule.
- `conformanceFixture.ts` implements every field of the frozen `VisualAgentAdapterConformanceFixture` interface (`toolId, adapter, profile, binding, upstream, supportedCapabilities, fallbackSpy, emitStatus/Approval/Delta/Completed/Failed/Cancelled/Disconnect`) with no extra/missing members.
- `openClawManifest.protocolVersions = [1]` and non-empty `adapterVersion` satisfy `assertManifest` in the frozen conformance runner.

## Global-constraint verification

| Constraint | Verdict |
|---|---|
| Only talks to injected `VisualAgentUpstreamPort`; no real WS/process | **PASS** — only imports are frozen contract types + `CapabilityError`; no `ws`/`child_process`/`fetch` anywhere in the file. |
| Requested `true` + negotiated `false` → throw `visual_agent_capability_unsupported` before execute/send | **PASS** — `computeGrantedCapabilities` throws inside `connect()`, before `ready`, for every one of the 8 capability keys uniformly (not just `imageInput`). Session is closed and state set to `failed` before rethrow. |
| Public errors are generic `CapabilityError` codes only; never echo upstream frames/URLs/tokens/images/Error/stack | **MOSTLY PASS, one gap** — every `catch` around `upstream.open`, `session.negotiate`, and `session.send` discards the original error object entirely (bare `catch {}`) before throwing a fixed-code `CapabilityError`. The explicit "auth failure" test injects a secret + URL into the rejected error and asserts only the generic code surfaces. **Gap:** `bindings.read(...)` in `connect()` is awaited with no surrounding `try/catch`, so if the binding port rejects, the raw rejection (not a `CapabilityError`) propagates to the caller unmodified, and the connection state is left at `connecting` instead of transitioning to `failed`. See Important finding below. |
| Image input + structured action required for operation activation; disconnect/protocol failure make zero local-pipeline calls | **PASS (scope-appropriate)** — there is no local-pipeline/fallback code path in this file at all (`fallbackSpy.callCount()` is hardcoded to `0`, nothing to spy on). Enforcing "image+structuredAction required to activate an operation profile" is a runtime/caller-level concern outside this adapter's brief; not applicable here. |
| Unsupported approval/steer/resume/streaming stays unsupported, not fabricated | **PASS** — `resolveApproval`, `resume`, and `steer` all call `assertCapability(...)` and throw before sending when the capability wasn't granted. `stream` (and every other capability) is gated identically to `imageInput` through the uniform `computeGrantedCapabilities` intersection at connect-time, so a caller that didn't request `stream` never gets a "ready" session promising it. |
| Envelope field is `visualAgent`; legacy OpenClaw only as `toolId: 'openclaw'` | **PASS** — no `openclaw`-specific error codes or protocol names were introduced; `toolId` is the only OpenClaw-specific literal, matching the frozen `CapabilityError.ts` comment ("No `openclaw_*` code is introduced"). |
| Profile connector stores only `{bridgeUrl, bindingId, secretRef}`; adapter settings stay in the binding | **PASS** — `gatewayUrl/deviceId/cluster` live solely in `OpenClawBindingV1`, read via `bindings.read(bindingId, 'openclaw')`; `VisualAgentProfileV1` is never extended. |
| Unit tests must call `defineVisualAgentAdapterConformance`; no `VisualAgentAdapterConformance.test.ts` | **PASS** — confirmed above. |
| Commit scope limited to `adapters/openclaw/**` + matching test file | **PASS** — confirmed above. |

## Brief-specific checks

- Both literal example tests from the brief's Step 1 are present verbatim in behavior: task.start/task.cancel correlation, and capability-unsupported on missing `imageInput`.
- Binding validation matches "Validate only `wss:` URL, nonempty device/cluster and opaque ref": `parseOpenClawBindingV1` checks `new URL(value).protocol === 'wss:'`, non-empty `deviceId`/`cluster`, and `secretRef` is `null` or a non-empty string. A dedicated test confirms `upstream.open` is never called for a non-`wss:` URL.
- "Authenticate before ready" / "map Gateway accepted/event/completed/failed/cancelled" / "require heartbeat acknowledgment" / "reject all pending requests on disconnect" are all implemented and each has a corresponding test (auth-failure mapping, heartbeat ack, disconnect-rejects-pending-preferences).
- "Preference and steer operations are enabled only if Gateway negotiation explicitly returns the corresponding capability" — implemented via `assertCapability` before any `send`, with tests confirming `session.send` is never called in the gated case.

## Conformance-suite trace (manual, since I did not re-run the suite)

I traced `defineVisualAgentAdapterConformance` (read directly from the frozen file) against the OpenClaw fixture step by step: manifest assertions, capability-subset assertion (all 8 keys requested/negotiated/supported = true, so the "must be false" branch is never exercised but is trivially satisfied), sequence-monotonicity, queued/running/waiting_approval status correlation, delta correlation, terminal-completed (since `requiredStatuses` excludes `cancelled`/`failed`), steer, and `requestPreferences` (resolved via the fixture's mock `send` that synthesizes a `preference.result` through the *same* subscribed listener used for `gateway.disconnected`/heartbeats — this is a distinct subscription from the test's own `port.subscribe()`, so calling `unsubscribe()` on the public event listener before `emitDisconnect()` does not prevent the adapter's internal upstream-message handler from receiving and acting on the disconnect). The trace is internally consistent with the adapter implementation; no logic gap was found that would make the claimed "10 passed" implausible.

I did not execute `npm test`/`npx tsc --noEmit` myself (per review instructions). I did run the IDE's static linter against both new directories and confirmed **no linter errors**, corroborating the report's `ReadLints` claim.

## Findings

### Critical
None.

### Important
1. **Unwrapped `bindings.read()` rejection in `connect()`.** `OpenClawExecutionPort.connect()` awaits `this.bindings.read(...)` with no `try/catch`. Every other failure surface in `connect()` (`upstream.open`, `session.negotiate`, capability negotiation) is caught and remapped to a generic `CapabilityError`, and the connection state is set to `failed`. A rejection from the binding port is neither remapped nor does it move the state out of `connecting`. This is a real (if narrow) gap against the explicit "public errors expose only stable generic CapabilityError codes; never echo ... Error, or stack" constraint — if the binding store ever rejects with a raw `Error`, that raw error (and its stack) would reach the caller directly. No test exercises a rejecting `bindings.read`. Recommend wrapping this call the same way the other two are wrapped (e.g., to `visual_agent_invalid_profile` or a new/existing generic code) and setting `state = {status: 'failed', ...}` on that path too.

### Minor
1. **Report overstates heartbeat-watchdog reset behavior.** The task report states the watchdog resets on "heartbeat/message," but the code only calls `scheduleHeartbeatTimeout()` from the `gateway.heartbeat` case in `handleUpstreamMessage`; other inbound messages (`task.event`, `task.completed`, etc.) do not reset it. Not a spec violation (the brief only requires heartbeat acknowledgment), but the report's self-description doesn't match the code exactly.
2. **`requestPreferences` only checks `signal.aborted` at call time**, with no listener attached for a later abort while the request is still pending (it can only resolve/reject via a matching `preference.result` or a Gateway disconnect). This matches the report's disclosed "no request-level timeout" limitation but is slightly broader than disclosed — a caller aborting mid-flight also won't unblock the promise. Low risk since this is an internal-only signal-handling nuance, not a public-error-hygiene issue.
3. **Malformed `task.completed`/status messages are silently dropped** (`emitTerminalCompleted` requires `message.result` to be an object, `correlated()` requires `taskId`/`sessionRevision`/`sequence`; if any check fails the event is dropped with no event emitted and no error surfaced). Defensive-by-design against a malformed/compromised Gateway, but in a real disconnection-free scenario this could leave a task hung with no terminal event ever emitted to subscribers. Not exercised by any test; flagged for awareness only, not a spec violation.

## ⚠️ Cannot verify
- Actual `npm test -- --runInBand src/__tests__/connectorBridge/visualAgent/openclaw/OpenClawAdapter.test.ts` execution and its "10 passed" result (did not re-run per instructions; manual trace found no contradiction).
- Actual `npx tsc --noEmit` clean-exit claim (did not re-run per instructions).
