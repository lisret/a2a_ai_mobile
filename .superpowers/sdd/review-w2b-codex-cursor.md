# Review: Capability Task 10 — Worker B (Codex & Cursor Visual Agent Adapters)

**Base:** `a5e36ddec7635a2aa4406ee6bda4852b742d9c93`
**Head:** `34954d34110a4f891874056db4dba5c4eb1c0291`
**Commit:** `34954d3` "feat: add codex and cursor visual agent adapters"

## Scope verification

`git show --stat 34954d3` in the implementer's worktree matches the diff file exactly: 8 new files, 1489 insertions, 0 deletions, 0 modifications to any other file. All files fall under `adapters/codex/**`, `adapters/cursor/**`, or the two matching test paths. No frozen contract (`VisualAgentContracts.ts`, `VisualAgentUpstreamPort.ts`, `VisualAgentAdapterConformance.ts`, `CapabilityError.ts`) was edited, and no `VisualAgentAdapterConformance.test.ts` was created. The `adapters/` directory in the worktree contains only `codex/` and `cursor/` — no encroachment on sibling adapter directories. Ownership constraint: **satisfied**.

`@core/*` → `src/core/*` alias is configured in both `tsconfig.json` (`paths`) and `babel.config.js` (module-resolver), so the `@core/engine/...` imports used by the new files resolve correctly under both `tsc` and Jest.

## Spec compliance walkthrough

- **Transport allow-lists.** `CodexBinding.parseCodexBinding` accepts only `cli_exec_jsonl` / `app_server_json_rpc_stdio`; anything else (including a hypothetical WebSocket variant or `mcp-server`) throws `visual_agent_invalid_profile`. `CursorBinding.parseCursorBinding` accepts only `agent_cli_ndjson` / `acp_json_rpc_stdio` / `cloud_agents_http`. Both match the brief's frozen mode lists exactly, and comments explicitly call out the excluded transports. **Matches.**
- **No local spawn / no product HTTP.** Neither binding file nor adapter file performs any `child_process`, `fetch`, `XMLHttpRequest`, or `WebSocket` call. All IO is via the injected `VisualAgentUpstreamPort.open(...)` and the returned `VisualAgentUpstreamSession`. **Matches.**
- **Capability negotiation ordering.** `connect()` first checks `requested[key] && !mask[key]` (mode-declared ceiling) and throws `visual_agent_capability_unsupported` *before* calling `upstream.open`. It then calls `session.negotiate(requested)` and re-validates `requested[key] && !negotiated[key]`, closing the session and throwing the same generic code if the upstream under-negotiates. Both paths run strictly before any `execute`/`send` call. **Matches** the "requested true + negotiated false → throw before send" rule (tested explicitly for both adapters).
- **Approval safety.** Inbound `approval/request` (Codex) and `approval/request` / `permission/request` (Cursor) are normalized to a `status: 'waiting_approval'` event; `resolveApproval` is a separate, explicitly-invoked method, and the adapter never calls `session.send` with a `decision: 'approve'` payload on its own. The Codex test explicitly asserts `send` was never called with `decision: 'approve'`. **Matches.**
- **CLI cancel-claim guard.** `cursorCapabilityMask('agent_cli_ndjson')` returns the base mask with `cancel: false`, so a profile requesting `cancel: true` on that mode fails at `connect()` before `upstream.open` is ever called — verified by the "does not claim cancel" test (`upstream.open` assertion). Codex's `cli_exec_jsonl`, by contrast, *does* claim `cancel: true`, consistent with the brief's specific instruction that this mode "closes stdin/process on cancellation." **Matches** the differentiated intent in the brief/context (Cursor CLI cannot ack cancel; Codex CLI kills the child process and can).
- **Generic error surface.** Every thrown error is a `CapabilityError` constructed with one of the frozen `VisualAgentErrorCode` literals (`visual_agent_invalid_profile`, `visual_agent_capability_unsupported`, `visual_agent_not_ready`, `visual_agent_resume_unsupported`, `visual_agent_disconnected`, `visual_agent_execution_failed`). No file interpolates upstream payloads, paths, tokens, or raw `Error`/stack data into a message or code. The `resumeToken` field forwarded on `failed`/`cancelled` terminal events is a named field of the frozen `VisualAgentTaskEvent` contract, not an ad hoc echo of upstream data. **Matches.**
- **Zero local-pipeline calls on disconnect/protocol failure.** Neither adapter references any local-model / pipeline API at all; `fallbackSpy.callCount()` is asserted to stay `0` by the shared conformance runner for both fixtures. **Matches** (trivially, since there is no fallback code path in either adapter — consistent with the "never spawn / bridge only" design).
- **Test structure.** Both `CodexAdapter.test.ts` and `CursorAdapter.test.ts` call `defineVisualAgentAdapterConformance` against their own `conformanceFixture.ts`, and neither creates the reserved aggregate `VisualAgentAdapterConformance.test.ts`. **Matches.**
- **Profile connector untouched.** No file adds gateway/CLI/ACP/HTTP fields to `VisualAgentProfileV1`; all transport-specific fields live in `CodexBindingV1` / `CursorBindingV1`, read via `bindings.read(bindingId, toolId)`. **Matches.**

I traced the conformance fixtures by hand against `VisualAgentAdapterConformance.ts`'s runner logic (connect → negotiated-subset assertion → status/approval/delta → single terminal → disconnect) for both the Codex (`app_server_json_rpc_stdio`) and Cursor (`acp_json_rpc_stdio`) fixtures and did not find a step where the runner's assertions would fail, given the adapters' actual negotiation/event-mapping logic.

## Findings

### Critical
None found.

### Important
None found.

### Minor
1. **Near-total code duplication between `CodexAdapter.ts` and `CursorAdapter.ts`.** `CodexExecutionPort`/`CursorExecutionPort`, `normalizeUpstreamMessage`, `normalizeDelta`, `normalizeResult`, and `CAPABILITY_KEYS` are copy-pasted verbatim (only the mask functions and manifest differ, plus one extra `permission/request` tag in Cursor's switch). The report explicitly flags this as a deliberate trade-off forced by the wave's file-ownership isolation rule (no shared file allowed outside each adapter's own directory), and proposes a future consolidation task. Given the stated constraint, this is a reasonable, disclosed trade-off rather than an oversight, but it is worth surfacing for the integration/consolidation step: any future bug fix to the shared lifecycle logic must currently be applied twice.
2. **All non-`closed` upstream failures collapse to the single generic code `visual_agent_execution_failed`.** The frozen `VisualAgentErrorCode` enum has more specific codes (e.g. `visual_agent_protocol_error`, `visual_agent_auth_failed`) that are never emitted by either adapter for a `task/failed`/`failed` frame — only the disconnect (`closed`/`session/closed`) path uses the more specific `visual_agent_disconnected`. This is a safe, conservative choice (it avoids ever forwarding an upstream-supplied error string) and is not required to be more granular by the brief, but it does mean task-level failure telemetry will be coarser than the type system allows.
3. **`execute()` only validates the envelope's `image` field against negotiated `imageInput`; it does not otherwise re-validate `envelope.requiredCapabilities` against the negotiated set at execute time.** Per-task capability drift (a task requiring a capability beyond what was negotiated at connect time, for a field other than `image`) would not be caught by the adapter itself. The shared conformance runner does not exercise this path either (it always passes `requiredCapabilities: negotiated`), and the brief's global constraint is phrased around profile-level `requestedCapabilities`, so this is not a clear violation — but it is a gap worth flagging for whoever integrates task-level dispatch.

## ⚠️ Cannot verify
- I did not re-run `npm test` or `npx tsc --noEmit` per the task instructions (must not re-run the implementer's suite / mutate the tree). The reported "10 passed, 10 total" count is consistent with the number of `it`/`it.each` cases visible in the diff (5 per file: 2–3 mode cases + 1–2 targeted behavior cases + 1 conformance case), and manual trace-through of both fixtures against the frozen conformance runner did not surface a failure, but I have not executed the code.
- `ReadLints` on the adapter and test directories in the implementer's worktree reports no linter errors, corroborating (but not fully substituting for) the implementer's own lint claim.
