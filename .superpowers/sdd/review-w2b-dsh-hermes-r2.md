# Re-review: Capability Task 11 — DSH and Hermes Visual Agent Adapters (round 2)

**Base:** `a5e36ddec7635a2aa4406ee6bda4852b742d9c93`
**Head:** `e81e9738b0fae7b37a33fffd7462e7c74f4fc4b0`
**Diff:** `.superpowers/sdd/review-w2b-dsh-hermes-r2.diff` (8 files, 2 commits: `50e44f5` feat + `e81e973` fix)
**Scope:** Task-scoped gate only — re-checking the two prior Important findings plus scanning the fix commit for new Critical/Important issues. Minors from the prior review are not re-litigated.

## Method

Read the brief, wave-2b context, implementer report (including the "Review fix pass" append), and the prior review. Re-read the full diff for both commits and traced the fix's control flow against the actual frozen dependency files in the worktree (`VisualAgentContracts.ts`, `VisualAgentProtocolCodec.ts`) to verify the fix's claims structurally — not by re-running the suite, per instructions.

## Prior Important #1 — `handleUpstream` threw raw out of the subscribe listener

**Status: Resolved.**

Both `DshAdapter.ts` and `HermesAdapter.ts` now wrap the full decode/dispatch body in `try { ... } catch { this.failWithProtocolError(); }` inside `handleUpstream`. Verified by tracing:

- `decodeVisualAgentMessage` (confirmed in `VisualAgentProtocolCodec.ts`) throws `CapabilityError('visual_agent_protocol_error')` on invalid JSON, unknown frame types, or correlation/schema violations — this call is now inside the `try`.
- `forward(event)` calls `this.tracker.accept(event)` (which throws on sequence regression or taskId/sessionRevision mismatch) *before* updating `lastDeliveredSequence` or notifying listeners, and `forward` is invoked only from inside the same `try` block. A throwing `tracker.accept` therefore never partially updates state or leaks a partially-processed event to subscribers — it falls straight into the same `catch`.
- `failWithProtocolError()` itself never throws: it sets `state = {status:'failed', errorCode:'visual_agent_protocol_error'}` and, only if a task is in flight and no terminal was yet delivered, synthesizes exactly one terminal event using `lastDeliveredSequence + 1` (the last *known-good* sequence, not the rejected one — avoiding a regressed/duplicate sequence in the synthetic terminal). Only the generic error code is used; the raw frame is never referenced.
- `terminalDelivered` gates re-entry so a second bad frame after failure is a silent no-op, matching "exactly one terminal."

New tests (`does not throw out of the subscribe listener on a malformed upstream frame`, one per adapter) exercise exactly this path with a non-JSON string and assert: the emit call doesn't throw, `getConnectionState()` reads `{status:'failed', errorCode:'visual_agent_protocol_error'}`, and exactly one terminal with matching `taskId`/`sessionRevision`/`errorCode` is delivered. Traced against `decodeVisualAgentMessage`'s `JSON.parse` failure path (`catch { return fail(); }`) — the test does exercise the fixed code path, not a no-op.

## Prior Important #2 — `declaredCapabilities` validated but unused

**Status: Resolved.**

`DshExecutionPort.connect()` now computes `effective[key] = upstreamNegotiated[key] === true && binding.declaredCapabilities[key] === true` for every capability key, gates `profile.requestedCapabilities` against `effective` (not the raw upstream negotiation), and — critically — assigns `this.negotiated = effective` and returns `effective` as the negotiated set. This means the ceiling is enforced everywhere `this.negotiated` is later read (`execute`, `cancel`, `resolveApproval`, `resume`, `steer`, `requestPreferences`), not only at the `connect()` gate.

Traced the new test `treats declaredCapabilities as a hard ceiling above negotiation`: binding declares only `stream`, upstream negotiates `stream` and `cancel`, profile requests both — `effective.cancel` is `false` (upstream said yes, binding didn't declare it), so the requested `cancel` correctly rejects with `visual_agent_capability_unsupported`. This is the exact scenario the prior review flagged as unenforced ("a buggy or compromised upstream implementation... this adapter would trust it") and it is now blocked.

Confirmed no regression to the two original DSH tests or the DSH conformance fixture: the conformance fixture's binding sets `declaredCapabilities: negotiatedCapabilities` (identical to what upstream negotiates), so `effective` collapses to the same set as before — conformance behavior unaffected. Hermes has no `declaredCapabilities` field on `HermesBindingV1` (confirmed unchanged in the diff), so this finding correctly does not apply there, consistent with the report's caveat.

## New findings from the fix commit

None at Critical/Important severity. The fix is minimal, correctly scoped to the two flagged gaps, adds no new IO surface, and does not touch any frozen file, other adapter, or the aggregate conformance suite. No new Minor is being raised either (not required in this task-scoped gate).

## Verdict

- **Spec compliance: PASS.** All prior-review PASS findings still hold; the fix commit only touches the two owned adapter files' internal control flow (`handleUpstream`, `failWithProtocolError`, `connect`'s capability-effective computation) plus their own test files — no ownership-boundary or contract violation introduced.
- **Task quality: Approved.** Both prior Important findings are structurally verified as fixed, each with a dedicated regression test whose assertions were traced against the actual frozen codec/tracker throw conditions (not just re-stated). No new Critical or Important issue found in the fix.
- **Remaining Critical/Important:** None.
- **New findings:** None.

## ⚠️ Cannot verify

- Test execution and `npx tsc --noEmit` were not re-run (per instructions); the report's "14 passed (up from 11), tsc exit 0" claim was cross-checked only by manually tracing types/control-flow/throw-sites against the frozen contract and codec files, consistent with but not equivalent to execution.
