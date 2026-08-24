# Re-review: Task 9 — OpenClaw Gateway WebSocket Adapter (Wave 2B Worker A)

**Base:** `a5e36ddec7635a2aa4406ee6bda4852b742d9c93`
**Head:** `816db98187bf66ab3a7a83df605ef3581a7266f2`
**Scope:** Task-scoped re-gate after the Important-fix commit. Verifying only the prior Important finding; Minors not re-litigated (none of them escalated).

## Prior Important finding

> `connect()` awaited `this.bindings.read(...)` with no `try/catch`. A rejecting `VisualAgentBindingPort.read` would propagate a raw `Error` (message/stack) to the caller unchanged, and `this.state` would stay `{status: 'connecting'}` forever instead of moving to `failed`.

## Fix verification (commit `816db98`)

`OpenClawExecutionPort.connect()` now wraps both `this.bindings.read(...)` and `parseOpenClawBindingV1(...)` in a single `try/catch`:

```469:485:AwesomeProject/src/connectorBridge/visualAgent/adapters/openclaw/OpenClawAdapter.ts
  async connect(
    profile: VisualAgentProfileV1,
    signal: AbortSignal,
  ): Promise<VisualAgentCapabilitySet> {
    this.state = {status: 'connecting'};
    let binding: ReturnType<typeof parseOpenClawBindingV1>;
    try {
      const rawBinding = await this.bindings.read(profile.connector.bindingId, 'openclaw');
      binding = parseOpenClawBindingV1(rawBinding);
    } catch (error) {
      const errorCode: VisualAgentErrorCode =
        error instanceof CapabilityError && isVisualAgentErrorCode(error.code)
          ? error.code
          : 'visual_agent_invalid_profile';
      this.state = {status: 'failed', errorCode};
      throw new CapabilityError(errorCode);
    }
```

Checked against the finding, line by line:

- **Generic error mapping**: any rejection that is not already a `CapabilityError` with a known `VisualAgentErrorCode` (i.e. an arbitrary `Error` from the binding store, network, etc.) is defaulted to `visual_agent_invalid_profile` and a **fresh** `CapabilityError` is thrown. `CapabilityError`'s constructor calls `super(code)` (`AwesomeProject/src/core/engine/capabilities/shared/CapabilityError.ts:19`), so `.message` is exactly the code string — the original error object, its message, and its stack are discarded, not just re-wrapped. No leak path remains.
- **Existing `CapabilityError` from `parseOpenClawBindingV1` is preserved**: `isVisualAgentErrorCode` checks against a hardcoded set that I cross-checked against the frozen `VisualAgentErrorCode` union in `VisualAgentContracts.ts` (12 literals) — exact match, so a binding-shape validation failure (e.g. non-`wss:` URL) still surfaces as `visual_agent_invalid_profile` rather than being coerced to something else. No regression to the pre-existing "rejects a binding whose gatewayUrl is not wss" test.
- **State transition**: `this.state = {status: 'failed', errorCode}` is set unconditionally in the `catch` before rethrowing, so `getConnectionState()` can never observe a stuck `connecting` state after this path. This is symmetric with the two other `connect()` failure paths (`upstream.open`, `session.negotiate`) which already did this.

## Test coverage verification

New test in the diff (`OpenClawAdapter.test.ts`), `maps a binding-port rejection to a generic error and a failed state without leaking the raw message`:

- Mocks `bindings.read` to reject with `new Error('binding store offline: dsn=postgres://user:pw@internal-host/db')` — a realistic raw-error shape with embedded secrets, matching the finding's threat model.
- Asserts `connect()` rejects with message `'visual_agent_invalid_profile'` (via `.rejects.toThrow(...)`).
- Asserts the rejection message does **not** match `/postgres|internal-host|binding store offline/` — directly tests the "no leak" requirement, not just the error code.
- Asserts `upstream.open` was never called — confirms fail-fast before reaching the next stage.
- Asserts `getConnectionState().status` is `'failed'` (explicitly `not.toBe('connecting')`) with `errorCode: 'visual_agent_invalid_profile'` — directly tests the "state must not stick at connecting" half of the finding.

This test exercises exactly the scenario described in the finding and would have failed against the pre-fix code (raw `Error` would have propagated un-wrapped, and state would have stayed `connecting`). Coverage is sufficient.

## Regression check

- The fix only touches `OpenClawAdapter.ts` (the wrapped `try/catch`) and adds one test to `OpenClawAdapter.test.ts`; no other file in the diff changed. Scope stays within the brief's file list.
- All 11 tests reportedly pass (10 prior + 1 new); reasoning through the change confirms no interference with the other two `connect()` catch blocks (`upstream.open`, `session.negotiate`/capability-negotiation), which are untouched and structurally identical in pattern.
- `npx tsc --noEmit` reported clean; the diff introduces no new `any`/unsafe casts beyond what already existed pre-fix (`ReturnType<typeof parseOpenClawBindingV1>` typing is sound).
- Did not re-run the suite or `tsc`, per instructions; relied on manual trace, consistent with the reported "11 passed" / clean `tsc` output.

## Findings

### Critical
None.

### Important
None remaining — the sole prior Important finding is resolved and covered by a targeted test.

### New findings
None. No new Critical/Important issues introduced by this fix. (Minors from the prior review were not re-examined per task scope; none of them are affected by this change.)

## Verdict

- **Spec:** PASS
- **Task quality:** Approved
