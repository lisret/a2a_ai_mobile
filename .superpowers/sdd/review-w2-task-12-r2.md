# Re-review: Capability-domain Task 12 — Unified Conformance Gate, Connector Bridge Client, Public Barrels, Architecture Guard (R2)

**Base:** `c9dec764c5bfd1e25314ce9309ddfd56fbe02813`
**Head:** `e3ade7b` (`5a3bc0d` + `e3ade7b`) — checkpoint ancestry confirmed (`git merge-base --is-ancestor` OK)
**Scope:** Task-scoped re-review of the two Important fixes only. Prior Minors not re-litigated (no new Critical/Important surfaced).

## Fix verification

### Finding 1 — `VisualAgentViewState.enabled`/`canExecute` must reflect the global flag

Bound resolution: *`ViewState.enabled` is the global `visualAgent.enabled` that `setEnabled` writes; `canExecute` requires that flag + ready + active profile. A smallest `readEnabled()` on `VisualAgentProfileController` is blessed.*

- `VisualAgentProfileController.setEnabled` writes `active.visualAgent.enabled` via `compareAndActivate` (`VisualAgentProfileController.ts:306-311`, unchanged by this pass).
- New `readEnabled()` reads the same field, `envelope.active.visualAgent.enabled` (`VisualAgentProfileController.ts:124-127`) — a single-line read, no legacy key, no reconstructed profile. Matches "smallest possible" exactly.
- `VisualAgentFacade.project()` now reads `enabled` via `controller.readEnabled()` (in parallel with `readActiveProjection()`), and the stale per-profile derivation (`activeFull?.enabled === true` via `list()`) was removed from `project`. `canExecute = enabled && connection.status === 'ready' && projection !== null` — exactly the bound formula (`VisualAgentFacade.ts:1288-1327`).
- New test `VisualAgentFacade.test.ts › 'reflects the global enabled flag written by setEnabled'` exercises the previously-missing round trip: `setEnabled(false, 7)` → returned view and a subsequent `read()` both show `enabled: false`/`canExecute: false`, using a stateful controller stub whose `setEnabled` flips what `readEnabled` returns. This closes exactly the gap the prior review flagged (no test previously exercised `setEnabled → read`).
- New test `VisualAgentProfileController.test.ts › 'reads the global visualAgent.enabled flag from the active route'` covers `readEnabled()` true/false directly.

**Verified fixed**, matches the coordinator's binding resolution precisely.

### Finding 2 — `cancel`/`requestPreferences` must reject, not throw synchronously

Bound resolution: *cancel/requestPreferences must reject, not throw sync.*

- `ConnectorBridgeVisualAgentClient.cancel` and `requestPreferences` are now declared `async` (`ConnectorBridgeVisualAgentClient.ts:1553` and `:1633`), matching their siblings (`resolveApproval`, `resume`, `steer`, `execute`, all already `async`). The guard throws (`assertReady()`, `assertCapability(...)`, and the no-session throw in `requestPreferences`) now execute inside an async function body, so they surface as promise rejections rather than synchronous exceptions — no functional change to the guard logic itself, only the calling convention.
- New test `ConnectorBridgeVisualAgentClient.test.ts › 'rejects cancel with not_ready before connect rather than throwing synchronously'` explicitly asserts `expect(pending).toBeInstanceOf(Promise)` before awaiting the rejection, proving no synchronous throw. This is exactly the untested path the prior review called out.
- Confirmed no other guard-throw call site in the file regressed: `execute` was already async before this pass; the `send()` helper and `handleRaw`/`route` paths are unaffected.

**Verified fixed**, matches the coordinator's binding resolution precisely.

## New findings

None. No new Critical or Important issues were introduced by this fix pass. The changes are surgical (two method-declaration changes, one new controller method, updated `project()` wiring) and directly traceable to the two bound resolutions; no other production code paths were touched.

## Re-run evidence (as reported, not independently re-run per instructions)

Report claims `4 passed, 4 total; 32 passed, 32 total; 0 failed` for the four affected suites plus `npx tsc --noEmit` clean. This is consistent with the diff's shape (new tests added exactly where the fixes land, no test deletions, no assertion weakening).

## Verdict

**Spec: PASS.** All binding coordinator resolutions are honored exactly as specified; no hotspot/composition-root edits; barrels and architecture guard unaffected by this pass.

**Task quality: Approved.** Both prior Important findings are correctly and fully resolved with matching tests; no new Critical/Important findings. Prior Minors (blocker.message placeholder; tracker not cleaned up if `send()` throws in `execute()`) remain open but out of scope for this task-scoped gate per instructions.

**Remaining Critical/Important:** None.
