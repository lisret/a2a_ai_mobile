# UI Task 5 report — Facade composition root

**Task:** Integrate Wave 1 commits and add the injectable Facade composition root.
**Role:** Serial integration owner (Wave 1).
**Worktree:** `/Users/a/Desktop/code/tool/a2a_ai_mobile/.worktrees/v1-runtime-integration`
**Branch:** `codex/v1-runtime-integration`
**baseSha (start HEAD):** `8b1fe30deea3a6ec7247ee87ddbadff77f046e56`
**Task 5 commit (UI Facade checkpoint):** `593cf41384dd00d0ce2d414b216bc2bb9165c55c`

Cherry-pick (Step 1) was already applied before this session; started at Step 2. No push/merge/rebase performed.

---

## WorkPackageEvidence

Files (commit `593cf41`, 4 files changed, +352 / −8):

- **Create** `AwesomeProject/src/application/facades/AppFacadesContext.tsx`
  - `createContext<AppFacades | null>(null)`; `AppFacadesProvider`; `useAppFacades()` throws `'AppFacadesProvider is missing'` when the context is `null`. No hidden fallback.
- **Create** `AwesomeProject/src/application/facades/createAppFacades.ts`
  - `createAppFacades(ports: AppFacadePorts): AppFacades` — the only application file that imports the concrete `Default*Facade` classes and the core registry types. Pure DI; no service locator.
  - `projectVisualAgentToolOptions(registry, statusByTool)` — pure projection over `VisualAgentToolRegistry.list()`; `builtIn = !toolId.startsWith('custom:')`; `capabilities`/`maturity`/`label` copied verbatim from each adapter's `manifest`; default status `{readiness:'not_configured', configuredProfileCount:0}`; preserves registry order.
  - `appFacades` — the single production graph.
- **Modify** `AwesomeProject/App.tsx`
  - Wraps `<AppNavigator/>` in `<AppFacadesProvider value={appFacades}>` inside `SafeAreaProvider`.
- **Test** `AwesomeProject/src/__tests__/application/facades/AppFacadesContext.test.tsx`
  - Injectable graph, fail-loud-outside-provider, exact canonical manifest projection, and a status-defaulting case.

`jest.setup.js` was **left unchanged**: the production composition uses loud-unwired ports (see Concerns) that touch no NativeModule at import/construction time, so no new native mock is "required by the current production composition" (brief's stated constraint). `__tests__/App.test.tsx` still renders `<App/>` green, confirming no new native dependency was introduced.

---

## RED / GREEN

**RED** (`npx jest src/__tests__/application/facades/AppFacadesContext.test.tsx --runInBand`):
```
FAIL src/__tests__/application/facades/AppFacadesContext.test.tsx
  ● Test suite failed to run
    Cannot find module '../../../application/facades/AppFacadesContext' ...
```

**GREEN** (`npx jest src/__tests__/application --runInBand`):
```
Test Suites: 5 passed, 5 total
Tests:       28 passed, 28 total
```
(The "fails loudly outside the provider" case emits the expected React error-boundary console trace but asserts green.)

Also verified `__tests__/App.test.tsx` → `1 passed` (root `<App/>` renders with the new provider).

---

## Gate

- **tsc:** `npx tsc --noEmit --pretty false` → exit 0 (clean).
- **Prettier:** my Task-5 files (`App.tsx`, `AppFacadesContext.tsx`, `createAppFacades.ts`, the test) → "All matched files use Prettier code style!". See Concerns re pre-existing warnings for non-Task-5 files.
- **Privacy scan:** `rg -n "apiKey|Authorization|data:image|modelResponse|screenshotUri" src/application` → no output (clean).
- **ESLint (ReadLints):** no linter errors in the four Task-5 files.

---

## Manifest delta (real built-in manifests vs. the brief's Step-2 excerpt)

Per `ui-task-5-context.md`, the projection follows the **real** Wave-2 manifests; the brief excerpt's `capabilities` literals were stale for four of five tools. The test asserts the real manifests (do not invent capabilities). Deltas found in `src/connectorBridge/visualAgent/adapters/*`:

| tool | field | brief excerpt | real manifest (used) |
|------|-------|---------------|----------------------|
| codex | `resume` | `true` | **`false`** |
| cursor | `steer` | `false` | **`true`** |
| dsh | `imageInput` | `true` | **`false`** |
| hermes | `preferences` | `false` | **`true`** |

`openclaw` matched (all `true`). All `maturity` values matched (`stable`/`beta`/`beta`/`experimental`/`beta`). Registry order (`openclaw, codex, cursor, dsh, hermes`) matched.

---

## Self-review

- **Injectable seam:** context is `AppFacades | null`; `useAppFacades()` throws on `null`. No silent default graph leaks into consumers. ✔
- **Single composition owner:** `createAppFacades.ts` is the only application file importing `Default*Facade` + core `VisualAgent*` types; Screens are untouched and cannot reach core classes through it. ✔
- **No widening / no invention:** `projectVisualAgentToolOptions` copies each `declaredCapabilities` field one-by-one and `maturity` from the manifest; nothing is forced to `true`; `custom:` prefix distinguishes built-ins. ✔
- **Order + defaults:** projection preserves `registry.list()` order and applies `{not_configured, 0}` only where the caller supplies no status (covered by the added 4th test). ✔
- **Surgical:** only the 4 committed files changed; `App.tsx` reformat was confined to the file I own (its pre-existing `debugLogService` block was already prettier-dirty at baseSha). No unrelated files touched or committed. ✔
- **Privacy:** no secret/screenshot/model-response strings anywhere in `src/application`. ✔

---

## Concerns

1. **Production ports are intentionally unwired (loud, not silent).** No runtime-backed `*ApplicationPort` implementations exist anywhere in the repo, and Wave-3 hard rules forbid editing Screens/hooks/storage/native/ModelService — which real runtime wiring (repositories, credential store, OperateRuntime/OperateTaskRunner) would require. So the sole production `appFacades` is composed from ports whose methods throw a stable `'app_facade_port_not_wired'` error. This honours "fail loudly, no hidden fallback," lets `App.tsx` boot with a valid non-null graph, and keeps the seam fully injectable. **The runtime-backed adapters (the detailed `start`/visual-tool/model-config adapter behaviour in brief Step 4) are deferred to the serial Task 6–Task 10 screen integration**, which will replace `productionPorts` in `createAppFacades.ts`. Flagging because this is a deviation from a literal reading of Step 4 that expected live adapters in this commit.

2. **Pre-existing Prettier failures outside Task 5.** `npx prettier --check src/application App.tsx jest.setup.js` (the brief's Step-5 gate) reports warnings for Wave-2/3 files committed by Tasks 2–4: `src/application/events/ScopedTaskUiEvents.ts`, `facades/ActivityFacade.ts`, `facades/ErrandFacade.ts`, `facades/PhoneOperateFacade.ts`, `facades/UiRuntimeContracts.ts`. These are not Task-5 files (forbidden to modify/commit here), so the aggregate gate command cannot pass at this baseSha. All **Task-5** files are Prettier-clean. Recommend a follow-up formatting pass on those Wave-2/3 files by their owners.

3. **`jest.setup.js` unchanged.** Consistent with concern 1 (no native dependency in the current production composition). If Task 6+ wires real native-backed ports, the corresponding empty NativeModule mocks should be added then.
