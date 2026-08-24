# Review: Capability-domain Task 12 — Unified Conformance Gate, Connector Bridge Client, Public Barrels, Architecture Guard

**Base:** `c9dec764c5bfd1e25314ce9309ddfd56fbe02813`
**Head:** `5a3bc0d4285c8d6d8b79e553af58f7dafbc3e217`
**Files changed:** 15 (all new, exactly the brief's list; no hotspot/composition-root edits)

## Spec compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| Import Task 7 `defineVisualAgentAdapterConformance` unchanged | PASS | `VisualAgentAdapterConformance.test.ts` imports it from `connectorBridge/visualAgent/conformance/VisualAgentAdapterConformance`; file itself untouched in diff. |
| Options derived from `supportedCapabilities`, no `switch(toolId)` | PASS | `negotiatedFrom`/`completedOptions` derive purely from capability booleans; no tool-id branch anywhere in the aggregate test. |
| No mutually exclusive terminals in one runner call | PASS | Default run uses `completed` (+`waiting_approval`); separate `it.each` blocks use `cancelled` and `failed` exclusively, gated by fixture capability. |
| No public mutable register; unregistered custom throws `visual_agent_adapter_not_found` | PASS | `registerCustomWithoutConformance` only calls `.require()` on the frozen registry; `ImmutableVisualAgentToolRegistry.require` (pre-existing, untouched) throws that code. |
| Barrels: Preference/Companion/Errand export only Facade+ViewState | PASS | All three `index.ts` files export exactly `{Facade}` + `type {ViewState}`. |
| Visual Agent barrel: nine frozen names + Facade/ViewState (+ manifest/run-status) | PASS | Re-exports exactly the 11 names listed in the brief's Step 8 sample, type-only, from `VisualAgentContracts`; no implementation/class/register export. |
| No composition-root files | PASS | `BuiltInVisualAgentToolRegistry` only composes adapters with an injectable-but-defaulted "unavailable" transport/binding — no live wiring. |
| No hotspot edits | PASS | Diff touches only the 15 brief-listed files; none of the Step 11 hotspot paths appear. |
| Mobile networking only via `ConnectorBridgeTransport`/`ConnectorBridgeVisualAgentClient` | PASS | `ConnectorBridgeVisualAgentClient` is the sole `VisualAgentExecutionPort` in `features/visualAgent`; only imports the shared protocol codec, never an adapter. |
| Public errors are generic `CapabilityError` codes only | PASS | Every throw site uses `CapabilityError` with a code from the frozen `VisualAgentErrorCode`/`CapabilityErrorCode` union; no ad hoc `Error` in production code. |
| No `OpenClawFacade`, no `VisualAgentAdapterRegistry`, no `features/openclaw` | PASS | Architecture test asserts both string absences and directory absence; grep of the diff confirms no matching token. |
| Legacy migration symbols out of capability-owned files | PASS | Architecture test scans mobile + `connectorBridge/visualAgent` + `core/engine/operateRuntime/visualAgent` for the four forbidden tokens. |

All Step 9/10/11 command outputs reported (23/23 suites, 162/162 tests; `tsc --noEmit` clean; full suite 70/70, 588/588; hotspot diff empty) are consistent with the diff's shape and scope. No evidence in the diff contradicts the report's claims.

**Spec verdict: PASS.**

## Quality review

### Important

1. **`VisualAgentViewState.enabled`/`canExecute` are derived from the wrong field and never reflect `setEnabled()`.** `VisualAgentProfileController.setEnabled` mutates the *global* `envelope.active.visualAgent.enabled` flag, but `VisualAgentFacade.project()` computes `enabled` from the *active profile's own* `VisualAgentProfileV1.enabled` field (`activeFull?.enabled === true`) — a structurally different boolean that `setEnabled` never touches (`features/visualAgent/application/VisualAgentFacade.ts:1243`, contrast with `VisualAgentProfileController.ts:301-306`). Concretely: calling `facade.setEnabled(false, rev)` then `facade.read()` will still report `enabled: true` (and `canExecute` computed from that same wrong flag) whenever the active profile's own `enabled` was `true`. This breaks the read side of the settings toggle the brief's UI handoff describes, and it propagates into `canExecute`, which UI code would use to gate showing a "run" action. The implementer's own self-review flags this exact gap as "not asserted by any test" but ships it unresolved; no test in `VisualAgentFacade.test.ts` exercises a `setEnabled` → `read()` round trip, so the gate does not catch it. This needs a decision from the coordinator (either extend the frozen controller with a global-enabled read, or redefine what `ViewState.enabled` means) before it's UI-safe.

2. **`cancel()` and `requestPreferences()` on `ConnectorBridgeVisualAgentClient` throw synchronously instead of rejecting the promise they're typed to return.** Both methods call `this.assertReady()`/`this.assertCapability(...)` (which `throw`) *before* entering the `Promise` constructor, and neither method is declared `async` (`features/visualAgent/data/ConnectorBridgeVisualAgentClient.ts:1457-1481` and `:1537-1561`). Every sibling mutating method (`resolveApproval`, `resume`, `steer`, `execute`) is `async`, so the same guard throws are automatically converted into rejected promises. For `cancel`/`requestPreferences`, a caller using the conventional `client.cancel(...).catch(handler)` (or `facade.cancel(...).catch(handler)`, since `VisualAgentFacade.cancel` just returns the same call un-awaited) gets an uncaught synchronous exception instead of a caught rejection whenever the client isn't ready or the capability wasn't negotiated. This is untested — the existing `cancel` test only exercises the case where the client is already ready and negotiated, so the guard-throw path never executes in the suite. Recommend making both methods `async` (or wrapping the guard checks in the returned `Promise`) for consistency with the rest of the port and to avoid an uncaught-exception surprise in UI code.

### Minor

3. `VisualAgentFacade.project()`'s `blocker.message` is just a copy of `blocker.code` (`{code: connection.errorCode, message: connection.errorCode}`, `VisualAgentFacade.ts:1259`) — not incorrect, but it's a placeholder rather than a real user-facing message; worth a follow-up if the UI plans to display `blocker.message` directly.
4. `execute()` inserts a task tracker into `this.trackers` before `send()`; if `send` throws (e.g., disconnected mid-call), the tracker for that `taskId` is never removed (`ConnectorBridgeVisualAgentClient.ts:1446-1454`). Low-impact (a rejected `execute()` means the caller won't proceed to `cancel`/events for that id), but a minor resource-cleanup gap.

## ⚠️ Items for the coordinator

- ⚠️ `VisualAgentViewState.enabled`/`canExecute` do not reflect `VisualAgentFacade.setEnabled()`'s effect because the Facade reads a different `enabled` field (per-profile) than the one the controller's `setEnabled` writes (global). The implementer self-flagged this; it is unresolved and untested. Needs an explicit coordinator decision (extend controller surface vs. redefine the ViewState field) before Visual Agent settings UI can safely wire the enable/disable toggle.

## Summary

Spec PASS — all binding coordinator resolutions and global constraints are honored, all required files match the brief exactly, no hotspot/composition-root edits, barrels and architecture guard match the spec verbatim.

Task quality: Changes requested — two Important defects (one self-flagged by the implementer, one newly found) affect the correctness/robustness of the delivered Facade and mobile execution client, though neither breaks the automated test gates the brief requires.
