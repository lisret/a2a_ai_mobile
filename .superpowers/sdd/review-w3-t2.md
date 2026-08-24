# Review: UI-plan Task 2 — Operate, Companion & Scoped Task Event Facades

Base: `14f687efda5e08b43c6beaf4560f1dc1107856f1` · Head: `acbabec`

## Spec conformance

- Files: exactly the 4 listed (create `ScopedTaskUiEvents.ts`, `OperateFacade.ts`, `CompanionFacade.ts`; test `OperateAndCompanionFacade.test.ts`). No extra files, no `features/companion` edits, no Screen/hook/provider/AsyncStorage/native imports.
- Imports: both facades and the event helper import only from `./UiRuntimeContracts` (plus the sibling `ScopedTaskUiEvents`, itself owned). No port/ViewState redeclaration.
- `ScopedTaskUiEvents`: matches the brief's mandated core exactly — filters by exact `taskId` + `sessionRevision`, drops non-integer/non-increasing `sequence`, tracks `lastSequence`, delegates `Unsubscribe`.
- `DefaultOperateFacade`: trims instruction, throws on empty/whitespace-only input, delegates `start`/`cancel`/`getViewState` verbatim to the port, subscribes via `ScopedTaskUiEvents`. `blocked` results from `port.start()` are returned as-is — no second execution path, matches zero-fallback rule.
- `DefaultCompanionFacade`: pure 1:1 delegation of the four port methods; a returned `proposal` is never auto-confirmed — `confirmProposal` only fires on explicit call. No screenshot/action capability exists on this facade (interface only exposes text methods), satisfying "Companion never screenshots/actions."
- Both `Default*` classes implement the exact frozen `OperateFacade`/`CompanionFacade` interface shapes from `UiRuntimeContracts.ts` (verified against the ports/interfaces directly).
- Tests: the 3 RED tests specified in the brief are reproduced verbatim (scope+sequence filter, blocked-no-fallback, no-auto-confirm).

**Spec: PASS**

## Quality

- Code is thin, matches the brief's prescribed shapes almost verbatim, no speculative abstractions, no unrelated edits.
- Minor: `start()` is a non-`async` method that `throw`s synchronously for empty input rather than returning a rejected `Promise`. Since the interface signature is `Promise<StartOperateResult>`, a caller using `.then/.catch` chaining (vs. `await` inside an `async` function) would get a synchronous `TypeError` instead of a promise rejection. Not exercised by any test in this task (the empty-input path has no RED/GREEN coverage), so it's unverified behavior.
- No other issues found; diff is exactly the 4 files, 162 insertions, 0 deletions as reported.

**Quality: Approved**

## Severity

- Critical: none
- Important: none
- Minor: `DefaultOperateFacade.start()` throws synchronously (not via rejected Promise) on empty/whitespace input; this path is untested.

⚠️ None blocking.
